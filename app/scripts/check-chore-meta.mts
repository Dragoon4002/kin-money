// Run: node --experimental-strip-types --no-warnings scripts/check-chore-meta.mts
import assert from "node:assert/strict";
import { cleanDue, cleanTitle, parseIds } from "../src/lib/choreMeta.ts";

// cleanTitle
assert.equal(cleanTitle("  Dishes "), "Dishes");
assert.equal(cleanTitle("Walk\nthe\tdog\u0000"), "Walkthedog");
assert.equal(cleanTitle("‮evil​"), "evil", "bidi override + zero-width stripped");
assert.equal(cleanTitle("👨‍👩‍👧 time"), "👨‍👩‍👧 time", "emoji joiners kept");
assert.equal(cleanTitle("x".repeat(60))?.length, 40);
assert.equal(Array.from(cleanTitle("😀".repeat(50))!).length, 40, "cut by character, not code unit");
for (const v of ["", "   ", "\u0001\u0002", 42, null, undefined, ["Dishes"]]) assert.equal(cleanTitle(v), null);

// parseIds
assert.deepEqual(parseIds("1,2,3"), ["1", "2", "3"]);
assert.deepEqual(parseIds("7,7,8"), ["7", "8"]);
assert.deepEqual(parseIds(Array.from({ length: 50 }, (_, i) => i + 1).join(",")), Array.from({ length: 50 }, (_, i) => String(i + 1)));
for (const v of [null, "", "1,,2", "0", "01", "-1", "1.5", "a", "1 ,2", "1".repeat(31), Array.from({ length: 51 }, (_, i) => i + 1).join(",")])
  assert.equal(parseIds(v), null, `rejects ${String(v).slice(0, 20)}`);

// cleanDue
assert.equal(cleanDue(1_760_000_000), 1_760_000_000);
for (const v of [0, -5, 1.5, 2 ** 32, "1760000000", null]) assert.equal(cleanDue(v), 0);

console.log("chore meta ok");
