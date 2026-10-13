"use client";
// Section E1 demo (gifts): send a gift → wrapping → gift slip (to a Kin name / as a gift link), and open a gift link in
// every state of app/gift/open/page.tsx. Every result is a slip out of the printer; status = a rubber stamp.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import type { Address } from "viem";
import { Kinko } from "@/components/kinko/Kinko";
import { Choice, MoneyInput, dateLabel, timeLeft, useNow } from "@/components/programs/kit";
import { share } from "@/components/core/share";
import { Avatar, Button, Card, ErrorText, Field as FormField, Ico, Screen, Tabs, inputClass } from "@/components/ui";
import { isBound, type GiftLink } from "@/lib/giftLinks";
import { humanError } from "@/lib/errors";
import { formatMoney, toUnits } from "@/lib/money";
import { same } from "@/lib/programs";
import * as F from "./fixtures";
import { money } from "@/components/receipt/motion";
import { After, Big, Cols, Dash, Field, IdBlock, Label, LinkStrip, Ok, Paper, Slip, SlotNote, SlotWait, Stamp, TicketCountdown } from "./Slip";
import type { DemoState } from "./screens";

const noop = () => {};
const GIFT_URL = "https://getkin.space/gift/open#7.k3y&m=Happy%20birthday";
const unlock = Math.floor(Date.now() / 1000) + 3 * 86_400;

/* ── Send a gift ─────────────────────────────────────────────────────────────────────────────────── */

const MODES = [["name", "To a Kin name"], ["link", "As a gift link"]] as const;
type Mode = (typeof MODES)[number][0];

/** Little paper tag that fills in as you type: what will print. */
function Tag({ mode, amount, guard }: { mode: Mode; amount: string; guard?: boolean }) {
  const v = Number(amount) > 0 ? formatMoney(toUnits(amount)) : "—";
  return (
    <Paper className="flex items-center gap-3 px-4 pb-6 pt-4">
      <span className="kt-pill grid size-12 shrink-0 place-items-center rounded-lg"><Ico name="gift" size={24} /></span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <Label>{mode === "name" ? "GIFT FOR @MAYA" : "GIFT LINK"}</Label>
        <span className="text-2xl font-bold tabular-nums">{v}</span>
        <span className="truncate font-mono text-[11px] text-[var(--kt-muted)]">OPENS {dateLabel(unlock).toUpperCase()}{guard ? " · OK BY @MOM" : ""}</span>
      </span>
    </Paper>
  );
}

function GiftForm({ mode: m0 = "name", err = "", guard }: { mode?: Mode; err?: string; guard?: boolean }) {
  const [mode, setMode] = useState<Mode>(m0);
  const [amount, setAmount] = useState("40");
  const [when, setWhen] = useState<"date" | "demo">("date");
  return (
    <Screen title="Send a gift" action={<Link href="/demo" className="grid h-11 place-items-center px-2 text-muted">Cancel</Link>}>
      <Tabs value={mode} options={MODES} onChange={setMode} />
      <Tag mode={mode} amount={amount} guard={mode === "name" && guard} />
      {mode === "name" && (
        <div className="flex items-center gap-3 rounded-[28px] border border-line bg-surface p-3">
          <Avatar name="maya" size={44} />
          <span className="flex-1"><span className="block text-xs text-muted">Who is it for?</span><span className="font-semibold">@maya</span></span>
          <button className="h-11 rounded-full px-4 text-sm font-semibold text-brand active:bg-brand-soft">Change</button>
        </div>
      )}
      <MoneyInput label="Amount" value={amount} onChange={setAmount} />
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-muted">When can they open it?</span>
        <Choice options={[{ value: "date", label: "Pick a date" }, { value: "demo", label: "In 2 min (demo)" }]} value={when} onChange={setWhen} />
      </div>
      {when === "date" && (
        <FormField label="Opens on">
          <input type="date" className={inputClass} defaultValue={new Date(unlock * 1000).toISOString().slice(0, 10)} />
        </FormField>
      )}
      {mode === "name" ? (
        <div className="flex items-center gap-3 rounded-[28px] border border-dashed border-line p-3">
          {guard ? <Avatar name="mom" size={40} /> : <Ico name="verified" size={22} className="ml-2 text-muted" />}
          <span className="flex-1 text-sm">{guard ? <><b>@mom</b> OKs it first</> : <span className="text-muted">Someone to OK it first? (optional)</span>}</span>
        </div>
      ) : (
        <FormField label="Message (optional)" hint="For someone not on Kin yet. They accept it now, it opens on the day.">
          <input className={inputClass} defaultValue={F.GIFT_MESSAGE} maxLength={120} />
        </FormField>
      )}
      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-4">
        <Button disabled={!(Number(amount) > 0)}>{Number(amount) > 0 ? `Wrap ${formatMoney(toUnits(amount))}` : "Wrap gift"}</Button>
      </div>
    </Screen>
  );
}

