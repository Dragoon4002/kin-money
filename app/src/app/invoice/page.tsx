"use client";
import { useState } from "react";
import type { Address } from "viem";
import { Choice, Empty, Loading, MoneyInput, Pad, Who, WhoAvatar, useLoad, useMe, useName } from "@/components/programs/kit";
import { Band, Button, Card, Chip, ErrorText, Field, Row, Screen, inputClass } from "@/components/ui";
import { formatMoney, fromLocal } from "@/lib/money";
import { listEscrows, same, type Escrow } from "@/lib/programs";

// Freelancer invoices: compose a pay link; the client holds each part safely until they OK the work
// (or it pays itself after N quiet days).

export default function InvoicePage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error } = useLoad(() => listEscrows(me!, "invoice").then((r) => r.escrows), me);

  if (creating) return <Compose me={me} onClose={() => setCreating(false)} />;

  // One row per client/freelancer pair.
  const groups = new Map<string, Escrow[]>();
  for (const e of [...(data ?? [])].reverse()) {
    const k = `${e.from}-${e.to}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }

  return (
    <Screen title="Invoices" back="/explore" wide>
      <Pad>
        <p className="text-muted">Get paid for your work. Your client&apos;s money is held safely until they OK each part.</p>
        <ErrorText>{error}</ErrorText>
        {!data && !error && <Loading />}
        {data && !data.length && <Empty icon="invoice" title="No invoices yet" sub="Send a client a pay link. If they go quiet, you still get paid." />}
      </Pad>
      {groups.size > 0 && <Band>Your invoices</Band>}
      {[...groups.values()].map((list) => {
        const e = list[0];
        const iWork = same(e.to, me);
        const other: Address = iWork ? e.from : e.to;
        const left = list.filter((x) => !x.settled).length;
        const total = list.reduce((a, x) => a + x.amount, 0n);
        return (
          <Row
            key={`${e.from}-${e.to}`}
            href={`/invoice/${list.map((x) => x.id).join("-")}`}
            icon={<WhoAvatar a={other} size={44} />}
            title={<>{iWork ? "From" : "To"} <Who a={other} me={me} /></>}
            sub={left ? <Chip tone="warn">{left} part{left > 1 ? "s" : ""} waiting</Chip> : <Chip tone="good">All paid ✓✓</Chip>}
            trail={<span className="font-display text-2xl tabular">{formatMoney(total)}</span>}
          />
        );
      })}
      <Pad className="mt-auto pt-4">
        <Button onClick={() => setCreating(true)}>New invoice</Button>
      </Pad>
    </Screen>
  );
}

function Compose({ me, onClose }: { me?: Address; onClose: () => void }) {
  const handle = useName(me);
  const [title, setTitle] = useState("");
  const [parts, setParts] = useState<string[]>([""]);
  const [days, setDays] = useState(7);
  const [copied, setCopied] = useState(false);

  const units = parts.map((p) => (Number(p) > 0 ? fromLocal(p) : 0n));
  const ready = title.trim() && units.every((u) => u > 0n);
  const total = units.reduce((a, b) => a + b, 0n);

  function link() {
    const q = new URLSearchParams({ to: handle || me || "", m: units.join(","), d: String(days), t: title.trim() });
    return `${location.origin}/invoice/new?${q}`;
  }

  async function share() {
    const url = link();
    if (navigator.share) {
      await navigator.share({ title: `Invoice: ${title.trim()}`, text: `Pay for "${title.trim()}" on Kin`, url }).catch(() => {});
    } else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    }
  }

  return (
    <Screen title="New invoice" action={<button onClick={onClose} className="h-11 px-2 text-muted">Cancel</button>}>
      <Field label="What's it for?">
        <input className={inputClass} placeholder="Logo design" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {parts.map((p, i) => (
        <div key={i} className="flex items-end gap-2">
          <div className="flex-1">
            <MoneyInput label={parts.length > 1 ? `Part ${i + 1}` : "Amount"} value={p} onChange={(v) => setParts(parts.map((x, j) => (j === i ? v : x)))} />
          </div>
          {parts.length > 1 && (
            <button aria-label={`Remove part ${i + 1}`} onClick={() => setParts(parts.filter((_, j) => j !== i))} className="grid size-16 place-items-center rounded-full border border-line text-xl text-muted">
              ×
            </button>
          )}
        </div>
      ))}
      {parts.length < 3 && (
        <button onClick={() => setParts([...parts, ""])} className="h-11 self-start rounded-full px-3 text-sm font-semibold text-brand">
          + Split into parts
        </button>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">If they don&apos;t reply, pay me after</span>
        <Choice options={[{ value: 3, label: "3 days" }, { value: 7, label: "7 days" }, { value: 14, label: "14 days" }]} value={days} onChange={setDays} />
      </div>
      {ready && (
        <Card className="text-sm text-muted">
          Your client pays {formatMoney(total)} with Face ID. It&apos;s held safely and reaches you when they OK each part — or automatically after {days} quiet days.
        </Card>
      )}
      <div className="mt-auto flex flex-col gap-2 pt-4">
        {copied && <p className="text-center text-sm text-good">Link copied — paste it to your client.</p>}
        <Button onClick={share} disabled={!ready}>Share pay link</Button>
      </div>
    </Screen>
  );
}
