import { q, route, UPSERT_ME, verifiedName } from "@/lib/server/graph";

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
 */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    const look = cleanLook(b.look);
    await q(`${UPSERT_ME} SET me.look = coalesce($look, me.look) RETURN me.address`, { me, meName: await verifiedName(me), look });
    return { ok: true };
  });
}
