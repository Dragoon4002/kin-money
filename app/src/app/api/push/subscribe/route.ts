import { allowShared, bad, q, route, UPSERT_ME } from "@/lib/server/graph";

// Register / remove a device for push. Web: browser PushSubscription. Expo: Android/iOS app token.
// Endpoints are limited to the real push services so the server never POSTs to arbitrary URLs.
const PUSH_HOST = /^https:\/\/(fcm\.googleapis\.com|([a-z0-9-]+\.)*(push\.apple\.com|push\.services\.mozilla\.com|notify\.windows\.com))\//;
const MAX_SUBS = 5; // devices per person (audit: unbounded subs = fan-out amplification)
const EXPO = /^Expo(nent)?PushToken\[[\w-]{10,200}\]$/;
const str = (v: unknown, max = 1000): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

function parse(b: Record<string, unknown>): { id: string; kind: "web" | "expo"; json: string } | null {
  if (b.kind === "expo") return str(b.token) && EXPO.test(b.token) ? { id: b.token, kind: "expo", json: b.token } : null;
  if (b.kind !== "web" || !b.subscription || typeof b.subscription !== "object") return null;
  const s = b.subscription as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const { endpoint, keys } = s;
  if (!str(endpoint) || !PUSH_HOST.test(endpoint) || !str(keys?.p256dh, 200) || !str(keys?.auth, 100)) return null;
  return { id: endpoint, kind: "web", json: JSON.stringify({ endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } }) };
}

export const POST = (req: Request) =>
  route(req, { ok: true }, async (me, body) => {
    const s = parse(body);
    if (!s) return bad();
    if (!(await allowShared(`pushsub:${me}`, 10, 3_600_000))) return bad("slow down", 429);
    // One device = one account: re-point the subscription if it belonged to someone else before.
    await q(
      `${UPSERT_ME}
       MERGE (s:PushSub {id: $id}) SET s.kind = $kind, s.json = $json, s.at = timestamp()
       WITH me, s OPTIONAL MATCH (other:Person)-[old:PUSH]->(s) WHERE other <> me DELETE old
       WITH DISTINCT me, s MERGE (me)-[:PUSH]->(s)`,
      { me, meName: null, ...s },
    );
    // Keep the newest MAX_SUBS devices.
    await q(
      `MATCH (:Person {address: $me})-[:PUSH]->(s:PushSub) WITH s ORDER BY s.at DESC SKIP ${MAX_SUBS} DETACH DELETE s`, // constant, not input
      { me },
    );
    return { ok: true };
  });

export const DELETE = (req: Request) =>
  route(req, { ok: true }, async (me, body) => {
    const s = parse(body);
    if (!s) return bad();
    await q("MATCH (:Person {address: $me})-[:PUSH]->(s:PushSub {id: $id}) DETACH DELETE s", { me, id: s.id });
    return { ok: true };
  });
