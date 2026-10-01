"use client";
import { useState } from "react";
import type { Address } from "viem";
import { Empty, Loading, MoneyInput, Pad, Status, Who, WhoAvatar, dateLabel, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Band, Button, Card, Chip, Delivered, ErrorText, Screen } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { canRelease, expiryAfter, HOLD_DAYS, listEscrows, nowSec, same, ZERO, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";

// "Pay a bill": money that can only go to one payee (school, landlord, hospital),
// optionally held until a family member OKs it.

export default function EarmarkPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "bill").then((r) => r.escrows), me);

  if (creating) return <NewBill me={me} onClose={() => { setCreating(false); reload(); }} />;
  const open = data?.filter((e) => !e.settled) ?? [];
  const past = data?.filter((e) => e.settled) ?? [];

  return (
    <Screen title="Pay a bill" back="/explore" wide>
      <Pad className="flex flex-col gap-3">
        <p className="text-muted">Money that can only go to the school, landlord or hospital you choose.</p>
        <ErrorText>{error}</ErrorText>
        {!data && !error && <Loading />}
        {data && !data.length && <Empty icon="🏫" title="No bills yet" sub="Send money that can only pay the fees — and let family OK it first." />}
        {open.map((e) => <Bill key={String(e.id)} e={e} me={me} onDone={reload} />)}
      </Pad>
      {past.length > 0 && <Band>Done</Band>}
      {past.length > 0 && <Pad className="flex flex-col gap-3">{past.map((e) => <Bill key={String(e.id)} e={e} me={me} onDone={reload} />)}</Pad>}
      <Pad className="mt-auto pt-4">
        <Button onClick={() => setCreating(true)}>Pay a bill</Button>
      </Pad>
    </Screen>
  );
}

function Bill({ e, me, onDone }: { e: Escrow; me?: Address; onDone: () => void }) {
  const now = useNow(30_000);
  const { busy, status, error, run } = useAction();
  const iApprove = same(e.approver, me) && !e.approved;
  const iCollect = same(e.to, me) && canRelease(e, now);
  const iRefund = same(e.from, me) && !e.settled && !!e.expiresAt && now >= e.expiresAt;

  async function act(fn: "approve" | "release" | "refund") {
    const ok = await run(async () => (await call(addr.escrow, KinEscrowAbi, fn, [e.id]), true));
    if (ok) {
      if (fn === "approve") void recordPayment(e.to, e.amount);
      onDone();
    }
  }

  const state = e.settled
    ? <Chip tone="good">Paid ✓✓</Chip>
    : e.approver === ZERO || e.approved
      ? <Chip tone="brand">Ready for <Who a={e.to} me={me} you="you" /> to collect</Chip>
      : <Chip tone="warn">Waiting for <Who a={e.approver} me={me} you="your" />{same(e.approver, me) ? "" : "'s"} OK</Chip>;

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <WhoAvatar a={e.to} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">To <Who a={e.to} me={me} you="you" /></p>
          <p className="mt-1 truncate">{state}</p>
        </div>
        <p className="font-display text-2xl tabular">{formatMoney(e.amount)}</p>
      </div>
      {!e.settled && same(e.from, me) && !iRefund && e.expiresAt > 0 && (
        <p className="text-xs text-muted">If it isn&apos;t paid by {dateLabel(e.expiresAt)}, it comes back to you.</p>
      )}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {iApprove && <Button onClick={() => act("approve")} busy={busy}>Bill looks right — pay it</Button>}
      {!iApprove && iCollect && <Button onClick={() => act("release")} busy={busy}>Collect {formatMoney(e.amount)}</Button>}
      {iRefund && <Button variant="soft" onClick={() => act("refund")} busy={busy}>Take it back</Button>}
    </Card>
  );
}

function NewBill({ me, onClose }: { me?: Address; onClose: () => void }) {
  const [payee, setPayee] = useState<Person | null>(null);
  const [checker, setChecker] = useState<Person | null>(null);
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState(false);
  const { busy, status, error, run } = useAction();
  const value = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const selfCheck = same(checker?.address, me);

  async function send() {
    if (!payee || !value || selfCheck) return;
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, "create", [payee.address, ZERO, checker?.address ?? ZERO, 0, expiryAfter(nowSec()), 0], { fund: value });
      say("Holding it safely…");
      return true;
    });
    if (ok) {
      void recordPayment(payee.address, value);
      setDone(true);
    }
  }

  if (done) {
    return (
      <Screen>
        <Delivered
          title={`${formatMoney(value)} set aside`}
          subtitle={checker ? `Held safely until @${checker.name} OKs the bill. Then @${payee!.name} gets paid.` : `Only @${payee!.name} can collect it.`}
        >
          <Button onClick={onClose}>Done</Button>
        </Delivered>
      </Screen>
    );
  }

  return (
    <Screen title="Pay a bill" action={<button onClick={onClose} className="h-11 px-2 text-muted">Cancel</button>}>
      <PersonPicker label="Who gets paid? School, landlord, hospital…" onPick={setPayee} />
      <MoneyInput label="Amount" value={amount} onChange={setAmount} />
      <PersonPicker label="Who checks the bill first? (optional)" onPick={setChecker} />
      <p className="-mt-2 text-xs text-muted">
        {selfCheck
          ? "Pick someone else — or leave it empty."
          : checker
            ? `Money stays held until @${checker.name} OKs it. If it isn't paid in ${HOLD_DAYS} days, it comes back to you.`
            : "Leave empty and they can collect it straight away."}
      </p>
      <ErrorText>{error}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        <Button onClick={send} busy={busy} disabled={!payee || !value || selfCheck}>
          {value ? `Send ${formatMoney(value)}` : "Send"}
        </Button>
      </div>
    </Screen>
  );
}
