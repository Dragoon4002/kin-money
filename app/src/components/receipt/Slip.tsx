"use client";
// The printed-ticket model for every money moment, not just payments (approved in /demo Section E). Same paper /
// slot / print / tear as ReceiptTicket (kt-*, kd-sheet-flat, kd-stamp in globals.css).
// ponytail: Slip copies ReceiptTicket's shell markup; extract one shared <Paper> there if they drift.
import { ArrowUpRight, ChevronsDown } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Barcode, CopyId, paymentId } from "./ReceiptTicket";
import { CountUp, Ticks } from "./motion";
import { READY_MS, useTearOff } from "./useTearOff";
import { Ico } from "@/components/ui";
import type { IconName } from "@/lib/icons";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function Tear({ root, onTear, onPull }: { root: RefObject<HTMLElement | null>; onTear: () => void; onPull: () => void }) {
  useTearOff(root, onTear, onPull);
  return null;
}

/** A slip printing out of the slot. `onTear` set = pull down to tear it off (leave); unset = it just prints. */
export function Slip({ label, onTear, children }: { label: string; onTear?: () => void; children: ReactNode }) {
  const printer = useRef<HTMLDivElement>(null);
  const [landed, setLanded] = useState(false);
  const [pulled, setPulled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLanded(true), reduced() ? 0 : READY_MS + 250);
    return () => clearTimeout(t);
  }, []);
  return (
    <div ref={printer} className="kt-printer">
      <div aria-hidden className="kt-slot" />
      <div className="kt-feed">
        <div className="kt-paper" role="group" tabIndex={onTear ? 0 : undefined} aria-label={label}>
          <div aria-hidden className="kt-shadow" />
          <div aria-hidden className="kt-lead" />
          <article className="kt-sheet flex flex-col items-center gap-4 px-5 pb-10 pt-9 text-center">{children}</article>
        </div>
        <div aria-hidden className="kt-perf" />
        <div aria-hidden className="kt-stub" />
        {onTear && (
          <span aria-hidden data-on={landed && !pulled} className="kt-hint">
            Pull down to tear off <ChevronsDown size={12} strokeWidth={2.5} />
          </span>
        )}
      </div>
      {onTear && <Tear root={printer} onTear={onTear} onPull={() => setPulled(true)} />}
    </div>
  );
}

/** Static paper (no slot, no print): quotes, notes, cards. Scalloped bottom edge, soft shadow. */
export function Paper({ children, className = "", edge = true }: { children: ReactNode; className?: string; edge?: boolean }) {
  return (
    <div className="kt-printer kd-paper-shadow">
      <div className={`${edge ? "kt-sheet" : "kd-sheet-flat"} ${className}`}>{children}</div>
    </div>
  );
}

/** The empty slot with a spinner and what's happening: the slip prints once it's done. */
export function SlotWait({ title, text, children }: { title?: string; text: string; children?: ReactNode }) {
  return (
    <div className="kt-printer" aria-busy>
      <div aria-hidden className="kt-slot" />
      <div className="kin-rise flex flex-col items-center gap-3 px-4 pt-10 text-center text-muted">
        <span aria-hidden className="inline-block size-7 animate-spin rounded-full border-2 border-current border-t-transparent" />
        {title && <span className="font-display tabular text-5xl text-ink">{title}</span>}
        <span className="font-mono text-sm" role="status">{text}</span>
        {children}
      </div>
    </div>
  );
}

/** Empty slot with a message: link incomplete, couldn't load, not valid. */
export function SlotNote({ title, children, bad }: { title: string; children: ReactNode; bad?: boolean }) {
  return (
    <div className="kt-printer">
      <div aria-hidden className="kt-slot" />
      <div className="kin-rise flex flex-col items-center gap-3 px-4 pt-10 text-center text-muted">
        {bad && <span className="kin-shake grid size-14 place-items-center rounded-full bg-bad/15 text-2xl font-bold text-bad" aria-hidden>!</span>}
        <span className="font-mono text-sm font-bold tracking-[0.2em] text-ink">{title}</span>
        <span className="text-sm">{children}</span>
      </div>
    </div>
  );
}

