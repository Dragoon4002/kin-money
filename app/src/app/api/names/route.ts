import { allow, clientIp } from "@/lib/server/relayer";
import { graphEnabled, q } from "@/lib/server/graph";

// Public: @names (public onchain anyway) + published Kinko looks. Feeds autocomplete and avatars.
export async function GET(req: Request) {
  if (!allow(`names:${clientIp(req)}`, 30)) return Response.json({ error: "slow down" }, { status: 429 });
  if (!graphEnabled()) return Response.json({ names: [] });
  const rows = await q<{ name: string; look: string | null }>(
    "MATCH (p:Person) WHERE p.name IS NOT NULL RETURN p.name AS name, p.look AS look ORDER BY name LIMIT 10000",
  );
  const looks = Object.fromEntries(rows.filter((r) => r.look).map((r) => [r.name, r.look]));
  return Response.json({ names: rows.map((r) => r.name), looks }, { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } });
}
