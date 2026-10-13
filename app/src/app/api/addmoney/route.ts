import { isAddress, parseUnits } from "viem";
import { MONAD_USDC_ASSET, SOURCES, payAmount, type AddQuote, type AddStatus } from "@/lib/addMoney";
import { allowShared } from "@/lib/server/graph";
import { allow, clientIp } from "@/lib/server/relayer";

// Aurora Intents Swap API (docs.intents.aurora.dev): the user asks for N dollars (EXACT_OUTPUT) → one-time deposit
// address on the source chain → they, or whoever they share the pay link with, send from any wallet or exchange →
// Aurora delivers USDC to the user's own Kin address on Monad mainnet. GET returns the quote too, so the public pay
// page (/add/pay?d=) shows only what Aurora knows for that address; a made-up address is a 404.
// Refunds go to the user's own NEAR Intents account (id = their Kin address; their key moves it) for every source, so
// no one pastes a refund address. ponytail: no in-app "bring it in" yet; add an INTENTS-deposit quote if refunds show up.
const API = "https://intents-api.aurora.dev/api";
const key = () => process.env.AURORA_API_KEY;

/** POST { source, amount (dollars to receive), address } → AddQuote */
export async function POST(req: Request) {
  if (!key()) return Response.json({ error: "not connected" }, { status: 503 });
  const ip = clientIp(req);
  if (!allow(`addmoney:${ip}`, 30) || !(await allowShared(`addmoney:${ip}`, 120, 3_600_000))) return Response.json({ error: "slow down" }, { status: 429 });
  const { source, amount, address } = await req.json().catch(() => ({}));
  const src = SOURCES.find((s) => s.id === source);
  if (!src || typeof amount !== "string" || !/^\d{1,6}(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0 || !isAddress(address ?? ""))
    return Response.json({ error: "invalid" }, { status: 400 });

  try {
    const res = await fetch(`${API}/quote/${key()}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dry: false,
        swapType: "EXACT_OUTPUT",
        slippageTolerance: 100, // bps
        originAsset: src.asset,
        depositType: "ORIGIN_CHAIN",
        destinationAsset: MONAD_USDC_ASSET,
        amount: parseUnits(amount, 6).toString(), // Monad USDC to deliver
        recipient: address,
        recipientType: "DESTINATION_CHAIN",
        refundTo: address.toLowerCase(), // Intents account id = lowercase EVM address
        refundType: "INTENTS",
        deadline: new Date(Date.now() + 60 * 60_000).toISOString(),
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const j = await res.json().catch(() => ({}));
    const q = j.quote;
    if (!res.ok || !q?.depositAddress) {
      // e.g. "Amount is too low for bridge, try at least 149967" (Monad USDC units, 6 dp)
      const msg = String(j.message ?? j.error ?? "");
      const min = msg.match(/at least (\d+)/)?.[1];
      return Response.json({ error: min ? "too little" : "no quote", min: min && (Math.ceil(Number(min) / 1e4) / 100).toFixed(2) }, { status: 422 });
    }
    return Response.json(shape(src.asset, address, q));
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
    if (res.status === 404 || j.statusCode === 404) return Response.json({ error: "not found" }, { status: 404 }); // Aurora: 400 + statusCode 404
    const status = j.status as AddStatus | undefined;
    if (!status) return Response.json({ error: "unknown" }, { status: 502 });
    const d = j.swapDetails ?? {};
    const r = j.quoteResponse ?? {};
    return Response.json({
      status,
      quote: r.quote?.depositAddress ? shape(r.quoteRequest?.originAsset, r.quoteRequest?.recipient, { ...r.quote, deadline: r.quote.deadline ?? r.quoteRequest?.deadline }) : null,
      amountOut: d.amountOut ?? null, // Monad USDC delivered (6 dp)
      destTx: d.destinationChainTxHashes?.[0]?.hash ?? null,
      originTx: d.originChainTxHashes?.[0]?.hash ?? null,
      refunded: d.refundedAmount ?? null,
    });
  } catch {
    return Response.json({ error: "busy" }, { status: 503 });
  }
}

// Aurora quote → what the app shows. Unknown source asset → "" (pay page then says the link isn't valid).
type RawQuote = { depositAddress: string; amountIn: string; amountOut: string; minAmountOut: string; timeEstimate?: number; deadline: string };
function shape(asset: string | undefined, recipient: string | undefined, q: RawQuote): AddQuote {
  const src = SOURCES.find((s) => s.asset === asset);
  return {
    depositAddress: q.depositAddress,
    source: src?.id ?? "",
    recipient: recipient ?? "",
    amountIn: q.amountIn,
    amountInFormatted: src ? payAmount(q.amountIn, src.decimals) : "",
    amountOut: q.amountOut,
    minAmountOut: q.minAmountOut,
    timeEstimate: Number(q.timeEstimate ?? 0),
    deadline: q.deadline,
  };
}
