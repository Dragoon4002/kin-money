import { isAddressEqual, type Address } from "viem";
import { KinCircleAbi, KinEscrowAbi, KinPotAbi } from "@/lib/abi";
import { addr, publicClient } from "@/lib/chain";
import { formatMoney } from "@/lib/money";
import { addrOf, bad, q, route, verifiedName } from "@/lib/server/graph";
import { notify } from "@/lib/server/push";

/**
 * After a pot/circle/chore is set up onchain from the phone: {kind: "pot"|"circle"|"chore", id, addresses}.
 * Everything is re-checked onchain before anyone is told:
 * - pot/circle: caller and each address must be members. addresses = [me] means "I just joined" → tell the others.
 * - chore: caller funded it and it's for that address.
 * Each (kind, id, person, event) is notified once.
 */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    const kind = b.kind;
    const id = typeof b.id === "string" && /^\d{1,30}$/.test(b.id) ? BigInt(b.id) : null;
    const list = Array.isArray(b.addresses) && b.addresses.length <= 30 ? b.addresses.map(addrOf) : null;
    if ((kind !== "pot" && kind !== "circle" && kind !== "chore") || id === null || !list || list.some((a) => !a)) return bad();
    const addresses = list as Address[];
    const has = (xs: readonly Address[], a: Address) => xs.some((x) => isAddressEqual(x, a));
    const who = `@${(await verifiedName(me)) ?? "someone"}`;

    let tell: { to: Address; title: string; body: string; url: string }[] = [];
    let event = "added";
    if (kind === "chore") {
      const e = await publicClient.readContract({ address: addr.escrow, abi: KinEscrowAbi, functionName: "escrows", args: [id] });
      const [from, unlockAt, , , settled, to, , , amount] = e;
      if (!isAddressEqual(from, me) || unlockAt !== 1 || settled || !has(addresses, to)) return bad("forbidden", 403);
      tell = [{ to, title: `${who} gave you a chore`, body: `Do it and earn ${formatMoney(amount, "USD")}.`, url: "/chores" }];
    } else {
      const members =
        kind === "pot"
          ? await publicClient.readContract({ address: addr.pot, abi: KinPotAbi, functionName: "membersOf", args: [id] })
          : await publicClient.readContract({ address: addr.circle, abi: KinCircleAbi, functionName: "membersOf", args: [id] });
      if (!has(members, me)) return bad("forbidden", 403);
      const what = kind === "pot" ? "pot" : "circle";
      const url = `/${kind}/${id}`;
      const joined = addresses.length === 1 && isAddressEqual(addresses[0], me);
      if (joined) event = `joined:${me}`;
      tell = joined
        ? members.filter((m) => !isAddressEqual(m, me)).map((to) => ({ to, title: `${who} joined your ${what}`, body: "Tap to take a look.", url }))
        : addresses
            .filter((a) => !isAddressEqual(a, me) && has(members, a))
            .map((to) => ({ to, title: `${who} added you to a ${what}`, body: kind === "pot" ? "Chip in together." : "Save together, take turns.", url }));
    }

    // Once per (kind, id, person, event): replays can't spam.
    const fresh = await q<{ to: string }>(
      `UNWIND $tos AS to
       MERGE (n:Notified {key: $key + to}) ON CREATE SET n.at = timestamp(), n.fresh = true ON MATCH SET n.fresh = false
       WITH n, to WHERE n.fresh RETURN to`,
      { tos: tell.map((t) => t.to), key: `${kind}:${id}:${event}:` },
    );
    const send = new Set(fresh.map((r) => r.to));
    await Promise.all(tell.filter((t) => send.has(t.to)).map((t) => notify(t.to, { title: t.title, body: t.body, url: t.url, tag: `${kind}-${id}` })));
    return { ok: true, notified: send.size };
  });
}
