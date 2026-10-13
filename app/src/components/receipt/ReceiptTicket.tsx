"use client";
// The receipt as a paper ticket feeding out of a printer slot (details/Proof.tsx, /demo).
// Real HTML (selectable, copy buttons work); the slot is drawn over the paper and the feed window clips at
// the slot, so the paper seems to come out of it. Print motion = CSS (`kt-*` in globals.css); pull down to
// tear it off and close (useTearOff).
import { ArrowUpRight, ChevronsDown, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { Address } from "viem";
import type { Look } from "@/components/kinko/Kinko";
import { MyKinko } from "@/components/kinko/PersonKinko";
import { Ico, Screen } from "@/components/ui";
import { CATEGORIES, type Category } from "@/lib/categories";
import { formatMoney, getCurrency } from "@/lib/money";
import { warmCard, type CardParams } from "@/lib/shareCard";
import { CountUp, money as moneyAt, Ticks } from "./motion";
import { READY_MS, useTearOff } from "./useTearOff";

export type Receipt = { explorer: string; amount: bigint; from: string; to: string; fromA?: Address; toA?: Address; out: boolean; at: Date; block: bigint; ok: boolean };

/** Friendly short receipt number: "A1B2C3…9F0E". */
export const paymentId = (h: string) => `${h.slice(2, 8)}…${h.slice(-4)}`.toUpperCase();

export type ReceiptTicketProps = {
  hash: string;
  r: Receipt;
  ms?: number;
  /** Saved note (this phone only); empty = none yet. */
  note?: string;
  /** Called with the note when the screen is left (back, tear, tab closed). Proof: setNote(hash, note). */
  onNote?: (note: string) => void;
  /** Sent payments: category (this phone only), editable on the paper. */
  cat?: Category | null;
  onCategory?: (c: Category) => void;
  /** My Kinko look, drawn on the shared image (part of the card URL, so the warmed picture is the one shared). */
  look?: Look;
  /** Share, after the person picks Image or Text. Image: `card` set → Proof: shareCard(card, text).
   *  Text: no `card` → Proof: share(text). */
  onShare?: (text: string, card?: CardParams) => Promise<string>;
  /** Torn off: leave the screen (Proof: back to `fresh ? "/home" : "/activity"`). */
  onTear: () => void;
  /** Back target. Proof: `fresh ? "/home" : "/activity"`. */
  back?: string;
};

/** Bars from the receipt number: same receipt, same barcode. Decoration only. */
export function Barcode({ hash }: { hash: string }) {
  let x = 0;
  const bars = [...hash.slice(2)].map((ch, i) => {
    const c = parseInt(ch, 16);
    const w = 1 + ((c + i * 7) % 3);
    const bar = { x, w };
    x += w + 1 + ((c * 3 + i) % 2);
    return bar;
  });
  return (
    <svg aria-hidden viewBox={`0 0 ${x} 10`} preserveAspectRatio="none" className="h-12 w-full">
      {bars.map((b, i) => <rect key={i} x={b.x} width={b.w} height={10} fill="currentColor" />)}
    </svg>
  );
}

/** Who this is: @name, or the short account for someone not on Kin. Tap to copy (@name / full account). */
export function Who({ label, who, a }: { label: string; who: string; a?: Address }) {
  const [done, setDone] = useState(false);
  const text = who.startsWith("0x") ? a ?? who : who;
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-2">
      <span className="kt-label">{label}</span>
      <button
        aria-label={who.startsWith("@") ? `Copy name ${who}` : "Copy account for someone not on Kin"}
        onClick={() => navigator.clipboard.writeText(text).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
        className="flex min-h-11 min-w-0 max-w-full flex-col items-center rounded-xl px-2 active:scale-95"
      >
        <span className="max-w-full truncate text-lg font-bold">{who}</span>
        <span className="font-mono text-[11px] text-[var(--kt-muted)]">{done ? "Copied ✓" : who.startsWith("0x") ? "Not on Kin · tap to copy" : "Tap to copy"}</span>
      </button>
    </div>
  );
}

/** Copies the full payment ID (what the public explorer searches by). */
export function CopyId({ hash }: { hash: string }) {
  const [done, setDone] = useState(false);
  return (
    <button aria-label="Copy full payment ID"
      onClick={() => navigator.clipboard.writeText(hash).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
      className="kt-pill flex h-11 items-center gap-1 whitespace-nowrap rounded-full px-2 font-mono text-xs active:scale-95">
      {done ? "Copied" : "Copy ID"} <Ico name={done ? "check" : "copy"} size={14} />
    </button>
  );
}

const Dash = () => <hr aria-hidden className="kt-dash" />;

export function ReceiptTicket({ hash, r, ms = 0, note = "", onNote, cat, onCategory, look, onShare, onTear, back = "/home" }: ReceiptTicketProps) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note);
  // Save on the way out: unmount covers back + tear (onTear navigates), pagehide covers closing the tab.
  const latest = useRef({ text, onNote });
  useEffect(() => {
    latest.current = { text, onNote };
  });
  useEffect(() => {
    const save = () => latest.current.onNote?.(latest.current.text.trim());
    addEventListener("pagehide", save);
    return () => (removeEventListener("pagehide", save), save());
  }, []);
  const [landed, setLanded] = useState(false);
  const [pulled, setPulled] = useState(false);
  const printer = useRef<HTMLDivElement>(null);
  const how = useId();
  useTearOff(printer, onTear, () => setPulled(true));
  useEffect(() => {
    const t = setTimeout(() => setLanded(true), matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : READY_MS + 250);
    return () => clearTimeout(t);
  }, []);
  const [cardCopied, setCardCopied] = useState(false);
  const money = formatMoney(r.amount);
  const other = r.out ? r.to : r.from;
  const secs = ms > 0 ? (ms / 1000).toFixed(1) : null;
  const day = r.at.toLocaleDateString(undefined, { dateStyle: "medium" });
  const offset = new Intl.DateTimeFormat(undefined, { timeZoneName: "shortOffset" }).formatToParts(r.at).find((p) => p.type === "timeZoneName")?.value;
  const time = `${r.at.toLocaleTimeString(undefined, { timeStyle: "short" })}${offset ? ` (${offset})` : ""}`;

  // Share: pick Image (the whole receipt as a picture, with the text) or Text (just the message + links).
  const sheet = useRef<HTMLDialogElement>(null);
  const shareParts = () => {
    // Invite = plain link carrying my @name as ref (lib/kinko stores ?ref= on "/" for the invite reward).
    const me = r.out ? r.from : r.to;
    const join = me.startsWith("@") ? `${location.origin}/?ref=${encodeURIComponent(me.slice(1))}` : location.origin;
    const msg = `${r.out ? `Paid ${money} to ${other}` : `Got ${money} from ${other}`} with Kin. Delivered ✓\nCheck it: ${r.explorer}/tx/${hash}\n${join}`;
    const card = receiptCard({ hash, r, ms, note: text.trim(), cat: r.out ? cat?.id : undefined, when: `${day} · ${time}`, look });
    return { msg, card };
  };
  function openShare() {
    warmCard(shareParts().card); // fetch the picture now, so the share sheet still opens on the next tap
    sheet.current?.showModal();
  }
  async function shareAs(image: boolean) {
    const { msg, card } = shareParts();
    sheet.current?.close();
    if ((await onShare?.(msg, image ? card : undefined)) !== "copied") return;
    setCardCopied(true);
    setTimeout(() => setCardCopied(false), 1500);
  }

  return (
    <Screen wide back={back} title="Receipt">
      <div ref={printer} className="kt-printer px-4">
        <div aria-hidden className="kt-slot" />
        <div className="kt-feed">
          <div className="kt-paper" role="group" tabIndex={0} aria-label="Receipt" aria-describedby={how}>
            <div aria-hidden className="kt-shadow" />
            <div aria-hidden className="kt-lead" />
            <article className="kt-sheet flex flex-col items-center gap-4 px-5 pb-10 pt-9 text-center" aria-label="Payment receipt">
              <div className="relative">
                <MyKinko mood="celebrate" size={56} />
                <span className="absolute -bottom-1 -right-3 grid size-8 place-items-center rounded-full border-2 border-[var(--kt-paper)] bg-[var(--kt-good)] text-white">
                  <Ico name="check" size={16} />
                </span>
              </div>
              <h2 className="font-mono text-base font-bold tracking-[0.25em]">{r.out ? "PAYMENT RECEIPT" : "MONEY RECEIVED"}</h2>

              <Dash />
              <div className="flex flex-col items-center gap-2">
                <span className="kt-label">{r.out ? "AMOUNT PAID" : "AMOUNT RECEIVED"}</span>
                <span className="flex items-baseline gap-1.5">
                  <span className="text-5xl font-bold tracking-tight tabular-nums">
                    {/* Counts up as this line comes out of the slot (~0.8 s into the feed). */}
                    <CountUp value={Number(r.amount)} format={moneyAt} delay={780} ms={420} />
                  </span>
                  <span className="font-mono text-sm font-bold text-[var(--kt-muted)]">{getCurrency()}</span>
                </span>
                <span className="kt-ok flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold">
                  {secs ? `Delivered in ${secs}s` : "Delivered"} <Ticks />
                </span>
              </div>

              {/* What it was for: category (sent only, tap to change) + a note you can edit. Both live on this phone only. */}
              <Dash />
              <div className="flex w-full flex-col items-center gap-2">
                <span className="kt-label">FOR</span>
                {r.out && cat && (
                  <button onClick={() => setEditing((e) => !e)} aria-expanded={editing}
                    className="kt-pill flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition-transform active:scale-95">
                    <span key={cat.id} className="kt-swap flex items-center gap-1.5"><Ico name={cat.icon} size={16} /> {cat.label}</span>
                    <span className="text-xs text-[var(--kt-muted)]">{editing ? "Done" : "Change"}</span>
                  </button>
                )}
                {r.out && cat && (
                  // Always mounted: height + chips animate in and out (kt-cats in globals.css), inert while closed.
                  <div className="kt-cats" data-open={editing} inert={!editing}>
                    <div className="flex min-h-0 flex-wrap justify-center gap-1.5 overflow-hidden px-1 py-1" role="radiogroup" aria-label="Category">
                      {CATEGORIES.map((c, i) => (
                        <button key={c.id} role="radio" aria-checked={cat.id === c.id} style={{ "--i": i } as React.CSSProperties}
                          onClick={() => (onCategory?.(c), setTimeout(() => setEditing(false), 220))}
                          className="kt-cat flex h-9 items-center gap-1 rounded-full px-3 text-xs font-semibold">
                          <Ico name={c.icon} size={14} /> {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {/* Wraps and grows with the text (field-sizing; rows=1 fallback scrolls). Enter = done, no new lines. */}
                <textarea value={text} rows={1} maxLength={200} aria-label="Note" placeholder="Add a note"
                  onChange={(e) => setText(e.target.value.replace(/\n/g, " "))}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), e.currentTarget.blur())}
                  className="kt-note w-full max-w-72 resize-none break-words rounded-xl bg-transparent px-2 py-2.5 text-center font-mono text-sm leading-snug text-[var(--kt-ink)] outline-none placeholder:text-[var(--kt-muted)]" />
                {text.length > 160 && <span className="font-mono text-[11px] text-[var(--kt-muted)]" aria-live="polite">{200 - text.length} left</span>}
              </div>

              <Dash />
              <div className="kt-cols grid w-full grid-cols-2">
                <Who label="TO" who={r.to} a={r.toA} />
                <Who label="FROM" who={r.from} a={r.fromA} />
              </div>

              <Dash />
              {/* Top row: speed + fee (fee alone when opened later). Bottom row: date & time, full width. */}
              <dl className={`grid w-full gap-x-2 gap-y-4 ${secs ? "grid-cols-2" : "grid-cols-1"}`}>
                {secs && <div className="flex flex-col gap-1"><dt className="kt-label">SPEED</dt><dd className="font-mono text-sm font-bold">{secs}s</dd></div>}
                <div className="flex flex-col gap-1"><dt className="kt-label">FEE</dt><dd className="font-mono text-sm font-bold">{formatMoney(0n)}</dd></div>
                <div className="col-span-full flex flex-col gap-1"><dt className="kt-label">DATE &amp; TIME</dt><dd className="font-mono text-sm font-bold">{day} · {time}</dd></div>
              </dl>

              <Dash />
              <div className="flex w-full flex-col items-center gap-1">
                <span className="kt-label">PAYMENT ID</span>
                <span className="font-mono text-sm font-bold tracking-wider">{paymentId(hash)}</span>
                <Barcode hash={hash} />
                <div className="mt-2 grid w-full grid-cols-3 gap-1.5 [&>*]:justify-center">
                  <CopyId hash={hash} />
                  <a href={`${r.explorer}/tx/${hash}`} target="_blank" rel="noreferrer" aria-label="Verify this payment on the public explorer"
                    className="kt-pill flex h-11 items-center gap-1 whitespace-nowrap rounded-full px-2 font-mono text-xs active:scale-95">
                    Verify <ArrowUpRight size={14} aria-hidden />
                  </a>
                  {onShare && (
                    <button onClick={openShare} aria-haspopup="dialog" className="kt-pill flex h-11 items-center gap-1 whitespace-nowrap rounded-full px-2 font-mono text-xs active:scale-95">
                      {cardCopied ? "Copied" : "Share"} <Ico name={cardCopied ? "check" : "share"} size={14} />
                    </button>
                  )}
                </div>
              </div>
            </article>
          </div>
          <div aria-hidden className="kt-perf" />
          <div aria-hidden className="kt-stub" />
          <span aria-hidden data-on={landed && !pulled} className="kt-hint">
            Pull down to tear off <ChevronsDown size={12} strokeWidth={2.5} />
          </span>
        </div>
        <p id={how} className="sr-only">Pull the receipt down to tear it off and close it, or press Enter.</p>
      </div>


      {/* Share sheet: native modal (Esc + tap outside close it, focus stays inside). */}
      <dialog ref={sheet} aria-label="Share receipt" onClick={(e) => e.target === e.currentTarget && e.currentTarget.close()}
        className="mx-auto mb-0 mt-auto w-full max-w-md bg-transparent p-0 text-ink backdrop:bg-black/50">
        <div className="kin-rise flex flex-col gap-2 rounded-t-[28px] bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <h2 className="mb-1 text-center font-semibold">Share receipt</h2>
          <button onClick={() => shareAs(true)} className="flex h-16 items-center gap-3 rounded-2xl bg-surface-2 px-4 text-left active:scale-[0.98]">
            <ImageIcon size={22} aria-hidden />
            <span className="flex flex-col"><span className="font-semibold">Image</span><span className="text-sm text-muted">A picture of the whole receipt</span></span>
          </button>
          <button onClick={() => shareAs(false)} className="flex h-16 items-center gap-3 rounded-2xl bg-surface-2 px-4 text-left active:scale-[0.98]">
            <Ico name="chat" size={22} />
            <span className="flex flex-col"><span className="font-semibold">Text</span><span className="text-sm text-muted">A short message with the links</span></span>
          </button>
          <button onClick={() => sheet.current?.close()} className="mt-1 h-12 rounded-full font-semibold text-muted active:bg-surface-2">Cancel</button>
        </div>
      </dialog>

      {/* Proof: a quiet note, not a card. The explorer + full ID live on the ticket's Payment ID. */}
      <p className="kin-rise mt-2 px-6 text-xs text-muted [animation-delay:1450ms]">
        Every Kin payment is recorded on the Monad public blockchain, so anyone can check it happened. Settled in dollars (AUSD), no fees. Block {r.block.toString()}.
      </p>
    </Screen>
  );
}

/** The empty printer with a message under it: loading, not found, didn't go through. */
function EmptySlot({ back, busy, children }: { back: string; busy?: boolean; children: React.ReactNode }) {
  return (
    <Screen wide back={back} title="Receipt">
      <div className="kt-printer px-4" aria-busy={busy}>
        <div aria-hidden className="kt-slot" />
        <div className="kin-rise flex flex-col items-center gap-3 px-4 pt-10 text-center text-muted">{children}</div>
      </div>
    </Screen>
  );
}

/** While the payment loads: the empty slot and "Printing receipt in a sec". Then render ReceiptTicket (it prints). */
export function ReceiptTicketLoading({ back = "/home" }: { back?: string }) {
  return (
    <EmptySlot back={back} busy>
      <span aria-hidden className="inline-block size-7 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span className="font-mono text-sm" role="status">Printing receipt in a sec</span>
    </EmptySlot>
  );
}

/** No payment with this ID: nothing to print. */
export function ReceiptTicketMissing({ back = "/activity" }: { back?: string }) {
  return (
    <EmptySlot back={back}>
      <span className="font-mono text-sm font-bold tracking-[0.2em] text-ink">RECEIPT NOT FOUND</span>
      <span className="text-sm">We couldn&apos;t find this receipt. Your money is safe.</span>
    </EmptySlot>
  );
}

/** The payment didn't go through: no receipt, money not moved; Try again reopens Pay with the same person + amount. */
export function ReceiptTicketFailed({ r, note = "", back = "/home" }: { r: Receipt; note?: string; back?: string }) {
  const to = r.to.startsWith("@") ? r.to.slice(1) : r.toA;
  const again = to ? `/send?${new URLSearchParams({ to, amt: r.amount.toString(), ...(note ? { note } : {}) })}` : "/send";
  return (
    <EmptySlot back={back}>
      <span className="kin-shake grid size-14 place-items-center rounded-full bg-bad/15 text-2xl font-bold text-bad" aria-hidden>!</span>
      <span className="font-mono text-sm font-bold tracking-[0.2em] text-ink">DIDN&apos;T GO THROUGH</span>
      <span className="text-sm">Money not moved. Nothing left your balance.</span>
      {/* A reverted payment moved nothing, so its amount may be unknown (0): then skip the line. */}
      {r.amount > 0n && (
        <span className="mt-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink">
          Sending <b>{formatMoney(r.amount)}</b> to <b>{r.to}</b>
        </span>
      )}
      <Link href={again} className="mt-4 grid h-14 w-full place-items-center rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">
        Try again
      </Link>
    </EmptySlot>
  );
}

/** Share-card params for the whole receipt (app/api/card kind "receipt"). Names go without "@"; short accounts as shown. */
export function receiptCard({ hash, r, ms = 0, note, cat, when, look }: { hash: string; r: Receipt; ms?: number; note?: string; cat?: string; when: string; look?: Look }): CardParams {
  const name = (s: string) => (s.startsWith("@") ? s.slice(1) : s.toLowerCase());
  return {
    kind: "receipt", dir: r.out ? "out" : "in", amount: r.amount, to: name(r.to), from: name(r.from),
    secs: ms > 0 && ms < 60_000 ? (ms / 1000).toFixed(1) : undefined, note: note || undefined, cat, when, id: hash, look,
  };
}
