import { resolveName, HANDLE_RE } from "@/lib/names";
import { q, route, UPSERT_ME, verifiedName } from "@/lib/server/graph";
import { notify } from "@/lib/server/push";

const ID = /^[a-z]{2,12}$/;

/** Kinko look from the client → compact JSON, or null if malformed. Cosmetic only (ids are rendered or ignored). */
function cleanLook(v: unknown): string | null {
  if (!v || typeof v !== "object") return null;
  const { skin, expression, accessories } = v as Record<string, unknown>;
  if (typeof skin !== "string" || !ID.test(skin) || typeof expression !== "string" || !ID.test(expression)) return null;
  const acc = Array.isArray(accessories) ? accessories.filter((a): a is string => typeof a === "string" && ID.test(a)).slice(0, 4) : [];
  return JSON.stringify({ skin, expression, accessories: acc });
}

/**
 * Register the caller in the phonebook (sign-up, unlock, after collecting a link) so others can
 * find them; optionally publish their Kinko look so others see their character.
 * `ref` = the @name whose invite link they opened. First referrer wins, forever; self-refs ignored.
 */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    const look = cleanLook(b.look);
    const meName = await verifiedName(me);
    await q(`${UPSERT_ME} SET me.look = coalesce($look, me.look) RETURN me.address`, { me, meName, look });

    const ref = typeof b.ref === "string" ? b.ref.toLowerCase() : "";
    const inviter = HANDLE_RE.test(ref) ? await resolveName(ref).catch(() => null) : null;
    if (!inviter || inviter === me) return { ok: true };
    // ponytail: check-then-create isn't atomic; two simultaneous unlocks could double-edge. Harmless (lists dedupe by DISTINCT).
    const [hit] = await q<{ created: boolean }>(
      `MATCH (me:Person {address: $me})
       WHERE NOT ()-[:INVITED]->(me)
       MERGE (i:Person {address: $inviter}) ON CREATE SET i.createdAt = timestamp()
       SET i.name = $ref
       CREATE (i)-[:INVITED {at: timestamp()}]->(me)
       MERGE (i)-[a:KNOWS]->(me) ON CREATE SET a.since = timestamp()
       MERGE (me)-[c:KNOWS]->(i) ON CREATE SET c.since = timestamp()
       RETURN true AS created`,
      { me, inviter, ref },
    );
    if (hit?.created) {
      await notify(inviter, { title: `${meName ? `@${meName}` : "Someone"} joined Kin with your invite 🎉`, body: "You both got a party hat for Kinko.", url: "/invite" });
    }
    return { ok: true };
  });
}
