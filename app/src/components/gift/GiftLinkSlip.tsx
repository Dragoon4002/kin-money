"use client";
// A gift link that isn't ready to open yet (or is someone else's, or gone): printed on a slip, status = a stamp.
// Ready gifts get GiftReveal instead. Used by app/gift/open and /demo/e-gift.
import Link from "next/link";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { Kinko } from "@/components/kinko/Kinko";
import { dateLabel, timeLeft, useNow } from "@/components/programs/kit";
import { share } from "@/components/core/share";
import { Big, Cols, Dash, Field, Label, Slip, SlotNote, SlotWait, Stamp, TicketCountdown } from "@/components/receipt/Slip";
import { money } from "@/components/receipt/motion";
import { Button, ErrorText, Ico, Screen } from "@/components/ui";
import { isBound, type GiftLink } from "@/lib/giftLinks";
import { same } from "@/lib/programs";

type Props = {
  link: { message: string } | null; info: (GiftLink & { sender: string }) | null; err: string;
  phase: "view" | "binding" | "opening"; justBound: boolean; me?: Address; profile?: { name?: string } | null;
  onAccept: () => void; onSignup: () => void; onOpen: () => void;
};

export function GiftLinkSlip({ link, info, err, phase, justBound, me, profile, onAccept, onSignup, onOpen }: Props) {
  const now = useNow();
  if (!link)
    return (
      <Screen title="Kin">
        <SlotNote title="LINK INCOMPLETE">This gift link looks incomplete. Ask the sender to share it again.</SlotNote>
        <Link href="/" className="mt-auto grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      </Screen>
    );
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
        {canAccept && <Button busy={phase === "binding"} onClick={onAccept}>Accept gift</Button>}
        {!info.settled && !isBound(info) && !profile && (
          <>
            <Button onClick={onSignup}>Create free account to accept</Button>
            <p className="text-center text-xs text-muted">Takes 20 seconds. Just your name and an Identity check.</p>
          </>
        )}
        {mine && !info.settled && !locked && <Button busy={phase === "opening"} onClick={onOpen}>Open gift</Button>}
        {fromMe && !info.settled && !isBound(info) && <Button variant="soft" onClick={() => void share("A gift for you on Kin 🎁", location.href)}>Share gift link</Button>}
        {(info.settled || isBound(info) || fromMe) && (
          <Link href={profile ? "/home" : "/"} className="grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
        )}
      </div>
    </Screen>
  );
}