function Wrapping({ slow }: { slow?: boolean }) {
  return (
    <Screen title="Send a gift">
      <SlotWait title={formatMoney(40_000_000n)} text={slow ? "Almost there…" : "Wrapping your gift…"}>
        <span className="text-xs">One Identity check, then it&apos;s held safely until the day.</span>
      </SlotWait>
    </Screen>
  );
}

/** Done: the gift slip. `link` = sent as a gift link (share it); else wrapped for @maya. */
function GiftSlip({ link, guard, copied }: { link?: boolean; guard?: boolean; copied?: boolean }) {
  const router = useRouter();
  const now = useNow();
  const [didCopy, setCopied] = useState(copied);
  const text = `I wrapped a gift for you on Kin 🎁 "${F.GIFT_MESSAGE}" It opens on ${dateLabel(unlock)}. Tap to accept it:`;
  const leave = () => router.push("/demo");
  return (
    <Screen title={link ? "Gift link ready" : "Gift wrapped"}>
      <Slip label="Gift slip" onTear={leave}>
        <span className="relative">
          <Kinko size={56} mood="celebrate" />
          <span className="absolute -bottom-1 -right-3 grid size-8 place-items-center rounded-full border-2 border-[var(--kt-paper)] bg-[var(--kt-good)] text-white"><Ico name="gift" size={16} /></span>
        </span>
        <h2 className="font-mono text-base font-bold tracking-[0.25em]">{link ? "GIFT LINK" : "GIFT WRAPPED"}</h2>
        <Dash />
        <Big value={40_000_000} format={money} label="GIFT" />
        <Ok>Held safely</Ok>
        {link && <p className="max-w-72 font-mono text-sm">&ldquo;{F.GIFT_MESSAGE}&rdquo;</p>}
        <Dash />
        <Cols>
          <Field k={link ? "FOR" : "TO"} v={link ? "First to accept" : "@maya"} />
          <Field k="OPENS" v={dateLabel(unlock)} sub="9:00 AM" />
        </Cols>
        {guard && <Field k="OK FIRST BY" v="@mom" sub="Opens once they OK it" />}
        <Dash />
        <Label>OPENS IN</Label>
        <TicketCountdown seconds={unlock - now} />
        <Dash />
        {link ? (
          <div className="flex w-full flex-col gap-2">
            <LinkStrip url={GIFT_URL} />
            <p className="font-mono text-[11px] leading-snug text-[var(--kt-muted)]">The first person to accept it keeps it. Send it only to them. Not accepted in 30 days? Take it back.</p>
          </div>
        ) : (
          <IdBlock hash={F.fakeHash(0x6a)} label="GIFT ID" details="/demo/receipt-sent" />
        )}
      </Slip>
      <After>
        {link ? (
          <>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${GIFT_URL}`)}`} target="_blank" rel="noreferrer"
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-good font-semibold text-fun-ink active:scale-[0.98]">
              <Ico name="share" /> Send on WhatsApp
            </a>
            <Button variant="soft" onClick={async () => (await share(text, GIFT_URL)) === "copied" && setCopied(true)}>{didCopy ? "Link copied ✓" : "Share another way"}</Button>
            <Button variant="ghost" onClick={leave}>Done</Button>
          </>
        ) : (
          <Button onClick={leave}>Done</Button>
        )}
      </After>
    </Screen>
  );
}

/* ── Open a gift link (app/gift/open) ────────────────────────────────────────────────────────────── */

type Phase = "view" | "signup" | "binding" | "opening" | "opened";
type OpenProps = {
  hash?: string | null; link?: { message: string } | null; info?: (GiftLink & { sender: string }) | null; err?: string;
  phase?: Phase; justBound?: boolean; me?: Address; profile?: { name?: string } | null;
};

