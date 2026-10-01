import { allow, clientIp } from "@/lib/server/relayer";
import { graphEnabled, q } from "@/lib/server/graph";

// Public: @names are public onchain anyway. Feeds the client-side autocomplete trie.
export async function GET(req: Request) {
  if (!allow(`names:${clientIp(req)}`, 30)) return Response.json({ error: "slow down" }, { status: 429 });
  if (!graphEnabled()) return Response.json({ names: [] });
  const rows = await q<{ name: string }>("MATCH (p:Person) WHERE p.name IS NOT NULL RETURN p.name AS name ORDER BY name LIMIT 10000");
  return Response.json({ names: rows.map((r) => r.name) }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
