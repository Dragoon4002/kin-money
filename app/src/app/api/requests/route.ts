import { randomUUID } from "node:crypto";
import { erc20Abi, isAddressEqual, isHash, parseEventLogs, type Address, type Hex } from "viem";
import { addr, publicClient } from "@/lib/chain";
import { addrOf, bad, q, route, UPSERT_ME, UPSERT_THEM, validAmount, verifiedName } from "@/lib/server/graph";

// (requester)-[:REQUESTED {id, amount, note, status, at}]->(payer)

type Row = { id: string; from: { address: Address; name: string }; to: { address: Address; name: string }; amount: string; note: string; status: string; at: number };

/** Requests I received (incoming) and sent (outgoing), newest first. */
export function GET(req: Request) {
  return route(req, { incoming: [], outgoing: [] }, async (me) => {
    const rows = await q<Row>(
      `MATCH (a:Person)-[r:REQUESTED]->(b:Person) WHERE a.address = $me OR b.address = $me
       RETURN r.id AS id, {address: a.address, name: coalesce(a.name, '')} AS \`from\`,
              {address: b.address, name: coalesce(b.name, '')} AS \`to\`,
              r.amount AS amount, r.note AS note, r.status AS status, r.at AS at
       ORDER BY r.at DESC LIMIT 100`,
      { me },
    );
    return { incoming: rows.filter((r) => r.to.address === me), outgoing: rows.filter((r) => r.from.address === me) };
  });
}

/** Ask someone for money: {to, amount (base units string), note}. */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    const them = addrOf(b.to);
    if (!them || them === me || !validAmount(b.amount)) return bad();
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 140) : "";
    const id = randomUUID();
    const [meName, themName] = await Promise.all([verifiedName(me), verifiedName(them)]);
    await q(
      `${UPSERT_ME}
       WITH me
       ${UPSERT_THEM}
       CREATE (me)-[:REQUESTED {id: $id, amount: $amount, note: $note, status: 'open', at: timestamp()}]->(p)`,
      { me, meName, them, themName, id, amount: b.amount, note },
    );
    return { id };
  });
}

/**
 * Payer settles an open request: {id, status: "declined"} or {id, status: "paid", hash}.
 * Only the payer (`to`) may settle; "paid" must point at a delivered transfer to the requester for ≥ amount.
 */
export function PATCH(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    if (typeof b.id !== "string" || (b.status !== "paid" && b.status !== "declined")) return bad();
    const [open] = await q<{ from: Address; amount: string }>(
      `MATCH (a:Person)-[r:REQUESTED {id: $id}]->(:Person {address: $me}) WHERE r.status = 'open'
       RETURN a.address AS \`from\`, r.amount AS amount`,
      { me, id: b.id },
    );
    if (!open) return bad("not found", 404);
    if (b.status === "paid" && !(typeof b.hash === "string" && isHash(b.hash) && (await paidOnchain(b.hash, me, open.from, BigInt(open.amount))))) return bad("unpaid");
    await q(`MATCH ()-[r:REQUESTED {id: $id}]->() WHERE r.status = 'open' SET r.status = $status`, { id: b.id, status: b.status });
    return { ok: true };
  });
}

async function paidOnchain(hash: Hex, from: Address, to: Address, min: bigint): Promise<boolean> {
  const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
  if (receipt?.status !== "success") return false;
  const logs = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs.filter((l) => isAddressEqual(l.address, addr.ausd)) });
  return logs.some((l) => isAddressEqual(l.args.from, from) && isAddressEqual(l.args.to, to) && l.args.value >= min);
}
