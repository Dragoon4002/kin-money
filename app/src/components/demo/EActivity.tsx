"use client";
// Section E2 demo: the whole Activity tab. Mirrors app/(tabs)/activity/page.tsx: wire-savings line, Moments (cards),
// links waiting to be collected, All/Sent/Received, payment rows, load more, loading, empty. Only the Moments cards are
// the printed-ticket model (mini stubs); everything else is the real tab's look. Tap → the receipt ticket.
import Link from "next/link";
import { useEffect, useState } from "react";
import { SkeletonRows } from "@/components/social/bits";
import { Avatar, Band, Button, Chip, ErrorText, Ico, IconTile, Row, Screen, Tabs, funBg } from "@/components/ui";
import type { Item } from "@/lib/activity";
import { CATEGORIES, type Category } from "@/lib/categories";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import * as F from "./fixtures";
import type { DemoState } from "./screens";
import { Heading, Label } from "./Slip";

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

/** The real ActivityRow's look, but tapping opens the demo receipt (ActivityRow links to /details?tx=<real hash>). */
function PayRow({ item, fresh }: { item: Item; fresh?: boolean }) {
  const inbound = item.dir === "in";
  const cat = inbound ? undefined : CAT[item.hash];
  return (
    <div className={fresh ? "kd-new" : ""}>
      <Row href={receiptOf(item)} icon={<Avatar name={item.who} size={44} />} title={item.who}
        sub={<span className="inline-flex items-center gap-1">{inbound ? "Received" : "Sent"} · {item.when}{cat && <>{" · "}<Ico name={cat.icon} size={14} /> {cat.label}</>}</span>}
        trail={<span className={`font-display tabular text-xl ${inbound ? "text-good" : ""}`}>{inbound ? "+" : "−"}{formatMoney(item.amount)}</span>} />
    </div>
  );
}

/** Links I sent that nobody collected yet (real markup): Take it back once expired. */
export function PendingLinks({ links, busy, err, onTakeBack }: { links: Pending[]; busy?: bigint | null; err?: string; onTakeBack: (id: bigint) => void }) {
  if (!links.length) return null;
  return (
    <section className="flex flex-col">
      <Band>Links waiting to be collected</Band>
      {links.map((l) => (
        <Row key={l.id.toString()} icon={<IconTile name="link" size={44} />} title={formatMoney(l.amount)}
          sub={l.expired ? `Not collected · expired ${l.when}` : `You can take it back ${l.when}`}
          trail={l.expired && <Button variant="soft" className="h-11! w-auto! text-sm" busy={busy === l.id} onClick={() => onTakeBack(l.id)}>Take it back</Button>} />
      ))}
      <div className="px-5"><ErrorText>{err ?? ""}</ErrorText></div>
    </section>
  );
}

/** Loading: ticket-stub placeholders for the cards, the real skeleton rows below. */
function Skeleton() {
  return (
    <section className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
      <div className="flex gap-3 overflow-hidden px-5 pt-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="kt-printer w-36 shrink-0 opacity-70"><div className="kt-sheet kd-shimmer h-44" /></div>
        ))}
      </div>
      <div className="px-5"><Tabs value="all" options={FILTERS} onChange={() => {}} /></div>
      <div className="px-5"><SkeletonRows n={5} /></div>
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
      ) : (
        <>
          {sum > 0n && !hide && (
            <div className="flex flex-col items-start gap-1 px-5">
              <Chip tone="good">You saved about {formatMoney(sum)} vs a bank wire</Chip>
              <p className="px-1 text-xs text-muted">Estimate: banks often charge 3% + $5 per transfer.</p>
            </div>
          )}
          {list.length > 0 && <MomentsStrip items={list} fresh={fresh} />}
          <PendingLinks links={pending} busy={taking} err={err} onTakeBack={takeBack} />
          <div className="px-5"><Tabs value={filter} options={FILTERS} onChange={setFilter} /></div>
          <section className="flex flex-col">
            {shown.length === 0 ? (
              <p className="px-5 py-6 text-center text-sm text-muted">
                {list.length === 0 ? "No payments yet. Money you send or get shows up here." : "Nothing here yet."}
              </p>
            ) : (
              shown.map((i) => <PayRow key={`${i.hash}:${i.logIndex}`} item={i} fresh={i.hash === fresh} />)
            )}
            {more && <div className="px-5"><SkeletonRows n={2} /></div>}
          </section>
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
