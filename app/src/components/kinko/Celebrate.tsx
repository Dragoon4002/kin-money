"use client";
import { useEffect, useState } from "react";
import { shareCard, warmCard, type CardParams } from "@/lib/shareCard";
import { play } from "@/lib/sound";
import { Ico } from "../ui";
import { Kinko, type Look } from "./Kinko";

// Full-screen celebration: confetti + Kinko cheering + serif headline. Reserve for real wins.

const COLORS = ["var(--fun-2)", "var(--fun-4)", "var(--fun-5)", "var(--fun-3)", "var(--fun-ink)"];
// Deterministic spread (no Math.random in render).
const PIECES = Array.from({ length: 32 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 7) % 20) / 10,
  dur: 2.6 + ((i * 13) % 10) / 6,
  rot: (i * 47) % 180,
  color: COLORS[i % COLORS.length],
  wide: i % 3 === 0,
}));
// One-shot burst from the middle when the moment lands.
const BURST = Array.from({ length: 28 }, (_, i) => {
  const a = (i / 28) * 2 * Math.PI, d = 130 + ((i * 53) % 110);
  return { dx: Math.round(Math.cos(a) * d), dy: Math.round(Math.sin(a) * d - 60), rot: (i * 71) % 360, color: COLORS[i % COLORS.length], wide: i % 2 === 0 };
});
const GIFT_MS = 1100; // box wiggles this long, then the lid pops

const CSS = `
@keyframes kin-confetti{0%{transform:translateY(-10vh) rotate(var(--r))}100%{transform:translateY(110vh) rotate(calc(var(--r) + 540deg))}}
.kin-confetti{animation:kin-confetti linear infinite}
@keyframes kin-burst{0%{transform:translate(0,0) rotate(0) scale(.4);opacity:1}80%{opacity:1}100%{transform:translate(var(--dx),var(--dy)) rotate(var(--r)) scale(1);opacity:0}}
.kin-burst{animation:kin-burst 1.1s cubic-bezier(.15,.7,.3,1) both}
@keyframes kin-wiggle{0%,100%{transform:rotate(0) scale(1)}15%{transform:rotate(-6deg) scale(1.03)}30%{transform:rotate(6deg) scale(1.03)}45%{transform:rotate(-9deg) scale(1.06)}60%{transform:rotate(9deg) scale(1.06)}75%{transform:rotate(-12deg) scale(1.1)}90%{transform:rotate(12deg) scale(1.12)}}
.kin-wiggle{animation:kin-wiggle ${GIFT_MS}ms ease-in-out both;transform-origin:50% 90%}
@keyframes kin-lid{to{transform:translate(40px,-160px) rotate(35deg);opacity:0}}
.kin-lid{animation:kin-lid .7s cubic-bezier(.3,.6,.4,1) both;transform-box:fill-box;transform-origin:center}
@keyframes kin-box-out{to{transform:scale(.6) translateY(30px);opacity:0}}
.kin-box-out{animation:kin-box-out .5s ease-in .15s both}
@media (prefers-reduced-motion:reduce){.kin-confetti{animation:none;top:10%!important}.kin-burst,.kin-box-out{display:none}}
`;

/** Wrapped present (theme fun colors). The lid is its own group so it can fly off. */
function GiftBox({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 120 120" width={200} height={200} aria-hidden className={open ? "kin-box-out" : "kin-wiggle"}>
      <rect x="18" y="52" width="84" height="58" rx="8" fill="var(--fun-4)" />
      <rect x="53" y="52" width="14" height="58" fill="var(--fun-2)" />
      <g className={open ? "kin-lid" : undefined}>
        <path d="M60 36C44 12 26 30 60 36ZM60 36C76 12 94 30 60 36Z" fill="var(--fun-2)" />
        <rect x="10" y="36" width="100" height="20" rx="6" fill="var(--fun-4)" />
        <rect x="53" y="36" width="14" height="20" fill="var(--fun-2)" />
      </g>
    </svg>
  );
}

