import { after } from "next/server";
import { sync, warm } from "@/lib/server/history";
import { allow, clientIp } from "@/lib/server/relayer";

export const maxDuration = 15;

// Nudge the indexer right after a payment so the other side's notification goes out within seconds.
// Notifications themselves are sent (once) from history.save().
export async function GET(req: Request) {
  if (!allow(`tick:${clientIp(req)}`, 30)) return Response.json({ error: "slow down" }, { status: 429 });
  await warm();
  const s = sync().catch(() => {});
  after(s);
  await Promise.race([s, new Promise((r) => setTimeout(r, 5_000))]);
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
