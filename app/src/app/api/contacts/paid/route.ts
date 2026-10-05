import type { Hex } from "viem";
import { allowShared, addrOf, bad, q, route, UPSERT_ME, UPSERT_THEM, validAmount, verifiedName } from "@/lib/server/graph";
import { saveMessage } from "@/lib/server/messages";
import { paidValue } from "@/lib/server/paid";

// The amount here only feeds my own recents/"frequent". The "paid you ✓✓" card in the other person's chat is only
// written for a delivered on-chain transfer (hash checked, amount read from the log) — never from client input (audit).
/** Upsert PAID {count, total, last} after a delivered payment; with `hash`, also post the payment card in our chat. */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    const them = addrOf(b.to);
    if (!them || them === me || !validAmount(b.amount)) return bad();
    if (!(await allowShared(`paid:${me}`, 60, 3_600_000))) return Response.json({ error: "slow down" }, { status: 429 });
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
    if (typeof b.hash === "string" && /^0x[0-9a-fA-F]{64}$/.test(b.hash)) {
      const value = await paidValue(b.hash as Hex, me, them);
      if (value > 0n && (await allowShared(`paidcard:${b.hash.toLowerCase()}`, 1, 86_400_000))) {
        await saveMessage(me, them, "payment", "", value.toString()); // one card per tx
      }
    }
    return { ok: true };
  });
}
