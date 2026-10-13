"use client";
// Proposed extraction of app/src/app/(tabs)/activity/page.tsx — not wired into the real screen yet.
// Moment card + the "Moments" strip, copied 1:1 (page files can't export extras).
import Link from "next/link";
import { Ico, funBg } from "@/components/ui";
import type { Item } from "@/lib/activity";
import { categoryOf } from "@/lib/categories";
import { formatMoney } from "@/lib/money";

/** Bright card for a recent payment. */
export function Moment({ item }: { item: Item }) {
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

export function Moments({ items }: { items: Item[] }) {
  if (!items.length) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="px-5 font-display text-2xl">Moments</h2>
      <div className="kd-stagger-x flex snap-x gap-3 overflow-x-auto px-5 pb-1 [scrollbar-width:none]">
        {items.map((i) => <Moment key={`${i.hash}:${i.logIndex}`} item={i} />)}
      </div>
    </section>
  );
}
