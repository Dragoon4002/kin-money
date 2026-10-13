"use client";
// Arrival of a gift that's ready: the box drops in → tap it → it pops (lid, flaps, confetti) and the money moves
// (`onOpen`: accept + open, behind the animation) → the folded note rises and unfolds → once it's in their balance,
// drag the note away in any direction to leave (like tearing off a receipt). No account: the tap only reveals;
// the button makes one ("Create free account to accept the gift"). Used by app/gift/open, app/gift and /demo.
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button, ErrorText, Screen } from "@/components/ui";
import { Stamp } from "@/components/receipt/Slip";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { BITS, Bow, Note, Ribbon, reducedMotion } from "./GiftNote";

export type RevealStep = "drop" | "wait" | "burst" | "unfold" | "card";
type Money = "idle" | "working" | "done" | "error";
/** ms in each step before the next; "wait" holds until the gift is tapped. */
const STEP_MS = { drop: 760, burst: 1150, unfold: 820 } as const;
const NEXT = { drop: "wait", burst: "unfold", unfold: "card" } as const;
const AWAY = 110; // px of drag that sends the note off

type Props = {
  amount: bigint; sender: string; msg: string;
  /** Signed in: tapping the box runs onOpen. No account: tapping only reveals, the button calls onSignup. */
  signedIn: boolean;
  onOpen: (say: (text: string) => void) => Promise<void>;
  onSignup?: () => void;
  onLeave: () => void;
  /** Start straight on the card and run onOpen (back from sign-up). */
  resume?: boolean;
  /** /demo only: hold a pose / a money state. */
  step?: RevealStep; money?: Money; say?: string;
};

export function GiftReveal({ amount, sender, msg, signedIn, onOpen, onSignup, onLeave, resume, step: s0, money: m0, say: say0 = "" }: Props) {
  const [step, setStep] = useState<RevealStep>(s0 ?? (resume ? "card" : "drop"));
  const [money, setMoney] = useState<Money>(m0 ?? "idle");
  const [say, setSay] = useState(say0);
  const [err, setErr] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (!(step in STEP_MS) || step === s0) return; // a held pose stays put
    const t = setTimeout(() => setStep(NEXT[step as keyof typeof NEXT]), STEP_MS[step as keyof typeof STEP_MS]);
    return () => clearTimeout(t);
  }, [step, s0]);

  async function run() {
    setErr("");
    setMoney("working");
    try {
      await onOpen(setSay);
      setMoney("done");
    } catch (e) {
      setErr(humanError(e));
      setMoney("error");
    }
  }
  useEffect(() => {
    if (resume && !started.current) { started.current = true; void Promise.resolve().then(run); }
  });

  function tap() {
    if (step !== "wait") return;
    setStep(reducedMotion() ? "card" : "burst");
    if (signedIn) void run();
  }

  // Drag the note away once the money is in (pointer events: mouse + touch).
  const from = useRef<{ x: number; y: number } | null>(null);
  const [off, setOff] = useState({ x: 0, y: 0, gone: false });
  const [dragging, setDragging] = useState(false);
  const done = money === "done";
  const drag = {
    onPointerDown: (e: PointerEvent) => { if (!done || off.gone) return; e.currentTarget.setPointerCapture(e.pointerId); from.current = { x: e.clientX, y: e.clientY }; setDragging(true); },
    onPointerMove: (e: PointerEvent) => { if (from.current) setOff({ x: e.clientX - from.current.x, y: e.clientY - from.current.y, gone: false }); },
    onPointerUp: () => {
      if (!from.current) return;
      from.current = null;
      setDragging(false);
      if (Math.hypot(off.x, off.y) < AWAY) return setOff({ x: 0, y: 0, gone: false });
      setOff({ x: off.x * 6, y: off.y * 6, gone: true });
      setTimeout(onLeave, reducedMotion() ? 0 : 280);
    },
  };

  return (
    <Screen title="Kin">
      <div className="flex flex-1 items-center justify-center">
        <div className="kd-open" data-step={step} role={step === "wait" ? "button" : undefined} tabIndex={step === "wait" ? 0 : undefined}
          aria-label={step === "wait" ? "Open the gift" : undefined} onClick={tap} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && tap()}>
          <span className="kd-open-drop">
            <span aria-hidden className="kd-ob-back" />
            <span aria-hidden className="kd-ob-flap kd-ob-flap-l" />
            <span aria-hidden className="kd-ob-flap kd-ob-flap-r" />
            <span className="kd-ob-card">
              <span {...drag} className={`kt-printer block select-none ${done ? "cursor-grab touch-none" : ""}`}
                style={{ transform: `translate(${off.x}px, ${off.y}px) rotate(${off.x / 25}deg)`, transition: dragging ? "none" : "transform 280ms cubic-bezier(0.3, 0.7, 0.3, 1)" }}>
                {/* Same note as the send, folded until "unfold". */}
                <span className="kt-printer kd-gift kd-ob-note" data-phase={step === "unfold" || step === "card" ? "note" : "fold"}>
                  <Note d={{ mode: "name", to: "", amount, msg, from: sender }} label={`A gift from ${sender ? `@${sender}` : "someone"}: ${formatMoney(amount)}.${msg ? ` ${msg}` : ""}`} />
                </span>
                {done && <span className="absolute right-1 top-5 z-10"><Stamp tone="good">OPENED ✓</Stamp></span>}
              </span>
            </span>
            <span aria-hidden className="kd-ob-front"><Ribbon /></span>
            <span aria-hidden className="kd-ob-lid"><Ribbon /><Bow /></span>
            <span aria-hidden className="kd-ob-bits">{BITS.map((b, i) => <i key={i} style={b} />)}</span>
          </span>
          <span aria-hidden className="kd-ob-floor" />
        </div>
      </div>
      <div className="flex min-h-[88px] flex-col justify-end gap-3 pt-2">
        {step === "wait" ? (
          <p className="kd-open-hint text-center font-semibold text-muted">Tap the gift to open it</p>
        ) : step !== "card" ? null : (
          <div className="kd-open-cta flex flex-col gap-3">
            {money === "working" && <p className="text-center text-sm text-muted" aria-live="polite">{say || "Opening your gift…"}</p>}
            {money === "error" && (
              <>
                <ErrorText>{err}</ErrorText>
                <Button onClick={run}>Try again</Button>
              </>
            )}
            {done ? (
              <>
                <p className="text-center text-muted" aria-live="polite">It&apos;s in your balance. Swipe the note away when you&apos;re done.</p>
                <Button onClick={onLeave}>See my balance</Button>
              </>
            ) : !signedIn ? (
              <>
                <Button onClick={onSignup}>Create free account to accept the gift</Button>
                <p className="text-center text-xs text-muted">Takes 20 seconds. Just your name and an Identity check.</p>
              </>
            ) : null}
          </div>
        )}
      </div>
    </Screen>
  );
}
