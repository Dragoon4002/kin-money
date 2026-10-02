import { bad, q, route } from "@/lib/server/graph";

/** Notification center: {items (newest 50), unread}. Stored by notify() in lib/server/push.ts. */
export function GET(req: Request) {
  return route(req, { items: [], unread: 0 }, async (me) => {
    const [items, [{ unread }]] = await Promise.all([
      q(
        `MATCH (:Person {address: $me})-[:INBOX]->(n:Notification)
         RETURN n.id AS id, n.title AS title, n.body AS body, n.url AS url, n.at AS at, n.read AS read
         ORDER BY n.at DESC LIMIT 50`,
        { me },
      ),
      q<{ unread: number }>(`OPTIONAL MATCH (:Person {address: $me})-[:INBOX]->(n:Notification {read: false}) RETURN count(n) AS unread`, { me }),
    ]);
    return { items, unread };
  });
}

/** {action: "read", ids: string[]} or {action: "read", all: true}. */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    const ids = Array.isArray(b.ids) && b.ids.length <= 100 && b.ids.every((i) => typeof i === "string") ? b.ids : null;
    if (b.action !== "read" || (b.all !== true && !ids)) return bad();
    await q(
      `MATCH (:Person {address: $me})-[:INBOX]->(n:Notification {read: false}) WHERE $all OR n.id IN $ids SET n.read = true`,
      { me, all: b.all === true, ids: ids ?? [] },
    );
    return { ok: true };
  });
}
