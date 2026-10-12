import { randomUUID } from "node:crypto";
import { erc20Abi, isAddressEqual, isHash, parseEventLogs, type Address, type Hex } from "viem";
import { addr, publicClient } from "@/lib/chain";
import { CATEGORIES } from "@/lib/categories";
import { formatMoney } from "@/lib/money";
import { REMIND_GAP, validDue } from "@/lib/reminders";
import { addrOf, allowShared, bad, q, route, UPSERT_THEM, validAmount, verifiedName } from "@/lib/server/graph";
import { blocked } from "@/lib/server/messages";
import { notify } from "@/lib/server/push";
import { shares } from "@/lib/split";
import { loadTrip, MAX_MEMBERS, planOf } from "../data";

const usd = (units: bigint) => formatMoney(units, "USD");

type Ctx = { params: Promise<{ id: string }> };

/** Members, expenses (newest first), settlements. Members only. */
export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  return route(req, null, async (me) => (await loadTrip(id, me)) ?? bad("not found", 404));
}

/** {action: "expense" | "addMember" | "settle" | "remind" | "settleBy", ...}. Members only. */
export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  return route(req, { ok: true }, async (me, b) => {
    const trip = await loadTrip(id, me);
    if (!trip) return bad("not found", 404);
    if (!(await allowShared(`trip:${me}`, 120, 3_600_000))) return bad("slow down", 429); // expenses/adds notify members
    const isMember = (a: Address | null): a is Address => !!a && trip.members.some((m) => m.address === a);
    const nameOf = (a: Address) => `@${trip.members.find((m) => m.address === a)?.name || "someone"}`;

    if (b.action === "expense") {
      const payer = addrOf(b.payer);
      const participants = Array.isArray(b.participants) ? [...new Set(b.participants.map(addrOf))] : [];
      const category = CATEGORIES.find((c) => c.id === b.category)?.id ?? "other";
      const note = typeof b.note === "string" ? b.note.trim().slice(0, 80) : "";
      if (!isMember(payer) || !participants.length || !participants.every(isMember) || !validAmount(b.amount)) return bad();
      const eid = randomUUID();
      await q(
        `MATCH (t:Trip {id: $id}), (payer:Person {address: $payer})
         CREATE (e:Expense {id: $eid, amount: $amount, note: $note, category: $category, at: timestamp(), by: $me})-[:OF]->(t)
         CREATE (e)-[:PAID_BY]->(payer)
         WITH e UNWIND $participants AS a
         MATCH (p:Person {address: a}) CREATE (e)-[:SHARE]->(p)`,
        { id, eid, payer, amount: b.amount, note, category, me, participants },
      );
      const what = `${nameOf(me)} added ${note || CATEGORIES.find((c) => c.id === category)!.label} ${usd(BigInt(b.amount))}`;
      await Promise.all(
        [...shares(BigInt(b.amount), participants)]
          .filter(([a]) => a !== me)
          .map(([a, share]) => notify(a, { title: trip.name, body: `${what} — your share ${usd(share)}`, url: `/trips/${id}`, tag: `trip-${id}` })),
      );
      return { id: eid };
    }

    if (b.action === "addMember") {
      const them = addrOf(b.address);
      if (!them) return bad();
      if (isMember(them)) return { ok: true };
      if (await blocked(me, them)) return bad("blocked", 403);
      // ponytail: count checked before write; two simultaneous adds could reach 21. Fine for friends.
      if (trip.members.length >= MAX_MEMBERS) return bad("too many");
      const themName = await verifiedName(them);
      if (!themName) return bad("unknown member");
      await q(`${UPSERT_THEM} WITH p MATCH (t:Trip {id: $id}) MERGE (p)-[:IN]->(t)`, { id, them, themName });
      await notify(them, { title: `${nameOf(me)} added you to ${trip.name}`, body: "Track who paid what, settle up later.", url: `/trips/${id}`, tag: `trip-${id}` });
      return { ok: true };
    }

    if (b.action === "settle") {
      const to = addrOf(b.to);
      if (!isMember(to) || to === me || !validAmount(b.amount) || typeof b.hash !== "string" || !isHash(b.hash)) return bad();
      const hash = b.hash.toLowerCase();
      if (trip.settlements.some((s) => s.hash === hash)) return { ok: true };
      // ponytail: a payment counts for one trip only (hash is unique), but could also mark a /api/requests
      // request paid. Tag payments with a purpose onchain if that ever matters.
      if ((await q(`MATCH (s:Settlement {hash: $hash}) RETURN s.hash`, { hash })).length) return bad("used");
      if (!(await paidOnchain(b.hash, me, to, BigInt(b.amount), trip.createdAt))) return bad("unpaid");
      await q(
        `MATCH (t:Trip {id: $id}), (f:Person {address: $me}), (to:Person {address: $to})
         MERGE (s:Settlement {hash: $hash}) ON CREATE SET s.amount = $amount, s.at = timestamp()
         WITH s, t, f, to WHERE NOT (s)-[:OF]->()
         CREATE (s)-[:OF]->(t), (s)-[:FROM]->(f), (s)-[:TO]->(to)`,
        { id, me, to, hash, amount: b.amount },
      );
      return { ok: true };
    }
    if (b.action === "remind") {
      // Only someone the debtor owes in the settle-up plan may nudge them, once per 12h.
      const from = addrOf(b.from);
      const owed = planOf(trip).find((t) => t.from === from && t.to === me);
      if (!from || !owed) return bad("not found", 404);
      const [r] = await q<{ ok: boolean }>(
        `MERGE (r:Reminder {trip: $id, from: $from, to: $me}) ON CREATE SET r.at = 0
         WITH r, r.at <= $cutoff AS ok
         FOREACH (_ IN CASE WHEN ok THEN [1] ELSE [] END | SET r.at = timestamp())
         RETURN ok`,
        { id, from, me, cutoff: Date.now() - REMIND_GAP },
      );
      if (!r?.ok) return bad("too soon", 429);
      await notify(from, { title: `Reminder: you owe ${nameOf(me)} ${usd(owed.amount)} for ${trip.name}`, body: "Tap to settle up.", url: `/trips/${id}`, tag: `trip-${id}` });
      return { ok: true };
    }

    if (b.action === "settleBy") {
      if (b.at !== null && !validDue(b.at)) return bad();
      await q(`MATCH (t:Trip {id: $id}) SET t.settleBy = $at, t.nudgedAt = null`, { id, at: b.at });
      return { ok: true };
    }
    return bad();
  });
}

