// Run: node --experimental-strip-types src/lib/bloom.test.ts
import assert from "node:assert/strict";
// @ts-expect-error node needs the .ts extension; tsc does not allow it
import { loadBloom, makeBloom } from "./bloom.ts";

const taken = Array.from({ length: 10_000 }, (_, i) => `user_${i}`);
const f = makeBloom(taken);
const has = loadBloom(f);
assert(taken.every(has), "false negative");
const fp = Array.from({ length: 10_000 }, (_, i) => `free_${i}`).filter(has).length;
assert(fp < 200, `false positive rate too high: ${fp / 100}%`);
assert(!loadBloom(makeBloom([]))("alice"), "empty filter must say free");
console.log(`ok — ${taken.length} items, ${f.bits.length} B, fp ${fp / 100}%`);
