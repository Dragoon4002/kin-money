"use client";
// Proposed extraction of app/src/app/claim/page.tsx — not wired into the real screen yet.
// Pure view: the page would keep the URL hash, readLink/collectLink, contacts and timing, and pass its state +
// callbacks in. `signup` = the page's <Onboard onDone={collect} />. Markup/classes copied 1:1.
import Link from "next/link";
import type { ReactNode } from "react";
import { Amount, Avatar, Button, Card, Delivered, ErrorText, Screen } from "@/components/ui";
import type { LinkInfo } from "@/lib/claimLink";
import { formatMoney } from "@/lib/money";

export type ClaimPhase = "view" | "signup" | "collecting" | "done";

export type ClaimViewProps = {
  hash: string | null;
  link: object | null;
  info: (LinkInfo & { sender: string }) | null;
  err: string;
  phase: ClaimPhase;
  secs: string;
  signedIn: boolean;
  signup: ReactNode;
  onCollect: () => void;
  onSignup: () => void;
};

export function ClaimView({ hash, link, info, err, phase, secs, signedIn, signup, onCollect, onSignup }: ClaimViewProps) {
  if (hash === null) return <Screen title="Kin">{null}</Screen>;

  if (!link) {
    return (
      <Screen title="Kin">
        <Card>This link looks incomplete. Ask the sender to share it again.</Card>
        <Link href="/" className="mt-auto grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      </Screen>
    );
  }

  const from = info?.sender ? `@${info.sender}` : "Someone";
  const money = info ? formatMoney(info.amount) : "";

  if (phase === "signup") {
    return <Screen title={`Collect ${money}`}>{signup}</Screen>;
  }

  if (phase === "done") {
    return (
      <Screen>
        <Delivered sound="received" title={`${formatMoney(info?.amount ?? 0n)} is yours`} subtitle={`From ${from} · Delivered in ${secs}s ✓`}>
          <Link href="/home" className="grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">See my balance</Link>
        </Delivered>
      </Screen>
    );
  }

  return (
    <Screen title="Kin">
      <div className="kd-stagger flex flex-1 flex-col items-center justify-center gap-3 text-center">
        {!info ? (
          err ? <ErrorText>{err}</ErrorText> : <div className="kd-shimmer h-40 w-full rounded-[28px] bg-surface-2" />
        ) : (
          <>
            <span className="grid size-24 place-items-center rounded-full bg-brand-soft"><Avatar name={info.sender || "?"} size={72} /></span>
            <p className="text-lg">{from} sent you</p>
            <Amount value={money} />
            <p className="text-muted">
              {info.settled ? "This money has already been collected." : "Held safely until you collect it."}
            </p>
          </>
        )}
      </div>
      {info && !info.settled && (
        <div className="flex flex-col gap-3">
          <ErrorText>{err}</ErrorText>
          {phase === "collecting" ? (
            <p className="text-center text-sm text-muted" aria-live="polite">Moving it to your balance…</p>
          ) : null}
          {signedIn ? (
            <Button busy={phase === "collecting"} onClick={onCollect}>Collect {money}</Button>
          ) : (
            <>
              <Button onClick={onSignup}>Create free account to collect</Button>
              <p className="text-center text-xs text-muted">Takes 20 seconds. Just your name and an Identity check.</p>
            </>
          )}
        </div>
      )}
      {info?.settled && (
        <Link href={signedIn ? "/home" : "/"} className="grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      )}
    </Screen>
  );
}
