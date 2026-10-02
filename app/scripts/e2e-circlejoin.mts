// Live end-to-end savings-circle invite links against a running server (default http://localhost:3272).
// Run: node --experimental-strip-types --no-warnings --env-file=.env.local scripts/e2e-circlejoin.mts
// A opens a 3-seat circle alone → A's link seats B → B (not the creator) links C → all deposit → starts → D rejected.
import assert from "node:assert/strict";
import { createPublicClient, encodeAbiParameters, encodeFunctionData, erc20Abi, http, keccak256, parseAbi, parseAbiParameters, parseEventLogs, toHex, zeroHash, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { monadTestnet as chain } from "viem/chains";
import { KinCircleAbi } from "../src/lib/abi.ts";

const B = process.env.BASE ?? "http://localhost:3272";
const E = process.env;
const pc = createPublicClient({ chain, transport: http(E.NEXT_PUBLIC_RPC_URL) });
const AUSD = E.NEXT_PUBLIC_AUSD as Hex, FWD = E.NEXT_PUBLIC_FORWARDER as Hex, CIRCLE = E.NEXT_PUBLIC_KIN_CIRCLE as Hex;
const ser = (o: unknown) => JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v));
const bal = (a: Hex) => pc.readContract({ address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [a] });
const AUTH = [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] as const;

