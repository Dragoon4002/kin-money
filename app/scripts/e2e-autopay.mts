// Live end-to-end AutoPay test against a running server (default http://localhost:3248).
// Run: node --experimental-strip-types --no-warnings --env-file=.env.local scripts/e2e-autopay.mts
// Payer funds 3 × $5 every 30s → payments fall due → cron collects → payer stops → refund. ~2 min.
import assert from "node:assert/strict";
import { createPublicClient, encodeFunctionData, erc20Abi, http, parseAbi, toHex, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { monadTestnet as chain } from "viem/chains";
import { KinMandateAbi } from "../src/lib/abi.ts";

const B = process.env.BASE ?? "http://localhost:3248";
const E = process.env;
const pc = createPublicClient({ chain, transport: http(E.NEXT_PUBLIC_RPC_URL) });
const AUSD = E.NEXT_PUBLIC_AUSD as Hex, FWD = E.NEXT_PUBLIC_FORWARDER as Hex, MANDATE = E.NEXT_PUBLIC_KIN_MANDATE as Hex;
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
async function forward(u: PrivateKeyAccount, data: Hex, expectOk = true) {
  const nonce = await pc.readContract({ address: FWD, abi: parseAbi(["function nonces(address) view returns (uint256)"]), functionName: "nonces", args: [u.address] });
  const req = { from: u.address, to: MANDATE, value: 0n, gas: 300_000n, nonce, deadline: Math.floor(Date.now() / 1000) + 600, data };
  const signature = await u.signTypedData({
    domain: { name: "Kin", version: "1", chainId: chain.id, verifyingContract: FWD },
    types: { ForwardRequest: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "gas", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" }, { name: "data", type: "bytes" }] },
    primaryType: "ForwardRequest", message: req,
  });
  return relay({ kind: "2771", request: { from: req.from, to: MANDATE, value: 0n, gas: req.gas, deadline: req.deadline, data, signature } }, expectOk);
}

const payer = privateKeyToAccount(generatePrivateKey()), payee = privateKeyToAccount(generatePrivateKey());
const fr = await fetch(B + "/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: ser({ address: payer.address }) });
const fj = await fr.json(); assert.ok(fj.hash, `faucet ${JSON.stringify(fj)}`); await pc.waitForTransactionReceipt({ hash: fj.hash });
const start = await bal(payer.address);
console.log("1. payer funded $" + Number(start) / 1e6);

// create: 3 payments of $5 every 30s, funded with a signed pull of $15 into the contract
const amount = $(5), period = 30, periods = 3, value = amount * 3n;
const auth = { from: payer.address, to: MANDATE, value, validAfter: 0n, validBefore: BigInt(Math.floor(Date.now() / 1000) + 3600), nonce: toHex(crypto.getRandomValues(new Uint8Array(32))) };
const sig = await payer.signTypedData({ domain: { name: "Agora Dollar", version: "1", chainId: chain.id, verifyingContract: AUSD }, types: { ReceiveWithAuthorization: AUTH }, primaryType: "ReceiveWithAuthorization", message: auth });
await forward(payer, encodeFunctionData({ abi: KinMandateAbi, functionName: "create", args: [payee.address, amount, period, periods, value, 0n, auth.validBefore, auth.nonce, sig] }));
const id = await pc.readContract({ address: MANDATE, abi: KinMandateAbi, functionName: "count" });
assert.equal(await bal(payer.address), start - value);
console.log(`2. AutoPay #${id} created: $5 × 3 every 30s (payer −$15, held by contract)`);

// nothing due yet → cron collects nothing for this id
const cron = async () => (await fetch(B + "/api/cron/autopay", { headers: { authorization: `Bearer ${E.CRON_SECRET}` } })).json();
assert.equal(await pc.readContract({ address: MANDATE, abi: KinMandateAbi, functionName: "due", args: [id] }), 0);
console.log("3. due now: 0 (first payment is one period after setup)");

await sleep(65_000);
const dueNow = await pc.readContract({ address: MANDATE, abi: KinMandateAbi, functionName: "due", args: [id] });
assert.equal(dueNow, 2);
const c = await cron();
assert.ok(c.collected.includes(id.toString()), `cron ${JSON.stringify(c)}`);
// the job sends the collect and returns; give the block ~a few seconds to land
for (let i = 0; i < 20 && (await bal(payee.address)) < $(10); i++) await sleep(500);
assert.equal(await bal(payee.address), $(10));
console.log(`4. after 65s: ${dueNow} due → daily job collected → payee +$10`);

// payee can't stop it
assert.notEqual(await forward(payee, encodeFunctionData({ abi: KinMandateAbi, functionName: "cancel", args: [id] }), false), 200);
console.log("5. payee tried to stop → rejected");

// payer stops before the 3rd payment: remaining $5 refunded
await forward(payer, encodeFunctionData({ abi: KinMandateAbi, functionName: "cancel", args: [id] }));
const [p, q] = [await bal(payer.address), await bal(payee.address)];
assert.equal(p + q, start, "money conserved");
console.log(`6. payer stopped → payer $${Number(p) / 1e6}, payee $${Number(q) / 1e6} (conserved: ${p + q === start})`);
assert.equal(await pc.readContract({ address: MANDATE, abi: KinMandateAbi, functionName: "due", args: [id] }), 0);
console.log("7. nothing left due; AutoPay finished");
