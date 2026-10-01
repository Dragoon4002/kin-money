"use client";
import { Avatar, Ico, Row } from "@/components/ui";
import type { Item } from "@/lib/activity";
import { categoryOf, hasCategory } from "@/lib/categories";
import { formatMoney } from "@/lib/money";

/** Full-bleed payment row (use inside <Screen wide>). Taps through to the receipt. */
export function ActivityRow({ item }: { item: Item }) {
  const inbound = item.dir === "in";
  const cat = !inbound && hasCategory(item.hash) ? categoryOf(item.hash) : null;
  return (
    <Row
      href={`/details?tx=${item.hash}`}
      icon={<Avatar name={item.who} size={44} />}
      title={item.who}
      sub={
        <span className="inline-flex items-center gap-1">
          {inbound ? "Received" : "Sent"} · {item.when}
          {cat && <>{" · "}<Ico name={cat.icon} size={14} /> {cat.label}</>}
        </span>
      }
      trail={
        <span className={`font-display tabular text-xl ${inbound ? "text-good" : ""}`}>
          {inbound ? "+" : "−"}
          {formatMoney(item.amount)}
        </span>
      }
    />
  );
}
