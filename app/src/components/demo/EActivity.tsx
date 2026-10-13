"use client";
// Section E2 demo: the whole Activity tab in the printed-ticket model. Mirrors app/(tabs)/activity/page.tsx:
// wire-savings line, Moments (cards), links waiting to be collected, All/Sent/Received, payment rows, load more,
// loading, empty. Cards = mini ticket stubs; rows = one statement roll. Tap → the receipt ticket.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, Ico, Screen, funBg } from "@/components/ui";
import type { Item } from "@/lib/activity";
import { CATEGORIES, type Category } from "@/lib/categories";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import * as F from "./fixtures";
import type { DemoState } from "./screens";
import { Heading, Label, Paper } from "./Slip";

export type Pending = { id: bigint; amount: bigint; expired: boolean; when: string };
type Filter = "all" | "out" | "in";
const FILTERS = [["all", "All"], ["out", "Sent"], ["in", "Received"]] as const;

// Demo categories for sent payments (real: categoryOf(hash), this phone only).
const CAT: Record<string, Category> = { [F.ITEMS[0].hash]: CATEGORIES[0], [F.ITEMS[2].hash]: CATEGORIES[4], [F.ITEMS[5].hash]: CATEGORIES[6] };
const receiptOf = (i: Item) => (i.dir === "out" ? "/demo/receipt-sent" : "/demo/receipt-received"); // real: /details?tx=<hash>

// Same estimate as the real tab: 3% + $5 per sent payment.
const saved = (items: Item[]) => items.filter((i) => i.dir === "out").reduce((a, i) => a + (i.amount * 3n) / 100n + 5_000_000n, 0n);

export const PENDING: Pending[] = [
  { id: 1n, amount: 30_000_000n, expired: false, when: "in 5 days" },
  { id: 2n, amount: 12_500_000n, expired: true, when: "2 days ago" },
];

/** Card: a mini ticket stub, colored band = the person. */
function Stub({ item, fresh }: { item: Item; fresh?: boolean }) {
  const out = item.dir === "out";
  return (
    <Link href={receiptOf(item)} aria-label={`${out ? "Paid" : "Got"} ${formatMoney(item.amount)} ${out ? "to" : "from"} ${item.who}, ${item.when}. Open receipt`}
      className={`kt-printer kd-paper-shadow block w-36 shrink-0 snap-start transition active:scale-[0.97] ${fresh ? "kd-new" : ""}`}>
      <div className="kt-sheet flex h-44 flex-col px-3 pb-6 text-left">
        <span aria-hidden className={`-mx-3 mb-3 h-2 ${funBg(item.who)}`} />
        <span className="flex items-center justify-between">
          <Ico name={out ? (CAT[item.hash]?.icon ?? "send") : "request"} size={22} />
          <Label>{out ? "PAID" : "GOT"}</Label>
        </span>
        <span className="mt-auto text-2xl font-bold leading-none tracking-tight tabular-nums">{formatMoney(item.amount)}</span>
        <hr aria-hidden className="kt-dash my-2" />
        <span className="truncate font-mono text-xs font-bold">{out ? "TO" : "FROM"} {item.who}</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--kt-muted)]">{item.when}</span>
      </div>
    </Link>
  );
}

export function MomentsStrip({ items, fresh }: { items: Item[]; fresh?: string }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="px-5"><Heading>MOMENTS</Heading></div>
      <div className="flex snap-x scroll-px-5 gap-3 overflow-x-auto px-5 pb-3 pt-1 [scrollbar-width:none]">
        {items.slice(0, 8).map((i) => <Stub key={`${i.hash}:${i.logIndex}`} item={i} fresh={i.hash === fresh} />)}
      </div>
    </section>
  );
}

const day = (t: number) => {
  const d = Math.floor((Date.now() - t) / 86_400_000);
  return d === 0 ? "TODAY" : d === 1 ? "YESTERDAY" : "EARLIER";
};

