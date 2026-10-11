import { q } from "@/lib/server/graph";
import { allow, clientIp } from "@/lib/server/relayer";

// Public: how many people have a Kin account (a Person with an @name). The CDN caches it for a day,
// so the landing's "be the Nth" number refreshes daily and the graph sees ~1 query/day per region.
export async function GET(req: Request) {
  if (!allow(`users:${clientIp(req)}`, 30)) return Response.json({ error: "slow down" }, { status: 429 });
  try {
    const [row] = await q<{ n: number }>("MATCH (p:Person) WHERE p.name IS NOT NULL RETURN count(p) AS n");
    return Response.json({ count: row?.n ?? 0 }, { headers: { "cache-control": "public, s-maxage=86400, stale-while-revalidate=3600" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