export const Dash = () => <hr aria-hidden className="kt-dash" />;
export const Label = ({ children }: { children: ReactNode }) => <span className="kt-label">{children}</span>;

/** Big amount that counts up as it leaves the slot. */
export function Big({ value, format, label, unit, delay = 780 }: { value: number; format: (n: number) => string; label?: string; unit?: string; delay?: number }) {
  return (
    <div className="flex flex-col items-center gap-2">
      {label && <Label>{label}</Label>}
      <span className="flex items-baseline gap-1.5">
        <span className="text-5xl font-bold tracking-tight tabular-nums"><CountUp value={value} format={format} delay={delay} ms={420} /></span>
        {unit && <span className="font-mono text-sm font-bold text-[var(--kt-muted)]">{unit}</span>}
      </span>
    </div>
  );
}

/** Green "Delivered ✓" pill, like the receipt. */
export const Ok = ({ children }: { children: ReactNode }) => (
  <span className="kt-ok flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold">{children} <Ticks /></span>
);

/** "LABEL ........ value" printed line. */
export function Line({ k, v, strong, muted }: { k: ReactNode; v: ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={`flex w-full items-baseline gap-2 text-left font-mono text-[13px] ${muted ? "text-[var(--kt-muted)]" : ""}`}>
      <span className="min-w-0 shrink">{k}</span>
      <span aria-hidden className="min-w-4 flex-1 border-b-2 border-dotted border-[var(--kt-line)]" />
      <span className={`shrink-0 tabular-nums ${strong ? "text-base font-bold" : "font-bold"}`}>{v}</span>
    </div>
  );
}

/** Label over a value, centered (TO / OPENS / EXPIRES). */
export function Field({ k, v, sub }: { k: string; v: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-2">
      <Label>{k}</Label>
      <span className="max-w-full truncate font-mono text-sm font-bold">{v}</span>
      {sub && <span className="font-mono text-[11px] text-[var(--kt-muted)]">{sub}</span>}
    </div>
  );
}

/** Two fields side by side with the dashed divider between (like TO | FROM). */
export const Cols = ({ children }: { children: ReactNode }) => <div className="kt-cols grid w-full grid-cols-2">{children}</div>;

/** Rubber stamp over the paper (status): lands with a thump after the print. */
export function Stamp({ children, tone = "ink" }: { children: ReactNode; tone?: "ink" | "good" | "bad" | "warn" }) {
  const c = { ink: "text-[var(--kt-ink)]", good: "text-[var(--kt-good)]", bad: "text-[#b3412e]", warn: "text-[#9a6a00]" }[tone];
  return <span className={`kd-stamp inline-block -rotate-6 rounded-lg border-[3px] border-current px-3 py-1 font-mono text-sm font-bold tracking-[0.2em] ${c}`}>{children}</span>;
}

export const pill = "kt-pill flex h-11 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 font-mono text-xs active:scale-95";

/** Receipt number + barcode + Copy ID / Details / Share. Details = the receipt screen (where the explorer lives). */
export function IdBlock({ hash, label = "PAYMENT ID", details, onShare, shareLabel = "Share" }: { hash: string; label?: string; details?: string; onShare?: () => void; shareLabel?: string }) {
  return (
    <div className="flex w-full flex-col items-center gap-1">
      <Label>{label}</Label>
      <span className="font-mono text-sm font-bold tracking-wider">{paymentId(hash)}</span>
      <Barcode hash={hash} />
      <div className="mt-2 flex w-full gap-1.5 [&>*]:flex-1 [&>*]:justify-center">
        <CopyId hash={hash} />
        {details && <Link href={details} className={pill}>Details <ArrowUpRight size={14} aria-hidden /></Link>}
        {onShare && <button onClick={onShare} className={pill}>{shareLabel} <Ico name="share" size={14} /></button>}
      </div>
    </div>
  );
}

