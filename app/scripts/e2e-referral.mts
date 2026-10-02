// Live referral check against a running server (default http://localhost:3271). Claims 3 throwaway zzr… names (gasless).
// Run: node --experimental-strip-types --no-warnings --env-file=.env.local scripts/e2e-referral.mts
import assert from "node:assert/strict";
import neo4j from "neo4j-driver";
import { createPublicClient, encodeFunctionData, http, parseAbi, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { monadTestnet as chain } from "viem/chains";

const B = process.env.BASE ?? "http://localhost:3271";
const E = process.env;
const pc = createPublicClient({ chain, transport: http(E.NEXT_PUBLIC_RPC_URL) });
const FWD = E.NEXT_PUBLIC_FORWARDER as Hex, NAMES = E.NEXT_PUBLIC_KIN_NAMES as Hex;
const tag = String(Math.floor(Math.random() * 1e5)).padStart(5, "0");
const [A, Bo, C] = ["a", "b", "c"].map((s) => ({ name: `zzr${tag}${s}`, acct: privateKeyToAccount(generatePrivateKey()) }));
type U = typeof A;
type Invites = { invited: { name: string; at: number }[]; invitedBy: string | null };
const ser = (o: unknown) => JSON.stringify(o, (_, v) => (typeof v === "bigint" ? v.toString() : v));

async function api<T>(u: U, path: string, method = "GET", body?: unknown): Promise<T> {
  const ts = Math.floor(Date.now() / 1000);
  const sig = await u.acct.signMessage({ message: `Kin contacts ${u.acct.address} ${ts}` });
  const r = await fetch(B + path, { method, headers: { "content-type": "application/json", "x-kin-address": u.acct.address, "x-kin-ts": String(ts), "x-kin-sig": sig }, body: body ? ser(body) : undefined });
  assert.ok(r.ok, `${method} ${path} ${r.status}`);
  return r.json() as Promise<T>;
}
async function claimName(u: U) {
  const data = encodeFunctionData({ abi: parseAbi(["function claim(string)"]), functionName: "claim", args: [u.name] });
  const nonce = await pc.readContract({ address: FWD, abi: parseAbi(["function nonces(address) view returns (uint256)"]), functionName: "nonces", args: [u.acct.address] });
  const req = { from: u.acct.address, to: NAMES, value: 0n, gas: 150_000n, nonce, deadline: Math.floor(Date.now() / 1000) + 600, data };
  const signature = await u.acct.signTypedData({
    domain: { name: "Kin", version: "1", chainId: chain.id, verifyingContract: FWD },
    types: { ForwardRequest: [{ name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" }, { name: "gas", type: "uint256" }, { name: "nonce", type: "uint256" }, { name: "deadline", type: "uint48" }, { name: "data", type: "bytes" }] },
    primaryType: "ForwardRequest", message: req,
  });
  const r = await fetch(B + "/api/relay", { method: "POST", headers: { "content-type": "application/json" }, body: ser({ kind: "2771", request: { ...req, nonce: undefined, signature } }) });
  const j = await r.json();
  assert.ok(r.ok, `relay ${r.status} ${JSON.stringify(j)}`);
  assert.equal((await pc.waitForTransactionReceipt({ hash: j.hash })).status, "success");
}
const invites = (u: U) => api<Invites>(u, "/api/invites");
const db = neo4j.driver(E.NEO4J_URI!, neo4j.auth.basic((E.NEO4J_USERNAME ?? E.NEO4J_USER)!, E.NEO4J_PASSWORD!));

try {
  for (const u of [A, Bo, C]) { await claimName(u); await api(u, "/api/contacts/me", "POST", {}); }
  console.log("1. names claimed + registered:", [A, Bo, C].map((u) => "@" + u.name).join(" "));

  await api(A, "/api/contacts/me", "POST", { ref: A.name });
  assert.equal((await invites(A)).invitedBy, null, "self-ref ignored");
  assert.equal((await invites(A)).invited.length, 0);
  console.log("2. self-ref ignored");

  await api(C, "/api/contacts/me", "POST", { ref: A.name.toUpperCase() });
  const a = await invites(A);
  assert.deepEqual(a.invited.map((p) => p.name), [C.name]);
  assert.equal((await invites(C)).invitedBy, A.name);
  const knows = (await db.executeQuery("MATCH (x:Person {address:$a})-[:KNOWS]->(y:Person {address:$c}), (y)-[:KNOWS]->(x) RETURN count(*) AS n", { a: A.acct.address, c: C.acct.address })).records[0].get("n");
  assert.equal(Number(knows), 1, "KNOWS both ways");
  console.log("3. invitee registered with ref → inviter sees", a.invited[0].name, "; KNOWS both ways");

  await api(C, "/api/contacts/me", "POST", { ref: Bo.name });
  await api(C, "/api/contacts/me", "POST", { ref: A.name }); // unlock again: idempotent
  assert.equal((await invites(C)).invitedBy, A.name, "first referrer wins");
  assert.equal((await invites(Bo)).invited.length, 0);
  assert.equal((await invites(A)).invited.length, 1);
  const edges = (await db.executeQuery("MATCH ()-[r:INVITED]->(:Person {address:$c}) RETURN count(r) AS n", { c: C.acct.address })).records[0].get("n");
  assert.equal(Number(edges), 1, "one INVITED edge");
  console.log("4. later ref ignored + repeat registration idempotent");

  await api(Bo, "/api/contacts/me", "POST", { ref: "nobody_here_zz" }); // unclaimed handle
  assert.equal((await invites(Bo)).invitedBy, null);
  console.log("5. unknown handle ignored");
} finally {
  await db.executeQuery("MATCH (p:Person) WHERE p.address IN $a OPTIONAL MATCH (p)-[:PUSH]->(s) DETACH DELETE s, p", { a: [A, Bo, C].map((u) => u.acct.address) });
  console.log("6. cleaned up");
  await db.close();
}
