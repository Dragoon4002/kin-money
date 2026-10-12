import { q, route } from "@/lib/server/graph";

/** People who joined with my invite link (active = made a payment), and who invited me (if anyone). */
export function GET(req: Request) {
  return route(req, { invited: [], invitedBy: null }, async (me) => {
    const [invited, by] = await Promise.all([
      q<{ name: string; at: number; active: boolean }>(
        `MATCH (:Person {address: $me})-[r:INVITED]->(p:Person) WHERE p.name IS NOT NULL
         RETURN p.name AS name, min(r.at) AS at, exists { (p)-[:PAID]->() } AS active ORDER BY at DESC LIMIT 200`,
        { me },
      ),
      q<{ name: string }>(`MATCH (i:Person)-[r:INVITED]->(:Person {address: $me}) RETURN i.name AS name ORDER BY r.at LIMIT 1`, { me }),
    ]);
    return { invited, invitedBy: by[0]?.name ?? null };
  });
}
