"use client";
// Section E1 demo (gifts), approved Oct 13: the real components (components/gift/*) with fake data and fake money.
// Send: GiftWrap (the note is the form → folds → box → flies). Arrival: GiftReveal (drop → tap → pop → unfold →
// drag away) for a ready gift, GiftLinkSlip (printed slip + stamp) for every other state of app/gift/open.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Address } from "viem";
import { GiftLinkSlip } from "@/components/gift/GiftLinkSlip";
import { GiftReveal, type RevealStep } from "@/components/gift/GiftReveal";
import { GiftWrap, type WrapPhase } from "@/components/gift/GiftWrap";
import type { GiftMode } from "@/components/gift/GiftNote";
import { Button, Card, Screen } from "@/components/ui";
import type { GiftLink } from "@/lib/giftLinks";
import { humanError } from "@/lib/errors";
import * as F from "./fixtures";
import type { DemoState } from "./screens";

const GIFT_URL = "https://getkin.space/gift/open#7.k3y&m=Happy%20birthday";
// 9:00 AM local, 3 days out: the real form opens gifts at 09:00 on the picked date.
const unlock = (() => { const d = new Date(); d.setDate(d.getDate() + 3); d.setHours(9, 0, 0, 0); return Math.floor(d.getTime() / 1000); })();
// Demo phonebook (real screen: every Kin name, lib/contacts loadNameTrie).
const PEOPLE = ["maya", "mom", "priya", "dev", "leo", "nina", "marco"];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const useLeave = () => { const router = useRouter(); return () => router.push("/demo"); };

/* ── Send ─────────────────────────────────────────────────────────────────────────────────────────── */

function Send({ mode = "name", at, slow, err, copied, fail }: { mode?: GiftMode; at?: WrapPhase; slow?: boolean; err?: string; copied?: boolean; fail?: boolean }) {
  return (
    <GiftWrap from="sam" initial={{ mode, to: "maya", amount: "40", msg: F.GIFT_MESSAGE }} opensOn={unlock} onClose={useLeave()}
      suggest={(p) => PEOPLE.filter((n) => n.includes(p))}
      check={async (d) => (d.mode === "name" && !PEOPLE.includes(d.to) ? "No one on Kin with that name yet." : null)}
      send={async (d) => { await wait(900); if (fail) throw new Error("insufficient balance"); return d.mode === "link" ? GIFT_URL : undefined; }}
      at={at} slow={slow} err={err} copied={copied} link={GIFT_URL} />
  );
}

/* ── Open a gift link that isn't ready (app/gift/open) ─────────────────────────────────────────────── */

type Phase = "view" | "signup" | "binding" | "opening";
type OpenProps = {
  hash?: string | null; link?: { message: string } | null; info?: (GiftLink & { sender: string }) | null; err?: string;
  phase?: Phase; justBound?: boolean; me?: Address; profile?: { name?: string } | null;
};

function OpenGift({ hash = "#demo", link = { message: F.GIFT_MESSAGE }, info: i0 = F.GIFT.unbound, err = "", phase: p0 = "view", justBound: j0 = false, me = F.ME, profile = { name: "sam" } }: OpenProps) {
  const [phase, setPhase] = useState<Phase>(p0);
  const [info, setInfo] = useState(i0);
  const [justBound, setJustBound] = useState(j0);
  // Tapping Accept / Open gift: "…ing" for 1.3 s, then the slip the real page lands on. A static "…ing" state stays put.
  useEffect(() => {
    if (phase === p0 || (phase !== "binding" && phase !== "opening")) return;
    const t = setTimeout(() => {
      setInfo(phase === "binding" ? F.GIFT.minelocked : F.GIFT.mineOpened);
      setJustBound(phase === "binding");
      setPhase("view");
    }, 1300);
    return () => clearTimeout(t);
  }, [phase, p0]);
  if (hash === null) return <Screen title="Kin">{null}</Screen>;
  if (phase === "signup") return <SignUp onDone={() => setPhase("view")} />;
  return <GiftLinkSlip link={link} info={info} err={err} phase={phase} justBound={justBound} me={me} profile={profile}
    onAccept={() => setPhase("binding")} onSignup={() => setPhase("signup")} onOpen={() => setPhase("opening")} />;
}

const SignUp = ({ onDone }: { onDone: () => void }) => (
  <Screen title="Your gift is waiting">
    <Card className="text-sm text-muted">Demo: the real sign-up screen goes here (not rendered, it creates a real account).</Card>
    <div className="mt-auto pt-2"><Button onClick={onDone}>Demo: finish sign-up</Button></div>
  </Screen>
);

