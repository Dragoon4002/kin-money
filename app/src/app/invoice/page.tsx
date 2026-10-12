"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Address } from "viem";
import { Choice, Empty, Loading, MoneyInput, Pad, Status, Who, WhoAvatar, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { Band, Button, Card, Chip, ErrorText, Field, IconTile, Row, Screen, inputClass } from "@/components/ui";
import { api } from "@/lib/contacts";
import { MAX_PARTS, partsTotal, type Invoice } from "@/lib/invoiceMeta";
import { formatMoney, fromLocal } from "@/lib/money";
import { listEscrows, same, type Escrow } from "@/lib/programs";
import { endOfDay } from "@/lib/reminders";

// Freelancer invoices: compose a pay link; the client holds each part safely until they OK the work
// (or it pays itself after N quiet days).

export default function InvoicePage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error } = useLoad(() => listEscrows(me!, "invoice").then((r) => r.escrows), me);
  // Not paid yet: ones I sent, and ones sent to me. Best effort — held ones show from the money itself.
  const { data: waiting } = useLoad(() => api<Invoice[]>("/api/invoices?mine=1").catch((): Invoice[] => []), me);

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
        {data && !data.length && !waiting?.length && <Empty icon="invoice" title="No invoices yet" sub="Send a client a pay link. If they go quiet, you still get paid." />}
      </Pad>
      {!!waiting?.length && <Band>Waiting to be paid</Band>}
      {waiting?.map((inv) => {
        const mine = same(inv.owner as Address, me);
        const other = (mine ? inv.sentTo : inv.owner) as Address | null;
        return (
          <Row
            key={inv.id}
            href={`/invoice/new?i=${inv.id}`}
            icon={other ? <WhoAvatar a={other} size={44} /> : <IconTile name="invoice" size={44} />}
            title={inv.title}
            sub={mine ? (other ? <>Sent to <Who a={other} me={me} /></> : "Not sent yet") : <>From <Who a={other!} me={me} /> · tap to pay</>}
            trail={<span className="font-display text-2xl tabular">{formatMoney(partsTotal(inv.parts))}</span>}
          />
        );
      })}
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
            sub={left ? <Chip tone="warn">{left} part{left > 1 ? "s" : ""} waiting</Chip> : <Chip tone="good">All paid ✓</Chip>}
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

type Draft = { name: string; amount: string; due: string };
const blank: Draft = { name: "", amount: "", due: "" };
const isoDay = (t: number) => new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

function Compose({ me, onClose }: { me?: Address; onClose: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [parts, setParts] = useState<Draft[]>([blank]);
  const [days, setDays] = useState(7);
  const { busy, status, error, run } = useAction();
  const today = isoDay(useNow(60_000) * 1000);

  const units = parts.map((p) => (Number(p.amount) > 0 ? fromLocal(p.amount) : 0n));
  const many = parts.length > 1;
  const ready = !!me && !!title.trim() && units.every((u) => u > 0n);
  const total = units.reduce((a, b) => a + b, 0n);
  const edit = (i: number, d: Partial<Draft>) => setParts(parts.map((x, j) => (j === i ? { ...x, ...d } : x)));

  async function create() {
    await run(async (say) => {
      say("Saving your invoice…");
      const { id } = await api<{ id: string }>("/api/invoices", "POST", {
        title: title.trim(),
        days,
        parts: parts.map((p, i) => ({ name: many ? p.name : title, amount: String(units[i]), due: p.due ? endOfDay(p.due) : 0 })),
      });
      router.push(`/invoice/new?i=${id}`);
    });
  }

  return (
    <Screen title="New invoice" action={<button onClick={onClose} className="h-11 px-2 text-muted">Cancel</button>}>
      <Field label="What's it for?">
        <input className={inputClass} placeholder="Logo design" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      {parts.map((p, i) => (
        <Card key={i} className="flex flex-col gap-3">
          {many && (
            <div className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Field label={`Part ${i + 1}`}>
                  <input className={inputClass} placeholder={["First drafts", "Final files", "Changes"][i]} value={p.name} maxLength={30} onChange={(e) => edit(i, { name: e.target.value })} />
                </Field>
              </div>
              <button aria-label={`Remove part ${i + 1}`} onClick={() => setParts(parts.filter((_, j) => j !== i))} className="grid size-14 shrink-0 place-items-center rounded-full border border-line text-xl text-muted">
                ×
              </button>
            </div>
          )}
          <MoneyInput label="Amount" value={p.amount} onChange={(v) => edit(i, { amount: v })} />
          <Field label="Due date (optional)">
            <input type="date" className={inputClass} min={today} value={p.due} onChange={(e) => edit(i, { due: e.target.value })} aria-label={`Part ${i + 1} due date`} />
          </Field>
        </Card>
      ))}
      {parts.length < MAX_PARTS && (
        <button onClick={() => setParts([...parts, blank])} className="h-11 self-start rounded-full px-3 text-sm font-semibold text-brand">
          + Split into parts
        </button>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">If they don&apos;t reply, pay me after</span>
        <Choice options={[{ value: 3, label: "3 days" }, { value: 7, label: "7 days" }, { value: 14, label: "14 days" }]} value={days} onChange={setDays} />
      </div>
      {ready && (
        <Card className="text-sm text-muted">
          Your client pays {formatMoney(total)} with an Identity check. It&apos;s held safely and reaches you when they OK each part — or automatically after {days} quiet days.
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        <Button onClick={create} busy={busy} disabled={!ready}>Create invoice</Button>
      </div>
    </Screen>
  );
}