export function Celebrate({ open, title, amount, subtitle, onClose, shareText, started, ended, look, card, intro }: {
  open: boolean; title: string; amount?: string; subtitle?: string; onClose: () => void; shareText?: string;
  started?: string; ended?: string; look?: Look; /** Share a picture card instead of plain text. */ card?: CardParams;
  /** "gift" = a wrapped box wiggles, then the lid pops off before the confetti. */ intro?: "gift";
}) {
  const [copied, setCopied] = useState(false);
  const [wrapped, setWrapped] = useState(intro === "gift");
  const cardP = card && { ...card, look: card.look ?? look };
  useEffect(() => {
    if (open && cardP) warmCard(cardP); // memoized by URL, cheap per render
  });

  // Sound + reveal: plain wins cheer at once; a gift cheers when its lid pops.
  useEffect(() => {
    if (!open) return;
    if (!wrapped) return play(intro === "gift" ? "gift" : "celebrate");
    const t = setTimeout(() => setWrapped(false), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : GIFT_MS);
    return () => clearTimeout(t);
  }, [open, wrapped, intro]);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;

  const text = shareText ?? [title, amount].filter(Boolean).join(" ");
  async function share() {
    if (cardP) {
      if ((await shareCard(cardP, text)) !== "copied") return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      return;
    }
    try {
      if (navigator.share) return await navigator.share({ text, url: location.origin });
      await navigator.clipboard.writeText(`${text} ${location.origin}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // share sheet dismissed — nothing to do
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-50 overflow-hidden bg-fun-1 text-fun-ink">
      <style href="kin-confetti" precedence="default">{CSS}</style>
      {wrapped ? (
        <div className="grid h-full place-items-center">
          <div className="flex flex-col items-center gap-6">
            <GiftBox open={false} />
            <p className="font-display text-3xl">Opening your gift…</p>
          </div>
        </div>
      ) : (
      <>
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {PIECES.map((p, i) => (
          <span
            key={i}
            className="kin-confetti absolute -top-8 rounded-full"
            style={{
              left: `${p.left}%`, width: p.wide ? 7 : 6, height: p.wide ? 7 : 22, background: p.color,
              animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, ["--r" as string]: `${p.rot}deg`,
            }}
          />
        ))}
        {intro === "gift" && <div className="absolute inset-0 grid place-items-center"><GiftBox open /></div>}
        <div className="absolute left-1/2 top-[40%]">
          {BURST.map((p, i) => (
            <span
              key={i}
              className="kin-burst absolute rounded-full"
              style={{ width: p.wide ? 10 : 7, height: p.wide ? 10 : 18, background: p.color, ["--dx" as string]: `${p.dx}px`, ["--dy" as string]: `${p.dy}px`, ["--r" as string]: `${p.rot}deg` }}
            />
          ))}
        </div>
      </div>

      <div className="relative mx-auto flex h-full max-w-md flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={onClose} aria-label="Close" className="-ml-1 grid size-11 place-items-center rounded-full text-xl font-bold active:scale-95" style={{ background: "var(--kinko-ink)" }}>
          <Ico name="close" />
        </button>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="kin-pop"><Kinko look={look} mood="celebrate" size={220} /></div>
          <h2 className="kin-rise mt-2 font-display text-4xl leading-tight [animation-delay:150ms]">{title}</h2>
          {amount && <p className="kin-pop font-display text-6xl tabular leading-none [animation-delay:250ms]">{amount}</p>}
          {subtitle && <p className="kin-rise max-w-72 text-base font-medium opacity-90 [animation-delay:350ms]">{subtitle}</p>}
          {(started || ended) && (
            <div className="mt-4 flex w-full max-w-72 justify-center divide-x divide-fun-ink/30 text-sm">
              {started && (
                <div className="flex-1 px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest opacity-75">Started</p>
                  <p className="font-semibold">{started}</p>
                </div>
              )}
              {ended && (
                <div className="flex-1 px-3">
                  <p className="text-[10px] font-semibold uppercase tracking-widest opacity-75">Ended</p>
                  <p className="font-semibold">{ended}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <button onClick={share} className="h-14 w-full rounded-full text-base font-semibold transition active:scale-[0.98]" style={{ background: "var(--kinko-ink)" }}>
          {copied ? <span className="inline-flex items-center gap-2"><Ico name="check" /> Copied</span> : cardP ? "Share card" : "Share to friends"}
        </button>
      </div>
      </>
      )}
    </div>
  );
}