/* ── Ready to open: GiftReveal ─────────────────────────────────────────────────────────────────────── */

/** signedIn = has an account; fail = the money step fails once (shows Try again). */
function Reveal({ signedIn = true, step, money, say, fail }: { signedIn?: boolean; step?: RevealStep; money?: "working" | "done" | "error"; say?: string; fail?: boolean }) {
  const [phase, setPhase] = useState<"reveal" | "signup" | "back">("reveal");
  const [failed, setFailed] = useState(false);
  const leave = useLeave();
  if (phase === "signup") return <SignUp onDone={() => setPhase("back")} />;
  return (
    <GiftReveal amount={F.GIFT.unbound.amount} sender="maya" msg={F.GIFT_MESSAGE} signedIn={signedIn || phase === "back"} resume={phase === "back"}
      step={step} money={money} say={say} onLeave={leave} onSignup={() => setPhase("signup")}
      onOpen={async (s) => {
        s("Accepting your gift…"); await wait(1300);
        if (fail && !failed) { setFailed(true); throw new Error("network"); }
        s("Opening your gift…"); await wait(1300);
      }} />
  );
}

export const GIFT_STATES: DemoState[] = [
  { label: "Send: to a Kin name (type on the note)", render: () => <Send /> },
  { label: "Send: as a gift link", render: () => <Send mode="link" /> },
  { label: "Send: didn't go through (tap Send)", render: () => <Send fail /> },
  { label: "Send: error shown", render: () => <Send err={humanError(new Error("insufficient balance"))} /> },
  { label: "Sending: folding", render: () => <Send at="fold" /> },
  { label: "Sending: in the box", render: () => <Send at="box" /> },
  { label: "Sending: lid on (wrapping…)", render: () => <Send at="closed" /> },
  { label: "Sending: slow (>2.5 s)", render: () => <Send at="closed" slow /> },
  { label: "Sending: flying", render: () => <Send at="lift" /> },
  { label: "On its way: @maya", render: () => <Send at="done" /> },
  { label: "On its way: gift link", render: () => <Send mode="link" at="done" /> },
  { label: "On its way: link copied", render: () => <Send mode="link" at="done" copied /> },
  { label: "Open: before load (blank)", render: () => <OpenGift hash={null} /> },
  { label: "Open: link incomplete", render: () => <OpenGift link={null} /> },
  { label: "Open: loading", render: () => <OpenGift info={null} /> },
  { label: "Open: couldn't load", render: () => <OpenGift info={null} err={humanError(new Error("network"))} /> },
  { label: "Open: signed out", render: () => <OpenGift me={undefined} profile={null} /> },
  { label: "Open: sign-up", render: () => <OpenGift phase="signup" me={undefined} profile={null} /> },
  { label: "Open: accept", render: () => <OpenGift /> },
  { label: "Open: accepting…", render: () => <OpenGift phase="binding" /> },
  { label: "Open: accept failed", render: () => <OpenGift err={humanError(new Error("x"))} /> },
  { label: "Open: just accepted, locked", render: () => <OpenGift info={F.GIFT.minelocked} justBound /> },
  { label: "Open: yours, locked (countdown)", render: () => <OpenGift info={F.GIFT.minelocked} /> },
  { label: "Open: ready (signed in, tap the box)", render: () => <Reveal /> },
  { label: "Open: ready (no account)", render: () => <Reveal signedIn={false} /> },
  { label: "Open: ready, fails once (Try again)", render: () => <Reveal fail /> },
  { label: "Opening: 1 landed, tap to open", render: () => <Reveal step="wait" /> },
  { label: "Opening: 2 note out, still folded", render: () => <Reveal step="burst" /> },
  { label: "Opening: 3 the card (no account)", render: () => <Reveal step="card" signedIn={false} /> },
  { label: "Opening: accepting…", render: () => <Reveal step="card" money="working" say="Accepting your gift…" /> },
  { label: "Opening: in your balance (drag it away)", render: () => <Reveal step="card" money="done" /> },
  { label: "Open: opened ✓ (later)", render: () => <OpenGift info={F.GIFT.mineOpened} /> },
  { label: "Open: someone else accepted", render: () => <OpenGift info={F.GIFT.otherBound} /> },
  { label: "Open: no longer available", render: () => <OpenGift info={F.GIFT.gone} /> },
  { label: "Open: sender's own link", render: () => <OpenGift info={F.GIFT.fromMe} /> },
];
