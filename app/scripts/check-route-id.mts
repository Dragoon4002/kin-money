// Opaque route id checks. Run: node --experimental-strip-types --no-warnings scripts/check-route-id.mts
import assert from "node:assert/strict";
import { idOf, idSeg } from "../src/lib/routeId.ts";

const max = (1n << 64n) - 1n;
for (const id of [0n, 1n, 8n, 12345n, 1n << 63n, max, ...Array.from({ length: 2000 }, (_, i) => BigInt(i) * 7919n)]) {
  const s = idSeg(id);
  assert.match(s, /^k[0-9a-z]{1,13}$/);
  assert.equal(idOf(s), id, `round trip ${id}`);
}
assert.notEqual(idSeg(1n).slice(1, 4), idSeg(2n).slice(1, 4), "neighbours look unrelated");
assert.equal(idOf("8"), 8n); // plain/legacy links
assert.equal(idOf("old-8"), null); // prefix is the caller's job (potRoute)
for (const bad of ["", "k", "kZZ", "k-1", "x123", "k" + "z".repeat(13), "k0" + idSeg(5n).slice(1), "1".repeat(31)]) assert.equal(idOf(bad), null, bad);
console.log("route id ok");
