import { isAddress, isHex, parseAbi, type Address, type Hex } from "viem";
import { KinCashoutV2Abi, KinForwarderAbi } from "@/lib/abi";
import { addr, networks, publicClient } from "@/lib/chain";
import { ROUTES, termsNonce, VENUES } from "@/lib/cashoutRoutes";
import { allowShared, releaseShared } from "@/lib/server/graph";
import { GAS_CAP, allow, clientIp, once, submit } from "@/lib/server/relayer";

const ausdAbi = parseAbi([
  "function transferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce,bytes signature)",
]);
const OLD_POT = "0x58ab4Da1575758be9d4Fe53bdB79fabe8F4C2caD"; // pre-redeploy KinPot (lib/programs.ts OLD_POT): only close() is used
const KIN = new Set([addr.names, addr.escrow, addr.stream, addr.pot, addr.circle, addr.mandate, addr.giftlink, addr.cashout, OLD_POT].map((a) => a.toLowerCase()));
const MAX_DEADLINE_S = 3600;
const MIN_MAIN_VALUE = 10_000n; // $0.01: dust sends on mainnet only burn relayer MON (audit)

export const maxDuration = 60; // a broadcast tx is awaited past the 20s queue timeout rather than dropped

const bad = (error: string, status = 400) => Response.json({ error }, { status });
const uint = (v: unknown) => (typeof v === "string" || typeof v === "number") && /^\d{1,78}$/.test(String(v));

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const ip = clientIp(req);
  if (!allow(`ip:${ip}`, 30)) return bad("slow down", 429);
  // Every relayed call spends relayer gas: cap per network across all instances (generous — a venue shares one IP).
  if (!(await allowShared(`relay:${ip}`, 600, 3_600_000))) return bad("slow down", 429);
  const now = Math.floor(Date.now() / 1000);
  try {
    // Real money (mainnet): plain sends only. Programs and links stay on the practice network.
    const net = body?.net === "main" ? "main" : "test";
    if (net === "main" && body?.kind !== "3009" && body?.kind !== "cashout" && body?.kind !== "usdc") return bad("not available");
    // "usdc": the cash-out's second leg — exchanged USDC (EIP-3009) to the payout deposit account. Real money only.
    if (body?.kind === "usdc" && net !== "main") return bad("not available");
    if (body?.kind === "3009" || body?.kind === "usdc") {
      const { auth: a, signature } = body;
      if (![a?.from, a?.to].every((x) => isAddress(x)) || !isHex(a.nonce) || !isHex(signature)) return bad("invalid");
      if (![a.value, a.validAfter, a.validBefore].every(uint) || BigInt(a.value) === 0n) return bad("invalid"); // a $0 transfer only burns relayer gas
      if (net === "main" && BigInt(a.value) < MIN_MAIN_VALUE) return bad("too small");
      if (!allow(`from:${a.from.toLowerCase()}`, 10)) return bad("slow down", 429);
      if (!(await allowShared(`relay-from:${a.from.toLowerCase()}`, 200, 86_400_000))) return bad("slow down", 429);
      const k3009 = `${body.kind}:${net}:${a.from.toLowerCase()}:${a.nonce.toLowerCase()}`; // case-insensitive: same nonce, any hex case
      if (!once(k3009) || !(await allowShared(k3009, 1, 3_600_000))) return bad("duplicate", 409);
      const hash = await submit(
        {
          address: body.kind === "usdc" ? ROUTES.main.settle.address : networks[net].ausd, abi: ausdAbi, functionName: "transferWithAuthorization",
          args: [a.from as Address, a.to as Address, BigInt(a.value), BigInt(a.validAfter), BigInt(a.validBefore), a.nonce as Hex, signature as Hex],
        },
        200_000n,
        net,
      );
      return Response.json({ hash });
    }
    if (body?.kind === "cashout") {
      // KinCashoutV2: one signed EIP-3009 pull whose nonce commits to the terms (see lib/cashoutRoutes.ts).
      const { from, terms: t, value, validAfter, validBefore, signature } = body;
      const target = ROUTES[net].cashout;
      if (!target) return bad("not available");
      const b32 = (v: unknown) => isHex(v) && v.length === 66;
      if (!isAddress(from) || !isAddress(t?.to) || !b32(t.payoutRef) || !b32(t.salt) || !isHex(signature)) return bad("invalid");
      if (![value, validAfter, validBefore, t.minOut].every(uint) || BigInt(value) === 0n || !(Number.isInteger(t.venue) && t.venue >= 0 && t.venue < VENUES.length)) return bad("invalid");
      if (net === "main" && BigInt(value) < MIN_MAIN_VALUE) return bad("too small");
      if (!allow(`from:${from.toLowerCase()}`, 10)) return bad("slow down", 429);
      if (!(await allowShared(`relay-from:${from.toLowerCase()}`, 200, 86_400_000))) return bad("slow down", 429);
      const terms = { to: t.to as Address, venue: Number(t.venue), minOut: BigInt(t.minOut), payoutRef: t.payoutRef as Hex, salt: t.salt as Hex };
      const k = `3009:${net}:${from.toLowerCase()}:${termsNonce(net, terms)}`;
      if (!once(k) || !(await allowShared(k, 1, 3_600_000))) return bad("duplicate", 409);
      const hash = await submit(
        {
          address: target, abi: KinCashoutV2Abi, functionName: "cashOut",
          args: [from as Address, terms, BigInt(value), BigInt(validAfter), BigInt(validBefore), signature as Hex],
        },
        GAS_CAP,
        net,
      );
      return Response.json({ hash });
    }
    if (body?.kind === "2771") {
      const r = body.request;
      if (!isAddress(r?.from) || !isAddress(r?.to) || !KIN.has(r.to.toLowerCase())) return bad("target not allowed");
      if (!isHex(r.data) || !isHex(r.signature) || !uint(r.gas) || !uint(r.deadline) || BigInt(r.value ?? 0) !== 0n) return bad("invalid");
      // Forwarder requires outer gas ≥ inner gas × 64/63, and Monad bills the limit: cap the signed gas.
      if (BigInt(r.gas) > (GAS_CAP * 63n) / 80n) return bad("too expensive");
      if (Number(r.deadline) > now + MAX_DEADLINE_S) return bad("invalid");
      if (!allow(`from:${r.from.toLowerCase()}`, 10)) return bad("slow down", 429);
      if (!(await allowShared(`relay-from:${r.from.toLowerCase()}`, 200, 86_400_000))) return bad("slow down", 429);
      if (!once(`2771:${r.signature.toLowerCase()}`)) return bad("duplicate", 409);
      // Audit: N requests signed for the SAME forwarder nonce (different deadlines) each simulate fine, but only one
      // can land — the rest revert and Monad bills their full gas. Allow one submission per (from, nonce).
      const fwdNonce = await publicClient.readContract({ address: addr.forwarder, abi: KinForwarderAbi, functionName: "nonces", args: [r.from as Address] });
      const nonceKey = `2771n:${r.from.toLowerCase()}:${fwdNonce}`;
      if (!(await allowShared(nonceKey, 1, 120_000))) return bad("duplicate", 409);
      const hash = await submit({
        address: addr.forwarder, abi: KinForwarderAbi, functionName: "execute",
        args: [{ from: r.from, to: r.to, value: 0n, gas: BigInt(r.gas), deadline: Number(r.deadline), data: r.data, signature: r.signature }],
      }).catch(async (e) => {
        // Failed before reaching the chain (simulation / gas cap): let the user retry this nonce. A timeout may have
        // broadcast, so keep the slot then.
        if (!/relay timeout/.test((e as Error).message ?? "")) await releaseShared(nonceKey);
        throw e;
      });
      return Response.json({ hash });
    }
    return bad("unknown kind");
  } catch (e) {
    const msg = (e as Error).message ?? "";
    console.error("relay failed", msg.slice(0, 300));
    // Timed out before broadcast: nothing was sent, so retrying is safe — say "busy", not "rejected".
    if (/relay timeout/.test(msg)) return Response.json({ error: "busy" }, { status: 503 });
    return Response.json({ error: "rejected" }, { status: 422 });
  }
}
