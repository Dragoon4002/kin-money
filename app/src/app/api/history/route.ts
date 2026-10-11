import { after } from "next/server";
import { isAddress } from "viem";
import { history, mainTransfers, sync, syncedRecently, type Kind, warm } from "@/lib/server/history";
import { allow, clientIp } from "@/lib/server/relayer";

const KINDS = new Set<Kind>(["transfers", "escrow", "pot", "circle", "stream", "mandate", "giftlink"]);
export const maxDuration = 30;

// Public log history (all onchain anyway): AUSD transfers for one address, or every event of a Kin contract.
export async function GET(req: Request) {
  if (!allow(`history:${clientIp(req)}`, 120)) return Response.json({ error: "slow down" }, { status: 429 });
  const q = new URL(req.url).searchParams;
  const kind = q.get("kind") as Kind;
  const address = q.get("address") ?? "";
  if (!KINDS.has(kind) || (kind === "transfers" && !isAddress(address))) return Response.json({ error: "bad request" }, { status: 400 });
  if (q.get("net") === "main") {
    if (kind !== "transfers") return Response.json({ error: "bad request" }, { status: 400 });
    const body = await mainTransfers(address).catch(() => null);
    if (!body) return Response.json({ error: "unavailable" }, { status: 503 });
    return Response.json(body, { headers: { "cache-control": "public, s-maxage=5" } });
  }
  // Persisted history first (fast DB read). Synced in the last minute → answer now (the client tails the newest
  // blocks itself); else give the scan ≤1.5s. Either way it finishes after the response.
  await warm();
  const fresh = syncedRecently();
  const s = sync().catch(() => {});
  after(s);
  if (!fresh) await Promise.race([s, new Promise((r) => setTimeout(r, 1_500))]);
  const body = history(kind, address || undefined);
  if (body.to === "-1") return Response.json({ error: "unavailable" }, { status: 503 });
  return Response.json(body, { headers: { "cache-control": `public, s-maxage=${body.complete ? 30 : 5}` } });
}