/** Copy a link, printed on the paper: the link (shortened) + Copy. */
export function LinkStrip({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button onClick={() => navigator.clipboard?.writeText(url).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)), () => {})}
      aria-label="Copy link" className="kt-pill flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left active:scale-[0.98]">
      <Ico name="link" size={16} />
      <span className="min-w-0 flex-1 truncate font-mono text-xs">{url.replace(/^https?:\/\//, "")}</span>
      <span className="shrink-0 font-mono text-xs font-bold">{done ? "Copied ✓" : "Copy"}</span>
    </button>
  );
}

/** Mono countdown in four boxes (DAYS : HRS : MIN : SEC). */
export function TicketCountdown({ seconds }: { seconds: number }) {
  const s = Math.max(0, Math.floor(seconds));
  const parts = [[Math.floor(s / 86400), "DAYS"], [Math.floor((s % 86400) / 3600), "HRS"], [Math.floor((s % 3600) / 60), "MIN"], [s % 60, "SEC"]] as const;
  return (
    <div className="flex items-start gap-1" role="timer" aria-label={`${parts.map(([n, l]) => `${n} ${l.toLowerCase()}`).join(" ")} left`}>
      {parts.map(([n, l], i) => (
        <div key={l} className="flex items-start gap-1" aria-hidden>
          {i > 0 && <span className="pt-1.5 font-mono text-xl text-[var(--kt-muted)]">:</span>}
          <div className="flex flex-col items-center">
            <span className="kt-pill min-w-11 rounded-lg px-1.5 py-1 font-mono text-2xl font-bold tabular-nums">{String(n).padStart(2, "0")}</span>
            <span className="mt-1 kt-label text-[9px]!">{l}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export type StepState = "todo" | "doing" | "done" | "practice" | "bad";
export type Step = { icon: IconName; title: string; sub?: string; state: StepState };

/** Progress printed on paper: each step a box that fills (✓), spins (now), or waits. */
export function Track({ title, steps }: { title: string; steps: Step[] }) {
  return (
    <Paper className="flex flex-col gap-3 px-5 pb-8 pt-5">
      <Label>{title}</Label>
      <ol className="flex flex-col gap-3" aria-live="polite">
        {steps.map((s, i) => (
          <li key={s.title} className={`flex items-start gap-3 text-left transition-opacity duration-300 ${s.state === "todo" ? "opacity-45" : ""}`}>
            <span className={`relative mt-0.5 grid size-8 shrink-0 place-items-center rounded-md border-2 ${
              s.state === "done" ? "kin-pop border-[var(--kt-good)] bg-[var(--kt-good)] text-white"
              : s.state === "bad" ? "border-[#b3412e] text-[#b3412e]"
              : s.state === "practice" ? "border-dashed border-[#9a6a00] text-[#9a6a00]" : "border-[var(--kt-line)]"}`}
              style={s.state === "done" ? { animationDelay: `${i * 120}ms` } : undefined}>
              {s.state === "done" ? <Ico name="check" size={16} />
                : s.state === "doing" ? <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-[var(--kt-ink)] border-t-transparent" />
                : s.state === "bad" ? <span aria-hidden className="font-bold">!</span>
                : <Ico name={s.icon} size={15} />}
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold">{s.title}{s.state === "doing" && <span className="sr-only"> (in progress)</span>}</span>
              {s.sub && <span className="font-mono text-xs leading-snug text-[var(--kt-muted)]">{s.sub}</span>}
            </span>
          </li>
        ))}
      </ol>
    </Paper>
  );
}

/** Mono section heading on the page (outside the paper). */
export const Heading = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="flex min-h-11 items-center justify-between gap-2">
    <h2 className="font-mono text-xs font-bold tracking-[0.2em] text-muted">{children}</h2>
    {action}
  </div>
);

/** Buttons under a slip: rise in once the paper has landed. */
export const After = ({ children, at = 1350 }: { children: ReactNode; at?: number }) => (
  <div className="kin-rise mt-auto flex flex-col gap-2 pt-2" style={{ animationDelay: `${at}ms` }}>{children}</div>
);
