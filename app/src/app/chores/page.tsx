"use client";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { Choice, Empty, Loading, MoneyInput, Pad, Status, Who, getMeta, setMeta, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { MyKinko } from "@/components/kinko/PersonKinko";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Amount, Band, Button, Chip, Delivered, ErrorText, Field, IconTile, Row, Screen, inputClass } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { CHORE_MARK, createdId, expiryAfter, listEscrows, nowSec, same, ZERO, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";

// Family chores. Parent holds the reward (to = kid, approver = parent, unlockAt = CHORE_MARK, 30-day exit).
// Kid taps "I did it!" (ping) → parent checks and pays (approve). Titles aren't onchain: they live on
// each phone under kin.chore.<id> and travel to the kid in the share link (/chores?c=<id>&t=<title>&d=<due>).

type Meta = { t: string; due: number };
const metaKey = (id: bigint | string) => `kin.chore.${id}`;
const titleOf = (id: bigint) => getMeta<Meta>(metaKey(id))?.t || "A chore";
const DAY = 86_400;
const IDEAS = ["Dishes", "Made bed", "Homework", "Walk the dog", "Tidy room"];

export default function ChoresPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "chore"), me);

  // Kid opened the parent's link: remember the chore's title on this phone.
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const id = q.get("c"), t = q.get("t");
    if (id && /^\d+$/.test(id) && t) {
      setMeta(metaKey(id), { t: t.slice(0, 40), due: Number(q.get("d")) || 0 });
      history.replaceState(null, "", "/chores");
    }
  }, []);

  // Parent sees "done" taps without a refresh.
  useEffect(() => {
    const i = setInterval(reload, 8000);
    return () => clearInterval(i);
  }, [reload]);

  if (creating) return <NewChore me={me} onClose={() => { setCreating(false); reload(); }} />;

  const all = data?.escrows ?? [];
  // ponytail: "done" = a recent ask in the log window (~15 min); older asks fall back to "To do". Add an indexer if that bites.
  const done = (e: Escrow) => (data?.pinged.get(e.id) ?? 0) > 0;
  const check = all.filter((e) => same(e.from, me) && !e.settled && done(e));
  const todo = all.filter((e) => !e.settled && !(same(e.from, me) && done(e)));
  const paid = all.filter((e) => e.settled && e.approved);
  const earned = paid.filter((e) => same(e.to, me)).reduce((a, e) => a + e.amount, 0n);
  const paidOut = paid.filter((e) => same(e.from, me)).reduce((a, e) => a + e.amount, 0n);
  const kid = all.some((e) => same(e.to, me));

  return (
    <Screen title="Chores" back="/explore" wide>
      <Pad className="flex flex-col items-center gap-2 text-center">
        <MyKinko size={88} mood={check.length ? "happy" : "calm"} />
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">{kid ? "You've earned" : "Paid for chores"}</p>
        {data ? <Amount value={formatMoney(kid ? earned : paidOut)} size="xl" /> : <span className="h-14 w-40 animate-pulse rounded-2xl bg-surface-2" />}
        <ErrorText>{error}</ErrorText>
      </Pad>
      {!data && !error && <Loading />}
      {data && !all.length && <Empty icon="chores" title="No chores yet" sub="Post a chore with a reward. They tap “I did it!”, you check and pay." />}

      {check.length > 0 && (
        <section>
          <Band>Done — check it</Band>
          {check.map((e) => <Chore key={String(e.id)} e={e} me={me} done onDone={reload} />)}
        </section>
      )}
      {todo.length > 0 && (
        <section>
          <Band>To do</Band>
          {todo.map((e) => <Chore key={String(e.id)} e={e} me={me} done={done(e)} onDone={reload} />)}
        </section>
      )}
      {paid.length > 0 && (
        <section>
          <Band>Paid</Band>
          {paid.map((e) => (
            <Row
              key={String(e.id)}
              icon={<IconTile name="check" />}
              title={titleOf(e.id)}
              sub={same(e.to, me) ? <>From <Who a={e.from} me={me} /></> : <Who a={e.to} me={me} />}
              trail={<span className="font-display text-2xl tabular text-good">+{formatMoney(e.amount)}</span>}
            />
          ))}
        </section>
      )}

      <Pad className="mt-auto pt-4">
        <Button onClick={() => setCreating(true)}>Post a chore</Button>
      </Pad>
    </Screen>
  );
}

