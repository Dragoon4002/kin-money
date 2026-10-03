import { isAddress, isHex, verifyMessage } from "viem";
import { allow, clientIp } from "@/lib/server/relayer";
import { SESSION_DAYS, signToken } from "@/lib/server/session";

// POST {address, ts, sig} — sig = EIP-191 over `Kin session <address> <ts>` → {token, exp}.
export async function POST(req: Request) {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return Response.json({ error: "unavailable" }, { status: 503 });
  if (!allow(`session:${clientIp(req)}`, 30)) return Response.json({ error: "slow down" }, { status: 429 });
  const b = (await req.json().catch(() => null)) as { address?: unknown; ts?: unknown; sig?: unknown } | null;
  const { address, ts, sig } = b ?? {};
  if (typeof address !== "string" || !isAddress(address) || typeof ts !== "string" || !/^\d{10}$/.test(ts) || typeof sig !== "string" || !isHex(sig) || Math.abs(Date.now() / 1000 - Number(ts)) > 300)
    return Response.json({ error: "invalid" }, { status: 400 });
  const ok = await verifyMessage({ address, message: `Kin session ${address} ${ts}`, signature: sig }).catch(() => false);
  if (!ok) return Response.json({ error: "unauthorized" }, { status: 401 });
  const exp = Math.floor(Date.now() / 1000) + SESSION_DAYS * 86400;
  return Response.json({ token: signToken(address, exp, secret), exp });
}
