import { after } from "next/server";
import { isAddress } from "viem";
import { history, sync, type Kind, warm } from "@/lib/server/history";
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
  // Persisted history first (fast DB read), then answer within ~1.5s while new blocks are scanned.
  await warm();
  const s = sync().catch(() => {});
  after(s);
  await Promise.race([s, new Promise((r) => setTimeout(r, 1_500))]);
  const body = history(kind, address || undefined);
  if (body.to === "-1") return Response.json({ error: "unavailable" }, { status: 503 });
  return Response.json(body, { headers: { "cache-control": `public, s-maxage=${body.complete ? 30 : 5}` } });
}
