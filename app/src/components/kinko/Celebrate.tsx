"use client";
import { useEffect, useState } from "react";
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

const CSS = `
@keyframes kin-confetti{0%{transform:translateY(-10vh) rotate(var(--r))}100%{transform:translateY(110vh) rotate(calc(var(--r) + 540deg))}}
.kin-confetti{animation:kin-confetti linear infinite}
@media (prefers-reduced-motion:reduce){.kin-confetti{animation:none;top:10%!important}}
`;

export function Celebrate({ open, title, amount, subtitle, onClose, shareText, started, ended, look }: {
  open: boolean; title: string; amount?: string; subtitle?: string; onClose: () => void; shareText?: string;
  started?: string; ended?: string; look?: Look;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open, onClose]);

  if (!open) return null;

  const text = shareText ?? [title, amount].filter(Boolean).join(" ");
  async function share() {
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
      </div>

      <div className="relative mx-auto flex h-full max-w-md flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={onClose} aria-label="Close" className="-ml-1 grid size-11 place-items-center rounded-full text-xl font-bold active:scale-95" style={{ background: "var(--kinko-ink)" }}>
          <Ico name="close" />
        </button>

        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Kinko look={look} mood="celebrate" size={220} />
          <h2 className="mt-2 font-display text-4xl leading-tight">{title}</h2>
          {amount && <p className="font-display text-6xl tabular leading-none">{amount}</p>}
          {subtitle && <p className="max-w-72 text-base font-medium opacity-90">{subtitle}</p>}
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
          {copied ? <span className="inline-flex items-center gap-2"><Ico name="check" /> Copied</span> : "Share to friends"}
        </button>
      </div>
    </div>
  );
}
