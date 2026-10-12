import { randomUUID } from "node:crypto";
import { erc20Abi, isAddressEqual, isHash, parseEventLogs, type Address, type Hex } from "viem";
import { addr, publicClient } from "@/lib/chain";
import { formatMoney } from "@/lib/money";
import { REMIND_GAP, validDue } from "@/lib/reminders";
import { addrOf, allowShared, bad, q, route, UPSERT_ME, UPSERT_THEM, validAmount, verifiedName } from "@/lib/server/graph";
import { blocked, saveMessage } from "@/lib/server/messages";
import { notify } from "@/lib/server/push";

// (requester)-[:REQUESTED {id, amount, note, status, at, due?, remindedAt?}]->(payer)

type Row = { id: string; from: { address: Address; name: string }; to: { address: Address; name: string }; amount: string; note: string; status: string; at: number; due: number | null; remindedAt: number | null };

const usd = (units: string) => formatMoney(BigInt(units), "USD");

/** Requests I received (incoming) and sent (outgoing), newest first. */
export function GET(req: Request) {
  return route(req, { incoming: [], outgoing: [] }, async (me) => {
    const rows = await q<Row>(
      `MATCH (a:Person)-[r:REQUESTED]->(b:Person) WHERE a.address = $me OR b.address = $me
       RETURN r.id AS id, {address: a.address, name: coalesce(a.name, '')} AS \`from\`,
              {address: b.address, name: coalesce(b.name, '')} AS \`to\`,
              r.amount AS amount, r.note AS note, r.status AS status, r.at AS at,
              r.due AS due, r.remindedAt AS remindedAt
       ORDER BY r.at DESC LIMIT 100`,
      { me },
    );
    return { incoming: rows.filter((r) => r.to.address === me), outgoing: rows.filter((r) => r.from.address === me) };
  });
}

/** Ask someone for money: {to, amount (base units string), note, due?}. Or nudge the payer: {action: "remind", id}. */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    if (b.action === "remind") return remind(me, b.id);
    const them = addrOf(b.to);
    const due = b.due == null ? null : validDue(b.due) ? b.due : undefined;
    if (!them || them === me || !validAmount(b.amount) || due === undefined) return bad();
    const note = typeof b.note === "string" ? b.note.trim().slice(0, 140) : "";
    if (await blocked(me, them)) return bad("blocked", 403);
    if (!(await allowShared(`requests:${me}`, 30, 3_600_000))) return bad("slow down", 429); // each one pushes + posts a card
    const id = randomUUID();
    const [meName, themName] = await Promise.all([verifiedName(me), verifiedName(them)]);
    if (!themName) return bad("That account isn't on Kin");
    await q(
      `${UPSERT_ME}
       WITH me
       ${UPSERT_THEM}
       CREATE (me)-[:REQUESTED {id: $id, amount: $amount, note: $note, status: 'open', at: timestamp(), due: $due}]->(p)`,
      { me, meName, them, themName, id, amount: b.amount, note, due },
    );
    await saveMessage(me, them, "request", note, id); // shows as a Pay/Decline card in their chat with me
    await notify(them, { title: `@${meName ?? "someone"} asked you for ${usd(b.amount)}`, body: note || "Tap to pay or decline.", url: `/messages/${me}`, tag: `req-${id}` });
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
    const [open] = await q<{ from: Address; amount: string; at: number }>(
      `MATCH (a:Person)-[r:REQUESTED {id: $id}]->(:Person {address: $me}) WHERE r.status = 'open'
       RETURN a.address AS \`from\`, r.amount AS amount, r.at AS at`,
      { me, id: b.id },
    );
    if (!open) return bad("not found", 404);
    if (b.status === "declined") {
      await q(`MATCH ()-[r:REQUESTED {id: $id}]->() WHERE r.status = 'open' SET r.status = 'declined'`, { id: b.id });
      return { ok: true };
    }
    if (typeof b.hash !== "string" || !isHash(b.hash)) return bad("unpaid");
    const hash = b.hash.toLowerCase();
    if ((await q(`MATCH (u:RequestPayment {hash: $hash}) RETURN u.hash`, { hash })).length) return bad("used");
    if (!(await paidOnchain(b.hash, me, open.from, BigInt(open.amount), open.at))) return bad("unpaid");
    // One payment settles one request: RequestPayment.hash is unique (constraint in graph.ts), MERGE claims it.
    const [r] = await q<{ n: number }>(
      `MATCH ()-[r:REQUESTED {id: $id}]->() WHERE r.status = 'open'
       MERGE (u:RequestPayment {hash: $hash}) ON CREATE SET u.request = $id
       WITH r, u WHERE u.request = $id
       SET r.status = 'paid' RETURN count(r) AS n`,
      { id: b.id, hash },
    );
    return r?.n ? { ok: true } : bad("used");
  });
}

/** Requester only, open requests only, once per 12h. */
async function remind(me: Address, id: unknown) {
  if (typeof id !== "string") return bad();
  const [r] = await q<{ to: Address; name: string; amount: string; ok: boolean }>(
    `MATCH (a:Person {address: $me})-[r:REQUESTED {id: $id}]->(b:Person) WHERE r.status = 'open'
     WITH a, b, r, coalesce(r.remindedAt, 0) <= $cutoff AS ok
     FOREACH (_ IN CASE WHEN ok THEN [1] ELSE [] END | SET r.remindedAt = timestamp())
     RETURN b.address AS to, coalesce(a.name, '') AS name, r.amount AS amount, ok`,
    { me, id, cutoff: Date.now() - REMIND_GAP },
  );
  if (!r) return bad("not found", 404);
  if (!r.ok) return bad("too soon", 429);
  await notify(r.to, { title: `Reminder: @${r.name || "someone"} is waiting for ${usd(r.amount)}`, body: "Tap to pay or decline.", url: "/requests", tag: `req-${id}` });
  return { ok: true };
}

/** Delivered AUSD Transfer from → to of ≥ min, made after the request was created (ms). */
async function paidOnchain(hash: Hex, from: Address, to: Address, min: bigint, sinceMs: number): Promise<boolean> {
  const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
  if (receipt?.status !== "success") return false;
  const logs = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs.filter((l) => isAddressEqual(l.address, addr.ausd)) });
  if (!logs.some((l) => isAddressEqual(l.args.from, from) && isAddressEqual(l.args.to, to) && l.args.value >= min)) return false;
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null);
  return !!block && Number(block.timestamp) * 1000 >= sinceMs - 60_000; // 1 min clock slack
}
