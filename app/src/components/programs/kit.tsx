"use client";
import { useEffect, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { isUnlocked, useRequireAccount } from "@/lib/account";
import { humanError } from "@/lib/errors";
import { FX, getCurrency } from "@/lib/money";
import { useCurrencySymbol } from "@/lib/useCurrencySymbol";
import { nameOf } from "@/lib/names";
import { nowSec, same } from "@/lib/programs";
import { ICON, type IconName } from "@/lib/icons";
import { Avatar, Field, IconTile, inputClass } from "../ui";

// Shared bits for programmable-money screens (allowance, pot, circle, bills, invoices, gifts).

/** My address; sends visitors without an account to the welcome screen. */
export const useMe = (): Address | undefined => useRequireAccount().profile?.address;

/** Load async data keyed by `key`; `reload()` refetches. */
export function useLoad<T>(fn: () => Promise<T>, key: string | undefined) {
  const [state, setState] = useState<{ data?: T; error?: string; key?: string }>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!key) return;
    let live = true;
    fn().then(
      (data) => live && setState({ data, key }),
      (e) => live && setState((s) => ({ ...s, error: humanError(e) })),
    );
    return () => void (live = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures fn's inputs
  }, [key, tick]);
  return { data: state.data, error: state.error, loading: state.data === undefined && !state.error, reload: () => setTick((t) => t + 1) };
}

/** Seconds clock that re-renders every `ms`. */
export function useNow(ms = 1000) {
  const [t, setT] = useState(nowSec);
  useEffect(() => {
    const i = setInterval(() => setT(nowSec()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}

/** Run a money action with busy state, progress copy and human errors. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  async function run<T>(fn: (say: (s: string) => void) => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    setStatus(isUnlocked() ? "Working on it…" : "Confirm with Face ID…");
    try {
      return await fn(setStatus);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }
  return { busy, status, error, run };
}

const names = new Map<string, Promise<string>>();
export function useName(a?: Address) {
  const { data } = useLoad(() => {
    const k = a!.toLowerCase();
    if (!names.has(k)) names.set(k, nameOf(a!).catch(() => ""));
    return names.get(k)!;
  }, a);
  return data;
}

/** "@alice", or "You". Never shows an account number. */
export function Who({ a, me, you = "You" }: { a?: Address; me?: Address; you?: string }) {
  const n = useName(a);
  if (same(a, me)) return <>{you}</>;
  return <>{n ? `@${n}` : "A Kin friend"}</>;
}

export function WhoAvatar({ a, size = 40 }: { a?: Address; size?: number }) {
  const n = useName(a);
  return <Avatar name={n || "?"} size={size} />;
}

/** Local money from a float of base units — for live, sub-cent displays. */
export function localParts(units: number, currency = getCurrency()) {
  const local = (units / 1e6) * (FX[currency] ?? 1);
  const cents = Math.floor(local * 100) / 100;
  const main = new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents);
  const tail = String(Math.floor(local * 1e6) % 10_000).padStart(4, "0");
  return { main, tail };
}

export function MoneyInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const symbol = useCurrencySymbol();
  return (
    <Field label={label} hint={hint}>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center font-display text-3xl text-muted">{symbol}</span>
        <input
          className={`${inputClass} h-16 pl-14 font-display text-3xl tabular`}
          inputMode="decimal"
          placeholder="0.00"
          value={value}
          onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
        />
      </div>
    </Field>
  );
}

/** Pill choice (like <Tabs>, but numbers allowed and full width), 44px targets. */
export function Choice<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex gap-2">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
          className={`h-11 flex-1 rounded-full text-sm font-semibold transition active:scale-95 ${o.value === value ? "bg-ink text-bg" : "bg-surface-2 text-muted"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** "3 days 4 hrs" / "12 min" / "45 sec". */
export function timeLeft(sec: number) {
  if (sec <= 0) return "now";
  const d = Math.floor(sec / 86_400), h = Math.floor((sec % 86_400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return `${d} day${d > 1 ? "s" : ""}${h ? ` ${h} hr${h > 1 ? "s" : ""}` : ""}`;
  if (h) return `${h} hr${h > 1 ? "s" : ""} ${m} min`;
  if (m) return `${m} min ${sec % 60} sec`;
  return `${sec} sec`;
}

export const dateLabel = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Bottom sheet for confirmations. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/70 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-t-[32px] border-t border-line bg-surface p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-line" />
        <div className="flex flex-col gap-3">{children}</div>
      </div>
    </div>
  );
}

export function Status({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p aria-live="polite" className="text-center text-sm text-muted">{children}</p>;
}

export function Empty({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-10 text-center">
      <IconTile name={icon} size={64} />
      <p className="font-semibold">{title}</p>
      <p className="max-w-64 text-sm text-muted">{sub}</p>
    </div>
  );
}

export function Loading() {
  return <div className="mx-auto my-10 size-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />;
}

/** Pad content inside <Screen wide> (bands/rows are full-bleed, text isn't). */
export function Pad({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`px-5 ${className}`}>{children}</div>;
}

/** Small device-only labels for things the contracts don't store (chore titles, jar names). */
export function getMeta<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
export const setMeta = (key: string, v: unknown) => localStorage.setItem(key, JSON.stringify(v));

// Stored as `{name, emoji}` for old entries; `emoji` now holds an ICON key. Old emoji values fall back to "jars".
export const jarKey = (id: bigint | string) => `kin.jar.${id}`;
export function jarMeta(id: bigint): { name: string; icon: IconName } {
  const m = getMeta<{ name?: string; emoji?: string }>(jarKey(id));
  return { name: m?.name ?? "Savings jar", icon: m?.emoji && m.emoji in ICON ? (m.emoji as IconName) : "jars" };
}
