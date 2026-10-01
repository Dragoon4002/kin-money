// Run: node --experimental-strip-types --no-warnings --env-file=.env.local scripts/check-history.mts   (LIVE=1 also scans the chain)
import assert from "node:assert/strict";
import { pad, type RpcLog } from "viem";
import { byPos, contracts, history, pick, sync, TRANSFER } from "../src/lib/server/history.ts";

const c = contracts();
assert.ok(c.transfers && c.escrow, "env addresses missing");
const me = "0x00000000000000000000000000000000000000aa";
const other = "0x00000000000000000000000000000000000000bb";
const log = (address: string, topics: string[], block: number, idx = 0) =>
  ({ address, topics, data: "0x", blockNumber: `0x${block.toString(16)}`, logIndex: `0x${idx.toString(16)}` }) as unknown as RpcLog;
const all = [
  log(c.transfers.toUpperCase().replace("0X", "0x"), [TRANSFER, pad(me), pad(other)], 10), // out (checksummed address)
  log(c.transfers, [TRANSFER, pad(other), pad(me)], 11), // in
  log(c.transfers, [TRANSFER, pad(other), pad(other)], 12), // not mine
  log(c.escrow, ["0x01"], 9),
  log(c.pot, ["0x02"], 13),
];
assert.equal(pick(all, "transfers", me).length, 2);
assert.equal(pick(all, "transfers", me.toUpperCase().replace("0X", "0x")).length, 2);
assert.deepEqual(pick(all, "escrow").map((l) => l.blockNumber), ["0x9"]);
assert.equal(pick(all, "circle").length, 0);
const sorted = [log(c.pot, [], 5, 2), log(c.pot, [], 4, 7), log(c.pot, [], 5, 1)].sort(byPos);
assert.deepEqual(sorted.map((l) => [l.blockNumber, l.logIndex]), [["0x4", "0x7"], ["0x5", "0x1"], ["0x5", "0x2"]]);
console.log("history pick ok");

if (process.env.LIVE) {
  for (let i = 0; i < 40; i++) {
    const t = Date.now();
    await new Promise((r) => setTimeout(r, 1100));
    await sync();
    const r = history("escrow");
    console.log(`poll ${i}: [${r.from}, ${r.to}] escrow=${r.logs.length} complete=${r.complete} ${Date.now() - t}ms`);
    if (r.complete) break;
  }
  const ev = history("escrow"), pot = history("pot"), circle = history("circle");
  const me = process.env.ME;
  if (me) console.log("transfers for ME:", history("transfers", me).logs.length);
  console.log("escrow/pot/circle logs:", ev.logs.length, pot.logs.length, circle.logs.length, "first escrow block", ev.logs[0] && BigInt(ev.logs[0].blockNumber!));
}
