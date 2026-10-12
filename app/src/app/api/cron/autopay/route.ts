import { timingSafeEqual } from "node:crypto";
import { zeroAddress, type Address } from "viem";
import { KinGiftLinkAbi, KinMandateAbi } from "@/lib/abi";
import { addr, publicClient } from "@/lib/chain";
import { formatMoney } from "@/lib/money";
import { canRemind, cronNudge, DAY, REMIND_GAP } from "@/lib/reminders";
import { graphEnabled, q } from "@/lib/server/graph";
import { notify } from "@/lib/server/push";
import { submit } from "@/lib/server/relayer";
import { loadTrip, planOf } from "@/app/api/trips/data";

// Daily job (vercel.json cron): collect every AutoPay payment that has fallen due, and open every accepted
// gift link whose day has come. `collect`/`open` are permissionless and pay the payee, so the relayer can call them.
// ponytail: scans the newest 500 of each and sends ≤10 of each per run; shard or index if usage outgrows that.
const SCAN = 500n;
const MAX_COLLECTS = 10;
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) return new Response("unauthorized", { status: 401 });

  const count = await publicClient.readContract({ address: addr.mandate, abi: KinMandateAbi, functionName: "count" });
  const ids: bigint[] = [];
  for (let i = count; i >= 1n && count - i < SCAN; i--) ids.push(i);
  const due = await publicClient.multicall({
    contracts: ids.map((id) => ({ address: addr.mandate, abi: KinMandateAbi, functionName: "due", args: [id] }) as const),
  });

  const collected: string[] = [];
  for (let i = 0; i < ids.length && collected.length < MAX_COLLECTS; i++) {
    const r = due[i];
    if (r.status !== "success" || !r.result) continue;
    try {
      await submit({ address: addr.mandate, abi: KinMandateAbi, functionName: "collect", args: [ids[i]] }, 400_000n);
      collected.push(ids[i].toString());
    } catch (e) {
      console.error("autopay collect failed", ids[i], (e as Error).message?.slice(0, 200));
    }
  }
  const opened = await openGifts();
  const reminded = await remindAll().catch((e) => (console.error("reminders failed", (e as Error).message?.slice(0, 200)), 0));
  const pruned = await prune();
  return Response.json({ scanned: ids.length, collected, opened, reminded, pruned });
}

async function openGifts(): Promise<string[]> {
  const count = await publicClient.readContract({ address: addr.giftlink, abi: KinGiftLinkAbi, functionName: "count" });
  const ids: bigint[] = [];
  for (let i = count; i >= 1n && count - i < SCAN; i--) ids.push(i);
  const gifts = await publicClient.multicall({
    contracts: ids.map((id) => ({ address: addr.giftlink, abi: KinGiftLinkAbi, functionName: "gifts", args: [id] }) as const),
  });
  const now = Math.floor(Date.now() / 1000);
  const opened: string[] = [];
  for (let i = 0; i < ids.length && opened.length < MAX_COLLECTS; i++) {
    const r = gifts[i];
    if (r.status !== "success") continue;
    const [, unlockAt, , settled, recipient] = r.result;
    if (settled || recipient === zeroAddress || now < unlockAt) continue;
    try {
      await submit({ address: addr.giftlink, abi: KinGiftLinkAbi, functionName: "open", args: [ids[i]] }, 400_000n);
      opened.push(ids[i].toString());
    } catch (e) {
      console.error("gift open failed", ids[i], (e as Error).message?.slice(0, 200));
    }
  }
  return opened;
}

// ponytail: ≤50 notifications per run, oldest-due first; anything over waits for tomorrow's run.
// Fine at hackathon scale; batch/queue push sends if one run must reach thousands.
const MAX_NOTES = 50;
const usd = (units: string | bigint) => formatMoney(BigInt(units), "USD");

/** Due-tomorrow / 1-and-3-days-overdue request nudges, then debtors on trips past their settle-by date. */
async function remindAll(): Promise<number> {
  if (!graphEnabled()) return 0;
  const now = Date.now();
  let sent = 0;

  const reqs = await q<{ id: string; to: string; name: string; amount: string; note: string; due: number; remindedAt: number | null }>(
    `MATCH (a:Person)-[r:REQUESTED]->(b:Person) WHERE r.status = 'open' AND r.due IS NOT NULL AND r.due > $from AND r.due < $to
     RETURN r.id AS id, b.address AS to, coalesce(a.name, '') AS name, r.amount AS amount, r.note AS note, r.due AS due, r.remindedAt AS remindedAt
     ORDER BY r.due LIMIT 500`,
    { from: now - 4 * DAY, to: now + 2 * DAY },
  );
  for (const r of reqs) {
    const kind = cronNudge(r.due, now);
    if (sent >= MAX_NOTES || !kind || !canRemind(r.remindedAt, now)) continue;
    const what = `@${r.name || "someone"} is waiting for ${usd(r.amount)}${r.note ? ` for ${r.note}` : ""}`;
    await notify(r.to, { title: kind === "tomorrow" ? "Due tomorrow" : "Overdue", body: `${what}.`, url: "/requests", tag: `req-${r.id}` });
    await q(`MATCH ()-[r:REQUESTED {id: $id}]->() SET r.remindedAt = timestamp()`, { id: r.id });
    sent++;
  }

  // Trips: once per daily run (12h gap guards re-runs) while past settle-by and someone still owes.
  const trips = await q<{ id: string; by: Address }>(
    `MATCH (t:Trip) WHERE t.settleBy IS NOT NULL AND t.settleBy < $now AND coalesce(t.nudgedAt, 0) <= $cutoff
     RETURN t.id AS id, t.by AS by ORDER BY t.settleBy LIMIT 50`,
    { now, cutoff: now - REMIND_GAP },
  );
  for (const { id, by } of trips) {
    if (sent >= MAX_NOTES) break;
    const trip = await loadTrip(id, by);
    if (!trip) continue;
    const owes = planOf(trip).slice(0, MAX_NOTES - sent);
    await q(`MATCH (t:Trip {id: $id}) SET t.nudgedAt = timestamp()`, { id });
    const name = (a: string) => `@${trip.members.find((m) => m.address === a)?.name || "someone"}`;
    await Promise.all(owes.map((t) => notify(t.from, { title: `Time to settle ${trip.name}`, body: `You owe ${name(t.to)} ${usd(t.amount)}.`, url: `/trips/${id}`, tag: `trip-${id}` })));
    sent += owes.length;
  }
  return sent;
}

/** Keep Aura Free small (audit): rate limits fail closed when it's full or paused, which would stop payments. Rate
 *  windows are ≤ 7 days, so older Rate nodes are dead; inbox keeps 30 days. */
async function prune(): Promise<number> {
  if (!graphEnabled()) return 0;
  const DAY_MS = 86_400_000;
  const [r] = await q<{ n: number }>(
    `MATCH (r:Rate) WHERE coalesce(r.at, 0) < $rateCut WITH r LIMIT 20000 DETACH DELETE r RETURN count(*) AS n`,
    { rateCut: Date.now() - 8 * DAY_MS },
  ).catch(() => [{ n: 0 }]);
  const [n] = await q<{ n: number }>(
    `MATCH (x:Notification) WHERE x.at < $noteCut WITH x LIMIT 20000 DETACH DELETE x RETURN count(*) AS n`,
    { noteCut: Date.now() - 30 * DAY_MS },
  ).catch(() => [{ n: 0 }]);
  return (r?.n ?? 0) + (n?.n ?? 0);
}
