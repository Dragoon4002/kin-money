"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MeButton } from "@/components/core/NavBar";
import { Amount, Button, Chip, ErrorText, Ico, IconTile, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { getBalance, loadActivity } from "@/lib/activity";
import { publicClient } from "@/lib/chain";
import { humanError } from "@/lib/errors";
import type { IconName } from "@/lib/icons";
import { formatMoney, getCurrency } from "@/lib/money";
import { usePrivate } from "@/lib/privacy";
import { accrued, isJar, listCircles, listEscrows, listPots, listStreams, nowSec, same } from "@/lib/programs";
import type { Address } from "viem";

type Pocket = { key: IconName; title: string; href: string; idle: string };

const POCKETS: Pocket[] = [
  { key: "allowance", title: "Live allowance", href: "/allowance", idle: "Grows every second" },
  { key: "jars", title: "Savings jars", href: "/jars", idle: "Save toward something big" },
  { key: "pot", title: "Family pots", href: "/pot", idle: "Chip in together" },
  { key: "circle", title: "Circles", href: "/circle", idle: "Save as a group, take turns" },
  { key: "chores", title: "Chores", href: "/chores", idle: "Earn for helping out" },
];

// ponytail: rough bank-wire cost (3% + $5 per transfer) — an estimate, labelled as such in the UI.
const WIRE_FLAT = 5_000_000n; // $5 in base units
const wireSavings = (sent: bigint[]) => sent.reduce((a, v) => a + (v * 3n) / 100n + WIRE_FLAT, 0n);

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Live one-line summary per pocket; missing key = still loading or nothing to show. */
async function summaries(me: Address): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const t = nowSec();
  await Promise.all([
    listStreams(me).then((ss) => {
      const live = ss.filter((s) => t < s.end || accrued(s, t) > 0n);
      if (!live.length) return;
      const ready = live.filter((s) => same(s.payee, me)).reduce((a, s) => a + accrued(s, t), 0n);
      out.allowance = ready > 0n ? `${formatMoney(ready)} ready to collect` : `${plural(live.length, "allowance")} running`;
    }),
    listPots(me).then((ps) => {
      const open = ps.filter((p) => !p.closed);
      const jars = open.filter(isJar);
      const pots = open.filter((p) => !isJar(p));
      const sum = (xs: typeof open) => formatMoney(xs.reduce((a, p) => a + p.balance, 0n));
      if (jars.length) out.jars = `${sum(jars)} saved · ${plural(jars.length, "jar")}`;
      if (pots.length) out.pot = `${sum(pots)} in ${plural(pots.length, "pot")}`;
    }),
    listCircles(me).then((cs) => {
      const active = cs.filter((c) => c.round < c.members.length);
      if (active.length) out.circle = `${plural(active.length, "circle")} going`;
    }),
    listEscrows(me, "chore").then(({ escrows }) => {
      const open = escrows.filter((e) => !e.settled && (same(e.to, me) || same(e.approver, me)));
      if (open.length) out.chores = `${open.length} waiting for an OK`;
    }),
  ].map((p) => p.catch(() => {})));
  return out;
}

export default function Money() {
  const { profile } = useRequireAccount();
  const me = profile?.address;
  const [balance, setBalance] = useState<bigint | null>(null);
  const [live, setLive] = useState<Record<string, string> | null>(null);
  const [adding, setAdding] = useState<"idle" | "busy" | "done" | "had">("idle");
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(0n);
  const hide = usePrivate();

  useEffect(() => {
    if (!me) return;
    let on = true;
    const tick = () => getBalance(me).then((b) => on && setBalance(b)).catch(() => {});
    tick();
    summaries(me).then((s) => on && setLive(s));
    loadActivity(me).then((items) => on && setSaved(wireSavings(items.filter((i) => i.dir === "out").map((i) => i.amount)))).catch(() => {});
    const t = setInterval(tick, 6000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [me]);

  async function addMoney() {
    if (!me) return;
    setAdding("busy");
    setErr("");
    try {
      const res = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: me }) });
      if (res.status === 429) throw new Error("network: slow down");
      const body = (await res.json()) as { hash?: `0x${string}`; skipped?: boolean };
      if (!res.ok) throw new Error("network: faucet");
      if (body.skipped) return setAdding("had");
      if (body.hash) await publicClient.waitForTransactionReceipt({ hash: body.hash });
      setBalance(await getBalance(me));
      setAdding("done");
    } catch (e) {
      setErr(humanError(e));
      setAdding("idle");
    }
  }

  return (
    <>
      <Screen>
        <header className="flex h-12 items-center">
          <h1 className="flex-1 text-xl font-bold">Money</h1>
          <MeButton name={profile?.name} />
        </header>

        <section className="relative overflow-hidden rounded-[32px] border border-line bg-surface p-6">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand/15 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <p className="text-sm text-muted">Total balance</p>
            <Chip>Practice money</Chip>
          </div>
          <div className="relative mt-3 min-h-16">
            {balance === null ? (
              <div className="h-14 w-52 animate-pulse rounded-2xl bg-surface-2" />
            ) : (
              <Amount value={formatMoney(balance)} size="xl" secret />
            )}
          </div>
          {balance !== null && !hide && getCurrency() !== "USD" && <p className="tabular relative mt-1 text-sm text-muted">{formatMoney(balance, "USD")}</p>}
          <div className="relative mt-6">
            <Button onClick={addMoney} busy={adding === "busy"} disabled={adding === "done" || adding === "had"}>
              {adding === "done" ? "Added ✓" : adding === "had" ? "You already have practice money" : "Add practice money"}
            </Button>
            {adding === "busy" && <p className="mt-3 text-center text-sm text-muted">Adding practice money — a few seconds…</p>}
          </div>
        </section>
        <ErrorText>{err}</ErrorText>

        <Link href="/cashout" className="flex min-h-16 items-center gap-4 rounded-[24px] border border-line bg-surface p-4 transition active:scale-[0.98]">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Cash out to bank</span>
            <span className="block text-sm text-muted">Arrives in 1–2 days · no fee</span>
          </span>
          <Ico name="chevron" className="text-muted" />
        </Link>
        {saved > 0n && !hide && (
          <div className="flex flex-col items-start gap-1">
            <Chip tone="good">You saved about {formatMoney(saved)} vs a bank wire</Chip>
            <p className="px-1 text-xs text-muted">Estimate: banks often charge 3% + $5 per transfer.</p>
          </div>
        )}

        <h2 className="mt-2 text-xs font-semibold uppercase tracking-widest text-muted">Pockets</h2>
        <div className="flex flex-col gap-3">
          {POCKETS.map((p) => (
            <Link key={p.key} href={p.href} className="flex min-h-20 items-center gap-4 rounded-[24px] border border-line bg-surface p-4 transition active:scale-[0.98]">
              <IconTile name={p.key} />
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{p.title}</span>
                {live === null ? (
                  <span className="mt-1 block h-4 w-32 animate-pulse rounded-full bg-surface-2" />
                ) : (
                  <span className={`block truncate text-sm ${live[p.key] ? "text-ink" : "text-muted"}`}>{live[p.key] ?? p.idle}</span>
                )}
              </span>
              <Ico name="chevron" className="text-muted" />
            </Link>
          ))}
        </div>
      </Screen>
    </>
  );
}
