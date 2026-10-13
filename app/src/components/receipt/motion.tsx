"use client";
// Small motion pieces shared by the receipt and Delivered. Keyframes in globals.css (`kin-*`), behind
// prefers-reduced-motion: no-preference. Reduced motion = final state on first paint.
import { useEffect, useState, type ReactNode } from "react";
import { formatMoney } from "@/lib/money";

const reduced = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** 0 → 1 over `ms` after `delay`, ease-out cubic. 1 at once when reduced motion. */
function useProgress(ms: number, delay: number) {
  const [p, setP] = useState(() => (reduced() ? 1 : 0));
  useEffect(() => {
    if (reduced()) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const tick = (t: number) => {
      const x = Math.min(1, Math.max(0, (t - t0) / ms));
      setP(1 - (1 - x) ** 3);
      if (x < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [ms, delay]);
  return p;
}

/**
 * Counts `value` up from 0. Screen readers only get the final text; the final text also reserves the width,
 * so nothing around it moves while digits grow (right-aligned, like an odometer).
 */
export function CountUp({ value, format, ms = 520, delay = 80, children = (s) => s }: {
  value: number; format: (n: number) => string; ms?: number; delay?: number; children?: (text: string) => ReactNode;
}) {
  const p = useProgress(ms, delay);
  const final = format(value);
  return (
    <span className="relative inline-grid justify-items-end">
      <span className="sr-only">{final}</span>
      <span aria-hidden className="invisible col-start-1 row-start-1">{children(final)}</span>
      <span aria-hidden className="col-start-1 row-start-1">{children(p >= 1 ? final : format(value * p))}</span>
    </span>
  );
}

/** formatMoney for a count-up frame (base units as a float). */
export const money = (n: number) => formatMoney(BigInt(Math.trunc(n)));

/** Static ✓ that reads "✓". */
export function Ticks() {
  return (
    <>
      <span className="sr-only">✓</span>
      <svg aria-hidden viewBox="0 0 20 12" className="h-[1em] w-auto" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 6.5 7 10.5l8-8.5" />
      </svg>
    </>
  );
}

/** Drawn check mark (stroke), for the big green circle. */
export function Check({ size = 36, delay = 150 }: { size?: number; delay?: number }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <path pathLength={1} className="kin-draw" style={{ animationDelay: `${delay}ms` }} d="M5 12.5 9.5 17 19 7.5" />
    </svg>
  );
}

/**
 * "$1,234.56 added" → the leading amount counts up, the rest stays. Frames reuse the title's own digit layout
 * (separators, symbol, suffix), so any locale/currency works; no amount → plain text.
 * ponytail: assumes the amount has a decimal part (Kin money always shows 2); "1,234" would count as "0,012".
 */
export function CountTitle({ text, delay = 160 }: { text: string; delay?: number }) {
  const m = text.match(/^(\D{0,4}?)(\d(?:[\d.,'\s]*\d)?)(.*)$/s);
  if (!m) return text;
  const [, pre, num, rest] = m;
  const digits = num.replace(/\D/g, "");
  const sep = Math.max(...[".", ",", "'", " ", " ", " "].map((s) => num.lastIndexOf(s)));
  const min = sep < 0 ? 1 : num.length - sep; // digits kept while counting: last group + 1 ("0.05")
  const fill = (n: number) => {
    let d = String(Math.floor(n)).padStart(min, "0");
    let out = "";
    for (let i = num.length - 1; i >= 0 && d; i--) {
      const digit = /\d/.test(num[i]);
      out = (digit ? d.at(-1) : num[i]) + out;
      if (digit) d = d.slice(0, -1);
    }
    return pre + out + rest;
  };
  return <CountUp value={Number(digits)} format={fill} delay={delay} />;
}
