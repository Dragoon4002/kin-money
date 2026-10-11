"use client";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { parseEventLogs } from "viem";
import { BILL_FOR, BillActions, BillState, loadBillFor } from "@/components/earmark/bill";
import { Loading, Pad, Who, WhoAvatar, dateLabel, useLoad, useMe } from "@/components/programs/kit";
import { Amount, Band, Card, ErrorText, Ico, IconTile, Row, Screen } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { formatMoney } from "@/lib/money";
import { getEscrow, history, same, ZERO } from "@/lib/programs";

// One bill: what it's for, who pays whom, where it's at, and my next step.

type Step = { text: ReactNode; at?: number; done: boolean };

/** Bill + its events (oldest first) from the shared escrow history. */
async function loadBill(id: bigint) {
  const [e, logs, what] = await Promise.all([
    getEscrow(id),
    history(addr.escrow).then((l) => parseEventLogs({ abi: KinEscrowAbi, logs: l })).catch(() => []),
    loadBillFor([id]),
  ]);
  const evs = logs.filter((l) => "id" in l.args && l.args.id === id);
  // Seconds; 0 = happened but time unknown (fresh logs may lack it), undefined = didn't happen (or history is down).
  const at = (name: string) => {
    const l = evs.find((x) => x.eventName === name);
    return l ? Number(l.blockTimestamp ?? 0) : undefined;
  };
  return { e, what: what[String(id)], created: at("Created"), approved: at("Approved"), released: at("Released"), refunded: at("Refunded") };
}

export default function BillPage() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const valid = /^\d{1,30}$/.test(id);
  const { data, error, reload } = useLoad(() => loadBill(BigInt(id)), valid && me ? id : undefined);

  // Only the sender, recipient and approver see a bill.
  const outside = data && ![data.e.from, data.e.to, data.e.approver].some((a) => same(a, me));
  if (!valid || (data && data.e.kind !== "bill") || outside) return <Screen title="Bill" back="/earmark"><ErrorText>We couldn&apos;t find this bill.</ErrorText></Screen>;
  if (!data) return <Screen title="Bill" back="/earmark">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { e, what } = data;
  const f = what ? BILL_FOR[what] : null;
  const back = data.refunded !== undefined;

  const steps: Step[] = [
    { text: <><Who a={e.from} me={me} /> set {f ? "it" : "the money"} aside</>, at: data.created, done: true },
    ...(e.approver !== ZERO && !back
      ? [{ text: e.approved ? <><Who a={e.approver} me={me} /> OK&apos;d the bill</> : <>Waiting for <Who a={e.approver} me={me} you="your" />{same(e.approver, me) ? "" : "'s"} OK</>, at: data.approved, done: e.approved }]
      : []),
    back
      ? { text: <>Came back to <Who a={e.from} me={me} you="you" /></>, at: data.refunded, done: true }
      : { text: e.settled ? <>Paid to <Who a={e.to} me={me} you="you" /> ✓✓</> : <><Who a={e.to} me={me} /> collects it</>, at: data.released, done: e.settled },
  ];

  return (
    <Screen title={f?.label ?? "Bill"} back="/earmark" wide>
      <Pad>
        <Card className="flex flex-col items-center gap-2 py-7 text-center">
          <IconTile name={f?.icon ?? "bill"} size={56} tone="brand" />
          <p className="text-sm text-muted">{f?.label ?? "Bill"} for <Who a={e.to} me={me} you="you" /></p>
          <Amount value={formatMoney(e.amount)} size="xl" />
          <BillState e={e} me={me} />
        </Card>
      </Pad>
      <Band>Who</Band>
      <Row icon={<WhoAvatar a={e.from} size={40} />} title={<Who a={e.from} me={me} />} sub="Set the money aside" />
      <Row icon={<WhoAvatar a={e.to} size={40} />} title={<Who a={e.to} me={me} />} sub="Gets paid — school, landlord, hospital" />
      {e.approver !== ZERO && <Row icon={<WhoAvatar a={e.approver} size={40} />} title={<Who a={e.approver} me={me} />} sub="Checks the bill first" />}
      <Band>What happened</Band>
      <Pad>
        <ol className="flex flex-col gap-4 py-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full ${s.done ? "bg-good text-fun-ink" : "border-2 border-line"}`}>
                {s.done && <Ico name="check" size={14} />}
              </span>
              <span className="flex flex-col">
                <span className={s.done ? "" : "text-muted"}>{s.text}</span>
                {!!s.at && <span className="text-xs text-muted">{dateLabel(s.at)}</span>}
              </span>
            </li>
          ))}
        </ol>
        {!e.settled && e.expiresAt > 0 && (
          <p className="mt-2 text-xs text-muted">If it isn&apos;t paid by {dateLabel(e.expiresAt)}, it can go back to <Who a={e.from} me={me} you="you" />.</p>
        )}
      </Pad>
      <Pad className="mt-auto flex flex-col gap-2 pt-4">
        <BillActions e={e} me={me} onDone={reload} />
      </Pad>
    </Screen>
  );
}
