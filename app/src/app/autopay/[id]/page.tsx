"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Loading, Pad, Sheet, Status, Who, WhoAvatar, dateLabel, timeLeft, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { Band, Button, Chip, ErrorText, Row, Screen } from "@/components/ui";
import { KinMandateAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney } from "@/lib/money";
import { same, ZERO } from "@/lib/programs";
import { dueCount, getMandate, isDone, nextDue, unitOf, type Mandate } from "@/lib/mandates";
import { call } from "@/lib/tx";

export default function AutoPayDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { data: m, error, reload } = useLoad(() => getMandate(BigInt(id)), me && id);
  const now = useNow(1000);

  if (!m) return <Screen title="AutoPay" back="/autopay">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  if (m.payer === ZERO || !(same(m.payer, me) || same(m.payee, me))) return <Screen title="AutoPay" back="/autopay"><ErrorText>We couldn&apos;t find this AutoPay.</ErrorText></Screen>;
  const isPayer = same(m.payer, me);
  const other = isPayer ? m.payee : m.payer;
  const ready = dueCount(m, now);
  const done = isDone(m);

  return (
    <Screen title="AutoPay" back="/autopay" wide>
      <div className="flex flex-col items-center gap-3 px-5 pb-4 pt-2 text-center">
        <Chip tone={done ? "muted" : ready ? "good" : "brand"}>{done ? "Finished" : ready ? "Ready to collect" : "On schedule"}</Chip>
        <p className="font-display text-6xl tabular leading-none">{formatMoney(m.amount)}</p>
        <p className="text-sm text-muted">every {unitOf(m.period)} · {m.paid} of {m.periods} paid</p>
        {!done && !ready && <p className="text-sm text-muted">Next one in {timeLeft(nextDue(m) - now)}</p>}
      </div>
      <section>
        <Band>Details</Band>
        <Row icon={<WhoAvatar a={other} size={40} />} title={<Who a={other} me={me} />} sub={isPayer ? "Gets paid by you" : "Pays you automatically"} />
        {!done && <Row title="Next payment" trail={<span className="text-muted">{dateLabel(nextDue(m))}</span>} />}
        {!done && <Row title="Last payment" trail={<span className="text-muted">{dateLabel(m.start + m.periods * m.period)}</span>} />}
        <Row title="Still held for this" trail={<span className="font-display text-2xl tabular">{formatMoney(m.amount * BigInt(m.periods - m.paid))}</span>} />
      </section>
      <Pad className="flex flex-1 flex-col">
        <Actions m={m} ready={ready} isPayer={isPayer} onDone={reload} />
      </Pad>
    </Screen>
  );
}

function Actions({ m, ready, isPayer, onDone }: { m: Mandate; ready: number; isPayer: boolean; onDone: () => void }) {
  const { busy, status, error, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState("");
  const [split, setSplit] = useState({ keep: 0n, back: 0n });

  async function collect() {
    const amt = m.amount * BigInt(ready);
    const ok = await run(async (say) => {
      await call(addr.mandate, KinMandateAbi, "collect", [m.id]);
      say("Moving it to your balance…");
      return true;
    });
    if (ok) {
      setDone(`${formatMoney(amt)} added to your balance ✓`);
      onDone();
    }
  }

  function askStop() {
    const keep = m.amount * BigInt(dueCount(m));
    setSplit({ keep, back: m.amount * BigInt(m.periods - m.paid) - keep });
    setConfirm(true);
  }

  async function stop() {
    const ok = await run(async () => {
      await call(addr.mandate, KinMandateAbi, "cancel", [m.id]);
      return true;
    });
    setConfirm(false);
    if (ok) {
      if (split.keep) void recordPayment(m.payee, split.keep);
      setDone(`Stopped. ${formatMoney(split.back)} is back in your balance ✓`);
      onDone();
    }
  }

  return (
    <div className="mt-auto flex flex-col gap-2 pt-4">
      {done && <p className="rounded-2xl bg-good/10 px-4 py-3 text-center text-sm font-medium text-good">{done}</p>}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {!isPayer && ready > 0 && <Button onClick={collect} busy={busy}>Collect {formatMoney(m.amount * BigInt(ready))}</Button>}
      {isPayer && !isDone(m) && <Button variant="ghost" onClick={askStop} disabled={busy}>Stop AutoPay</Button>}
      <Sheet open={confirm} onClose={() => !busy && setConfirm(false)} label="Stop AutoPay">
        <h2 className="text-xl font-bold">Stop this AutoPay?</h2>
        <p className="text-muted">
          {split.keep ? <>They still get {formatMoney(split.keep)} already due. </> : null}
          You get {formatMoney(split.back)} back, right away.
        </p>
        <Status>{busy && status}</Status>
        <Button onClick={stop} busy={busy}>Stop and get {formatMoney(split.back)} back</Button>
        <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>Keep it going</Button>
      </Sheet>
    </div>
  );
}
