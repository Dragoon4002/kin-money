import { q, route, UPSERT_ME, verifiedName } from "@/lib/server/graph";

/** Register the caller in the phonebook (sign-up, unlock, after collecting a link) so others can find them. */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me) => {
    await q(`${UPSERT_ME} RETURN me.address`, { me, meName: await verifiedName(me) });
    return { ok: true };
  });
}
