// Live end-to-end gift-link test against a running server (default http://localhost:3250).
// Run: node --experimental-strip-types --no-warnings --env-file=.env.local scripts/e2e-giftlink.mts
// Sender wraps $5 opening in 40s → new person takes a name, accepts → others can't → opens after the date. ~1.5 min.
import assert from "node:assert/strict";
import { createPublicClient, encodeAbiParameters, encodeFunctionData, erc20Abi, http, keccak256, parseAbi, parseAbiParameters, parseEventLogs, toHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { monadTestnet as chain } from "viem/chains";
import { KinGiftLinkAbi, KinNamesAbi } from "../src/lib/abi.ts";

const B = process.env.BASE ?? "http://localhost:3250";
const E = process.env;
const pc = createPublicClient({ chain, transport: http(E.NEXT_PUBLIC_RPC_URL) });
const AUSD = E.NEXT_PUBLIC_AUSD as Hex, FWD = E.NEXT_PUBLIC_FORWARDER as Hex, GL = E.NEXT_PUBLIC_KIN_GIFTLINK as Hex, NAMES = E.NEXT_PUBLIC_KIN_NAMES as Hex;
const $ = (d: number) => BigInt(Math.round(d * 1e6));
const ser = (o: unknown) => JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
async function forward(u: PrivateKeyAccount, to: Hex, data: Hex, expectOk = true) {
  const nonce = await pc.readContract({ address: FWD, abi: parseAbi(["function nonces(address) view returns (uint256)"]), functionName: "nonces", args: [u.address] });
  const req = { from: u.address, to, value: 0n, gas: 300_000n, nonce, deadline: Math.floor(Date.now() / 1000) + 600, data };
  const signature = await u.signTypedData({
    domain: { name: "Kin", version: "1", chainId: chain.id, verifyingContract: FWD },
    types: { ForwardRequest: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "gas", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" }, { name: "data", type: "bytes" }] },
    primaryType: "ForwardRequest", message: req,
  });
  return relay({ kind: "2771", request: { from: req.from, to, value: 0n, gas: req.gas, deadline: req.deadline, data, signature } }, expectOk);
}
// Same digest as giftLinks.bindGift / KinGiftLink.bind
const bindSig = (key: Hex, id: bigint, who: Hex) =>
  privateKeyToAccount(key).signMessage({ message: { raw: keccak256(encodeAbiParameters(parseAbiParameters("address, uint256, uint256, address"), [GL, BigInt(chain.id), id, who])) } });
const gift = (id: bigint) => pc.readContract({ address: GL, abi: KinGiftLinkAbi, functionName: "gifts", args: [id] });

const sender = privateKeyToAccount(generatePrivateKey()), friend = privateKeyToAccount(generatePrivateKey()), stranger = privateKeyToAccount(generatePrivateKey());
const fr = await fetch(B + "/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: ser({ address: sender.address }) });
const fj = await fr.json(); assert.ok(fj.hash, `faucet ${JSON.stringify(fj)}`); await pc.waitForTransactionReceipt({ hash: fj.hash });
const start = await bal(sender.address);
console.log("1. sender funded $" + Number(start) / 1e6);

// create: $5 opening in 40s, behind a one-time link key; signed pull of $5 into the contract
const value = $(5), unlockAt = Math.floor(Date.now() / 1000) + 40, key = generatePrivateKey();
const auth = { from: sender.address, to: GL, value, validAfter: 0n, validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600), nonce: toHex(crypto.getRandomValues(new Uint8Array(32))) };
const sig = await sender.signTypedData({ domain: { name: "Agora Dollar", version: "1", chainId: chain.id, verifyingContract: AUSD }, types: { ReceiveWithAuthorization: AUTH }, primaryType: "ReceiveWithAuthorization", message: auth });
const ch = await forward(sender, GL, encodeFunctionData({ abi: KinGiftLinkAbi, functionName: "create", args: [privateKeyToAccount(key).address, unlockAt, unlockAt + 60 * 86_400, value, 0n, auth.validBefore, auth.nonce, sig] }));
const [ev] = parseEventLogs({ abi: KinGiftLinkAbi, eventName: "Created", logs: (await pc.getTransactionReceipt({ hash: ch as Hex })).logs });
const id = ev.args.id;
assert.equal(await bal(sender.address), start - value);
console.log(`2. gift link #${id} created: $5, opens in 40s → ${B}/gift/open#${id}.<key>&m=Happy%20birthday`);

// new person signs up: claims a name via relay
const handle = `gl${Date.now() % 1e9}`;
await forward(friend, NAMES, encodeFunctionData({ abi: KinNamesAbi, functionName: "claim", args: [handle] }));
console.log(`3. new account took @${handle}`);

await forward(friend, GL, encodeFunctionData({ abi: KinGiftLinkAbi, functionName: "bind", args: [id, friend.address, await bindSig(key, id, friend.address)] }));
assert.equal((await gift(id))[4], friend.address);
console.log(`4. gift accepted → bound to @${handle}`);

const s1 = await forward(stranger, GL, encodeFunctionData({ abi: KinGiftLinkAbi, functionName: "bind", args: [id, stranger.address, await bindSig(key, id, stranger.address)] }), false);
assert.notEqual(s1, 200);
console.log(`5. second account with the same link tried to accept → rejected (${s1})`);

const s2 = await forward(friend, GL, encodeFunctionData({ abi: KinGiftLinkAbi, functionName: "open", args: [id] }), false);
assert.notEqual(s2, 200);
console.log(`6. open before the date → rejected (${s2})`);

await sleep(Math.max(0, unlockAt * 1000 - Date.now()) + 5_000);
const c = await (await fetch(B + "/api/cron/autopay", { headers: { authorization: `Bearer ${E.CRON_SECRET}` } })).json();
assert.ok(c.opened?.includes(id.toString()), `cron ${JSON.stringify(c)}`);
for (let i = 0; i < 20 && (await bal(friend.address)) < value; i++) await sleep(500);
assert.equal(await bal(friend.address), value);
assert.equal((await gift(id))[3], true);
console.log(`7. after the date: daily job opened #${id} → @${handle} +$5`);

const s3 = await forward(sender, GL, encodeFunctionData({ abi: KinGiftLinkAbi, functionName: "refund", args: [id] }), false);
assert.notEqual(s3, 200);
console.log(`8. sender tried to take it back → rejected (${s3}); sender $${Number(await bal(sender.address)) / 1e6}, @${handle} $${Number(await bal(friend.address)) / 1e6}`);
