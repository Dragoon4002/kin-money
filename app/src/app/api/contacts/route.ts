import type { Address } from "viem";
import { addrOf, bad, phoneHash, q, route, UPSERT_ME, UPSERT_THEM, verifiedName } from "@/lib/server/graph";

const EMPTY = { contacts: [], recents: [], suggested: [] };

/** My saved people, recents (by last payment), and friends-of-friends. */
export function GET(req: Request) {
  return route(req, EMPTY, async (me) => {
    const [contacts, recents, suggested] = await Promise.all([
      q(
        `MATCH (:Person {address: $me})-[k:KNOWS]->(p:Person)
         RETURN p.address AS address, coalesce(p.name, '') AS name, coalesce(k.label, '') AS label
         ORDER BY toLower(coalesce(k.label, p.name, '')) LIMIT 200`,
        { me },
      ),
      q(
        `MATCH (:Person {address: $me})-[r:PAID]->(p:Person)
         RETURN p.address AS address, coalesce(p.name, '') AS name, r.count AS count, r.total AS total, r.last AS last
         ORDER BY r.last DESC LIMIT 12`,
        { me },
      ),
      q(
        `MATCH (me:Person {address: $me})-[:KNOWS|PAID]-(f:Person)-[:KNOWS|PAID]-(s:Person)
         WHERE s <> me AND s.name IS NOT NULL AND NOT (me)-[:KNOWS|PAID]->(s)
         RETURN s.address AS address, s.name AS name, count(DISTINCT f) AS mutual
         ORDER BY mutual DESC LIMIT 10`,
        { me },
      ),
    ]);
    return { contacts, recents, suggested };
  });
}

/**
 * Save a contact: {address, label} or {phone, label}. Optional {myPhone} registers my own number.
 * Names are read onchain; client-sent names are ignored. Phones are stored only as HMAC.
 */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    const label = typeof b.label === "string" ? b.label.trim().slice(0, 40) : "";
    const myPhone = b.myPhone === undefined ? null : phoneHash(b.myPhone);
    if (b.myPhone !== undefined && !myPhone) return bad("phone");

    let them: Address | null = addrOf(b.address);
    if (!them && b.phone !== undefined) {
      const h = phoneHash(b.phone);
      if (!h) return bad("phone");
      const [hit] = await q<{ address: Address }>(`MATCH (p:Person {phoneHash: $h}) RETURN p.address AS address LIMIT 1`, { h });
      if (!hit) return bad("not found", 404);
      them = hit.address;
    }
    if (them === me) return bad();
    if (!them && !myPhone) return bad();

    const [meName, themName] = await Promise.all([verifiedName(me), them ? verifiedName(them) : null]);
    await q(
      `${UPSERT_ME}
       SET me.phoneHash = coalesce($myPhone, me.phoneHash)
       ${them ? `WITH me
       ${UPSERT_THEM}
       MERGE (me)-[k:KNOWS]->(p) ON CREATE SET k.since = timestamp()
       SET k.label = $label` : ""}`,
      { me, meName, myPhone, them, themName, label },
    );
    return { ok: true };
  });
}
