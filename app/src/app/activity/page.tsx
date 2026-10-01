"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { ActivityRow } from "@/components/core/ActivityRow";
import { NavBar } from "@/components/core/NavBar";
import { Band, Button, ErrorText, Row, Screen, Tabs, funBg } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { ago, loadActivity, type Item } from "@/lib/activity";
import { categoryOf } from "@/lib/categories";
import { forgetLink, myLinkIds, readLink, refundLink } from "@/lib/claimLink";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";

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
  const emoji = out ? categoryOf(item.hash).emoji : "💌";
  return (
    <Link href={`/details?tx=${item.hash}`}
      className={`flex h-40 w-36 shrink-0 snap-start flex-col justify-between rounded-[28px] p-4 text-fun-ink active:scale-[0.97] transition ${funBg(item.who)}`}>
      <span className="text-3xl" aria-hidden>{emoji}</span>
      <span className="flex flex-col gap-1">
        <span className="font-display text-2xl leading-none tabular">{formatMoney(item.amount)}</span>
        <span className="line-clamp-2 text-sm font-semibold leading-tight">{out ? `paid to ${item.who}` : `from ${item.who}`}</span>
        <span className="text-xs opacity-80">{item.when}</span>
      </span>
    </Link>
  );
}

export default function Activity() {
  const { profile } = useRequireAccount();
  const me = profile?.address;
  const [items, setItems] = useState<Item[] | null>(null);
  const [links, setLinks] = useState<Pending[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [busy, setBusy] = useState<bigint | null>(null);
  const [err, setErr] = useState("");

  const refresh = useCallback(() => {
    if (!me) return;
    loadActivity(me).then(setItems).catch(() => {});
    pendingLinks(me).then(setLinks).catch(() => {});
  }, [me]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

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

  const shown = items?.filter((i) => filter === "all" || i.dir === filter) ?? [];
  const moments = items?.slice(0, 8) ?? [];

  return (
    <>
      <Screen wide title="Activity" action={
        <Link href="/spends" className="grid h-11 place-items-center rounded-full bg-surface-2 px-4 text-sm font-semibold active:scale-95">Spends</Link>
      }>
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
                icon={<span className="grid size-11 place-items-center rounded-full bg-surface-2 text-xl" aria-hidden>🔗</span>}
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
            <p className="py-6 text-center text-sm text-muted">Loading your payments…</p>
          ) : shown.length === 0 ? (
            <p className="px-5 py-6 text-center text-sm text-muted">
              {items.length === 0 ? "No payments yet. Money you send or get shows up here." : "Nothing here yet."}
            </p>
          ) : (
            shown.map((i) => <ActivityRow key={`${i.hash}:${i.logIndex}`} item={i} />)
          )}
        </section>
      </Screen>
      <NavBar />
    </>
  );
}
