import { createHmac } from "node:crypto";
import { allowShared } from "@/lib/server/graph";
import { allow, clientIp } from "@/lib/server/relayer";

// Onramp white-label off-ramp quote: { usdc: "10" } → rupees out + rate + fees, from Onramp's own API (sandbox or live,
// per ONRAMP_BASE_URL). Keys stay on the server. Chain: USDC on Monad; Onramp's sandbox API doesn't list Monad yet, so
// it falls back to Base there (same USDC → INR rate, the quote doesn't depend on the chain).
const BASE = process.env.ONRAMP_BASE_URL ?? "https://api-test.onramp.money";
const SANDBOX = BASE.includes("api-test");

async function quote(fromAmount: string, chain: string) {
  const body = { fromCurrency: "usdc", toCurrency: "INR", fromAmount, chain };
  const timestamp = Date.now().toString();
  const payload = Buffer.from(JSON.stringify({ body, timestamp })).toString("base64");
  const signature = createHmac("sha512", process.env.ONRAMP_API_SECRET ?? "").update(payload).digest("hex");
  // White-label auth headers (docs-whitelabel.onramp.money).
  const res = await fetch(`${BASE}/onramp/api/v2/whiteLabel/offramp/quote`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-onramp-apikey": process.env.ONRAMP_API_KEY ?? "",
      "x-onramp-timestamp": timestamp,
      "x-onramp-payload": payload,
      "x-onramp-signature": signature,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return res.json() as Promise<{ status: number; error?: string; data?: { toAmount: string; rate: string; fees?: { onrampFee?: string; gatewayFee?: string; tdsFee?: string }[] } }>;
}

export async function POST(req: Request) {
  if (!process.env.ONRAMP_API_KEY || !process.env.ONRAMP_API_SECRET) return Response.json({ error: "not connected" }, { status: 503 });
  const ip = clientIp(req);
  if (!allow(`onramp-quote:${ip}`, 30) || !(await allowShared(`onramp-quote:${ip}`, 120, 3_600_000))) return Response.json({ error: "slow down" }, { status: 429 });
  const { usdc } = await req.json().catch(() => ({}));
  if (typeof usdc !== "string" || !/^\d{1,7}(\.\d{1,6})?$/.test(usdc) || Number(usdc) <= 0) return Response.json({ error: "invalid" }, { status: 400 });
  try {
    let q = await quote(usdc, "monad");
    if (q.status !== 1) q = await quote(usdc, "base");
    if (q.status !== 1 || !q.data) return Response.json({ error: "no quote" }, { status: 502 });
    const f = q.data.fees?.[0] ?? {};
    return Response.json({
      rupees: Number(q.data.toAmount),
      rate: Number(q.data.rate),
      fees: { onramp: Number(f.onrampFee ?? 0), gateway: Number(f.gatewayFee ?? 0), tds: Number(f.tdsFee ?? 0) },
      sandbox: SANDBOX,
    });
  } catch {
    return Response.json({ error: "busy" }, { status: 503 });
  }
}
