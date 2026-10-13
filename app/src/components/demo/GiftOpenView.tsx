"use client";
// Proposed extraction of app/src/app/gift/open/page.tsx — not wired into the real screen yet.
// Pure view: the page would keep the URL hash, readGiftLink/bindGift/openGift, auto-accept and contacts, and pass
// its state + callbacks in. `signup` = the page's <Onboard onDone={accept} />. Markup/classes copied 1:1.
import Link from "next/link";
import type { ReactNode } from "react";
import type { Address } from "viem";
import { Celebrate } from "@/components/kinko/Celebrate";
import { Kinko, type Look } from "@/components/kinko/Kinko";
import { dateLabel, timeLeft } from "@/components/programs/kit";
import { Amount, Button, Card, Chip, Countdown, ErrorText, IconTile, Screen } from "@/components/ui";
import { isBound, type GiftLink } from "@/lib/giftLinks";
import { formatMoney } from "@/lib/money";
import { same } from "@/lib/programs";

export type GiftPhase = "view" | "signup" | "binding" | "opening" | "opened";

export type GiftOpenViewProps = {
  /** null = before hydration (blank screen). */
  hash: string | null;
  link: { message: string } | null;
  info: (GiftLink & { sender: string }) | null;
  err: string;
  phase: GiftPhase;
  justBound: boolean;
  me?: Address;
  profile?: { name?: string } | null;
  now: number;
  look?: Look;
  signup: ReactNode;
  onAccept: () => void;
  onOpen: () => void;
  onSignup: () => void;
  onClose: () => void;
};

export function GiftOpenView({ hash, link, info, err, phase, justBound, me, profile, now, look, signup, onAccept, onOpen, onSignup, onClose }: GiftOpenViewProps) {
  const canAccept = !!info && !info.settled && !isBound(info) && !!me && !same(info.from, me);

  if (hash === null) return <Screen title="Kin">{null}</Screen>;

  if (!link) {
    return (
      <Screen title="Kin">
        <Card>This gift link looks incomplete. Ask the sender to share it again.</Card>
        <Link href="/" className="mt-auto grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      </Screen>
    );
  }

  const from = info?.sender ? `@${info.sender}` : "Someone";
  const money = info ? formatMoney(info.amount) : "";

  if (phase === "signup") {
    return <Screen title="Your gift is waiting">{signup}</Screen>;
  }

  if (phase === "opened" && info) {
    return (
      <Celebrate open intro="gift" title="Your gift is open!" amount={money} subtitle={`From ${from}. It's in your balance now.`}
        shareText="I just opened a gift on Kin 🎁" onClose={onClose}
        card={{ kind: "gift", amount: info.amount, from: info.sender || undefined, look }} />
    );
  }

  const mine = !!info && isBound(info) && same(info.recipient, me);
  const locked = !!info && now < info.unlockAt;

  let body: ReactNode;
  if (!info) {
    body = err ? <ErrorText>{err}</ErrorText> : <div className="kd-shimmer h-40 w-full rounded-[28px] bg-surface-2" />;
  } else if (mine) {
    body = (
      <>
        <div><div className={locked ? "" : "animate-bounce"}><Kinko size={120} mood="celebrate" /></div></div>
        <h2 className="font-display text-4xl leading-tight">
          {info.settled ? "Opened ✓" : justBound ? `This gift is now yours${profile?.name ? `, @${profile.name}` : ""}` : `Your gift from ${from}`}
        </h2>
        {link.message && <p className="text-lg">&ldquo;{link.message}&rdquo;</p>}
        <Amount value={money} />
        {info.settled ? (
          <p className="text-muted">It&apos;s in your balance.</p>
        ) : locked ? (
          <>
            <Chip tone="brand">Opens in {timeLeft(info.unlockAt - now)}</Chip>
            <Countdown seconds={info.unlockAt - now} />
            <p className="text-sm text-muted">Held safely until {dateLabel(info.unlockAt)}. It opens by itself that day.</p>
          </>
        ) : (
          <p className="text-muted">It&apos;s ready to open!</p>
        )}
      </>
    );
  } else {
    body = (
      <>
        <span className="grid size-28 place-items-center rounded-full bg-brand-soft"><IconTile name="gift" size={72} tone="brand" /></span>
        <p className="text-lg">A gift from {from}</p>
        {link.message && <p className="font-display text-2xl leading-snug">&ldquo;{link.message}&rdquo;</p>}
        <Amount value={money} />
        <p className="text-muted">
          {info.settled ? "This gift is no longer available."
            : isBound(info) ? "This gift was already accepted."
            : same(info.from, me) ? "Share this link with the person it's for."
            : `Opens on ${dateLabel(info.unlockAt)}. Accept it now so it's yours.`}
        </p>
      </>
    );
  }

  return (
    <Screen title="Kin">
      <div className="kd-stagger flex flex-1 flex-col items-center justify-center gap-3 text-center">{body}</div>
      <div className="flex flex-col gap-3">
        {info && <ErrorText>{err}</ErrorText>}
        {phase === "binding" && <p className="text-center text-sm text-muted" aria-live="polite">Accepting your gift…</p>}
        {phase === "opening" && <p className="text-center text-sm text-muted" aria-live="polite">Opening your gift…</p>}
        {canAccept && <Button busy={phase === "binding"} onClick={onAccept}>Accept gift</Button>}
        {info && !info.settled && !isBound(info) && !profile && (
          <>
            <Button onClick={onSignup}>Create free account to accept</Button>
            <p className="text-center text-xs text-muted">Takes 20 seconds. Just your name and an Identity check.</p>
          </>
        )}
        {mine && !info.settled && !locked && <Button busy={phase === "opening"} onClick={onOpen}>Open gift</Button>}
        {info && (info.settled || isBound(info) || same(info.from, me)) && (
          <Link href={profile ? "/home" : "/"} className="grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
        )}
      </div>
    </Screen>
  );
}
