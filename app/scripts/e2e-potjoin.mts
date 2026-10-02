// Live end-to-end pot invite-link test against a running server (default http://localhost:3270).
// Run: node --experimental-strip-types --no-warnings --env-file=.env.local scripts/e2e-potjoin.mts
// Creator starts a "for everyone" pot with an invite link → two new people join through it → a wrong key fails →
// a non-creator member makes their own link → creator turns theirs off (rejected) → the member's link still works
// → creator chips in, the pot fills and every member (incl. link joiners) gets an equal share.
import assert from "node:assert/strict";
import { createPublicClient, encodeAbiParameters, encodeFunctionData, erc20Abi, http, keccak256, parseAbi, parseAbiParameters, parseEventLogs, toHex, zeroAddress, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { monadTestnet as chain } from "viem/chains";
import { KinNamesAbi, KinPotAbi } from "../src/lib/abi.ts";

const B = process.env.BASE ?? "http://localhost:3270";
const E = process.env;
const pc = createPublicClient({ chain, transport: http(E.NEXT_PUBLIC_RPC_URL) });
const AUSD = E.NEXT_PUBLIC_AUSD as Hex, FWD = E.NEXT_PUBLIC_FORWARDER as Hex, POT = E.NEXT_PUBLIC_KIN_POT as Hex, NAMES = E.NEXT_PUBLIC_KIN_NAMES as Hex;
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
async function forward(u: PrivateKeyAccount, to: Hex, data: Hex, expectOk = true, gas = 300_000n) {
  const nonce = await pc.readContract({ address: FWD, abi: parseAbi(["function nonces(address) view returns (uint256)"]), functionName: "nonces", args: [u.address] });
  const req = { from: u.address, to, value: 0n, gas, nonce, deadline: Math.floor(Date.now() / 1000) + 600, data };
  const signature = await u.signTypedData({
    domain: { name: "Kin", version: "1", chainId: chain.id, verifyingContract: FWD },
    types: { ForwardRequest: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "gas", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" }, { name: "data", type: "bytes" }] },
    primaryType: "ForwardRequest", message: req,
  });
  return relay({ kind: "2771", request: { from: req.from, to, value: 0n, gas: req.gas, deadline: req.deadline, data, signature } }, expectOk);
}
// Same digest as potLinks.joinPot / KinPot.join
const joinSig = (key: Hex, id: bigint, inviter: Hex, who: Hex) =>
  privateKeyToAccount(key).signMessage({ message: { raw: keccak256(encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address, address"), [POT, BigInt(chain.id), id, inviter, who])) } });
const join = async (u: PrivateKeyAccount, id: bigint, inviter: Hex, key: Hex, expectOk = true) =>
  forward(u, POT, encodeFunctionData({ abi: KinPotAbi, functionName: "join", args: [id, inviter, u.address, await joinSig(key, id, inviter, u.address)] }), expectOk);
const isMember = (id: bigint, a: Hex) => pc.readContract({ address: POT, abi: KinPotAbi, functionName: "isMember", args: [id, a] });
const fresh = () => privateKeyToAccount(generatePrivateKey());

const creator = fresh(), b = fresh(), c = fresh(), d = fresh(), stranger = fresh();
const fr = await fetch(B + "/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: ser({ address: creator.address }) });
const fj = await fr.json(); assert.ok(fj.hash, `faucet ${JSON.stringify(fj)}`); await pc.waitForTransactionReceipt({ hash: fj.hash });
console.log("1. creator funded $" + Number(await bal(creator.address)) / 1e6);

const target = 3_000_000n, keyA = generatePrivateKey();
const ch = await forward(creator, POT, encodeFunctionData({ abi: KinPotAbi, functionName: "create", args: [[], true, target, [creator.address], privateKeyToAccount(keyA).address] }));
const [ev] = parseEventLogs({ abi: KinPotAbi, eventName: "PotCreated", logs: (await pc.getTransactionReceipt({ hash: ch })).logs });
const id = ev.args.id;
console.log(`2. pot #${id} "for everyone", goal $3, creator's link → ${B}/pot/join#${id}.${creator.address}.<key>`);

const handle = `pj${Date.now() % 1e9}`;
await forward(b, NAMES, encodeFunctionData({ abi: KinNamesAbi, functionName: "claim", args: [handle] }));
await join(b, id, creator.address, keyA);
assert.equal(await isMember(id, b.address), true);
console.log(`3. new account @${handle} joined via the link → isMember true`);

await join(c, id, creator.address, keyA);
assert.equal(await isMember(id, c.address), true);
console.log("4. second new account joined via the same link → isMember true");

const s1 = await join(stranger, id, creator.address, generatePrivateKey(), false);
assert.notEqual(s1, 200); assert.equal(await isMember(id, stranger.address), false);
console.log(`5. join signed with a wrong key → rejected (${s1})`);

const keyB = generatePrivateKey();
await forward(b, POT, encodeFunctionData({ abi: KinPotAbi, functionName: "setInviteKey", args: [id, privateKeyToAccount(keyB).address] }));
await forward(creator, POT, encodeFunctionData({ abi: KinPotAbi, functionName: "setInviteKey", args: [id, zeroAddress] }));
const s2 = await join(d, id, creator.address, keyA, false);
assert.notEqual(s2, 200); assert.equal(await isMember(id, d.address), false);
console.log(`6. @${handle} made their own link; creator turned theirs off → third account via creator's link rejected (${s2})`);

await join(d, id, b.address, keyB);
assert.equal(await isMember(id, d.address), true);
console.log(`7. third account joined via @${handle}'s link (non-creator invite) → isMember true; members ${(await pc.readContract({ address: POT, abi: KinPotAbi, functionName: "membersOf", args: [id] })).length}`);

const before = await Promise.all([creator, b, c, d].map((u) => bal(u.address)));
const auth = { from: creator.address, to: POT, value: target, validAfter: 0n, validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600), nonce: toHex(crypto.getRandomValues(new Uint8Array(32))) };
const sig = await creator.signTypedData({ domain: { name: "Agora Dollar", version: "1", chainId: chain.id, verifyingContract: AUSD }, types: { ReceiveWithAuthorization: AUTH }, primaryType: "ReceiveWithAuthorization", message: auth });
await forward(creator, POT, encodeFunctionData({ abi: KinPotAbi, functionName: "contribute", args: [id, target, 0n, auth.validBefore, auth.nonce, sig] }), true, 500_000n);
const after = await Promise.all([creator, b, c, d].map((u) => bal(u.address)));
const got = after.map((a, i) => a - before[i]);
assert.deepEqual(got, [-target + 750_000n, 750_000n, 750_000n, 750_000n]);
assert.equal(await bal(POT), 0n);
console.log(`8. creator chipped in $3 → pot full → split 4 ways: creator net -$2.25, @${handle} +$0.75, 2nd +$0.75, 3rd +$0.75; pot left $0`);
