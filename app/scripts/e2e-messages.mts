// Live e2e for messages + notification center against a running server (default http://localhost:3280).
// Run: node --experimental-strip-types --no-warnings --env-file=.env.local scripts/e2e-messages.mts
// Uses 2 throwaway accounts (no names, no money moves).
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";

const B = process.env.BASE ?? "http://localhost:3280";
const [A, Bb] = [0, 1].map(() => privateKeyToAccount(generatePrivateKey()));

async function call(u: PrivateKeyAccount, path: string, method = "GET", body?: unknown) {
  const ts = String(Math.floor(Date.now() / 1000));
  const sig = await u.signMessage({ message: `Kin contacts ${u.address} ${ts}` });
  const r = await fetch(B + path, {
    method,
    headers: { "x-kin-address": u.address, "x-kin-ts": ts, "x-kin-sig": sig, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => ({})) };
}
async function ok(u: PrivateKeyAccount, path: string, method = "GET", body?: unknown) {
  const r = await call(u, path, method, body);
  assert.ok(r.status < 300, `${method} ${path} → ${r.status} ${JSON.stringify(r.json)}`);
  return r.json;
}
type Thread = { with: { address: string }; unread: number; status: string; last: { body: string; kind: string } };
const threadWith = async (u: PrivateKeyAccount, other: string) => ((await ok(u, "/api/messages/threads")) as Thread[]).find((t) => t.with.address === other);

// 1. text A → B
const m = await ok(A, "/api/messages", "POST", { to: Bb.address, body: "hi from A" });
assert.equal(m.kind, "text");
assert.equal((await call(A, "/api/messages", "POST", { to: Bb.address, body: "x".repeat(1001) })).status, 400);
console.log("1. A sent text to B (1001 chars rejected)");

// 2. B sees it as a request, A sees a normal chat
const t = await threadWith(Bb, A.address);
assert.equal(t?.status, "request");
assert.equal(t?.unread, 1);
assert.equal(t?.last.body, "hi from A");
assert.equal((await threadWith(A, Bb.address))?.status, "ok");
console.log("2. B threads: status=request unread=1; A: status=ok");

// 3. accept
await ok(Bb, "/api/messages", "POST", { action: "accept", address: A.address });
assert.equal((await threadWith(Bb, A.address))?.status, "ok");
console.log("3. B accepted → status=ok");

// 4. read
const msgs = await ok(Bb, `/api/messages?with=${A.address}`);
assert.equal(msgs.length, 1);
assert.equal(msgs[0].read, false);
await ok(Bb, "/api/messages", "POST", { action: "read", with: A.address });
assert.equal((await threadWith(Bb, A.address))?.unread, 0);
console.log("4. B read thread → unread=0");

// 5. block both ways → 403
await ok(Bb, "/api/messages", "POST", { action: "block", address: A.address });
assert.equal((await threadWith(Bb, A.address))?.status, "blocked");
assert.equal((await call(A, "/api/messages", "POST", { to: Bb.address, body: "hello?" })).status, 403);
assert.equal((await call(Bb, "/api/messages", "POST", { to: A.address, body: "hello?" })).status, 403);
assert.equal((await call(A, "/api/requests", "POST", { to: Bb.address, amount: "1000000", note: "x" })).status, 403);
await ok(Bb, "/api/messages", "POST", { action: "unblock", address: A.address });
await ok(Bb, "/api/messages", "POST", { to: A.address, body: "ok back" });
console.log("5. blocked → 403 both ways (+ requests); unblock → can chat again");

// 6. request → inbox notification + request card in chat
const before = (await ok(Bb, "/api/inbox")).unread as number;
const { id: reqId } = await ok(A, "/api/requests", "POST", { to: Bb.address, amount: "2500000", note: "pizza" });
const inbox = await ok(Bb, "/api/inbox");
assert.equal(inbox.unread, before + 1);
assert.match(inbox.items[0].title, /asked you for \$2\.50/);
assert.equal(inbox.items[0].url, `/messages/${A.address}`);
const card = (await ok(Bb, `/api/messages?with=${A.address}`)).find((x: { kind: string }) => x.kind === "request");
assert.equal(card.ref, reqId);
assert.deepEqual([card.req.amount, card.req.status, card.req.note], ["2500000", "open", "pizza"]);
await ok(Bb, "/api/inbox", "POST", { action: "read", ids: [inbox.items[0].id] });
assert.equal((await ok(Bb, "/api/inbox")).unread, before);
await ok(Bb, "/api/inbox", "POST", { action: "read", all: true });
assert.equal((await ok(Bb, "/api/inbox")).unread, 0);
console.log("6. request → B inbox +1 ('asked you for $2.50'), chat card {open, $2.50}; read by id + all → 0");

// 7. decline shows on the card; payment record → payment message
await ok(Bb, "/api/requests", "PATCH", { id: reqId, status: "declined" });
const after = await ok(A, `/api/messages?with=${Bb.address}`);
assert.equal(after.find((x: { kind: string }) => x.kind === "request").req.status, "declined");
await ok(Bb, "/api/contacts/paid", "POST", { to: A.address, amount: "1000000" });
assert.equal((await threadWith(A, Bb.address))?.last.kind, "payment");
console.log("7. decline reflected on card; payment → payment message");

// 8. realtime auth: own channel only
const sock = "1234.5678";
const own = await call(A, "/api/pusher/auth", "POST", { socket_id: sock, channel_name: `private-user-${A.address.toLowerCase()}` });
const other = await call(A, "/api/pusher/auth", "POST", { socket_id: sock, channel_name: `private-user-${Bb.address.toLowerCase()}` });
if (process.env.PUSHER_APP_ID) assert.ok(own.status === 200 && typeof own.json.auth === "string", `own ${own.status}`);
assert.equal(other.status, 403);
assert.equal((await fetch(B + "/api/pusher/auth", { method: "POST", body: "{}" })).status, 401);
console.log(`8. pusher auth: own=${own.status} other=${other.status} unsigned=401`);

// 9. notify-added: non-member can't fan out notifications
assert.equal((await call(A, "/api/notify-added", "POST", { kind: "pot", id: "999999", addresses: [Bb.address] })).status, 403);
console.log("9. notify-added for a pot I'm not in → 403");
console.log("ALL OK");
