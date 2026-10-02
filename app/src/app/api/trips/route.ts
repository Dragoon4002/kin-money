import { randomUUID } from "node:crypto";
import { addrOf, bad, q, route, verifiedName } from "@/lib/server/graph";
import { notify } from "@/lib/server/push";
import { loadTrip, MAX_MEMBERS, netOf } from "./data";

/** My trips, newest first: {id, name, members, net}. */
export function GET(req: Request) {
  return route(req, { trips: [] }, async (me) => {
    const ids = await q<{ id: string }>(`MATCH (:Person {address: $me})-[:IN]->(t:Trip) RETURN t.id AS id ORDER BY t.createdAt DESC LIMIT 50`, { me });
    // ponytail: one load per trip (N+1); fine for a person's handful of trips.
    const trips = (await Promise.all(ids.map((r) => loadTrip(r.id, me)))).filter((t) => t !== null);
    return { trips: trips.map((t) => ({ id: t.id, name: t.name, members: t.members, net: netOf(t, me) })) };
  });
}

/** New trip: {name, members: address[]}. Creator is always in. Everyone needs a Kin @name. */
export function POST(req: Request) {
  return route(req, { id: null }, async (me, b) => {
    const name = typeof b.name === "string" ? b.name.trim().slice(0, 60) : "";
    if (!name || !Array.isArray(b.members)) return bad();
    const addrs = b.members.map(addrOf);
    if (addrs.some((a) => !a)) return bad();
    const unique = [...new Set([me, ...addrs.map((a) => a!)])];
    if (unique.length > MAX_MEMBERS) return bad("too many");
    const names = await Promise.all(unique.map(verifiedName));
    if (names.some((n) => !n)) return bad("unknown member");
    const id = randomUUID();
    await q(
      `UNWIND $people AS person
       MERGE (p:Person {address: person.address}) ON CREATE SET p.createdAt = timestamp()
       SET p.name = person.name
       WITH collect(p) AS ps
       CREATE (t:Trip {id: $id, name: $name, createdAt: timestamp(), by: $me})
       FOREACH (p IN ps | CREATE (p)-[:IN]->(t))`,
      { id, name, me, people: unique.map((address, i) => ({ address, name: names[i] })) },
    );
    await Promise.all(unique.slice(1).map((a) => notify(a, { title: `@${names[0]} added you to ${name}`, body: "Track who paid what, settle up later.", url: `/trips/${id}`, tag: `trip-${id}` })));
    return { id };
  });
}
