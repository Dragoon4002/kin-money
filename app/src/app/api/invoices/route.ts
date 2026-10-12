import { randomBytes } from "node:crypto";
import { isAddressEqual, type Address } from "viem";
import { KinEscrowAbi } from "@/lib/abi";
import { addr, publicClient } from "@/lib/chain";
import { cleanDays, cleanParts, cleanText, isInvoiceId, partsTotal, type Invoice, type Part } from "@/lib/invoiceMeta";
import { formatMoney } from "@/lib/money";
import { addrOf, allowShared, bad, graphEnabled, q, route, UPSERT_ME, UPSERT_THEM, verifiedName } from "@/lib/server/graph";
import { blocked, saveMessage } from "@/lib/server/messages";
import { notify } from "@/lib/server/push";

// (:Invoice {id, owner, title, days, parts: JSON Part[], payer, escrows: [escrow id strings], sentTo, at})
// The pay link is /invoice/new?i=<id>; names, dues and "done" live here, money lives in KinEscrow.
// ponytail: no index on Invoice.id (graph.ts owns constraints); a label scan is fine at hackathon size.

type Row = Omit<Invoice, "parts"> & { parts: string };
const RETURN = `RETURN i.id AS id, i.owner AS owner, i.title AS title, i.days AS days, i.parts AS parts,
  i.payer AS payer, coalesce(i.escrows, []) AS escrows, i.sentTo AS sentTo`;
const parse = (r: Row): Invoice => ({ ...r, parts: JSON.parse(r.parts) as Part[] });
const usd = (u: bigint | string) => formatMoney(BigInt(u), "USD");
const ESCROW_ID = /^\d{1,30}$/;
/** Where the payer should land: the held view once paid, else the pay link. */
const payPath = (i: Invoice) => (i.escrows.length ? `/invoice/${i.escrows.join("-")}` : `/invoice/new?i=${i.id}`);

async function load(id: string): Promise<Invoice | null> {
  const [r] = await q<Row>(`MATCH (i:Invoice {id: $id}) ${RETURN}`, { id });
  return r ? parse(r) : null;
}

/**
 * ?id=<invoice id> → the invoice. Public: the id is the pay link's secret and the client may not have joined yet.
 * ?e=<escrow id> → the invoice that escrow pays (owner or payer only).
 * ?mine=1 → unpaid invoices I sent or was sent, newest first.
 */
export async function GET(req: Request) {
  const u = new URL(req.url).searchParams;
  const id = u.get("id");
  if (id !== null) {
    if (!isInvoiceId(id)) return bad();
    if (!graphEnabled()) return bad("not found", 404);
    try {
      const inv = await load(id);
      return inv ? Response.json({ ...inv, sentTo: null }) : bad("not found", 404);
    } catch {
      return bad("unavailable", 503);
    }
  }
  const e = u.get("e");
  return route(req, e === null ? [] : null, async (me) => {
    if (e !== null) {
      if (!ESCROW_ID.test(e)) return bad();
      const [r] = await q<Row>(`MATCH (i:Invoice) WHERE $e IN i.escrows AND $me IN [i.owner, i.payer] ${RETURN}`, { e, me });
      return r ? parse(r) : null;
    }
    const rows = await q<Row>(
      `MATCH (i:Invoice) WHERE (i.owner = $me OR i.sentTo = $me) AND size(coalesce(i.escrows, [])) = 0 ${RETURN} ORDER BY i.at DESC LIMIT 50`,
      { me },
    );
    return rows.map(parse);
  });
}

/**
 * {title, days, parts: [{name?, amount, due?}]} → {id}: make an invoice (I'm the one getting paid).
 * {action: "send", id, to} → owner only: message + notify a Kin person with the pay link.
 * {action: "done", id, part} → owner only: mark part done, tell the client to pay it.
 * {action: "held", id, escrows} → client links the held payments it just made (checked onchain).
 */
