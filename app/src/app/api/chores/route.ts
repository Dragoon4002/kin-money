import { isAddressEqual } from "viem";
import { KinEscrowAbi } from "@/lib/abi";
import { addr, publicClient } from "@/lib/chain";
import { cleanDue, cleanTitle, parseIds } from "@/lib/choreMeta";
import { allowShared, bad, q, route } from "@/lib/server/graph";

/**
 * Chore titles/due dates, so every phone sees "Dishes", not "A chore".
 * POST {id, title, due?}: only the person who funded chore `id` (checked onchain) can save it.
 * GET ?ids=1,2,3: labels for the chores the caller gives or does.
 */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    const id = typeof b.id === "string" && /^[1-9]\d{0,29}$/.test(b.id) ? b.id : null;
    const title = cleanTitle(b.title);
    if (!id || !title) return bad();
    if (!(await allowShared(`chores:${me}`, 60, 3_600_000))) return bad("slow down", 429);
    // unlockAt 1 = chore marker (CHORE_MARK in lib/programs, a client module).
    const [from, unlockAt, , , , to] = await publicClient.readContract({ address: addr.escrow, abi: KinEscrowAbi, functionName: "escrows", args: [BigInt(id)] });
    if (!isAddressEqual(from, me) || unlockAt !== 1) return bad("forbidden", 403);
    await q(`MERGE (c:Chore {id: $id}) SET c.title = $title, c.due = $due, c.from = $from, c.to = $to, c.at = timestamp()`, {
      id, title, due: cleanDue(b.due), from: from.toLowerCase(), to: to.toLowerCase(),
    });
    return { ok: true };
  });
}

export function GET(req: Request) {
  return route(req, {}, async (me) => {
    const ids = parseIds(new URL(req.url).searchParams.get("ids"));
    if (!ids) return bad();
    const rows = await q<{ id: string; title: string; due: number }>(
      `MATCH (c:Chore) WHERE c.id IN $ids AND $me IN [c.from, c.to] RETURN c.id AS id, c.title AS title, c.due AS due`,
      { ids, me: me.toLowerCase() },
    );
    return Object.fromEntries(rows.map((r) => [r.id, { title: r.title, due: r.due }]));
  });
}
