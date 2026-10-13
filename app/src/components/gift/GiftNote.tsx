"use client";
// The gift note (paper, three 110 px rows that fold), the box parts and the confetti. Shared by the send screen
// (GiftWrap), the arrival (GiftReveal) and /demo. Motion: kd-gift / kd-open in globals.css.
import type { CSSProperties } from "react";
import { Ico } from "@/components/ui";
import { formatMoney, fromLocal } from "@/lib/money";
import { useCurrencySymbol } from "@/lib/useCurrencySymbol";

export type GiftMode = "name" | "link";
/** What's on the note. amount = local-currency text as typed ("40", "12.5") or exact units (a received gift);
 *  to = Kin name without "@" ("" = you). */
export type GiftDraft = { mode: GiftMode; to: string; amount: string | bigint; msg: string; from: string };
export const MAX_MSG = 120;

// Message shrinks as it grows so 120 chars still fit its 110 px row: 20 px → 14 px.
const msgSize = (n: number) => `${Math.max(14, Math.min(20, 22 - n * 0.07))}px`;
const bare = "bg-transparent text-center outline-none placeholder:text-[var(--kt-muted)]";
/** Amount text → what the folded note shows. */
export const noteMoney = (amount: string | bigint) => formatMoney(typeof amount === "bigint" ? amount : Number(amount) > 0 ? fromLocal(amount) : 0n);

type Edit = { set?: (p: Partial<GiftDraft>) => void; onTo?: (focus: boolean) => void };

/** Each panel shows one row, so only that row (`live`) gets the real inputs; the other two copies are clipped and static. */
function NoteFace({ d, set, live, onTo }: { d: GiftDraft; live?: number } & Edit) {
  const symbol = useCurrencySymbol();
  const edit = (row: number) => !!set && live === row;
  return (
    <div className="flex h-[330px] flex-col text-center text-[var(--kt-ink)]">
      <div className="flex h-[110px] flex-col items-center justify-center gap-1 px-6">
        <span className="kt-pill grid size-9 place-items-center rounded-lg"><Ico name="gift" size={18} /></span>
        <span className="kt-label">A GIFT FOR</span>
        {d.mode === "link" ? <span className="text-xl font-bold leading-none">Whoever accepts it</span>
          : edit(0) ? (
            <input aria-label="Who is it for?" className={`${bare} w-full text-xl font-bold leading-none`} placeholder="@name" autoComplete="off" autoCapitalize="none" autoCorrect="off"
              value={d.to ? `@${d.to}` : ""} onChange={(e) => set!({ to: e.target.value.replace(/[^a-z0-9_]/gi, "").toLowerCase() })}
              onFocus={() => onTo?.(true)} onBlur={() => onTo?.(false)} />
          ) : <span className="text-xl font-bold leading-none">{d.to ? `@${d.to}` : "You"}</span>}
      </div>
      <div className="flex h-[110px] items-center justify-center text-5xl font-bold tabular-nums leading-none">
        {edit(1) ? (
          <label className="flex items-baseline"><span className="text-[var(--kt-muted)]">{symbol}</span>
            <input aria-label="Amount" inputMode="decimal" placeholder="0" className={`${bare} field-sizing-content min-w-[1ch] max-w-48`}
              value={String(d.amount)} onChange={(e) => set!({ amount: e.target.value.replace(/[^\d.]/g, "") })} />
          </label>
        ) : noteMoney(d.amount)}
      </div>
      <div className="flex h-[110px] flex-col items-center justify-center gap-1 px-6">
        {edit(2) ? (
          <textarea aria-label="Message (optional)" maxLength={MAX_MSG} rows={1} placeholder="Add a message" style={{ fontSize: msgSize(d.msg.length) }}
            className={`${bare} field-sizing-content w-full resize-none font-display leading-snug`} value={d.msg} onChange={(e) => set!({ msg: e.target.value })} />
        ) : d.msg && <p className="font-display leading-snug" style={{ fontSize: msgSize(d.msg.length) }}>&ldquo;{d.msg}&rdquo;</p>}
        {d.from && <span className="font-mono text-xs text-[var(--kt-muted)]">from @{d.from}</span>}
      </div>
    </div>
  );
}

function Panel({ k, d, set, onTo }: { k: 0 | 1 | 2; d: GiftDraft } & Edit) {
  return (
    <div className={`kd-panel kd-p${k}`}>
      <div className="kd-face kd-sheet-flat"><div style={{ marginTop: -110 * k }}><NoteFace d={d} set={set} live={k} onTo={onTo} /></div><span className="kd-shade" /></div>
      {k !== 1 && (
        <div className="kd-face kd-face-back kd-sheet-flat" aria-hidden>
          {k === 0 && <span className="font-display text-2xl text-[var(--kt-ink)]">For {d.mode === "link" || !d.to ? "you" : `@${d.to}`}</span>}
        </div>
      )}
    </div>
  );
}

/** The note itself: folded whenever the parent `.kd-gift` isn't data-phase="note". `set` = editable (the form). */
export function Note({ d, set, onTo, label }: { d: GiftDraft; label: string } & Edit) {
  return (
    <div className="kd-note" role={set ? "group" : "img"} aria-label={label}>
      <span aria-hidden className="kd-note-shadow" />
      {([0, 1, 2] as const).map((k) => <Panel key={k} k={k} d={d} set={set} onTo={onTo} />)}
    </div>
  );
}

export const Ribbon = () => <span aria-hidden className="kd-ribbon" />;
export const Bow = () => (
  <svg aria-hidden viewBox="0 0 80 44" className="kd-bow">
    <path d="M40 30 C26 4 4 6 8 24 C10 34 26 34 40 30 Z" />
    <path d="M40 30 C54 4 76 6 72 24 C70 34 54 34 40 30 Z" />
    <path d="M37 30 L28 44 M43 30 L52 44" strokeWidth="5" strokeLinecap="round" fill="none" />
    <circle cx="40" cy="29" r="6" />
  </svg>
);

// Burst from the box top (same spread as Celebrate's, no Math.random in render).
const CONFETTI = ["var(--fun-2)", "var(--fun-4)", "var(--fun-5)", "var(--fun-3)", "var(--fun-1)"];
export const BITS = Array.from({ length: 26 }, (_, i) => {
  const a = Math.PI + (i / 25) * Math.PI, d = 110 + ((i * 53) % 90); // upper half-circle
  return { "--dx": `${Math.round(Math.cos(a) * d)}px`, "--dy": `${Math.round(Math.sin(a) * d)}px`, "--r": `${(i * 71) % 360}deg`,
    background: CONFETTI[i % CONFETTI.length], width: i % 2 ? 7 : 6, height: i % 2 ? 7 : 14, borderRadius: i % 2 ? 99 : 2 } as CSSProperties;
});

export const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
