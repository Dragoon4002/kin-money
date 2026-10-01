"use client";
import { useState } from "react";
import type { Address } from "viem";
import { Choice, Empty, Loading, MoneyInput, Pad, Status, Who, WhoAvatar, dateLabel, timeLeft, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { Celebrate } from "@/components/kinko/Celebrate";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { share } from "@/components/core/share";
import { Band, Button, Card, Chip, Delivered, ErrorText, Field, Ico, IconTile, Screen, Tabs, inputClass } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { createGiftLink, isBound, listGiftLinks, openGift, refundGift, type GiftLink } from "@/lib/giftLinks";
import { formatMoney, fromLocal } from "@/lib/money";
import { canRelease, expiryAfter, listEscrows, nowSec, same, ZERO, type Escrow } from "@/lib/programs";
import { call } from "@/lib/tx";

// "$500 when you graduate": money that opens on a date, optionally once a guardian OKs it.

export default function GiftPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const [opened, setOpened] = useState<{ amount: bigint } | null>(null);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "gift").then((r) => r.escrows), me);
  const links = useLoad(() => listGiftLinks(me!), me);

  if (creating) return <NewGift me={me} onClose={() => { setCreating(false); reloadAll(); }} />;
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
  const linksForMe = links.data?.filter((g) => same(g.recipient, me)) ?? [];
  const linksSent = links.data?.filter((g) => !same(g.recipient, me)) ?? [];
  const reloadAll = () => (reload(), links.reload());
  const none = !!data && !!links.data && !data.length && !links.data.length;
  const sent = rest.length + linksSent.length > 0;

  return (
    <Screen title="Gifts" back="/explore" wide>
      <Pad className="flex flex-col gap-3">
        <ErrorText>{error ?? links.error}</ErrorText>
        {(!data || !links.data) && !error && !links.error && <Loading />}
        {none && <Empty icon="gift" title="No gifts yet" sub="Send money that opens on their birthday, or when they graduate." />}
        {linksForMe.map((g) => <GiftLinkCard key={`l${g.id}`} g={g} me={me} onOpened={() => { setOpened(g); links.reload(); }} onDone={links.reload} />)}
        {forMe.map((e) => <GiftCard key={String(e.id)} e={e} me={me} onOpened={() => { setOpened(e); reload(); }} onDone={reload} />)}
      </Pad>
      {sent && <Band>Sent or looked after by you</Band>}
      {sent && (
        <Pad className="flex flex-col gap-3">
          {linksSent.map((g) => <GiftLinkCard key={`l${g.id}`} g={g} me={me} onOpened={links.reload} onDone={links.reload} />)}
          {rest.map((e) => <GiftCard key={String(e.id)} e={e} me={me} onOpened={reload} onDone={reload} />)}
        </Pad>
      )}
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

/** A dated gift sent as a link: I'm the sender, or it was accepted by me. */
function GiftLinkCard({ g, me, onOpened, onDone }: { g: GiftLink; me?: Address; onOpened: () => void; onDone: () => void }) {
  const now = useNow();
  const { busy, status, error, run } = useAction();
  const mine = same(g.recipient, me);
  const locked = now < g.unlockAt;
  const canOpen = mine && !g.settled && !locked;
  const canTakeBack = same(g.from, me) && !g.settled && now >= g.expiresAt;

  async function act(fn: typeof openGift) {
    if (await run(async () => (await fn(g.id), true))) (fn === openGift && mine ? onOpened : onDone)();
  }

  const sub = mine
    ? g.settled ? "Opened ✓✓" : locked ? `Opens ${dateLabel(g.unlockAt)}` : "Ready to open"
    : g.settled ? (isBound(g) ? "Opened ✓✓" : "Back in your balance")
    : isBound(g) ? <>Accepted by <Who a={g.recipient} me={me} /> · opens {dateLabel(g.unlockAt)}</> : "Waiting to be accepted";

  return (
    <Card className={`flex flex-col gap-3 ${mine && !g.settled ? "border-brand/40 bg-brand-soft" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={canOpen ? "animate-bounce" : ""}><IconTile name={g.settled ? "celebrate" : locked ? "lock" : "gift"} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{mine ? <>From <Who a={g.from} me={me} /></> : isBound(g) ? <>For <Who a={g.recipient} me={me} /></> : "Gift link"}</p>
          <p className="truncate text-sm text-muted">{sub}</p>
        </div>
        <p className="font-display text-2xl tabular">{mine && locked && !g.settled ? <span aria-label="Hidden until it opens"><Ico name="lock" size={24} /></span> : formatMoney(g.amount)}</p>
      </div>
      {mine && !g.settled && locked && <p className="text-center"><Chip>Opens in {timeLeft(g.unlockAt - now)}</Chip></p>}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {canOpen && <Button onClick={() => act(openGift)} busy={busy}>Open gift</Button>}
      {canTakeBack && <Button variant="soft" onClick={() => act(refundGift)} busy={busy}>Take back</Button>}
    </Card>
  );
}

const MODES = [["name", "To a Kin name"], ["link", "As a gift link"]] as const;

const WHEN = [
  { value: "date", label: "Pick a date" },
  { value: "demo", label: "In 2 min (demo)" },
] as const;

function NewGift({ me, onClose }: { me?: Address; onClose: () => void }) {
  const [mode, setMode] = useState<(typeof MODES)[number][0]>("name");
  const [message, setMessage] = useState("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
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
    if (mode === "link") {
      if (!value || !unlockAt) return;
      const url = await run(async (say) => {
        const r = await createGiftLink(value, unlockAt, message);
        say("Wrapping your gift…");
        return r.url;
      });
      if (!url) return;
      setLink(url);
      setDone(unlockAt);
      return;
    }
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

  if (done && link) {
    const text = `I wrapped a gift for you on Kin 🎁${message.trim() ? ` "${message.trim()}"` : ""} It opens on ${dateLabel(done)}. Tap to accept it:`;
    return (
      <Screen>
        <Delivered title="Gift link ready" subtitle={`${formatMoney(value)} opens on ${dateLabel(done)}. The first person to accept it keeps it — send it only to them.`}>
          <div className="flex flex-col gap-2">
            <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`} target="_blank" rel="noreferrer"
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-good font-semibold text-fun-ink active:scale-[0.98]">
              <Ico name="share" /> Send on WhatsApp
            </a>
            <Button variant="soft" onClick={async () => (await share(text, link)) === "copied" && setCopied(true)}>
              {copied ? "Link copied ✓" : "Share another way"}
            </Button>
            <Button variant="soft" onClick={onClose}>Done</Button>
          </div>
        </Delivered>
      </Screen>
    );
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
      <Tabs value={mode} options={MODES} onChange={setMode} />
      <div className="flex items-center justify-center py-2">{to && mode === "name" ? <WhoAvatar a={to.address} size={64} /> : <IconTile name="gift" size={64} tone="brand" />}</div>
      {mode === "name" && <PersonPicker label="Who is it for?" onPick={setTo} />}
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
      {mode === "name" ? (
        <>
          <PersonPicker label="Someone to OK it first? (optional)" onPick={setGuard} />
          <p className="-mt-2 text-xs text-muted">
            {selfGuard ? "Pick someone else — or leave it empty." : "E.g. a parent who confirms they graduated."}
          </p>
        </>
      ) : (
        <Field label="Message (optional)" hint="For someone not on Kin yet. They accept it now, it opens on the day.">
          <input className={inputClass} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={120} placeholder="Happy birthday!" />
        </Field>
      )}
      <ErrorText>{error}</ErrorText>
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <Status>{busy && status}</Status>
        <Button onClick={send} busy={busy} disabled={!value || (mode === "name" && (!to || selfGuard)) || (when === "date" && !date)}>
          {value ? `Wrap ${formatMoney(value)}` : "Wrap gift"}
        </Button>
      </div>
    </Screen>
  );
}