/** Rows: one long statement roll, a dashed line between payments, day headings printed on it. */
export function Roll({ items, fresh, more }: { items: Item[]; fresh?: string; more?: boolean }) {
  return (
    <div className="px-4">
      <Paper className="flex flex-col pb-7 pt-2">
        <div className="kd-roll flex flex-col">
          {items.map((i, n) => {
            const out = i.dir === "out";
            const cat = out ? CAT[i.hash] : undefined;
            const head = n === 0 || day(items[n - 1].time) !== day(i.time) ? day(i.time) : null;
            return (
              <div key={`${i.hash}:${i.logIndex}`} className={i.hash === fresh ? "kd-new" : ""}>
                {head && <p className="px-4 pb-1 pt-3"><Label>{head}</Label></p>}
                <Link href={receiptOf(i)} className="flex min-h-16 items-center gap-3 px-4 py-2">
                  <Avatar name={i.who} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{i.who}</span>
                    <span className="flex items-center gap-1 truncate font-mono text-[11px] uppercase tracking-wider text-[var(--kt-muted)]">
                      {out ? "Sent" : "Received"} · {i.when}{cat && <> · <Ico name={cat.icon} size={12} /> {cat.label}</>}
                    </span>
                  </span>
                  <span className={`shrink-0 font-mono text-base font-bold tabular-nums ${out ? "" : "text-[var(--kt-good)]"}`}>
                    {out ? "−" : "+"}{formatMoney(i.amount)}
                  </span>
                </Link>
              </div>
            );
          })}
        </div>
        {more ? (
          <div className="flex flex-col gap-2 px-4 pt-3" aria-busy aria-label="Loading more">
            {[0, 1].map((k) => <span key={k} className="kd-shimmer h-12 rounded-lg bg-[rgb(36_32_27/0.07)]" />)}
          </div>
        ) : (
          <p className="pt-4 text-center font-mono text-[11px] tracking-[0.2em] text-[var(--kt-muted)]">— {items.length} PAYMENT{items.length === 1 ? "" : "S"} —</p>
        )}
      </Paper>
    </div>
  );
}

/** Links I sent that nobody collected yet: stubs on one paper, Take it back once expired. */
export function PendingLinks({ links, busy, err, onTakeBack }: { links: Pending[]; busy?: bigint | null; err?: string; onTakeBack: (id: bigint) => void }) {
  if (!links.length) return null;
  return (
    <section className="flex flex-col gap-2 px-5">
      <Heading>WAITING TO BE COLLECTED</Heading>
      <Paper className="kd-roll flex flex-col pb-6 pt-1">
        {links.map((l) => (
          <div key={l.id.toString()} className="flex min-h-16 items-center gap-3 px-4 py-2">
            <span className="kt-pill grid size-10 shrink-0 place-items-center rounded-lg"><Ico name="link" size={18} /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-base font-bold tabular-nums">{formatMoney(l.amount)}</span>
              <span className="block font-mono text-[11px] uppercase leading-snug tracking-wider text-[var(--kt-muted)]">
                {l.expired ? `Not collected · expired ${l.when}` : `Take it back ${l.when}`}
              </span>
            </span>
            {l.expired && (
              <button onClick={() => onTakeBack(l.id)} disabled={busy === l.id} aria-busy={busy === l.id}
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-[var(--kt-ink)] px-4 text-sm font-semibold text-[var(--kt-paper)] active:scale-95 disabled:opacity-70">
                {busy === l.id ? <><span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> Taking back…</> : "Take it back"}
              </button>
            )}
          </div>
        ))}
      </Paper>
      {err && <p role="alert" className="kin-shake rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad">{err}</p>}
    </section>
  );
}

/** Filters as a printed segmented control (mono labels, the picked one inked). */
function Filters({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  return (
    <div role="tablist" aria-label="Show" className="mx-5 grid grid-cols-3 gap-1 rounded-full bg-surface-2 p-1">
      {FILTERS.map(([v, l]) => (
        <button key={v} role="tab" aria-selected={value === v} onClick={() => onChange(v)}
          className={`h-11 rounded-full font-mono text-xs font-bold uppercase tracking-[0.15em] transition active:scale-95 ${value === v ? "kt-cream shadow-sm" : "text-muted"}`}>
          {l}
        </button>
      ))}
    </div>
  );
}

/** Savings line as a torn-off coupon. */
function Coupon({ amount }: { amount: bigint }) {
  return (
    <div className="mx-5 flex items-center gap-3 rounded-2xl border-2 border-dashed border-good/50 bg-good/5 px-4 py-3">
      <Ico name="sparkle" size={22} className="shrink-0 text-good" />
      <span className="flex min-w-0 flex-col">
        <span className="font-mono text-sm font-bold text-good">SAVED ≈ {formatMoney(amount)} vs a bank wire</span>
        <span className="text-xs text-muted">Estimate: banks often charge 3% + $5 per transfer.</span>
      </span>
    </div>
  );
}

function Skeleton() {
  return (
    <section className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="flex gap-3 overflow-hidden px-5 pt-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="kt-printer w-36 shrink-0 opacity-70"><div className="kt-sheet kd-shimmer h-44" /></div>
        ))}
      </div>
      <div className="px-4">
        <div className="kt-printer opacity-70">
          <div className="kt-sheet flex flex-col gap-3 px-4 pb-8 pt-4">
            {[0, 1, 2, 3, 4].map((i) => <span key={i} className="kd-shimmer h-12 rounded-lg bg-[rgb(36_32_27/0.07)]" />)}
          </div>
        </div>
      </div>
      <p className="text-center font-mono text-xs text-muted" role="status">Printing your activity…</p>
    </section>
  );
}

