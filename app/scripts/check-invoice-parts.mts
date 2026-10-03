// Run: node --experimental-strip-types --no-warnings scripts/check-invoice-parts.mts
import assert from "node:assert/strict";
import { cleanDays, cleanParts, cleanText, isInvoiceId, partStatus, partsTotal } from "../src/lib/invoiceMeta.ts";

const now = 1_800_000_000_000;
const DAY = 86_400_000;

// cleanText
assert.equal(cleanText("  Drafts ", 30), "Drafts");
assert.equal(cleanText("‮evil​\n", 30), "evil", "bidi + zero-width + newline stripped");
assert.equal(Array.from(cleanText("😀".repeat(40), 30)!).length, 30, "cut by character");
for (const v of ["", "  ", 1, null, ["x"]]) assert.equal(cleanText(v, 30), null);

// cleanParts
const ok = cleanParts([{ name: " Drafts ", amount: "1000000", due: now + DAY }, { amount: "5" }], now);
assert.deepEqual(ok, [
  { name: "Drafts", amount: "1000000", due: now + DAY, done: false },
  { name: "Part 2", amount: "5", due: 0, done: false },
]);
assert.equal(cleanParts([{ name: "x".repeat(99), amount: "1" }], now)![0].name.length, 30);
assert.equal(cleanParts([{ amount: "1", done: true }], now)![0].done, false, "client can't pre-mark done");
for (const bad of [
  [], {}, null, "1",
  [{ amount: "1" }, { amount: "1" }, { amount: "1" }, { amount: "1" }], // >3
  [{ amount: "0" }], [{ amount: "01" }], [{ amount: 1 }], [{ amount: "1".repeat(16) }], [{ amount: "-1" }],
  [{ amount: "1", due: now - 2 * DAY }], [{ amount: "1", due: now + 400 * DAY }], [{ amount: "1", due: 1.5 }], [{ amount: "1", due: "soon" }],
  [null], ["1"],
]) assert.equal(cleanParts(bad, now), null, JSON.stringify(bad));

// cleanDays / ids / total
assert.equal(cleanDays(7), 7);
for (const v of [0, 61, 1.5, "7", null]) assert.equal(cleanDays(v), null);
assert.ok(isInvoiceId("Ab3_-xYz0123"));
for (const v of ["short", "Ab3_-xYz0123x", "Ab3_/xYz0123", 12, null]) assert.equal(isInvoiceId(v), false);
assert.equal(partsTotal([{ amount: "1" }, { amount: "999999999999999" }]), 1_000_000_000_000_000n);

// partStatus: paid > done > overdue > pending
assert.equal(partStatus({ done: true, due: now - DAY }, true, now), "paid");
assert.equal(partStatus({ done: true, due: now - DAY }, false, now), "done");
assert.equal(partStatus({ done: false, due: now - 1 }, false, now), "overdue");
assert.equal(partStatus({ done: false, due: now + 1 }, false, now), "pending");
assert.equal(partStatus({ done: false, due: 0 }, false, now), "pending", "no due date never overdue");

console.log("invoice parts ok");