export function POST(req: Request) {
  return route(req, { ok: true }, async (me, b) => {
    if (!(await allowShared(`invoices:${me}`, 60, 3_600_000))) return bad("slow down", 429);

    if (b.action === undefined) {
      const title = cleanText(b.title, 60), days = cleanDays(b.days), parts = cleanParts(b.parts);
      if (!title || !days || !parts) return bad();
      const id = randomBytes(9).toString("base64url");
      await q(`CREATE (:Invoice {id: $id, owner: $me, title: $title, days: $days, parts: $parts, escrows: [], at: timestamp()})`, {
        id, me, title, days, parts: JSON.stringify(parts),
      });
      return { id };
    }

    const inv = isInvoiceId(b.id) ? await load(b.id) : null;
    if (!inv) return bad("not found", 404);

    if (b.action === "send") {
      const them = addrOf(b.to);
      if (inv.owner !== me) return bad("forbidden", 403);
      if (!them || them === me) return bad();
      if (inv.escrows.length) return bad("already paid", 409);
      if (await blocked(me, them)) return bad("blocked", 403);
      const [meName, themName] = await Promise.all([verifiedName(me), verifiedName(them)]);
      if (!themName) return bad("That account isn't on Kin");
      await q(`${UPSERT_ME} WITH me ${UPSERT_THEM} WITH p MATCH (i:Invoice {id: $id}) SET i.sentTo = $them`, { me, meName, them, themName, id: inv.id });
      const total = usd(partsTotal(inv.parts));
      const path = `/invoice/new?i=${inv.id}`;
      await saveMessage(me, them, "text", `Invoice: '${inv.title}' — ${total}. Pay here: https://getkin.space${path}`);
      await notify(them, { title: `@${meName ?? "someone"} sent you an invoice for ${total}`, body: `'${inv.title}'. Tap to see it.`, url: path, tag: `inv-${inv.id}` });
      return { ok: true };
    }

    if (b.action === "done") {
      const n = b.part;
      if (inv.owner !== me) return bad("forbidden", 403);
      if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n >= inv.parts.length) return bad();
      const p = inv.parts[n];
      if (p.done) return { ok: true };
      p.done = true;
      await q(`MATCH (i:Invoice {id: $id}) SET i.parts = $parts`, { id: inv.id, parts: JSON.stringify(inv.parts) });
      const to = inv.payer ?? inv.sentTo;
      const meName = await verifiedName(me);
      if (to) {
        await notify(to, {
          title: `${p.name} is done — pay ${usd(p.amount)}`,
          body: `@${meName ?? "someone"} finished part of '${inv.title}'. Take a look and OK it.`,
          url: payPath(inv),
          tag: `inv-${inv.id}-${n}`,
        });
      }
      return { ok: true };
    }

    if (b.action === "held") {
      const ids = Array.isArray(b.escrows) && b.escrows.length === inv.parts.length && b.escrows.every((x) => typeof x === "string" && ESCROW_ID.test(x)) ? (b.escrows as string[]) : null;
      if (!ids || new Set(ids).size !== ids.length) return bad();
      if (inv.escrows.length) return bad("already paid", 409);
      const [{ n }] = await q<{ n: number }>(`MATCH (o:Invoice) WHERE any(x IN coalesce(o.escrows, []) WHERE x IN $ids) RETURN count(o) AS n`, { ids });
      if (n) return bad("taken", 409);
      const rows = await Promise.all(ids.map((id) => publicClient.readContract({ address: addr.escrow, abi: KinEscrowAbi, functionName: "escrows", args: [BigInt(id)] })));
      const owner = inv.owner as Address;
      const ok = rows.every(([from, , , , , to, autoApproveAt, approver, amount], i) =>
        isAddressEqual(from, me) && isAddressEqual(approver, me) && isAddressEqual(to, owner) && autoApproveAt > 0 && amount === BigInt(inv.parts[i].amount));
      if (!ok) return bad("forbidden", 403);
      await q(`MATCH (i:Invoice {id: $id}) WHERE size(coalesce(i.escrows, [])) = 0 SET i.escrows = $ids, i.payer = $me`, { id: inv.id, ids, me });
      const meName = await verifiedName(me);
      await notify(owner, {
        title: `${meName ? `@${meName}` : "Your client"} paid '${inv.title}'`,
        body: `${usd(partsTotal(inv.parts))} is held safely for you until they OK each part.`,
        url: `/invoice/${ids.join("-")}`,
        tag: `inv-${inv.id}`,
      });
      return { ok: true };
    }

    return bad();
  });
}
