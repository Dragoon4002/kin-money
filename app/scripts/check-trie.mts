// Run: node --experimental-strip-types scripts/check-trie.mts
import assert from "node:assert/strict";
import { Trie } from "../src/lib/trie.ts";

const t = new Trie(["sounak", "sound", "soumya", "sam", "abhirup", "so"]);
assert.deepEqual(t.suggest("sou"), ["sound", "soumya", "sounak"]);
assert.deepEqual(t.suggest("so"), ["so", "sound", "soumya", "sounak"]);
assert.deepEqual(t.suggest("s", 2), ["so", "sam"]);
assert.deepEqual(t.suggest("x"), []);
assert.deepEqual(t.suggest(""), ["so", "sam", "sound", "soumya", "sounak", "abhirup"].sort((a, b) => a.length - b.length || a.localeCompare(b)).slice(0, 5));
console.log("trie ok");
