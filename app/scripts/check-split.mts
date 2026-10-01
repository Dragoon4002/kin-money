// Run: node --experimental-strip-types --no-warnings scripts/check-split.mts
import assert from "node:assert/strict";
import { balances, settleUp, shares } from "../src/lib/split.ts";

const $ = (d: number) => BigInt(Math.round(d * 1e6));
// shares: remainder goes to first participants, total preserved
const s = shares(100n, ["a", "b", "c"]);
assert.deepEqual([...s.values()], [34n, 33n, 33n]);

// The trip from the brief: A–G; A–E breakfast (B paid 50), train for A–E booked by A (100), F & G flight (G paid 80)
const M = ["A", "B", "C", "D", "E", "F", "G"];
const ex = [
  { payer: "B", amount: $(50), participants: ["A", "B", "C", "D", "E"] },
  { payer: "A", amount: $(100), participants: ["A", "B", "C", "D", "E"] },
  { payer: "G", amount: $(80), participants: ["F", "G"] },
];
const bal = balances(M, ex);
assert.equal([...bal.values()].reduce((a, b) => a + b, 0n), 0n, "balances sum to zero");
assert.equal(bal.get("A"), $(70)); // paid 100, share 30
assert.equal(bal.get("B"), $(20)); // paid 50, share 30
assert.equal(bal.get("C"), -$(30));
assert.equal(bal.get("F"), -$(40));
assert.equal(bal.get("G"), $(40));
const plan = settleUp(bal);
assert.ok(plan.length <= M.length - 1);
// applying the plan clears everything
const after = balances(M, ex, plan);
assert.ok([...after.values()].every((v) => v === 0n), "settled after plan");
// partial settlement is respected
const partial = balances(M, ex, [{ from: "F", to: "G", amount: $(40) }]);
assert.equal(partial.get("F"), 0n);
assert.ok(!settleUp(partial).some((t) => t.from === "F"));
console.log("split ok", plan.map((t) => `${t.from}→${t.to} ${Number(t.amount) / 1e6}`).join(", "));
