import { isAddressEqual } from "viem";
import { KinEscrowAbi } from "@/lib/abi";
import { addr, publicClient } from "@/lib/chain";
import { parseIds } from "@/lib/choreMeta";
import { allowShared, bad, q, route } from "@/lib/server/graph";

/**
 * What a bill is for ("school" | "rent" | "doctor" | "other") — not onchain.
 * POST {id, for}: only the person who set bill `id` aside (checked onchain) can save it.
 * GET ?ids=1,2,3: labels for the bills the caller sent, collects or checks.
 */
const FOR = ["school", "rent", "doctor", "other"];

export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    const id = typeof b.id === "string" && /^\d{1,30}$/.test(b.id) ? b.id : null;
    if (!id || typeof b.for !== "string" || !FOR.includes(b.for)) return bad();
    if (!(await allowShared(`bills:${me}`, 60, 3_600_000))) return bad("slow down", 429);
    const [from, unlockAt, , , , to, autoApproveAt, approver] = await publicClient.readContract({ address: addr.escrow, abi: KinEscrowAbi, functionName: "escrows", args: [BigInt(id)] });
    // Bill terms (lib/programs kindOf): no unlock date, no auto-OK, someone other than the sender (or no one) OKs it.
    if (!isAddressEqual(from, me) || unlockAt !== 0 || autoApproveAt !== 0 || isAddressEqual(approver, from)) return bad("forbidden", 403);
    await q(`MERGE (x:Bill {id: $id}) SET x.for = $for, x.from = $from, x.to = $to, x.approver = $approver, x.at = timestamp()`, {
      id, for: b.for, from: from.toLowerCase(), to: to.toLowerCase(), approver: approver.toLowerCase(),
    });
    return { ok: true };
  });
}

export function GET(req: Request) {
  return route(req, {}, async (me) => {
    const ids = parseIds(new URL(req.url).searchParams.get("ids"));
    if (!ids) return bad();
    const rows = await q<{ id: string; for: string }>(
      `MATCH (x:Bill) WHERE x.id IN $ids AND $me IN [x.from, x.to, x.approver] RETURN x.id AS id, x.for AS for`,
      { ids, me: me.toLowerCase() },
    );
    return Object.fromEntries(rows.map((r) => [r.id, r.for]));
  });
}
