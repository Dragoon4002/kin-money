import "server-only";
import type { Address } from "viem";
import { q } from "@/lib/server/graph";
import { balances } from "@/lib/split";

// (p:Person)-[:IN]->(t:Trip {id, name, createdAt, by})
// (e:Expense {id, amount, note, category, at, by})-[:OF]->(t), (e)-[:PAID_BY]->(:Person), (e)-[:SHARE]->(:Person)*
// (s:Settlement {hash, amount, at})-[:OF]->(t), (s)-[:FROM]->(:Person), (s)-[:TO]->(:Person)
// Money = decimal strings of base units.

export const MAX_MEMBERS = 20;

type Member = { address: Address; name: string };
type Expense = { id: string; amount: string; note: string; category: string; at: number; by: Address; payer: Address; participants: Address[] };
type Settlement = { hash: string; amount: string; at: number; from: Address; to: Address };

/** Whole trip if `me` is a member, else null. */
export async function loadTrip(id: string, me: Address) {
  const [trip] = await q<{ name: string; createdAt: number; by: Address }>(
    `MATCH (:Person {address: $me})-[:IN]->(t:Trip {id: $id}) RETURN t.name AS name, t.createdAt AS createdAt, t.by AS by`,
    { id, me },
  );
  if (!trip) return null;
  const [members, expenses, settlements] = await Promise.all([
    q<Member>(`MATCH (p:Person)-[:IN]->(:Trip {id: $id}) RETURN p.address AS address, coalesce(p.name, '') AS name ORDER BY name`, { id }),
    q<Expense>(
      `MATCH (e:Expense)-[:OF]->(:Trip {id: $id}), (e)-[:PAID_BY]->(payer:Person)
       OPTIONAL MATCH (e)-[:SHARE]->(s:Person)
       WITH e, payer, s ORDER BY s.address
       WITH e, payer, collect(s.address) AS participants // sorted: leftover cents land the same for everyone
       RETURN e.id AS id, e.amount AS amount, e.note AS note, e.category AS category, e.at AS at, e.by AS by,
              payer.address AS payer, participants
       ORDER BY at DESC`,
      { id },
    ),
    q<Settlement>(
      `MATCH (s:Settlement)-[:OF]->(:Trip {id: $id}), (s)-[:FROM]->(f:Person), (s)-[:TO]->(t:Person)
       RETURN s.hash AS hash, s.amount AS amount, s.at AS at, f.address AS \`from\`, t.address AS \`to\`
       ORDER BY at DESC`,
      { id },
    ),
  ]);
  return { id, ...trip, members, expenses, settlements };
}

export type Trip = NonNullable<Awaited<ReturnType<typeof loadTrip>>>;

/** My net in a trip: + owed, − owe (base units string). */
export function netOf(t: Trip, me: Address): string {
  const b = balances(
    t.members.map((m) => m.address),
    t.expenses.map((e) => ({ payer: e.payer, amount: BigInt(e.amount), participants: e.participants })),
    t.settlements.map((s) => ({ from: s.from, to: s.to, amount: BigInt(s.amount) })),
  );
  return (b.get(me) ?? 0n).toString();
}
