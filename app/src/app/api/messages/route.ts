import { addrOf, bad, q, route, UPSERT_ME, UPSERT_THEM, verifiedName } from "@/lib/server/graph";
import { blocked, saveMessage } from "@/lib/server/messages";
import { notify } from "@/lib/server/push";

const RATE = 30; // text messages per sender per minute

/**
 * ?with=0x..&before=<ms> → the newest 50 messages of that thread (before `before`), oldest first.
 * "request" messages carry `req: {amount, note, status, due}` from the live request.
 */
export function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  return route(req, [], async (me) => {
    const them = addrOf(u.get("with"));
    const before = Number(u.get("before") || Date.now() + 60_000);
    if (!them || !Number.isFinite(before)) return bad();
    const rows = await q(
      `MATCH (:Person {address: $me})-[:SENT|TO]-(m:Message)-[:SENT|TO]-(:Person {address: $them})
       WHERE m.at < $before
       WITH m ORDER BY m.at DESC LIMIT 50
       OPTIONAL MATCH (:Person {address: m.from})-[r:REQUESTED {id: m.ref}]->() WHERE m.kind = 'request'
       RETURN m.id AS id, m.from AS \`from\`, m.to AS to, m.body AS body, m.kind AS kind, m.ref AS ref, m.at AS at, m.read AS read,
              CASE WHEN r IS NULL THEN null ELSE {amount: r.amount, note: r.note, status: r.status, due: r.due} END AS req
       ORDER BY at`,
      { me, them, before },
    );
    return rows;
  });
}

/**
 * {to, body} → send a text (≤1000 chars, 30/min, 403 if blocked either way).
 * {action: "read", with} → mark their messages to me read.
 * {action: "block" | "unblock" | "accept", address}.
 */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    if (b.action === "read") {
      const them = addrOf(b.with);
      if (!them) return bad();
      await q(`MATCH (:Person {address: $them})-[:SENT]->(m:Message)-[:TO]->(:Person {address: $me}) WHERE NOT m.read SET m.read = true`, { me, them });
      return { ok: true };
    }
    if (b.action === "block" || b.action === "unblock" || b.action === "accept") {
      const them = addrOf(b.address);
      if (!them || them === me) return bad();
      const cypher = {
        block: `MERGE (me)-[:BLOCKED]->(p)`,
        unblock: `WITH me, p OPTIONAL MATCH (me)-[x:BLOCKED]->(p) DELETE x`,
        accept: `MERGE (me)-[:ACCEPTED]->(p)`,
      }[b.action];
      await q(`${UPSERT_ME} WITH me MATCH (p:Person {address: $them}) ${cypher}`, { me, meName: null, them });
      return { ok: true };
    }

    const them = addrOf(b.to);
    const body = typeof b.body === "string" ? b.body.trim() : "";
    if (!them || them === me || !body || body.length > 1000) return bad();
    if (await blocked(me, them)) return bad("blocked", 403);
    const [{ n }] = await q<{ n: number }>(
      `MATCH (:Person {address: $me})-[:SENT]->(m:Message {kind: 'text'}) WHERE m.at > $since RETURN count(m) AS n`,
      { me, since: Date.now() - 60_000 },
    );
    if (n >= RATE) return bad("too many", 429);
    const [meName, themName] = await Promise.all([verifiedName(me), verifiedName(them)]);
    if (!themName) return bad("That account isn't on Kin");
    await q(`${UPSERT_ME} WITH me ${UPSERT_THEM}`, { me, meName, them, themName });
    const m = await saveMessage(me, them, "text", body);
    // Chat texts skip the notification center (the Messages badge covers them); push still goes to the phone.
    await notify(them, { title: meName ? `@${meName}` : "New message", body: body.slice(0, 140), url: `/messages/${me}`, tag: `chat-${me}` }, { inbox: false });
    return m;
  });
}
