"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar, Button, Chip, ErrorText, IconTile, Screen } from "@/components/ui";
import { Bubble, SkeletonRows, useSignedIn } from "@/components/social/bits";
import { listRequests, recordPayment, settleRequest, type MoneyRequest } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { sendDollars } from "@/lib/tx";

type Lists = { incoming: MoneyRequest[]; outgoing: MoneyRequest[] };

function ago(at: number) {
  const s = (at - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [unit, n] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
  return "just now";
}

const STATUS = { open: "Waiting", paid: "Paid ✓✓", declined: "Declined" } as const;

/** #24 Collect: pay or decline what people asked you for; track what you asked. */
export default function RequestsPage() {
  useSignedIn();
  const [lists, setLists] = useState<Lists | null>(null);
  const [err, setErr] = useState("");
  const [paying, setPaying] = useState<string | null>(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    listRequests().then(setLists, (e) => setErr(humanError(e)));
  }, []);

  const mark = (id: string, status: MoneyRequest["status"]) =>
    setLists((l) => l && { ...l, incoming: l.incoming.map((r) => (r.id === id ? { ...r, status } : r)) });

  async function pay(r: MoneyRequest) {
    setErr("");
    setPaying(r.id);
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 2000);
    try {
      const units = BigInt(r.amount);
      const hash = await sendDollars(r.from.address, units);
      mark(r.id, "paid");
      void settleRequest(r.id, "paid", hash).catch(() => {});
      void recordPayment(r.from.address, units);
    } catch (e) {
      setErr(humanError(e));
    } finally {
      clearTimeout(t);
      setPaying(null);
    }
  }

  async function decline(r: MoneyRequest) {
    setErr("");
    mark(r.id, "declined");
    try {
      await settleRequest(r.id, "declined");
    } catch (e) {
      mark(r.id, "open");
      setErr(humanError(e));
    }
  }

  const open = lists?.incoming.filter((r) => r.status === "open") ?? [];
  const done = lists?.incoming.filter((r) => r.status !== "open") ?? [];

  return (
    <Screen
      title="Requests"
      back="/home"
      action={
        <Link href="/request" className="grid h-11 place-items-center rounded-full bg-brand-soft px-4 text-sm font-semibold text-brand active:scale-95">
          + Ask
        </Link>
      }
    >
      <ErrorText>{err}</ErrorText>
      {!lists && !err && <SkeletonRows />}

      {lists && !lists.incoming.length && !lists.outgoing.length && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <IconTile name="request" size={64} />
          <p className="font-semibold">No requests yet</p>
          <p className="text-sm text-muted">When someone asks you for money, it shows up here.</p>
        </div>
      )}

      {[...open, ...done].map((r) => (
        <article key={r.id} className="flex flex-col gap-3 border-b border-line pb-5 last:border-0">
          <p className="flex items-center gap-2 text-sm text-muted">
            <Avatar name={r.from.name} size={24} />
            <span className="font-semibold text-ink">@{r.from.name || "someone"}</span> · {ago(r.at)}
          </p>
          <Bubble amount={formatMoney(BigInt(r.amount))} note={r.note} />
          {r.status === "open" ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-3">
                <Button variant="ghost" className="flex-1" onClick={() => decline(r)} disabled={!!paying}>
                  Decline
                </Button>
                <Button className="flex-[2]" onClick={() => pay(r)} busy={paying === r.id} disabled={!!paying && paying !== r.id}>
                  Pay {formatMoney(BigInt(r.amount))}
                </Button>
              </div>
              {paying === r.id && (
                <p className="text-center text-sm text-muted" aria-live="polite">
                  {slow ? `Delivering to @${r.from.name}…` : "Sending…"}
                </p>
              )}
            </div>
          ) : (
            <span><Chip tone={r.status === "paid" ? "good" : "muted"}>{r.status === "paid" ? "You paid ✓✓" : "You declined"}</Chip></span>
          )}
        </article>
      ))}

      {!!lists?.outgoing.length && (
        <section className="mt-4 flex flex-col gap-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted">You asked</h2>
          {lists.outgoing.map((r) => (
            <div key={r.id} className="flex flex-col gap-1">
              <Bubble mine amount={formatMoney(BigInt(r.amount))} note={r.note} />
              <p className="text-right text-sm text-muted">
                @{r.to.name || "someone"} · {ago(r.at)} ·{" "}
                <Chip tone={r.status === "paid" ? "good" : r.status === "declined" ? "muted" : "warn"}>{STATUS[r.status]}</Chip>
              </p>
            </div>
          ))}
        </section>
      )}
    </Screen>
  );
}