async function relay(body: unknown, expectOk = true) {
  const r = await fetch(B + "/api/relay", { method: "POST", headers: { "content-type": "application/json" }, body: ser(body) });
  const j = await r.json();
  if (!expectOk) return r.status;
  assert.ok(r.ok, `relay ${r.status} ${JSON.stringify(j)}`);
  assert.equal((await pc.waitForTransactionReceipt({ hash: j.hash })).status, "success");
  return j.hash as Hex;
}
async function forward(u: PrivateKeyAccount, data: Hex, expectOk = true) {
  const nonce = await pc.readContract({ address: FWD, abi: parseAbi(["function nonces(address) view returns (uint256)"]), functionName: "nonces", args: [u.address] });
  const req = { from: u.address, to: CIRCLE, value: 0n, gas: 300_000n, nonce, deadline: Math.floor(Date.now() / 1000) + 600, data };
  const signature = await u.signTypedData({
    domain: { name: "Kin", version: "1", chainId: chain.id, verifyingContract: FWD },
    types: { ForwardRequest: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "gas", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" }, { name: "data", type: "bytes" }] },
    primaryType: "ForwardRequest", message: req,
  });
  return relay({ kind: "2771", request: { from: req.from, to: CIRCLE, value: 0n, gas: req.gas, deadline: req.deadline, data, signature } }, expectOk);
}
async function fund(a: Hex) {
  const j = await (await fetch(B + "/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: ser({ address: a }) })).json();
  assert.ok(j.hash, `faucet ${JSON.stringify(j)}`);
  await pc.waitForTransactionReceipt({ hash: j.hash });
}
// Same digest as circleLinks.claimSeat / KinCircle.claimSeat
const seatSig = (key: Hex, id: bigint, inviter: Hex, who: Hex) =>
  privateKeyToAccount(key).signMessage({ message: { raw: keccak256(encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address, address"), [CIRCLE, BigInt(chain.id), id, inviter, who])) } });
const read = <F extends "circles" | "membersOf" | "depositFor" | "memberInfo">(functionName: F, args: readonly unknown[]) =>
  pc.readContract({ address: CIRCLE, abi: KinCircleAbi, functionName, args } as never) as Promise<never>;
async function join(u: PrivateKeyAccount, id: bigint) {
  const value: bigint = await read("depositFor", [id, u.address]);
  if (!value) return forward(u, encodeFunctionData({ abi: KinCircleAbi, functionName: "join", args: [id, 0n, 0n, 0n, zeroHash, "0x"] }));
  const auth = { from: u.address, to: CIRCLE, value, validAfter: 0n, validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600), nonce: toHex(crypto.getRandomValues(new Uint8Array(32))) };
  const sig = await u.signTypedData({ domain: { name: "Agora Dollar", version: "1", chainId: chain.id, verifyingContract: AUSD }, types: { ReceiveWithAuthorization: AUTH }, primaryType: "ReceiveWithAuthorization", message: auth });
  return forward(u, encodeFunctionData({ abi: KinCircleAbi, functionName: "join", args: [id, value, 0n, auth.validBefore, auth.nonce, sig] }));
}
const setKey = (u: PrivateKeyAccount, id: bigint, key: Hex) => forward(u, encodeFunctionData({ abi: KinCircleAbi, functionName: "setInviteKey", args: [id, privateKeyToAccount(key).address] }));
const claim = async (u: PrivateKeyAccount, id: bigint, inviter: Hex, key: Hex, ok = true) =>
  forward(u, encodeFunctionData({ abi: KinCircleAbi, functionName: "claimSeat", args: [id, inviter, u.address, await seatSig(key, id, inviter, u.address)] }), ok);

const [a, b, c, d] = [0, 0, 0, 0].map(() => privateKeyToAccount(generatePrivateKey()));
await fund(a.address); // one faucet call (it's globally rate-limited); A passes $3 to B with a gasless send
{
  const auth = { from: a.address, to: b.address, value: 3_000_000n, validAfter: 0n, validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600), nonce: toHex(crypto.getRandomValues(new Uint8Array(32))) };
  const signature = await a.signTypedData({ domain: { name: "Agora Dollar", version: "1", chainId: chain.id, verifyingContract: AUSD }, types: { TransferWithAuthorization: AUTH }, primaryType: "TransferWithAuthorization", message: auth });
  await relay({ kind: "3009", auth, signature });
}
console.log(`1. A funded, sent B $3 → A $${Number(await bal(a.address)) / 1e6}, B $${Number(await bal(b.address)) / 1e6}`);

const C = 1_000_000n; // $1 a round
const h = await forward(a, encodeFunctionData({ abi: KinCircleAbi, functionName: "create", args: [[a.address], 3, C, 300] }));
const [ev] = parseEventLogs({ abi: KinCircleAbi, eventName: "CircleCreated", logs: (await pc.getTransactionReceipt({ hash: h })).logs });
const id = ev.args.id;
await join(a, id);
const depA: bigint = await read("depositFor", [id, a.address]);
console.log(`2. circle #${id}: 3 seats, only A listed; A joined with $${Number(depA) / 1e6} deposit`);

const keyA = generatePrivateKey();
await setKey(a, id, keyA);
await claim(b, id, a.address, keyA);
await join(b, id);
const depB: bigint = await read("depositFor", [id, b.address]);
console.log(`3. A's link → B took turn 2, joined with $${Number(depB) / 1e6} deposit → ${B}/circle/join#${id}.${a.address}.<key>`);

const keyB = generatePrivateKey();
await setKey(b, id, keyB);
await claim(c, id, b.address, keyB);
let [, , roundStart] = await read("circles", [id]) as readonly [bigint, number, number];
assert.equal(roundStart, 0);
await join(c, id);
const depC: bigint = await read("depositFor", [id, c.address]);
console.log(`4. B's link (not the creator) → C took turn 3, joined with $${Number(depC) / 1e6} deposit`);

[, , roundStart] = await read("circles", [id]) as readonly [bigint, number, number];
assert.ok(roundStart > 0, "circle should have started");
const members: Hex[] = await read("membersOf", [id]);
assert.deepEqual(members, [a.address, b.address, c.address]);
console.log(`5. circle started (roundStart ${roundStart}); turn order A, B, C`);

const s = await claim(d, id, a.address, keyA, false);
assert.notEqual(s, 200);
console.log(`6. D opened A's link after the circle filled → rejected (${s})`);

assert.deepEqual([depA, depB, depC], [2n * C, C, 0n]);
console.log(`7. deposits = (seats-1-slot) × $1 → $2, $1, $0 ✓, unchanged by later seats`);
