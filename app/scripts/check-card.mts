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

// receipt: the whole ticket
const id = "0x" + "ab".repeat(32);
const r = p(`kind=receipt&dir=out&amount=25000000&to=maya&from=sam&secs=0.8&cat=food&id=${id}&when=${encodeURIComponent("Oct 13, 2026 · 3:32 AM (GMT+5:30)")}&note=${encodeURIComponent("Dinner\u0000 last\n night")}`);
assert.equal(r?.out, true);
assert.equal(r?.cat, "food");
assert.equal(r?.note, "Dinner last night");
assert.equal(r?.id, id);
assert.equal(p(`kind=receipt&dir=in&from=0x1a2b…9f0e`)?.from, "0x1a2b…9f0e"); // not on Kin: short account ok on receipts
assert.equal(p(`kind=sent&from=0x1a2b…9f0e`), null); // …but nowhere else
assert.equal(p("kind=receipt"), null); // dir required
assert.equal(p("kind=receipt&dir=out&cat=evil"), null);
assert.equal(p("kind=receipt&dir=out&id=0x12"), null);
assert.equal(p(`kind=receipt&dir=out&note=${"x".repeat(300)}`)?.note?.length, 200);
assert.equal(p("kind=sent&note=hi")?.note, undefined); // extras only on receipts

console.log("check-card: ok");
