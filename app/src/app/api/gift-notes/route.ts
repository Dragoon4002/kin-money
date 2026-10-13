import { isAddressEqual, type Address } from "viem";
import { KinEscrowAbi } from "@/lib/abi";
import { addr, publicClient } from "@/lib/chain";
import { cleanText } from "@/lib/invoiceMeta";
import { allowShared, bad, q, route } from "@/lib/server/graph";

// (:GiftNote {id, from, to, body, at}) — the message on a Kin-name gift. KinEscrow has no message field, so the
// note lives here keyed by escrow id; the money (amount, date, who) is always read from the chain.
// Gift links keep their message in the link itself (lib/giftLinks.ts), never here.

const ESCROW_ID = /^\d{1,30}$/;
const MAX_NOTE = 120;

const escrow = (id: string) =>
  publicClient.readContract({ address: addr.escrow, abi: KinEscrowAbi, functionName: "escrows", args: [BigInt(id)] });

/** ?id=<escrow id> → {body} for the gift's sender or recipient, else {body: null}. */
export function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  return route(req, { body: null }, async (me) => {
    if (!id || !ESCROW_ID.test(id)) return bad();
    const [r] = await q<{ body: string }>(`MATCH (n:GiftNote {id: $id}) WHERE $me IN [n.from, n.to] RETURN n.body AS body`, { id, me });
    return { body: r?.body ?? null };
  });
}

/** {id, body} → sender only, checked onchain; first write wins (the note can't be swapped after it's sent). */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    if (!(await allowShared(`giftnotes:${me}`, 30, 3_600_000))) return bad("slow down", 429);
    const id = typeof b.id === "string" && ESCROW_ID.test(b.id) ? b.id : null;
    const body = cleanText(b.body, MAX_NOTE);
    if (!id || !body) return bad();
    const [from, , , , , to] = await escrow(id);
    if (!isAddressEqual(from, me)) return bad("forbidden", 403);
    await q(`MERGE (n:GiftNote {id: $id}) ON CREATE SET n.from = $me, n.to = $to, n.body = $body, n.at = timestamp()`, {
      id, me, to: to as Address, body,
    });
    return { ok: true };
  });
}
