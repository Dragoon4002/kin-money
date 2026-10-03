"use client";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import type { Address } from "viem";
import { Loading, Pad, Status, Who, WhoAvatar, dateLabel, useLoad, useMe } from "@/components/programs/kit";
import { dueLabel, useChore, useChoreMeta, type ChoreMeta } from "@/components/programs/chores";
import { AddressKinko } from "@/components/kinko/PersonKinko";
import { Amount, Band, Button, Chip, ErrorText, IconTile, Row, Screen } from "@/components/ui";
import type { IconName } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { listEscrows, same, type Escrow } from "@/lib/programs";

export default function ChoreDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const valid = /^\d{1,30}$/.test(id ?? "");
  const { data, error, reload } = useLoad(async () => {
    const { escrows, pinged } = await listEscrows(me!, "chore");
    const e = escrows.find((x) => x.id === BigInt(id));
    return { e, done: !!e && (pinged.get(e.id) ?? 0) > 0 };
  }, me && valid ? `${id}:${me}` : undefined);
  const metaOf = useChoreMeta(data?.e ? [data.e.id] : []);

  // Parent sees the "I did it!" tap without a refresh.
  useEffect(() => {
    const i = setInterval(reload, 8000);
    return () => clearInterval(i);
  }, [reload]);

  const missing = <Screen title="Chore" back="/chores"><ErrorText>We couldn&apos;t find this chore.</ErrorText></Screen>;
  if (!valid) return missing;
  if (!data) return <Screen title="Chore" back="/chores">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  if (!data.e) return missing;
  return <Chore e={data.e} done={data.done} meta={metaOf(data.e.id)} me={me} onDone={reload} />;
}

function Chore({ e, done, meta, me, onDone }: { e: Escrow; done: boolean; meta: ChoreMeta; me?: Address; onDone: () => void }) {
  const { busy, status, error, step, act, iDo, said, expired } = useChore(e, me, done, onDone);
  const paid = e.settled && e.approved;
  const other = iDo ? e.from : e.to;

  type Item = { icon: IconName; title: string; sub: string; on: boolean };
  const chip = busy ? "Working on it…" : e.settled ? step.label : expired ? "Time's up" : said ? (iDo ? "Waiting for OK" : "Done — check it") : "To do";
  const items: Item[] = [
    { icon: "post", title: "Posted", sub: `${formatMoney(e.amount)} held safely`, on: true },
    { icon: "check", title: "Done", sub: said || paid ? (iDo ? "You said it's done" : "They said it's done") : "Waiting for “I did it!”", on: said || paid },
    e.settled
      ? paid
        ? { icon: "payout", title: "Paid", sub: iDo ? "It's in your balance" : "Sent from what you set aside", on: true }
        : { icon: "takeBack", title: "Taken back", sub: iDo ? "It went back to them" : "It's back in your balance", on: true }
      : expired
        ? { icon: "schedule", title: "Time's up", sub: same(e.from, me) ? "You can take it back" : "It wasn't OK'd in time", on: true }
        : { icon: "pending", title: "Paid", sub: "Once it gets the OK", on: false },
  ];

  return (
    <Screen title="Chore" back="/chores" wide>
      <Pad className="flex flex-col items-center gap-2 text-center">
        <AddressKinko address={e.to} size={88} mood={paid ? "celebrate" : said ? "happy" : "calm"} />
        <h1 className="font-display text-3xl">{meta.t}</h1>
        <Amount value={formatMoney(e.amount)} size="lg" />
        <Chip tone={paid ? "good" : said && !e.settled ? "warn" : "muted"}>{chip}</Chip>
      </Pad>

      <section>
        <Band>Details</Band>
        <Row icon={<WhoAvatar a={other} />} title={<Who a={other} me={me} />} sub={iDo ? "Posted it" : "Doing it"} />
        {meta.due > 0 && <Row icon={<IconTile name="schedule" />} title="Due" trail={<span className="text-muted">{dueLabel(meta.due)}</span>} />}
        {!e.settled && <Row icon={<IconTile name="safe" />} title="Held safely until" trail={<span className="text-muted">{dateLabel(e.expiresAt)}</span>} />}
      </section>

      <section>
        <Band>Progress</Band>
        {items.map((s, i) => (
          <Row key={i} icon={<span className={s.on ? "" : "opacity-40"}><IconTile name={s.icon} tone={s.on ? "brand" : "neutral"} /></span>} title={s.title} sub={s.sub} />
        ))}
      </section>

      <Pad className="mt-auto flex flex-col gap-2 pt-4">
        <ErrorText>{error}</ErrorText>
        <Status>{busy && status}</Status>
        {step.fn && <Button onClick={act} busy={busy} variant={step.brand ? "primary" : "ghost"}>{step.label}</Button>}
      </Pad>
    </Screen>
  );
}
