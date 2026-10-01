// Live end-to-end trip test against a running server (default http://localhost:3248).
// Run: node --experimental-strip-types --no-warnings --env-file=.env.local scripts/e2e-trip.mts
// Creates 3 throwaway accounts (zzt… names), a trip, expenses, and a real gasless settlement.
import assert from "node:assert/strict";
import { createPublicClient, encodeFunctionData, http, parseAbi, toHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet as chain } from "viem/chains";
import { balances, settleUp } from "../src/lib/split.ts";

const B = process.env.BASE ?? "http://localhost:3248";
const E = process.env;
const pc = createPublicClient({ chain, transport: http(E.NEXT_PUBLIC_RPC_URL) });
const AUSD = E.NEXT_PUBLIC_AUSD as Hex, FWD = E.NEXT_PUBLIC_FORWARDER as Hex, NAMES = E.NEXT_PUBLIC_KIN_NAMES as Hex;
const $ = (d: number) => BigInt(Math.round(d * 1e6));
const ser = (o: unknown) => JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v));

const tag = String(Math.floor(Math.random() * 1e5)).padStart(5, "0");
const users = ["a", "b", "c"].map((s) => ({ name: `zzt${tag}${s}`, acct: privateKeyToAccount(generatePrivateKey()) }));
const [A, Bb, C] = users;

async function signed(u: (typeof users)[0]) {
  const ts = Math.floor(Date.now() / 1000);
  const sig = await u.acct.signMessage({ message: `Kin contacts ${u.acct.address} ${ts}` });
  return { "x-kin-address": u.acct.address, "x-kin-ts": String(ts), "x-kin-sig": sig, "content-type": "application/json" };
}
async function api(u: (typeof users)[0], path: string, method = "GET", body?: unknown) {
  const r = await fetch(B + path, { method, headers: await signed(u), body: body ? ser(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${method} ${path} ${r.status} ${JSON.stringify(j)}`);
  return j;
}
async function relay(body: unknown) {
  const r = await fetch(B + "/api/relay", { method: "POST", headers: { "content-type": "application/json" }, body: ser(body) });
  const j = await r.json();
  assert.ok(r.ok, `relay ${r.status} ${JSON.stringify(j)}`);
  const rc = await pc.waitForTransactionReceipt({ hash: j.hash });
  assert.equal(rc.status, "success");
  return j.hash as Hex;
}
async function claimName(u: (typeof users)[0]) {
  const data = encodeFunctionData({ abi: parseAbi(["function claim(string)"]), functionName: "claim", args: [u.name] });
  const nonce = await pc.readContract({ address: FWD, abi: parseAbi(["function nonces(address) view returns (uint256)"]), functionName: "nonces", args: [u.acct.address] });
  const req = { from: u.acct.address, to: NAMES, value: 0n, gas: 150_000n, nonce, deadline: Math.floor(Date.now() / 1000) + 600, data };
  const signature = await u.acct.signTypedData({
    domain: { name: "Kin", version: "1", chainId: chain.id, verifyingContract: FWD },
    types: { ForwardRequest: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "gas", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" }, { name: "data", type: "bytes" }] },
    primaryType: "ForwardRequest", message: req,
  });
  await relay({ kind: "2771", request: { from: req.from, to: NAMES, value: 0n, gas: req.gas, deadline: req.deadline, data, signature } });
}
async function pay(u: (typeof users)[0], to: Hex, value: bigint) {
  const F = [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] as const;
  const auth = { from: u.acct.address, to, value, validAfter: 0n, validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600), nonce: toHex(crypto.getRandomValues(new Uint8Array(32))) };
  const signature = await u.acct.signTypedData({ domain: { name: "Agora Dollar", version: "1", chainId: chain.id, verifyingContract: AUSD }, types: { TransferWithAuthorization: F }, primaryType: "TransferWithAuthorization", message: auth });
  return relay({ kind: "3009", auth, signature });
}

console.log("accounts:", users.map((u) => "@" + u.name).join(" "));
for (const u of users) { await claimName(u); await api(u, "/api/contacts/me", "POST", {}); }
console.log("1. names claimed + registered");

const fr = await fetch(B + "/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: ser({ address: Bb.acct.address }) });
const fj = await fr.json(); assert.ok(fj.hash, `faucet ${JSON.stringify(fj)}`); await pc.waitForTransactionReceipt({ hash: fj.hash });
console.log("2. @b funded");

const { id } = await api(A, "/api/trips", "POST", { name: "Test trip", members: [Bb.acct.address, C.acct.address] });
await api(A, `/api/trips/${id}`, "POST", { action: "expense", payer: A.acct.address, amount: $(90).toString(), participants: users.map((u) => u.acct.address), note: "Hotel", category: "travel" });
await api(C, `/api/trips/${id}`, "POST", { action: "expense", payer: C.acct.address, amount: $(30).toString(), participants: [Bb.acct.address, C.acct.address], note: "Taxi", category: "travel" });
console.log("3. trip + 2 expenses");

// Outsider can't read it
const outsider = { name: "x", acct: privateKeyToAccount(generatePrivateKey()) };
await assert.rejects(api(outsider, `/api/trips/${id}`), /40[134]/);
console.log("4. outsider blocked");

const t = await api(Bb, `/api/trips/${id}`);
const addr = (m: { address?: string } | string) => (typeof m === "string" ? m : m.address!);
const members = t.members.map(addr);
const ex = t.expenses.map((e: { payer: unknown; amount: string; participants: unknown[] }) => ({ payer: addr(e.payer as never), amount: BigInt(e.amount), participants: e.participants.map((p) => addr(p as never)) }));
const plan = settleUp(balances(members, ex));
console.log("5. plan:", plan.map((p) => `${users.find((u) => u.acct.address === p.from)?.name}→${users.find((u) => u.acct.address === p.to)?.name} $${Number(p.amount) / 1e6}`).join(", "));
const mine = plan.filter((p) => p.from === Bb.acct.address);
assert.ok(mine.length > 0, "b should owe");

// Settle rejects a fake hash
await assert.rejects(api(Bb, `/api/trips/${id}`, "POST", { action: "settle", to: mine[0].to, amount: mine[0].amount.toString(), hash: "0x" + "ab".repeat(32) }), /400|unpaid/);
console.log("6. fake settlement rejected");

for (const p of mine) {
  const hash = await pay(Bb, p.to as Hex, p.amount);
  await api(Bb, `/api/trips/${id}`, "POST", { action: "settle", to: p.to, amount: p.amount.toString(), hash });
}
const t2 = await api(Bb, `/api/trips/${id}`);
const settled = t2.settlements.map((s: { from: unknown; to: unknown; amount: string }) => ({ from: addr(s.from as never), to: addr(s.to as never), amount: BigInt(s.amount) }));
const after = balances(members, ex, settled);
assert.equal(after.get(Bb.acct.address), 0n, "b settled");
console.log("7. @b paid", mine.length, "transfer(s) onchain; b balance now 0; remaining plan:", settleUp(after).length, "transfer(s)");
console.log(JSON.stringify({ tripId: id, addrs: users.map((u) => u.acct.address) }));