function Chore({ e, me, done, onDone }: { e: Escrow; me?: Address; done: boolean; onDone: () => void }) {
  const now = useNow(30_000);
  const { busy, status, error, run } = useAction();
  const [asked, setAsked] = useState(false);
  const iDo = same(e.to, me);
  const iCheck = same(e.from, me);
  const due = getMeta<Meta>(metaKey(e.id))?.due;
  const expired = now >= e.expiresAt;

  async function act(fn: "ping" | "approve" | "refund") {
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, fn, [e.id]);
      if (fn === "approve") say("Paying…");
      return true;
    });
    if (!ok) return;
    if (fn === "approve") void recordPayment(e.to, e.amount);
    if (fn === "ping") setAsked(true);
    onDone();
  }

  const pill = "h-11 shrink-0 rounded-full px-4 text-sm font-semibold transition active:scale-95 disabled:opacity-40";
  let trail;
  if (iCheck && expired) trail = <button className={`${pill} bg-surface-2 text-ink`} disabled={busy} onClick={() => act("refund")}>Take it back</button>;
  else if (iCheck && done) trail = <button className={`${pill} bg-brand text-brand-ink`} disabled={busy} onClick={() => act("approve")}>Looks good — pay</button>;
  else if (iDo && (done || asked)) trail = <Chip tone="warn">Waiting for OK</Chip>;
  else if (iDo && !expired) trail = <button className={`${pill} bg-brand text-brand-ink`} disabled={busy} onClick={() => act("ping")}>I did it!</button>;
  else trail = <Chip>Not done yet</Chip>;

  return (
    <div>
      <Row
        icon={<IconTile name="chores" />}
        title={<>{titleOf(e.id)} · <span className="font-display text-xl tabular">{formatMoney(e.amount)}</span></>}
        sub={
          busy ? status
            : iDo ? <>From <Who a={e.from} me={me} />{due ? ` · due ${dueLabel(due)}` : ""}</>
            : <><Who a={e.to} me={me} />{due ? ` · due ${dueLabel(due)}` : ""}</>
        }
        trail={busy ? <span className="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent" /> : trail}
      />
      {error && <Pad><ErrorText>{error}</ErrorText></Pad>}
    </div>
  );
}

const dueLabel = (t: number) => {
  const d = Math.round((new Date(t * 1000).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000);
  return d <= 0 ? "today" : d === 1 ? "tomorrow" : new Date(t * 1000).toLocaleDateString(undefined, { weekday: "long" });
};

const DUE = [
  { value: 0, label: "Today" },
  { value: 1, label: "Tomorrow" },
  { value: 7, label: "This week" },
];

function NewChore({ me, onClose }: { me?: Address; onClose: () => void }) {
  const [kid, setKid] = useState<Person | null>(null);
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [dueIn, setDueIn] = useState(0);
  const [posted, setPosted] = useState<{ id: bigint; due: number } | null>(null);
  const { busy, status, error, run } = useAction();
  const value = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const t = title.trim();
  const selfKid = same(kid?.address, me);

  async function post() {
    if (!kid || !me || !t || !value || selfKid) return;
    const due = nowSec() + dueIn * DAY;
    await run(async (say) => {
      const hash = await call(addr.escrow, KinEscrowAbi, "create", [kid.address, ZERO, me, CHORE_MARK, expiryAfter(nowSec()), 0], { fund: value });
      say("Posting the chore…");
      const id = await createdId(hash, KinEscrowAbi, "Created");
      setMeta(metaKey(id), { t, due });
      setPosted({ id, due });
    });
  }

  async function tell() {
    if (!posted || !kid) return;
    const url = `${location.origin}/chores?${new URLSearchParams({ c: String(posted.id), t, d: String(posted.due) })}`;
    const text = `New chore for you on Kin: ${t} — earn ${formatMoney(value)}`;
    if (navigator.share) await navigator.share({ title: "Kin chore", text, url }).catch(() => {});
    else await navigator.clipboard.writeText(`${text} ${url}`).catch(() => {});
  }

  if (posted) {
    return (
      <Screen>
        <Delivered title="Chore posted" subtitle={`${formatMoney(value)} is held safely. @${kid!.name} gets it when you OK their “${t}”.`}>
          <div className="flex flex-col gap-2">
            <Button onClick={tell}>Tell @{kid!.name}</Button>
            <Button variant="ghost" onClick={onClose}>Done</Button>
          </div>
        </Delivered>
      </Screen>
    );
  }

  return (
    <Screen title="New chore" action={<button onClick={onClose} className="h-11 px-2 text-muted">Cancel</button>}>
      <PersonPicker label="Who's doing it?" onPick={setKid} />
      <Field label="What's the chore?">
        <input className={inputClass} placeholder="Dishes" value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <div className="-mt-2 flex flex-wrap gap-2">
        {IDEAS.map((i) => (
          <button key={i} type="button" onClick={() => setTitle(i)} className="h-11 rounded-full bg-surface-2 px-4 text-sm font-medium text-muted active:scale-95">
            {i}
          </button>
        ))}
      </div>
      <MoneyInput label="Reward" value={amount} onChange={setAmount} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">Due</span>
        <Choice options={DUE} value={dueIn} onChange={setDueIn} />
      </div>
      <ErrorText>{error || (selfKid ? "Pick someone else to do it." : "")}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        <Button onClick={post} busy={busy} disabled={!kid || !t || !value || selfKid}>
          {value ? `Post chore · ${formatMoney(value)}` : "Post chore"}
        </Button>
      </div>
    </Screen>
  );
}
