"use client";
import { useState } from "react";
import type { Address } from "viem";
import { Choice, Empty, Loading, MoneyInput, Pad, Status, Who, WhoAvatar, dateLabel, timeLeft, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { Celebrate } from "@/components/kinko/Celebrate";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Band, Button, Card, Chip, Delivered, ErrorText, Field, Ico, IconTile, Screen, inputClass } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { canRelease, expiryAfter, listEscrows, nowSec, same, ZERO, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";

// "$500 when you graduate": money that opens on a date, optionally once a guardian OKs it.

export default function GiftPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const [opened, setOpened] = useState<Escrow | null>(null);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "gift").then((r) => r.escrows), me);

  if (creating) return <NewGift me={me} onClose={() => { setCreating(false); reload(); }} />;
  if (opened) {
    return (
      <Celebrate
        open
        title="Your gift is open!"
        amount={formatMoney(opened.amount)}
        subtitle="It's in your balance now."
        shareText="I just opened a gift on Kin 🎁"
        onClose={() => setOpened(null)}
      />
    );
  }

  const forMe = data?.filter((e) => same(e.to, me)) ?? [];
  const rest = data?.filter((e) => !same(e.to, me)) ?? [];

  return (
    <Screen title="Gifts" back="/explore" wide>
      <Pad className="flex flex-col gap-3">
        <ErrorText>{error}</ErrorText>
        {!data && !error && <Loading />}
        {data && !data.length && <Empty icon="gift" title="No gifts yet" sub="Send money that opens on their birthday, or when they graduate." />}
        {forMe.map((e) => <GiftCard key={String(e.id)} e={e} me={me} onOpened={() => { setOpened(e); reload(); }} onDone={reload} />)}
      </Pad>
      {rest.length > 0 && <Band>Sent or looked after by you</Band>}
      {rest.length > 0 && <Pad className="flex flex-col gap-3">{rest.map((e) => <GiftCard key={String(e.id)} e={e} me={me} onOpened={reload} onDone={reload} />)}</Pad>}
      <Pad className="mt-auto pt-4">
        <Button onClick={() => setCreating(true)}>Send a gift</Button>
      </Pad>
    </Screen>
  );
}

function GiftCard({ e, me, onOpened, onDone }: { e: Escrow; me?: Address; onOpened: () => void; onDone: () => void }) {
  const now = useNow();
  const { busy, status, error, run } = useAction();
  const mine = same(e.to, me);
  const locked = now < e.unlockAt;
  const needsOk = e.approver !== ZERO && !e.approved;
  const iGuard = same(e.approver, me) && needsOk && !e.settled;
  const iRefund = same(e.from, me) && !e.settled && !!e.expiresAt && now >= e.expiresAt;

  async function act(fn: "release" | "approve" | "refund") {
    const ok = await run(async () => (await call(addr.escrow, KinEscrowAbi, fn, [e.id]), true));
    if (!ok) return;
    if (fn === "approve" && !locked) void recordPayment(e.to, e.amount);
    if (fn === "release" && mine) onOpened();
    else onDone();
  }

  return (
    <Card className={`relative flex flex-col gap-3 overflow-hidden ${mine && !e.settled ? "border-brand/40 bg-brand-soft" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={mine && canRelease(e, now) ? "animate-bounce" : ""}><IconTile name={e.settled ? "celebrate" : locked ? "lock" : "gift"} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {mine ? <>From <Who a={e.from} me={me} /></> : <>For <Who a={e.to} me={me} /></>}
          </p>
          <p className="truncate text-sm text-muted">
            {e.settled ? "Opened ✓✓" : locked ? `Opens ${dateLabel(e.unlockAt)}` : needsOk ? <>Waiting for <Who a={e.approver} me={me} you="your" />{same(e.approver, me) ? "" : "'s"} OK</> : "Ready to open"}
          </p>
        </div>
        <p className="font-display text-2xl tabular">{mine && locked && !e.settled ? <span aria-label="Hidden until it opens"><Ico name="lock" size={24} /></span> : formatMoney(e.amount)}</p>
      </div>
      {!e.settled && locked && (
        <p className="text-center"><Chip>Opens in {timeLeft(e.unlockAt - now)}</Chip></p>
      )}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {mine && canRelease(e, now) && <Button onClick={() => act("release")} busy={busy}>Open gift</Button>}
      {iGuard && (
        <Button variant={locked ? "soft" : "primary"} onClick={() => act("approve")} busy={busy}>
          {locked ? "OK it for the big day" : "OK it — send now"}
        </Button>
      )}
      {iRefund && <Button variant="soft" onClick={() => act("refund")} busy={busy}>Take it back</Button>}
    </Card>
  );
}

const WHEN = [
  { value: "date", label: "Pick a date" },
  { value: "demo", label: "In 2 min (demo)" },
] as const;

function NewGift({ me, onClose }: { me?: Address; onClose: () => void }) {
  const [to, setTo] = useState<Person | null>(null);
  const [guard, setGuard] = useState<Person | null>(null);
  const [amount, setAmount] = useState("");
  const [when, setWhen] = useState<(typeof WHEN)[number]["value"]>("date");
  const [date, setDate] = useState("");
  const [done, setDone] = useState(0);
  const { busy, status, error, run } = useAction();
  const value = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const selfGuard = same(guard?.address, me);
  const tomorrow = new Date((useNow(60_000) + 86_400) * 1000).toISOString().slice(0, 10);

  async function send() {
    const unlockAt = when === "demo" ? nowSec() + 120 : Math.floor(new Date(`${date}T09:00`).getTime() / 1000);
    if (!to || !value || !unlockAt || selfGuard) return;
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, "create", [to.address, ZERO, guard?.address ?? ZERO, unlockAt, guard ? expiryAfter(unlockAt) : 0, 0], { fund: value });
      say("Wrapping your gift…");
      return true;
    });
    if (ok) {
      void recordPayment(to.address, value);
      setDone(unlockAt);
    }
  }

  if (done) {
    return (
      <Screen>
        <Delivered title="Gift wrapped" subtitle={`@${to!.name} can open it on ${dateLabel(done)}${guard ? ` once @${guard.name} OKs it` : ""}. Until then it's held safely.`}>
          <Button onClick={onClose}>Done</Button>
        </Delivered>
      </Screen>
    );
  }

  return (
    <Screen title="Send a gift" action={<button onClick={onClose} className="h-11 px-2 text-muted">Cancel</button>}>
      <div className="flex items-center justify-center py-2">{to ? <WhoAvatar a={to.address} size={64} /> : <IconTile name="gift" size={64} tone="brand" />}</div>
      <PersonPicker label="Who is it for?" onPick={setTo} />
      <MoneyInput label="Amount" value={amount} onChange={setAmount} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">When can they open it?</span>
        <Choice options={[...WHEN]} value={when} onChange={setWhen} />
      </div>
      {when === "date" && (
        <Field label="Opens on">
          <input type="date" className={inputClass} min={tomorrow} value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
      <PersonPicker label="Someone to OK it first? (optional)" onPick={setGuard} />
      <p className="-mt-2 text-xs text-muted">
        {selfGuard ? "Pick someone else — or leave it empty." : "E.g. a parent who confirms they graduated."}
      </p>
      <ErrorText>{error}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        <Button onClick={send} busy={busy} disabled={!to || !value || selfGuard || (when === "date" && !date)}>
          {value ? `Wrap ${formatMoney(value)}` : "Wrap gift"}
        </Button>
      </div>
    </Screen>
  );
}
