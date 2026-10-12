import { isAddress, parseUnits } from "viem";
import { MONAD_USDC_ASSET, SOURCES, type AddQuote, type AddStatus } from "@/lib/addMoney";
import { allowShared } from "@/lib/server/graph";
import { allow, clientIp } from "@/lib/server/relayer";

// Aurora Intents Swap API (docs.intents.aurora.dev): quote → one-time deposit address on the source chain → the
// user sends from any wallet or exchange → Aurora delivers USDC to the user's own Kin address on Monad mainnet.
// Refunds go back to the user on the source chain (same key = same address on every EVM chain; Solana asks for one).
const API = "https://intents-api.aurora.dev/api";
const key = () => process.env.AURORA_API_KEY;

/** POST { source, amount, address, refundTo? } → AddQuote */
export async function POST(req: Request) {
  if (!key()) return Response.json({ error: "not connected" }, { status: 503 });
  const ip = clientIp(req);
  if (!allow(`addmoney:${ip}`, 30) || !(await allowShared(`addmoney:${ip}`, 120, 3_600_000))) return Response.json({ error: "slow down" }, { status: 429 });
  const { source, amount, address, refundTo } = await req.json().catch(() => ({}));
  const src = SOURCES.find((s) => s.id === source);
  if (!src || typeof amount !== "string" || !/^\d{1,7}(\.\d{1,18})?$/.test(amount) || Number(amount) <= 0 || !isAddress(address ?? ""))
    return Response.json({ error: "invalid" }, { status: 400 });
  const refund = src.evm ? address : refundTo;
  if (!src.evm && (typeof refund !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(refund))) return Response.json({ error: "refund address" }, { status: 400 });

  try {
    const res = await fetch(`${API}/quote/${key()}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dry: false,
        swapType: "EXACT_INPUT",
        slippageTolerance: 100, // bps
        originAsset: src.asset,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: MONAD_USDC_ASSET,
        amount: parseUnits(amount, src.decimals).toString(),
        recipient: address,
        recipientType: "DESTINATION_CHAIN",
        refundTo: refund,
        refundType: "ORIGIN_CHAIN",
        deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = await res.json().catch(() => ({}));
    const q = j.quote;
    if (!res.ok || !q?.depositAddress) {
      // e.g. "Amount is too low for bridge, try at least 1000000"
      const msg = String(j.message ?? j.error ?? "");
      const min = msg.match(/at least (\d+)/)?.[1];
      return Response.json({ error: min ? "too little" : "no quote", min: min && (Number(min) / 10 ** src.decimals).toString() }, { status: 422 });
    }
    const out: AddQuote = {
      depositAddress: q.depositAddress,
      amountIn: q.amountIn,
      amountInFormatted: q.amountInFormatted,
      amountOut: q.amountOut,
      minAmountOut: q.minAmountOut,
      timeEstimate: Number(q.timeEstimate ?? 0),
      deadline: q.deadline,
    };
    return Response.json(out);
  } catch {
    return Response.json({ error: "busy" }, { status: 503 });
  }
}

/** GET ?depositAddress= → { status, arrived? } */
export async function GET(req: Request) {
  if (!key()) return Response.json({ error: "not connected" }, { status: 503 });
  const depositAddress = new URL(req.url).searchParams.get("depositAddress");
  if (!depositAddress || depositAddress.length > 100) return Response.json({ error: "invalid" }, { status: 400 });
  try {
    const res = await fetch(`${API}/status/${key()}?depositAddress=${encodeURIComponent(depositAddress)}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    const status = j.status as AddStatus | undefined;
    if (!status) return Response.json({ error: "unknown" }, { status: 502 });
    const d = j.swapDetails ?? {};
    return Response.json({
      status,
      amountOut: d.amountOut ?? null, // Monad USDC delivered (6 dp)
      destTx: d.destinationChainTxHashes?.[0]?.hash ?? null,
      originTx: d.originChainTxHashes?.[0]?.hash ?? null,
      refunded: d.refundedAmount ?? null,
    });
  } catch {
    return Response.json({ error: "busy" }, { status: 503 });
  }
}
