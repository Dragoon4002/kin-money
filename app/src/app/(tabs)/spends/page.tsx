"use client";
import { useEffect, useState } from "react";
import { Amount, Band, Ico, IconTile, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { loadActivity, type Item } from "@/lib/activity";
import { categoryOf, type Category } from "@/lib/categories";
import { formatMoney } from "@/lib/money";

const W = 320;
const H = 120;

/** Running total of spend across the month's days, as an SVG path. */
function Chart({ daily, upTo }: { daily: bigint[]; upTo: number }) {
  const pts: number[] = [];
  for (const v of daily.slice(0, upTo)) pts.push((pts.at(-1) ?? 0) + Number(v));
  const max = Math.max(pts.at(-1) ?? 0, 1);
  const x = (i: number) => (daily.length > 1 ? (i / (daily.length - 1)) * W : 0);
  const y = (v: number) => H - 8 - (v / max) * (H - 16);
  const line = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = pts.length - 1;
  return (
    <figure className="flex flex-col gap-2 px-5" aria-label="Spending through the month">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full overflow-visible" preserveAspectRatio="none">
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={0} x2={W} y1={H * f} y2={H * f} stroke="var(--line)" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
        ))}
        {last >= 0 && (
          <>
            <path d={`${line} L${x(last)},${H} L0,${H} Z`} fill="var(--brand-soft)" />
            <path d={line} fill="none" stroke="var(--brand)" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
      </svg>
      <figcaption className="flex justify-between text-xs text-muted">
        <span>1</span>
        <span>{Math.ceil(daily.length / 2)}</span>
        <span>{daily.length}</span>
      </figcaption>
    </figure>
  );
}

const monthKey = (d: Date) => d.getFullYear() * 12 + d.getMonth();

export default function Spends() {
  const { profile } = useRequireAccount();
  const me = profile?.address;
  const [items, setItems] = useState<Item[] | null>(null);
  const [month, setMonth] = useState(() => monthKey(new Date()));

  useEffect(() => {
    if (me) loadActivity(me).then(setItems).catch(() => setItems([]));
  }, [me]);

  const year = Math.floor(month / 12);
  const m = month % 12;
  const days = new Date(year, m + 1, 0).getDate();
  const now = new Date();
  const upTo = month === monthKey(now) ? now.getDate() : month > monthKey(now) ? 0 : days;
  const sent = (items ?? []).filter((i) => i.dir === "out" && monthKey(new Date(i.time)) === month);

  const daily = Array.from({ length: days }, () => 0n);
  const byCat = new Map<string, { cat: Category; total: bigint }>();
  let total = 0n;
  for (const i of sent) {
    daily[new Date(i.time).getDate() - 1] += i.amount;
    total += i.amount;
    const cat = categoryOf(i.hash);
    const e = byCat.get(cat.id) ?? { cat, total: 0n };
    e.total += i.amount;
    byCat.set(cat.id, e);
  }
  const cats = [...byCat.values()].sort((a, b) => (b.total > a.total ? 1 : -1));
  const pct = (v: bigint) => (total ? Number((v * 1000n) / total) / 10 : 0);
  const name = new Date(year, m).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <>
      <Screen wide title="Spends" back="/activity">
        <div className="flex items-center justify-between px-3">
          <button aria-label="Previous month" onClick={() => setMonth(month - 1)} className="grid size-11 place-items-center rounded-full active:bg-surface-2"><Ico name="chevron" size={24} className="rotate-180" /></button>
          <span suppressHydrationWarning className="font-semibold">{name}</span>
          <button aria-label="Next month" disabled={month >= monthKey(now)} onClick={() => setMonth(month + 1)}
            className="grid size-11 place-items-center rounded-full active:bg-surface-2 disabled:opacity-30"><Ico name="chevron" size={24} /></button>
        </div>

        <div className="flex flex-col items-center gap-2 px-5 text-center">
          <span className="text-sm text-muted">You sent</span>
          {items === null ? <span className="h-14 w-48 animate-pulse rounded-2xl bg-surface-2" /> : <Amount value={formatMoney(total)} />}
        </div>

        <Chart daily={daily} upTo={upTo} />

        <section className="flex flex-col">
          <Band>By category</Band>
          {items !== null && cats.length === 0 && (
            <p className="px-5 py-6 text-center text-sm text-muted">No spending this month. Nice and calm.</p>
          )}
          <ul className="flex flex-col">
            {cats.map(({ cat, total: t }) => (
              <li key={cat.id} className="flex min-h-16 items-center gap-4 px-5 py-3">
                <IconTile name={cat.icon} size={44} />
                <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <span className="flex justify-between gap-2">
                    <span className="font-semibold">{cat.label}</span>
                    <span className="font-display tabular text-lg">{formatMoney(t)}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2">
                      <span className="block h-full rounded-full bg-brand" style={{ width: `${pct(t)}%` }} />
                    </span>
                    <span className="w-12 text-right text-xs text-muted tabular">{pct(t)}%</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      </Screen>
    </>
  );
}
