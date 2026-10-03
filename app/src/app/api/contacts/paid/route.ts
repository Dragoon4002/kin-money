import { saveMessage } from "@/lib/server/messages";
import { addrOf, bad, q, route, UPSERT_ME, UPSERT_THEM, validAmount, verifiedName } from "@/lib/server/graph";

// ponytail: amount is client-reported (drives recents/"frequent" only, never money). Verify against the receipt if it ever feeds anything financial.
/** Upsert PAID {count, total, last} after a delivered payment. */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    const them = addrOf(b.to);
    if (!them || them === me || !validAmount(b.amount)) return bad();
    const [meName, themName] = await Promise.all([verifiedName(me), verifiedName(them)]);
    if (!themName) return { ok: true }; // not on Kin: never add a bare address to the phonebook
    await q(
      `${UPSERT_ME}
       WITH me
       ${UPSERT_THEM}
       MERGE (me)-[r:PAID]->(p) ON CREATE SET r.count = 0, r.total = '0'
       SET r.count = r.count + 1, r.total = toString(toInteger(r.total) + toInteger($amount)), r.last = timestamp()`,
      { me, meName, them, themName, amount: b.amount },
    );
    await saveMessage(me, them, "payment", "", b.amount); // payment card in our chat
    return { ok: true };
  });
}
