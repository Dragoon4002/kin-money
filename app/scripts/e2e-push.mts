// Live check of push wiring against a running server (default http://localhost:3260). No real device needed.
// Run: node --experimental-strip-types --no-warnings --env-file=.env.local scripts/e2e-push.mts
import assert from "node:assert/strict";
import neo4j from "neo4j-driver";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const B = process.env.BASE ?? "http://localhost:3260";
const E = process.env;
const u = privateKeyToAccount(generatePrivateKey());
const asker = privateKeyToAccount(generatePrivateKey());
async function api(path: string, method: string, body: unknown, signed = true, who = u) {
  const ts = Math.floor(Date.now() / 1000);
  const h: Record<string, string> = { "content-type": "application/json" };
  if (signed) Object.assign(h, { "x-kin-address": who.address, "x-kin-ts": String(ts), "x-kin-sig": await who.signMessage({ message: `Kin contacts ${who.address} ${ts}` }) });
  return fetch(B + path, { method, headers: h, body: JSON.stringify(body) });
}
const db = neo4j.driver(E.NEO4J_URI!, neo4j.auth.basic(E.NEO4J_USERNAME!, E.NEO4J_PASSWORD!));
const count = async () => Number((await db.executeQuery("MATCH (:Person {address:$a})-[:PUSH]->(s:PushSub) RETURN count(s) AS n", { a: u.address })).records[0].get("n"));

// A well-formed but dead FCM endpoint + valid-shape keys: push service will reject → notify must prune it.
const sub = { endpoint: `https://fcm.googleapis.com/fcm/send/dead-${Date.now()}`, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } };
assert.equal((await api("/api/push/subscribe", "POST", { kind: "web", subscription: sub }, false)).status, 401);
console.log("1. unsigned subscribe rejected (401)");
assert.equal((await api("/api/push/subscribe", "POST", { kind: "web", subscription: { ...sub, endpoint: "https://evil.example/x" } })).status, 400);
console.log("2. non-push-service endpoint rejected (400)");
assert.ok((await api("/api/push/subscribe", "POST", { kind: "web", subscription: sub })).ok);
assert.ok((await api("/api/push/subscribe", "POST", { kind: "expo", token: "ExponentPushToken[deadtoken000000000000]" })).ok);
console.log("3. web + expo subscriptions stored:", await count());
// Someone requests money from u → server calls notify(u) → both dead subscriptions get pruned.
const r = await api("/api/requests", "POST", { to: u.address, amount: "1000000", note: "push test" }, true, asker);
assert.ok(r.ok, `request ${r.status}`);
for (let i = 0; i < 20 && (await count()) > 0; i++) await new Promise((s) => setTimeout(s, 500));
assert.equal(await count(), 0, "dead subscriptions pruned");
console.log("4. request → notify(): both dead subscriptions pruned (410 / DeviceNotRegistered)");
await db.executeQuery("MATCH (p:Person) WHERE p.address IN $a OPTIONAL MATCH (p)-[:PUSH]->(s) DETACH DELETE s, p", { a: [u.address, asker.address] });
console.log("5. cleaned up"); await db.close();
