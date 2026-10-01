"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Choice, Empty, Loading, MoneyInput, Pad, Status, Who, WhoAvatar, dateLabel, useAction, useLoad, useMe } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Amount, Band, Button, Card, Chip, ErrorText, Field, Row, Screen, inputClass } from "@/components/ui";
import { KinMandateAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { createdId, same } from "@/lib/programs";
import { DAY, EVERY, dueCount, isDone, listMandates, nextDue, unitOf } from "@/lib/mandates";
import { call } from "@/lib/tx";

const MAX_TIMES = 120;

export default function AutoPayPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error } = useLoad(() => listMandates(me!), me);

  if (creating) return <NewAutoPay onCancel={() => setCreating(false)} />;
  const paying = data?.filter((m) => same(m.payer, me)) ?? [];
  const getting = data?.filter((m) => same(m.payee, me)) ?? [];

  return (
    <Screen title="AutoPay" back="/explore" wide>
      <Pad>
        <p className="text-muted">Paid automatically every month. Set it once, stop any time.</p>
        <ErrorText>{error}</ErrorText>
        {!data && !error && <Loading />}
        {data && !data.length && <Empty icon="schedule" title="No AutoPay yet" sub="Rent, school fees, help for home. Set it once and forget it." />}
      </Pad>
      {([["You pay", paying], ["You get", getting]] as const).map(([label, list]) =>
        list.length > 0 && (
          <section key={label}>
            <Band>{label}</Band>
            {list.map((m) => {
              const other = same(m.payer, me) ? m.payee : m.payer;
              const ready = dueCount(m);
              return (
                <Row
                  key={String(m.id)}
                  href={`/autopay/${m.id}`}
                  icon={<WhoAvatar a={other} size={44} />}
                  title={<Who a={other} me={me} />}
                  sub={
                    isDone(m) ? <Chip>Finished</Chip>
                      : ready > 0 ? <Chip tone="good">Ready to collect</Chip>
                      : <span>Next {dateLabel(nextDue(m))}</span>
                  }
                  trail={<span className="text-right"><span className="block font-display text-2xl tabular">{formatMoney(m.amount)}</span><span className="block text-xs text-muted">every {unitOf(m.period)}</span></span>}
                />
              );
            })}
          </section>
        ),
      )}
      <Pad className="mt-auto pt-4">
        <Button onClick={() => setCreating(true)}>Set up AutoPay</Button>
      </Pad>
    </Screen>
  );
}

function NewAutoPay({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [to, setTo] = useState<Person | null>(null);
  const [amount, setAmount] = useState("");
  const [period, setPeriod] = useState(30 * DAY);
  const [times, setTimes] = useState("6");
  const { busy, status, error, run } = useAction();

  const each = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const n = Math.min(MAX_TIMES, Math.max(0, Math.floor(Number(times) || 0)));
  const total = each * BigInt(n);
  const unit = unitOf(period);

  async function start() {
    if (!to || !total) return;
    await run(async (say) => {
      const hash = await call(addr.mandate, KinMandateAbi, "create", [to.address, each, period, n], { fund: total });
      say("Setting up AutoPay…");
      const id = await createdId(hash, KinMandateAbi, "MandateCreated");
      void recordPayment(to.address, total);
      router.push(`/autopay/${id}`);
    });
  }

  return (
    <Screen title="New AutoPay" action={<button onClick={onCancel} className="h-11 px-2 text-muted">Cancel</button>}>
      <PersonPicker label="Who gets paid?" onPick={setTo} />
      <MoneyInput label="How much each time?" value={amount} onChange={setAmount} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">How often?</span>
        <Choice options={EVERY} value={period} onChange={setPeriod} />
      </div>
      <Field label="How many times?" hint={`Up to ${MAX_TIMES}`}>
        <input className={`${inputClass} tabular`} inputMode="numeric" value={times} onChange={(e) => setTimes(e.target.value.replace(/\D/g, ""))} />
      </Field>
      {total > 0n && (
        <Card className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Set aside today</p>
          <Amount value={formatMoney(total)} size="lg" />
          <p className="text-sm text-muted">
            Pay {to ? `@${to.name}` : "them"} {formatMoney(each)} every {unit}, {n} time{n > 1 ? "s" : ""}. The first one is ready in {EVERY.find((e) => e.value === period)?.wait}.
            Stop any time and get the rest back.
          </p>
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        <Button onClick={start} busy={busy} disabled={!to || !total}>Start AutoPay</Button>
      </div>
    </Screen>
  );
}
