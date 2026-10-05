import { makeBloom } from "@/lib/bloom";
import { allow, clientIp } from "@/lib/server/relayer";
import { graphEnabled, q } from "@/lib/server/graph";

// Filter of taken @names for instant "is it free?" feedback at signup. Graph can lag onchain, so a
// "free" answer is provisional — claim() still reverts if taken. No graph → 404, client uses RPC.
export async function GET(req: Request) {
  if (!allow(`names:${clientIp(req)}`, 30)) return Response.json({ error: "slow down" }, { status: 429 });
  if (!graphEnabled()) return Response.json({ error: "off" }, { status: 404 });
  // ponytail: LIMIT matches /api/names; above it the filter under-reports, claim() still guards.
  const rows = await q<{ name: string }>("MATCH (p:Person) WHERE p.name IS NOT NULL RETURN p.name AS name LIMIT 10000");
  return Response.json(makeBloom(rows.map((r) => r.name)), { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
