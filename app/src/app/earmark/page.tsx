"use client";
import { useState } from "react";
import type { Address } from "viem";
import { BILL_FOR, BillState, loadBillFor, saveBillFor, type BillFor } from "@/components/earmark/bill";
import { Choice, Empty, Loading, MoneyInput, Pad, Status, Who, WhoAvatar, useAction, useLoad, useMe } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Band, Button, Delivered, ErrorText, Row, Screen } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { createdId, expiryAfter, HOLD_DAYS, listEscrows, nowSec, same, ZERO, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";

// "Pay a bill": money that can only go to one payee (school, landlord, hospital),
// optionally held until a family member OKs it.

export default function EarmarkPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "bill").then((r) => r.escrows), me);
  const ids = data?.map((e) => e.id).reverse() ?? [];
  const { data: what } = useLoad(() => loadBillFor(ids), ids.join(",") || undefined);

  if (creating) return <NewBill me={me} onClose={() => { setCreating(false); reload(); }} />;
  const open = data?.filter((e) => !e.settled) ?? [];
  const past = data?.filter((e) => e.settled) ?? [];

  return (
    <Screen title="Pay a bill" back="/explore" wide>
      <Pad className="flex flex-col gap-3">
        <p className="text-muted">Money that can only go to the school, landlord or hospital you choose.</p>
        <ErrorText>{error}</ErrorText>
        {!data && !error && <Loading />}
        {data && !data.length && <Empty icon="bill" title="No bills yet" sub="Send money that can only pay the fees — and let family OK it first." />}
      </Pad>
      {open.map((e) => <BillRow key={String(e.id)} e={e} me={me} what={what?.[String(e.id)]} />)}
      {past.length > 0 && <Band>Done</Band>}
      {past.map((e) => <BillRow key={String(e.id)} e={e} me={me} what={what?.[String(e.id)]} />)}
      <Pad className="mt-auto pt-4">
        <Button onClick={() => setCreating(true)}>Pay a bill</Button>
      </Pad>
    </Screen>
  );
}

function BillRow({ e, me, what }: { e: Escrow; me?: Address; what?: BillFor }) {
  return (
    <Row
      href={`/earmark/${e.id}`}
      icon={<WhoAvatar a={e.to} size={44} />}
      title={<>{what ? `${BILL_FOR[what].label} · ` : ""}{same(e.from, me) ? <>To <Who a={e.to} me={me} you="you" /></> : <>From <Who a={e.from} me={me} /></>}</>}
      sub={<BillState e={e} me={me} />}
      trail={<span className="font-display text-2xl tabular">{formatMoney(e.amount)}</span>}
    />
  );
}

const FOR_OPTIONS = (Object.keys(BILL_FOR) as BillFor[]).map((k) => ({ value: k, label: BILL_FOR[k].short }));

function NewBill({ me, onClose }: { me?: Address; onClose: () => void }) {
  const [payee, setPayee] = useState<Person | null>(null);
  const [checker, setChecker] = useState<Person | null>(null);
  const [amount, setAmount] = useState("");
  const [what, setWhat] = useState<BillFor | "">("");
  const [done, setDone] = useState(false);
  const { busy, status, error, run } = useAction();
  const value = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const selfCheck = same(checker?.address, me);

  async function send() {
    if (!payee || !value || selfCheck) return;
    const ok = await run(async (say) => {
      const hash = await call(addr.escrow, KinEscrowAbi, "create", [payee.address, ZERO, checker?.address ?? ZERO, 0, expiryAfter(nowSec()), 0], { fund: value });
      say("Holding it safely…");
      if (what) void saveBillFor(await createdId(hash, KinEscrowAbi, "Created"), what);
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
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">What&apos;s it for?</span>
        <Choice<BillFor | ""> options={FOR_OPTIONS} value={what} onChange={setWhat} />
      </div>
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
