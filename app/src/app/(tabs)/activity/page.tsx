"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useMode } from "@/lib/mode";
import type { Address } from "viem";
import { ActivityRow } from "@/components/core/ActivityRow";
import { SkeletonRows } from "@/components/social/bits";
import { Band, Button, Chip, ErrorText, Ico, IconTile, Row, Screen, Tabs, funBg } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { ago, cachedPayments, label, payments, type Item } from "@/lib/activity";
import { categoryOf } from "@/lib/categories";
import { forgetLink, myLinkIds, readLink, refundLink } from "@/lib/claimLink";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { usePrivate } from "@/lib/privacy";

type Pending = { id: bigint; amount: bigint; expired: boolean; when: string };
type Filter = "all" | "out" | "in";
const FILTERS = [["all", "All"], ["out", "Sent"], ["in", "Received"]] as const;

async function pendingLinks(me: Address): Promise<Pending[]> {
  const out: Pending[] = [];
  for (const id of myLinkIds(me)) {
    const l = await readLink(id);
    if (l.settled) forgetLink(me, id);
    else out.push({ id, amount: l.amount, expired: Date.now() >= l.expiresAt * 1000, when: ago(l.expiresAt * 1000) });
  }
  return out;
}

/** Bright card for a recent payment. */
function Moment({ item }: { item: Item }) {
  const out = item.dir === "out";
  const icon = out ? categoryOf(item.hash).icon : "request";
  return (
    <Link href={`/details?tx=${item.hash}`}
      className={`flex h-40 w-36 shrink-0 snap-start flex-col justify-between rounded-[28px] p-4 text-fun-ink active:scale-[0.97] transition ${funBg(item.who)}`}>
      <Ico name={icon} size={28} />
      <span className="flex flex-col gap-1">
        <span className="font-display text-2xl leading-none tabular">{formatMoney(item.amount)}</span>
        <span className="line-clamp-2 text-sm font-semibold leading-tight">{out ? `paid to ${item.who}` : `from ${item.who}`}</span>
        <span className="text-xs opacity-80">{item.when}</span>
      </span>
    </Link>
  );
}

// ponytail: rough bank-wire cost (3% + $5 per transfer) — an estimate, labelled as such in the UI.
const WIRE_FLAT = 5_000_000n; // $5 in base units
const wireSavings = (sent: bigint[]) => sent.reduce((a, v) => a + (v * 3n) / 100n + WIRE_FLAT, 0n);

// Names are looked up per payment: label the newest FIRST, then NEXT more, then NEXT per scroll.
const FIRST = 5;
const NEXT = 10;

export default function Activity() {
  const { profile } = useRequireAccount();
  const me = profile?.address;
  const mode = useMode();
  const [raw, setRaw] = useState<{ mode: string; list: Awaited<ReturnType<typeof payments>> } | null>(null);
  const all = raw?.mode === mode ? raw.list : me ? cachedPayments(me) : null; // this session's last list right away
  const [n, setN] = useState(FIRST);
  const [labelled, setItems] = useState<Item[] | null>(null);
  const items = all && labelled;
  const more = useRef<HTMLDivElement>(null);
  const [links, setLinks] = useState<Pending[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<bigint | null>(null);
  const [err, setErr] = useState("");

  const refresh = useCallback(() => {
    if (!me) return;
    payments(me).then((list) => setRaw({ mode, list })).catch(() => {});
    pendingLinks(me).then(setLinks).catch(() => {});
  }, [me, mode]);

  // Label the newest n payments; once the first FIRST show, queue NEXT more.
  useEffect(() => {
    if (!me || !all) return;
    let live = true;
    label(all.slice(0, n), me)
      .then((it) => {
        if (!live) return;
        setItems(it);
        if (n === FIRST) setN(FIRST + NEXT);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [all, n, me]);

  // Near the bottom: NEXT more (one step per finished page).
  const hasMore = !!all && !!items && n > FIRST && items.length === n && n < all.length;
  useEffect(() => {
    const el = more.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setN(items!.length + NEXT), { rootMargin: "300px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, items]);

  useEffect(() => {
    refresh();
    const t = setInterval(() => document.visibilityState === "visible" && refresh(), 15_000); // hidden tabs don't poll (RPC budget)
    return () => clearInterval(t);
  }, [refresh, mode]); // mode: practice ↔ real money switches the list

  async function takeBack(id: bigint) {
    setBusy(id);
    setErr("");
    try {
      await refundLink(id);
      refresh();
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(null);
    }
  }

  const hide = usePrivate();
  const saved = all ? wireSavings(all.filter((i) => i.dir === "out").map((i) => i.amount)) : 0n;
  const shown = items?.filter((i) => filter === "all" || i.dir === filter) ?? [];
  const moments = items?.slice(0, 8) ?? [];

  return (
    <>
      <Screen wide title="Activity" action={
        <Link href="/spends" className="grid h-11 place-items-center rounded-full bg-surface-2 px-4 text-sm font-semibold active:scale-95">Spends</Link>
      }>
        {saved > 0n && !hide && (
          <div className="flex flex-col items-start gap-1 px-5">
            <Chip tone="good">You saved about {formatMoney(saved)} vs a bank wire</Chip>
            <p className="px-1 text-xs text-muted">Estimate: banks often charge 3% + $5 per transfer.</p>
          </div>
        )}
        {items === null && (
          <section className="flex flex-col gap-3" aria-busy="true" aria-label="Loading">
            <span className="mx-5 h-7 w-32 animate-pulse rounded-full bg-surface-2" />
            <div className="flex gap-3 overflow-hidden px-5 pb-1">
              {Array.from({ length: 4 }, (_, i) => <span key={i} className="h-40 w-36 shrink-0 animate-pulse rounded-[28px] bg-surface-2" />)}
            </div>
          </section>
        )}
        {moments.length > 0 && (
          <section className="flex flex-col gap-3">
            <h2 className="px-5 font-display text-2xl">Moments</h2>
            <div className="flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
              {moments.map((i) => <Moment key={`${i.hash}:${i.logIndex}`} item={i} />)}
            </div>
          </section>
        )}

        {links.length > 0 && (
          <section className="flex flex-col">
            <Band>Links waiting to be collected</Band>
            {links.map((l) => (
              <Row key={l.id.toString()}
                icon={<IconTile name="link" size={44} />}
                title={formatMoney(l.amount)}
                sub={l.expired ? `Not collected · expired ${l.when}` : `You can take it back ${l.when}`}
                trail={l.expired && (
                  <Button variant="soft" className="h-11! w-auto! text-sm" busy={busy === l.id} onClick={() => takeBack(l.id)}>Take it back</Button>
                )}
              />
            ))}
            <div className="px-5"><ErrorText>{err}</ErrorText></div>
          </section>
        )}

        <div className="px-5">
          <Tabs value={filter} options={FILTERS} onChange={setFilter} />
        </div>

        <section className="flex flex-col">
          {items === null ? (
            <div className="px-5"><SkeletonRows n={5} /></div>
          ) : shown.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">
              {items.length === 0 ? "No payments yet. Money you send or get shows up here." : "Nothing here yet."}
            </p>
          ) : (
            shown.map((i) => <ActivityRow key={`${i.hash}:${i.logIndex}`} item={i} />)
          )}
          {hasMore && <div ref={more} className="px-5"><SkeletonRows n={2} /></div>}
        </section>
      </Screen>
    </>
  );
}
