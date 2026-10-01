// One-time (or catch-up) backfill of the persisted history index (Neo4j HistLog/HistCursor).
// Run: node --experimental-strip-types --no-warnings --env-file=.env.local scripts/backfill-history.mts
import { history, sync } from "../src/lib/server/history.ts";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
for (let i = 1; ; i++) {
  await sync();
  const h = history("escrow");
  const all = history("transfers");
  console.log(`pass ${i}: blocks ${h.from}…${h.to} complete=${h.complete}`);
  if (h.complete) break;
  await sleep(1_100);
  void all;
}
process.exit(0);