function OpenGift({ hash = "#demo", link = { message: F.GIFT_MESSAGE }, info = F.GIFT.unbound, err = "", phase = "view", justBound = false, me = F.ME, profile = { name: "sam" } }: OpenProps) {
  const now = useNow();
  const router = useRouter();
  if (hash === null) return <Screen title="Kin">{null}</Screen>;
  if (!link)
    return (
      <Screen title="Kin">
        <SlotNote title="LINK INCOMPLETE">This gift link looks incomplete. Ask the sender to share it again.</SlotNote>
        <Link href="/" className="mt-auto grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      </Screen>
    );
  if (phase === "signup")
    return <Screen title="Your gift is waiting"><Card className="text-sm text-muted">Demo: the real sign-up screen goes here (not rendered, it creates a real account).</Card></Screen>;
  if (!info)
    return (
      <Screen title="Kin">
        {err ? <SlotNote bad title="COULDN'T OPEN THE GIFT">{err}</SlotNote> : <SlotWait text="Unwrapping your gift…" />}
      </Screen>
    );

  const from = info.sender ? `@${info.sender}` : "Someone";
  const mine = isBound(info) && same(info.recipient, me);
  const locked = now < info.unlockAt;
  const fromMe = same(info.from, me);
  const canAccept = !info.settled && !isBound(info) && !!me && !fromMe;

  if (phase === "opened")
    return (
      <Screen title="Gift">
        <Slip label="Gift opened" onTear={() => router.push("/demo")}>
          <span className="relative">
            <Kinko size={64} mood="celebrate" />
            <span className="absolute -bottom-1 -right-3 grid size-8 place-items-center rounded-full border-2 border-[var(--kt-paper)] bg-[var(--kt-good)] text-white"><Ico name="check" size={16} /></span>
          </span>
          <h2 className="font-mono text-base font-bold tracking-[0.25em]">GIFT OPENED</h2>
          <Dash />
          <Big value={Number(info.amount)} format={money} label="AMOUNT RECEIVED" />
          <Ok>In your balance</Ok>
          <p className="max-w-72 font-mono text-sm">&ldquo;{link.message}&rdquo;</p>
          <Dash />
          <Cols><Field k="FROM" v={from} /><Field k="OPENED" v={dateLabel(now)} /></Cols>
          <Dash />
          <IdBlock hash={F.fakeHash(0x6b)} details="/demo/receipt-received" onShare={() => void share("I just opened a gift on Kin 🎁")} />
        </Slip>
        <After><Link href="/home" className="grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">See my balance</Link></After>
      </Screen>
    );

  // What the slip says, and the stamp on it.
  let title: string, note: ReactNode, stamp: ReactNode = null;
  if (mine) {
    title = info.settled ? "OPENED" : justBound ? `NOW YOURS${profile?.name ? `, @${profile.name.toUpperCase()}` : ""}` : `YOUR GIFT FROM ${from.toUpperCase()}`;
    note = info.settled ? "It's in your balance." : locked ? `Held safely until ${dateLabel(info.unlockAt)}. It opens by itself that day.` : "It's ready to open!";
    stamp = info.settled ? <Stamp tone="good">OPENED ✓</Stamp> : locked ? (justBound ? <Stamp tone="good">YOURS</Stamp> : null) : <Stamp tone="good">READY</Stamp>;
  } else {
    title = fromMe ? "YOUR GIFT LINK" : `A GIFT FROM ${from.toUpperCase()}`;
    note = info.settled ? "This gift is no longer available." : isBound(info) ? "This gift was already accepted." : fromMe ? "Share this link with the person it's for." : `Opens on ${dateLabel(info.unlockAt)}. Accept it now so it's yours.`;
    stamp = info.settled ? <Stamp tone="bad">NO LONGER AVAILABLE</Stamp> : isBound(info) ? <Stamp>ALREADY ACCEPTED</Stamp> : null;
  }

  return (
    <Screen title="Kin">
      <Slip label="Gift">
        <span className={mine && !locked && !info.settled ? "animate-bounce" : ""}>
          {mine ? <Kinko size={72} mood="celebrate" /> : <span className="kt-pill grid size-16 place-items-center rounded-2xl"><Ico name="gift" size={32} /></span>}
        </span>
        <h2 className="font-mono text-sm font-bold tracking-[0.2em]">{title}</h2>
        {link.message && <p className="max-w-72 text-lg leading-snug">&ldquo;{link.message}&rdquo;</p>}
        <Dash />
        <Big value={Number(info.amount)} format={money} label="GIFT" />
        {stamp}
        {!info.settled && locked && (mine || canAccept || fromMe) && (
          <>
            <Dash />
            <Label>OPENS IN {timeLeft(info.unlockAt - now).toUpperCase()}</Label>
            <TicketCountdown seconds={info.unlockAt - now} />
          </>
        )}
        <Dash />
        <Cols><Field k="FROM" v={from} /><Field k="OPENS" v={dateLabel(info.unlockAt)} /></Cols>
        <p className="font-mono text-xs leading-snug text-[var(--kt-muted)]">{note}</p>
      </Slip>
      <div className="mt-auto flex flex-col gap-3 pt-2">
        {err && <ErrorText>{err}</ErrorText>}
        {phase === "binding" && <p className="text-center text-sm text-muted" aria-live="polite">Accepting your gift…</p>}
        {phase === "opening" && <p className="text-center text-sm text-muted" aria-live="polite">Opening your gift…</p>}
        {canAccept && <Button busy={phase === "binding"} onClick={noop}>Accept gift</Button>}
        {!info.settled && !isBound(info) && !profile && (
          <>
            <Button onClick={noop}>Create free account to accept</Button>
            <p className="text-center text-xs text-muted">Takes 20 seconds. Just your name and an Identity check.</p>
          </>
        )}
        {mine && !info.settled && !locked && <Button busy={phase === "opening"} onClick={noop}>Open gift</Button>}
        {fromMe && !info.settled && !isBound(info) && <Button variant="soft" onClick={() => void share("A gift for you on Kin 🎁", GIFT_URL)}>Share gift link</Button>}
        {(info.settled || isBound(info) || fromMe) && (
          <Link href={profile ? "/home" : "/"} className="grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
        )}
      </div>
    </Screen>
  );
}