/** ?expense=<id> — only whoever added it. */
export async function DELETE(req: Request, { params }: Ctx) {
  const { id } = await params;
  const eid = new URL(req.url).searchParams.get("expense") ?? "";
  return route(req, { ok: true }, async (me) => {
    const [r] = await q<{ n: number }>(
      `MATCH (:Person {address: $me})-[:IN]->(:Trip {id: $id})<-[:OF]-(e:Expense {id: $eid, by: $me})
       DETACH DELETE e RETURN count(*) AS n`,
      { me, id, eid },
    );
    return r?.n ? { ok: true } : bad("not found", 404);
  });
}

/** Delivered AUSD Transfer from → to of ≥ min, made after the trip was created (ms). */
async function paidOnchain(hash: Hex, from: Address, to: Address, min: bigint, sinceMs: number): Promise<boolean> {
  const receipt = await publicClient.getTransactionReceipt({ hash }).catch(() => null);
  if (receipt?.status !== "success") return false;
  const logs = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: receipt.logs.filter((l) => isAddressEqual(l.address, addr.ausd)) });
  if (!logs.some((l) => isAddressEqual(l.args.from, from) && isAddressEqual(l.args.to, to) && l.args.value >= min)) return false;
  const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber }).catch(() => null);
  return !!block && Number(block.timestamp) * 1000 >= sinceMs - 60_000; // 1 min clock slack
}
