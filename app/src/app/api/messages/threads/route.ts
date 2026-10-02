import { q, route } from "@/lib/server/graph";

/**
 * My chats, latest first: [{with: {address, name}, last, unread, status}].
 * status "request" = they wrote, but I never wrote back, saved, paid or accepted them; "blocked" = I blocked them.
 */
export function GET(req: Request) {
  return route(req, [], (me) =>
    q(
      `MATCH (me:Person {address: $me})-[:SENT|TO]-(m:Message)-[:SENT|TO]-(o:Person)
       WITH me, o, m ORDER BY m.at DESC
       WITH me, o, collect(m) AS ms
       WITH me, o, ms[0] AS l, size([x IN ms WHERE x.to = $me AND NOT x.read]) AS unread
       RETURN {address: o.address, name: coalesce(o.name, '')} AS \`with\`,
              l {.id, .from, .to, .body, .kind, .ref, .at} AS last, unread,
              CASE WHEN (me)-[:BLOCKED]->(o) THEN 'blocked'
                   WHEN (me)-[:SENT]->(:Message)-[:TO]->(o) OR (me)-[:KNOWS|PAID|ACCEPTED]->(o) THEN 'ok'
                   ELSE 'request' END AS status
       ORDER BY l.at DESC LIMIT 100`,
      { me },
    ),
  );
}
