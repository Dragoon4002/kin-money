"use client";
import { useEffect, useState } from "react";
import { PayQr } from "@/components/core/PayQr";
import { Ico } from "@/components/ui";
import { SOURCES, chainOf, coinOf, type AddQuote, type AddStatus } from "@/lib/addMoney";
import { formatMoney } from "@/lib/money";

// Shared by Add money (the person asking) and /add/pay (whoever they shared the link with).

export type Live = { status: AddStatus; amountOut: string | null; quote: AddQuote | null; missing?: boolean };

export const isFinal = (s: AddStatus) => s === "SUCCESS" || s === "REFUNDED" || s === "FAILED";
export const about = (s: number) => (s < 90 ? `about ${Math.max(10, Math.round(s / 10) * 10)} seconds` : `about ${Math.round(s / 60)} minutes`);

/** Poll Aurora (via /api/addmoney) every 4 s until the money arrives or comes back. `missing` = Aurora doesn't know it. */
export function useAddStatus(depositAddress: string | null): Live | null {
  const [live, setLive] = useState<Live | null>(null);
  const final = live ? isFinal(live.status) || !!live.missing : false;
  useEffect(() => {
    if (!depositAddress || final) return;
    let on = true;
    const tick = () =>
      fetch(`/api/addmoney?depositAddress=${encodeURIComponent(depositAddress)}`, { cache: "no-store" })
        .then((r) => (r.status === 404 || r.status === 400 ? { missing: true } : r.json()))
        .then((j) => {
          if (!on) return;
          if (j.missing) return setLive({ status: "FAILED", amountOut: null, quote: null, missing: true });
          if (j.status) setLive({ status: j.status, amountOut: j.amountOut ?? null, quote: j.quote ?? null });
        })
        .catch(() => {});
    tick();
    const t = setInterval(tick, 4000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [depositAddress, final]);
  return live;
}

/** Seconds until the deposit code expires, ticking while `on`. */
export function useSecondsLeft(deadline: string | undefined, on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return deadline ? Math.max(0, Math.floor((Date.parse(deadline) - now) / 1000)) : 0;
}

/** Time left, readable at any size: "2 days", "5 h 12 min", "4:09". Codes can live up to ~3 days. */
export function timeLeft(s: number): string {
  if (s >= 2 * 86400) return `${Math.floor(s / 86400)} days`;
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Send exactly 0.040347 ETH on Ethereum" + QR + code + copy buttons. */
export function SendThis({ q, left, children }: { q: AddQuote; left: number; children?: React.ReactNode }) {
  const src = SOURCES.find((s) => s.id === q.source);
  const coin = src ? coinOf(src) : "";
  const [copied, setCopied] = useState<"" | "code" | "amount">("");
  const copy = (text: string, what: "code" | "amount") => navigator.clipboard?.writeText(text).then(() => setCopied(what), () => {});

  return (
    <section className="flex flex-col items-center rounded-[32px] border border-line bg-surface p-6 text-center">
      <p className="text-sm text-muted">Send exactly</p>
      <button type="button" onClick={() => copy(q.amountInFormatted, "amount")} className="min-h-11 rounded-full px-3 active:bg-brand-soft">
        <span className="tabular font-display text-4xl">{q.amountInFormatted} {coin}</span>
      </button>
      {src && <p className="text-sm font-semibold">on {chainOf(src)}</p>}
      <p className="mt-1 text-sm text-muted">Arrives as {formatMoney(BigInt(q.amountOut))} · {about(q.timeEstimate)}</p>
      <div className="mt-5 w-full max-w-64 overflow-hidden rounded-3xl">
        <PayQr text={q.depositAddress} label="QR code to send the money here" />
      </div>
      <p className="mt-4 text-xs text-muted">Send to this code</p>
      <p className="break-all font-mono text-sm">{q.depositAddress}</p>
      <div className="mt-3 grid w-full grid-cols-2 gap-2">
        <button type="button" onClick={() => copy(q.depositAddress, "code")} className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface-2 text-sm font-semibold active:scale-[0.98]">
          <Ico name={copied === "code" ? "check" : "copy"} size={16} />{copied === "code" ? "Copied" : "Copy code"}
        </button>
        <button type="button" onClick={() => copy(q.amountInFormatted, "amount")} className="flex h-12 items-center justify-center gap-2 rounded-full bg-surface-2 text-sm font-semibold active:scale-[0.98]">
          <Ico name={copied === "amount" ? "check" : "copy"} size={16} />{copied === "amount" ? "Copied" : "Copy amount"}
        </button>
      </div>
      <p className="tabular mt-4 text-sm text-muted">Send within {timeLeft(left)} from any app or exchange{src ? ` that holds ${coin} on ${chainOf(src)}` : ""}.</p>
      {children}
    </section>
  );
}
