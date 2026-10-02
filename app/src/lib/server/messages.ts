import "server-only";
import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import { q } from "./graph";
import { live } from "./push";

// Chat: (a:Person)-[:SENT]->(m:Message {id, from, to, body, kind, ref, at, read})-[:TO]->(b:Person)
// (me)-[:BLOCKED]->(them) hides/blocks; (me)-[:ACCEPTED]->(them) moves them out of "Requests".
// kind "text" | "request" (ref = request id) | "payment" (ref = amount in base units).

export type Kind = "text" | "request" | "payment";
export type Message = { id: string; from: Address; to: Address; body: string; kind: Kind; ref: string; at: number };

/** True if either person blocked the other. */
export async function blocked(a: Address, b: Address): Promise<boolean> {
  const [r] = await q<{ n: number }>(
    `MATCH (x:Person)-[:BLOCKED]->(y:Person) WHERE (x.address = $a AND y.address = $b) OR (x.address = $b AND y.address = $a) RETURN count(*) AS n`,
    { a, b },
  );
  return (r?.n ?? 0) > 0;
}

/** Store a message between two existing Persons and push the realtime `message` event to both. */
export async function saveMessage(from: Address, to: Address, kind: Kind, body: string, ref = ""): Promise<Message> {
  const m: Message = { id: randomUUID(), from, to, body, kind, ref, at: Date.now() };
  await q(
    `MATCH (a:Person {address: $m.from}), (b:Person {address: $m.to})
     CREATE (a)-[:SENT]->(:Message {id: $m.id, from: $m.from, to: $m.to, body: $m.body, kind: $m.kind, ref: $m.ref, at: $m.at, read: false})-[:TO]->(b)`,
    { m },
  );
  await Promise.all([live(from, "message", m), live(to, "message", m)]);
  return m;
}
