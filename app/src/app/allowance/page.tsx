"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Choice, Empty, Loading, MoneyInput, Pad, Status, WhoAvatar, Who, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Amount, Band, Button, Card, Chip, ErrorText, Row, Screen } from "@/components/ui";
import { KinStreamAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { createdId, listStreams, same } from "@/lib/programs";
import { call } from "@/lib/tx";

const DAY = 86_400;
const LENGTHS = [
  { value: 7 * DAY, label: "1 week" },
  { value: 30 * DAY, label: "1 month" },
  { value: 90 * DAY, label: "3 months" },
];

export default function AllowancePage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error } = useLoad(() => listStreams(me!), me);
  const now = useNow(30_000);

  if (creating) return <NewAllowance onCancel={() => setCreating(false)} />;
  const giving = data?.filter((s) => same(s.payer, me)) ?? [];
  const getting = data?.filter((s) => same(s.payee, me)) ?? [];

  return (
    <Screen title="Live allowance" back="/money" wide>
      <Pad>
        <p className="text-muted">Money that grows in their balance every second. Stop it any time.</p>
        <ErrorText>{error}</ErrorText>
        {!data && !error && <Loading />}
        {data && !data.length && <Empty icon="allowance" title="No allowances yet" sub="Start one for your kid studying abroad. They watch it grow, live." />}
      </Pad>
      {([["You give", giving], ["You get", getting]] as const).map(([label, list]) =>
        list.length > 0 && (
          <section key={label}>
            <Band>{label}</Band>
            {list.map((s) => {
              const other = same(s.payer, me) ? s.payee : s.payer;
              const live = now < s.end;
              return (
                <Row
                  key={String(s.id)}
                  href={`/allowance/${s.id}`}
                  icon={<WhoAvatar a={other} size={44} />}
                  title={<Who a={other} me={me} />}
                  sub={<Chip tone={live ? "good" : "muted"}>{live ? "● Growing now" : "Finished"}</Chip>}
                  trail={<span className="font-display text-2xl tabular">{formatMoney(s.amount)}</span>}
                />
              );
            })}
          </section>
        ),
      )}
      <Pad className="mt-auto pt-4">
        <Button onClick={() => setCreating(true)}>Start an allowance</Button>
      </Pad>
    </Screen>
  );
}

function NewAllowance({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const [kid, setKid] = useState<Person | null>(null);
  const [monthly, setMonthly] = useState("");
  const [length, setLength] = useState(30 * DAY);
  const { busy, status, error, run } = useAction();

  const perMonth = Number(monthly) > 0 ? fromLocal(monthly) : 0n;
  const total = (perMonth * BigInt(length)) / BigInt(30 * DAY);
  const perDay = total / BigInt(length / DAY);

  async function start() {
    if (!kid || !total) return;
    await run(async (say) => {
      const hash = await call(addr.stream, KinStreamAbi, "create", [kid.address, length], { fund: total });
      say("Starting their allowance…");
      const id = await createdId(hash, KinStreamAbi, "StreamCreated");
      void recordPayment(kid.address, total);
      router.push(`/allowance/${id}`);
    });
  }

  return (
    <Screen title="New allowance" action={<button onClick={onCancel} className="h-11 px-2 text-muted">Cancel</button>}>
      <PersonPicker label="Who is it for?" onPick={setKid} />
      <MoneyInput label="How much each month?" value={monthly} onChange={setMonthly} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">For how long?</span>
        <Choice options={LENGTHS} value={length} onChange={setLength} />
      </div>
      {total > 0n && (
        <Card className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Set aside today</p>
          <Amount value={formatMoney(total)} size="lg" />
          <p className="text-sm text-muted">
            About {formatMoney(perDay)} a day lands in {kid ? `@${kid.name}'s` : "their"} balance, a little every second.
            Stop any time and get the rest back.
          </p>
        </Card>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        <Button onClick={start} busy={busy} disabled={!kid || !total}>Start allowance</Button>
      </div>
    </Screen>
  );
}