export type ActivityProps = {
  items?: Item[] | null; filter?: Filter; links?: Pending[]; busy?: bigint | null; err?: string;
  hide?: boolean; more?: boolean; arriving?: boolean;
};

/** Full Activity tab. `items` null = loading, [] = empty. `arriving` = a received payment prints in after 0.9 s. */
export function ActivityPage({ items = F.ITEMS, filter: f0 = "all", links = PENDING, busy = null, err = "", hide, more, arriving }: ActivityProps) {
  const [list, setList] = useState(items);
  const [filter, setFilter] = useState<Filter>(f0);
  const [fresh, setFresh] = useState<string>();
  const [pending, setPending] = useState(links);
  const [taking, setTaking] = useState(busy);
  useEffect(() => {
    if (!arriving) return;
    const t = setTimeout(() => {
      const n = F.newItem(1); // received
      setList((l) => (l ? [n, ...l] : [n]));
      setFresh(n.hash);
    }, 900);
    return () => clearTimeout(t);
  }, [arriving]);
  // Demo take-back: 1.2 s busy, then the stub goes (real: refundLink → refresh).
  function takeBack(id: bigint) {
    setTaking(id);
    setTimeout(() => (setPending((p) => p.filter((l) => l.id !== id)), setTaking(null)), 1200);
  }

  const shown = list?.filter((i) => filter === "all" || i.dir === filter) ?? [];
  const sum = list ? saved(list) : 0n;
  return (
    <Screen wide title="Activity" action={
      <Link href="/spends" className="grid h-11 place-items-center rounded-full bg-surface-2 px-4 text-sm font-semibold active:scale-95">Spends</Link>
    }>
      {list === null ? (
        <Skeleton />
      ) : list.length === 0 ? (
        <div className="flex flex-1 flex-col gap-4 px-5">
          <div className="kt-printer"><div aria-hidden className="kt-slot" /></div>
          <div className="kin-rise flex flex-col items-center gap-2 text-center">
            <span className="font-mono text-sm font-bold tracking-[0.2em]">NO PAYMENTS YET</span>
            <span className="text-sm text-muted">Money you send or get shows up here, each with its own receipt.</span>
          </div>
          <Link href="/send" className="mt-auto grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">Send money</Link>
        </div>
      ) : (
        <>
          {sum > 0n && !hide && <Coupon amount={sum} />}
          <MomentsStrip items={list} fresh={fresh} />
          <PendingLinks links={pending} busy={taking} err={err} onTakeBack={takeBack} />
          <Filters value={filter} onChange={setFilter} />
          {shown.length === 0 ? (
            <p className="px-5 py-6 text-center font-mono text-sm text-muted">Nothing here yet.</p>
          ) : (
            <Roll items={shown} fresh={fresh} more={more} />
          )}
        </>
      )}
    </Screen>
  );
}

const fail = humanError(new Error("x"));

export const ACTIVITY_STATES: DemoState[] = [
  { label: "All: cards + links + rows", render: () => <ActivityPage /> },
  { label: "New payment arriving", render: () => <ActivityPage arriving /> },
  { label: "Sent", render: () => <ActivityPage filter="out" /> },
  { label: "Received", render: () => <ActivityPage filter="in" /> },
  { label: "Filter with nothing", render: () => <ActivityPage items={F.ITEMS.filter((i) => i.dir === "out")} filter="in" /> },
  { label: "Loading more (scroll)", render: () => <ActivityPage more /> },
  { label: "Taking a link back…", render: () => <ActivityPage busy={2n} /> },
  { label: "Take back failed", render: () => <ActivityPage err={fail} /> },
  { label: "Private: no savings line", render: () => <ActivityPage hide /> },
  { label: "No links waiting", render: () => <ActivityPage links={[]} /> },
  { label: "Loading", render: () => <ActivityPage items={null} /> },
  { label: "Empty: no payments yet", render: () => <ActivityPage items={[]} /> },
];
