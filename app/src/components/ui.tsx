"use client";
import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

// Kin UI kit. Colors ONLY via token classes (see globals.css). Mobile-first, 44px+ targets.

export function Screen({ title, back, children, action, wide }: { title?: ReactNode; back?: string; children: ReactNode; action?: ReactNode; wide?: boolean }) {
  return (
    <main className={`flex flex-1 flex-col pb-[max(7rem,calc(env(safe-area-inset-bottom)+6rem))] pt-[max(1rem,env(safe-area-inset-top))] ${wide ? "" : "px-5"}`}>
      {(title || back || action) && (
        <header className={`mb-5 flex min-h-11 items-center gap-3 ${wide ? "px-5" : ""}`}>
          {back && (
            <Link href={back} aria-label="Back" className="-ml-2 grid size-11 place-items-center rounded-full text-2xl active:bg-surface-2">
              ‹
            </Link>
          )}
          <h1 className="flex-1 text-xl font-bold">{title}</h1>
          {action}
        </header>
      )}
      <div className="flex flex-1 flex-col gap-4">{children}</div>
    </main>
  );
}

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "soft" | "ink"; busy?: boolean };

export function Button({ variant = "primary", busy, className = "", children, disabled, ...rest }: BtnProps) {
  const style = {
    primary: "bg-brand text-brand-ink",
    soft: "bg-brand-soft text-brand",
    ghost: "bg-transparent text-ink border border-line",
    ink: "bg-ink text-bg",
  }[variant];
  return (
    <button
      {...rest}
      disabled={disabled || busy}
      className={`h-14 w-full rounded-full px-6 text-base font-semibold transition active:scale-[0.98] disabled:opacity-40 ${style} ${className}`}
    >
      {busy ? <span className="inline-block size-5 animate-spin rounded-full border-2 border-current border-t-transparent align-middle" /> : children}
    </button>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[28px] border border-line bg-surface p-5 ${className}`}>{children}</div>;
}

/** Full-bleed uppercase section strip ("DETAILS", "MORE"). Use inside <Screen wide>. */
export function Band({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between bg-surface-2 px-5 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted">
      <span>{children}</span>
      {action}
    </div>
  );
}

/** List row: icon, title/subtitle, trailing. */
export function Row({ icon, title, sub, trail, href, onClick }: { icon?: ReactNode; title: ReactNode; sub?: ReactNode; trail?: ReactNode; href?: string; onClick?: () => void }) {
  const body = (
    <>
      {icon}
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold">{title}</span>
        {sub && <span className="block truncate text-sm text-muted">{sub}</span>}
      </span>
      {trail}
    </>
  );
  const cls = "flex min-h-16 w-full items-center gap-4 px-5 py-3 text-left active:bg-surface-2";
  if (href) return <Link href={href} className={cls}>{body}</Link>;
  if (onClick) return <button onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

/** Round dark icon button with optional label below (quick actions). */
export function IconButton({ icon, label, href, onClick, big }: { icon: ReactNode; label?: string; href?: string; onClick?: () => void; big?: boolean }) {
  const circle = (
    <span className={`grid place-items-center rounded-full border border-line bg-surface-2 text-ink ${big ? "size-16 text-2xl" : "size-14 text-xl"}`}>{icon}</span>
  );
  const cls = "flex flex-col items-center gap-2 text-sm text-muted active:scale-95 transition";
  const inner = (
    <>
      {circle}
      {label && <span className="text-center leading-tight">{label}</span>}
    </>
  );
  if (href) return <Link href={href} className={cls} aria-label={label}>{inner}</Link>;
  return <button onClick={onClick} className={cls} aria-label={label}>{inner}</button>;
}

/** Big serif money figure. Pass the already-formatted string ("₹4,425.50"); cents are dimmed. */
export function Amount({ value, size = "xl", className = "" }: { value: string; size?: "md" | "lg" | "xl"; className?: string }) {
  const m = value.match(/^(.*?)([.,]\d{2})(\D*)$/);
  const cls = { md: "text-4xl", lg: "text-5xl", xl: "text-6xl" }[size];
  return (
    <span className={`font-display tabular leading-none tracking-tight ${cls} ${className}`}>
      {m ? (
        <>
          {m[1]}
          <span className="text-muted">{m[2]}</span>
          {m[3]}
        </>
      ) : (
        value
      )}
    </span>
  );
}

/** Pill segmented control. */
export function Tabs<T extends string>({ value, options, onChange }: { value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`h-10 shrink-0 rounded-full px-4 text-sm font-semibold transition ${v === value ? "bg-ink text-bg" : "bg-surface-2 text-muted"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "good" | "brand" | "warn" | "bad" }) {
  const t = {
    muted: "bg-surface-2 text-muted",
    good: "bg-good/15 text-good",
    brand: "bg-brand-soft text-brand",
    warn: "bg-warn/15 text-warn",
    bad: "bg-bad/15 text-bad",
  }[tone];
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${t}`}>{children}</span>;
}

/** Progress ring (0–1) with centered content. */
export function Ring({ value, size = 160, stroke = 14, children }: { value: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--good)" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  );
}

/** Big countdown "01 : 21 : 19 : 01" to unix seconds `until`. Caller re-renders each second. */
export function Countdown({ seconds }: { seconds: number }) {
  const s = Math.max(0, Math.floor(seconds));
  const parts = [
    [Math.floor(s / 86400), "Days"],
    [Math.floor((s % 86400) / 3600), "Hours"],
    [Math.floor((s % 3600) / 60), "Minutes"],
    [s % 60, "Seconds"],
  ] as const;
  return (
    <div className="flex items-start gap-1">
      {parts.map(([n, label], i) => (
        <div key={label} className="flex items-start gap-1">
          {i > 0 && <span className="font-display text-4xl text-muted">:</span>}
          <div className="flex flex-col items-center">
            <span className="font-display text-5xl tabular leading-none">{String(n).padStart(2, "0")}</span>
            <span className="mt-1 text-[10px] text-muted">{label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const inputClass = "h-14 w-full rounded-2xl border border-line bg-surface px-4 text-base text-ink outline-none placeholder:text-muted focus:border-brand";

const FUN = ["bg-fun-1", "bg-fun-2", "bg-fun-3", "bg-fun-4", "bg-fun-5"];

/** Stable color slot (0–4) for a name — use for Moments cards etc. */
export const funIndex = (name = "") => [...name].reduce((h, c) => h + c.charCodeAt(0), 0) % FUN.length;
export const funBg = (name = "") => FUN[funIndex(name)];

export function Avatar({ name, size = 44 }: { name?: string; size?: number }) {
  const letter = (name ?? "?").replace(/^@/, "").charAt(0).toUpperCase();
  return (
    <span className={`grid shrink-0 place-items-center rounded-full font-bold text-fun-ink ${funBg(name)}`} style={{ width: size, height: size, fontSize: size * 0.42 }}>
      {letter}
    </span>
  );
}

export function ErrorText({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-sm text-bad">{children}</p>;
}

/** Success state shown after a payment settles. */
export function Delivered({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <div className="grid size-20 place-items-center rounded-full bg-good text-3xl font-bold text-fun-ink">✓</div>
      <h2 className="font-display text-4xl">{title}</h2>
      {subtitle && <p className="text-muted">{subtitle}</p>}
      <div className="mt-6 w-full">{children}</div>
    </div>
  );
}
