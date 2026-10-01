"use client";
import { type ReactNode } from "react";
import { useRequireAccount } from "@/lib/account";
import { useCurrencySymbol } from "@/lib/useCurrencySymbol";
import { Avatar, Band, Row } from "../ui";

/** Unlocked-only screens: bounce to welcome when there is no saved account. */
export const useSignedIn = () => useRequireAccount().profile;

/** Huge serif local-currency amount input. `value` is the typed local amount ("50.5"). */
export function AmountInput({ value, onChange, label = "Amount", hint }: { value: string; onChange: (v: string) => void; label?: string; hint?: ReactNode }) {
  const symbol = useCurrencySymbol();
  return (
    <label className="flex flex-col items-center gap-2 py-2">
      <span className="text-sm font-medium text-muted">{label}</span>
      <span className="flex max-w-full items-baseline justify-center font-display leading-none">
        <span className="text-5xl text-muted">{symbol}</span>
        <input
          className="tabular min-w-0 bg-transparent text-center text-7xl text-ink outline-none placeholder:text-muted/50"
          style={{ width: `${Math.max(1, value.length) + 0.5}ch` }}
          inputMode="decimal"
          placeholder="0"
          aria-label={label}
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(",", ".");
            if (/^\d{0,9}(\.\d{0,2})?$/.test(v)) onChange(v);
          }}
        />
      </span>
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </label>
  );
}

/** Chat bubble for a money request. `mine` = I asked (right, brand); otherwise left, neutral. */
export function Bubble({ mine, amount, note, children }: { mine?: boolean; amount: string; note?: string; children?: ReactNode }) {
  return (
    <div className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
      <div className={`max-w-[85%] rounded-[28px] px-5 py-4 ${mine ? "rounded-br-lg bg-brand text-brand-ink" : "rounded-bl-lg border border-line bg-surface"}`}>
        <p className="font-display tabular text-4xl leading-none">{amount}</p>
        {note && <p className="mt-2 text-base leading-snug">{note}</p>}
      </div>
      {children}
    </div>
  );
}

/** Tappable person row, full-bleed (use inside <Screen wide>). */
export function PersonRow({ name, sub, href, action }: { name: string; sub?: string; href?: string; action?: ReactNode }) {
  return (
    <li className="flex items-center pr-5">
      <span className="min-w-0 flex-1">
        <Row icon={<Avatar name={name} />} title={name} sub={sub} href={href} />
      </span>
      {action}
    </li>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col">
      <Band>{title}</Band>
      <ul className="flex flex-col py-1">{children}</ul>
    </section>
  );
}

export function SkeletonRows({ n = 3 }: { n?: number }) {
  return (
    <ul className="flex flex-col gap-4 py-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <li key={i} className="flex items-center gap-4">
          <span className="size-11 animate-pulse rounded-full bg-surface-2" />
          <span className="h-4 w-40 animate-pulse rounded-full bg-surface-2" />
        </li>
      ))}
    </ul>
  );
}
