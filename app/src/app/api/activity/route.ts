import { isAddress } from "viem";
import { indexedTransfers } from "@/lib/server/history";
import { allow, clientIp } from "@/lib/server/relayer";

// Public (all onchain anyway): one person's newest payments from Envio HyperIndex, names included.
// 503 → the app falls back to /api/history + its own lookups.
export async function GET(req: Request) {
  if (!allow(`activity:${clientIp(req)}`, 120)) return Response.json({ error: "slow down" }, { status: 429 });
  const q = new URL(req.url).searchParams;
  const address = q.get("address") ?? "";
  const limit = Math.min(200, Math.max(1, Number(q.get("limit")) || 200));
  if (!isAddress(address)) return Response.json({ error: "bad request" }, { status: 400 });
  try {
    return Response.json(await indexedTransfers(address, limit), { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