const failErr = humanError(new Error("x"));
const netErr = humanError(new Error("network"));

export const GIFT_STATES: DemoState[] = [
  { label: "Send: to a Kin name", render: () => <GiftForm /> },
  { label: "Send: with someone to OK it", render: () => <GiftForm guard /> },
  { label: "Send: as a gift link", render: () => <GiftForm mode="link" /> },
  { label: "Send: wrapping…", render: () => <Wrapping /> },
  { label: "Send: slow (>2.5 s)", render: () => <Wrapping slow /> },
  { label: "Send: didn't go through", render: () => <GiftForm err={humanError(new Error("insufficient balance"))} /> },
  { label: "Done: gift wrapped slip", render: () => <GiftSlip /> },
  { label: "Done: wrapped, OK by @mom", render: () => <GiftSlip guard /> },
  { label: "Done: gift link slip", render: () => <GiftSlip link /> },
  { label: "Done: link copied", render: () => <GiftSlip link copied /> },
  { label: "Open: before load (blank)", render: () => <OpenGift hash={null} /> },
  { label: "Open: link incomplete", render: () => <OpenGift link={null} /> },
  { label: "Open: loading", render: () => <OpenGift info={null} /> },
  { label: "Open: couldn't load", render: () => <OpenGift info={null} err={netErr} /> },
  { label: "Open: signed out", render: () => <OpenGift me={undefined} profile={null} /> },
  { label: "Open: sign-up", render: () => <OpenGift phase="signup" me={undefined} profile={null} /> },
  { label: "Open: accept", render: () => <OpenGift /> },
  { label: "Open: accepting…", render: () => <OpenGift phase="binding" /> },
  { label: "Open: accept failed", render: () => <OpenGift err={failErr} /> },
  { label: "Open: just accepted, locked", render: () => <OpenGift info={F.GIFT.minelocked} justBound /> },
  { label: "Open: yours, locked (countdown)", render: () => <OpenGift info={F.GIFT.minelocked} /> },
  { label: "Open: ready to open", render: () => <OpenGift info={F.GIFT.mineReady} /> },
  { label: "Open: opening…", render: () => <OpenGift info={F.GIFT.mineReady} phase="opening" /> },
  { label: "Open: opened (slip prints)", render: () => <OpenGift info={F.GIFT.mineOpened} phase="opened" /> },
  { label: "Open: opened ✓ (later)", render: () => <OpenGift info={F.GIFT.mineOpened} /> },
  { label: "Open: someone else accepted", render: () => <OpenGift info={F.GIFT.otherBound} /> },
  { label: "Open: no longer available", render: () => <OpenGift info={F.GIFT.gone} /> },
  { label: "Open: sender's own link", render: () => <OpenGift info={F.GIFT.fromMe} /> },
];
