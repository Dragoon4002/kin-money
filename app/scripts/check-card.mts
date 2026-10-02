// Run: node --experimental-strip-types --no-warnings scripts/check-card.mts
import assert from "node:assert/strict";
import { parseCard } from "../src/app/api/card/params.ts";

const p = (q: string) => parseCard(new URLSearchParams(q));

const ok = p("kind=sent&amount=1500000&to=@Alice&from=bob_1&secs=0.9&cur=INR");
assert.equal(ok?.kind, "sent");
assert.equal(ok?.amount, 1500000n);
assert.equal(ok?.to, "alice");
assert.equal(ok?.from, "bob_1");
assert.equal(ok?.secs, "0.9");
assert.equal(ok?.cur, "INR");
assert.ok(ok?.skin);

assert.equal(p("kind=nope"), null);
assert.equal(p(""), null);
assert.equal(p("kind=sent&amount=1e6"), null);
assert.equal(p("kind=sent&amount=-1"), null);
assert.equal(p("kind=sent&amount=1234567890123456"), null); // 16 digits
assert.equal(p("kind=sent&to=0xabc0000000000000000000000000000000000000"), null);
assert.equal(p("kind=sent&to=ab"), null);
assert.equal(p("kind=sent&secs=0.95"), null);
assert.equal(p("kind=sent&cur=usd"), null);
assert.equal(p("kind=goal&look={bad"), null);

// title trimmed, control chars stripped, capped at 40
assert.equal(p(`kind=goal&title=${encodeURIComponent(" Bike\u0000 fund ")}`)?.title, "Bike fund");
assert.equal(p(`kind=goal&title=${"x".repeat(60)}`)?.title?.length, 40);

// look: known skin/accessories kept, junk dropped
const l = p(`kind=gift&look=${encodeURIComponent(JSON.stringify({ skin: "gold", accessories: ["crown", "<script>"] }))}`);
assert.equal(l?.skin, "gold");
assert.deepEqual(l?.accessories, ["crown"]);
assert.equal(p(`kind=gift&look=${encodeURIComponent('{"skin":"evil"}')}&from=amy`)?.skin, p("kind=gift&from=amy")?.skin);

// default skin is stable per name
assert.equal(p("kind=received&from=amy")?.skin, p("kind=received&from=amy")?.skin);

console.log("check-card: ok");
