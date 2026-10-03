// Run: node --experimental-strip-types --no-warnings scripts/check-push.mts   (offline: fake logs + fake chain reads)
import assert from "node:assert/strict";
import { encodeAbiParameters, getAddress, pad, toEventSelector, type Address, type RpcLog } from "viem";
import { messageFor, type Ctx } from "../src/lib/server/push.ts";

const A = (n: number) => getAddress(`0x${n.toString(16).padStart(40, "0")}`);
const [ausd, escrow, giftlink, mandate, pot] = [A(0xa0), A(0xe0), A(0x90), A(0x30), A(0x70)].map((a) => a.toLowerCase());
const [mum, kid, bob, nameless] = [A(1), A(2), A(3), A(4)];
const c = { transfers: ausd, escrow, pot, circle: "", stream: "", mandate, giftlink } as Ctx["c"];
const NAMES: Record<string, string> = { [mum]: "mum", [kid]: "kid", [bob]: "bob" };
const escrows: Record<string, { from: Address; approver: Address; unlockAt: number }> = {
  "1": { from: mum, approver: mum, unlockAt: 1 }, // chore
  "2": { from: mum, approver: mum, unlockAt: 0 }, // emergency reserve
  "3": { from: bob, approver: mum, unlockAt: 0 }, // bill someone else OKs
};
const ctx: Ctx = {
  c,
  name: async (a) => NAMES[a] ?? "",
  money: (u) => `$${(Number(u) / 1e6).toFixed(2)}`,
  escrow: async (id) => escrows[id.toString()],
  mandatePayer: async () => bob,
  giftFrom: async () => mum,
};
const log = (address: string, topics: string[], data = "0x") =>
  ({ address, topics, data, blockNumber: "0x1", logIndex: "0x0", transactionHash: `0x${"ab".repeat(32)}` }) as unknown as RpcLog;
const T = toEventSelector("Transfer(address,address,uint256)");
const usd = (n: number) => pad(`0x${(n * 1e6).toString(16)}`);
const id = (n: number) => pad(`0x${n.toString(16)}`);

// Transfers
let m = await messageFor(log(ausd, [T, pad(bob), pad(kid)], usd(10)), ctx);
assert.equal(m?.to, kid);
assert.equal(m?.msg.title, "You got $10.00 from @bob");
assert.equal(m?.msg.url, "/activity");
m = await messageFor(log(ausd.toUpperCase().replace("0X", "0x"), [T, pad(nameless), pad(kid)], usd(5)), ctx);
assert.equal(m?.msg.title, "You got $5.00");
assert.equal(await messageFor(log(ausd, [T, pad(pot), pad(kid)], usd(1)), ctx), null, "from a Kin contract");
assert.equal(await messageFor(log(ausd, [T, pad(kid), pad(escrow)], usd(1)), ctx), null, "into a Kin contract");
assert.equal(await messageFor(log(ausd, [T, pad("0x0"), pad(kid)], usd(1)), ctx), null, "mint");
assert.equal(await messageFor(log(ausd, [T, pad(kid), pad(kid)], usd(1)), ctx), null, "self");

// Escrow pings
const R = toEventSelector("Requested(uint256,address)");
m = await messageFor(log(escrow, [R, id(1), pad(kid)]), ctx);
assert.deepEqual([m?.to, m?.msg.title, m?.msg.url], [mum, "@kid says the chore is done", "/chores/1"]);
m = await messageFor(log(escrow, [R, id(2), pad(kid)]), ctx);
assert.deepEqual([m?.to, m?.msg.title, m?.msg.url], [mum, "@kid is asking for emergency money", "/allowance"]);
m = await messageFor(log(escrow, [R, id(3), pad(nameless)]), ctx);
assert.deepEqual([m?.to, m?.msg.title], [mum, "Someone is asking you to OK a payment"]);
assert.equal(m?.msg.url, "/earmark/3", "bill opens its own page");

// Gift link bound, AutoPay collected
m = await messageFor(log(giftlink, [toEventSelector("Bound(uint256,address)"), id(7), pad(bob)]), ctx);
assert.deepEqual([m?.to, m?.msg.title], [mum, "@bob accepted your gift"]);
const data = encodeAbiParameters([{ type: "uint16" }, { type: "uint256" }], [2, 25_000_000n]);
m = await messageFor(log(mandate, [toEventSelector("Collected(uint256,address,uint16,uint256)"), id(4), pad(kid)], data), ctx);
assert.deepEqual([m?.to, m?.msg.title, m?.msg.url], [kid, "AutoPay: $25.00 from @bob arrived", "/autopay"]);

// Anything else is silent
assert.equal(await messageFor(log(pot, [T, pad(bob), pad(kid)], usd(1)), ctx), null);
assert.equal(await messageFor(log(escrow, [toEventSelector("Approved(uint256,address)"), id(1), pad(mum)]), ctx), null);

// No crypto words in any message
const BANNED = /wallet|address|0x|ausd|token|gas|transaction|block|crypto|escrow|sign/i;
for (const l of [log(escrow, [R, id(2), pad(kid)]), log(ausd, [T, pad(bob), pad(kid)], usd(3))]) {
  const x = await messageFor(l, ctx);
  assert.ok(!BANNED.test(`${x?.msg.title} ${x?.msg.body}`));
}
console.log("push mapping ok");
