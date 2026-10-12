"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PayQr } from "@/components/core/PayQr";
import { useSignedIn } from "@/components/social/bits";
import { Button, Card, Delivered, ErrorText, Field, Ico, Screen, inputClass } from "@/components/ui";
import { MONAD_USDC, SOURCES, type AddQuote, type AddStatus } from "@/lib/addMoney";
import { networks } from "@/lib/chain";
import { erc20Abi } from "viem";
import { convertToDollars } from "@/lib/offramp";
import { humanError } from "@/lib/errors";
import type { IconName } from "@/lib/icons";
import { useMode } from "@/lib/mode";
import { formatMoney } from "@/lib/money";

// Add money from another account: pick where the money is → one-time code to send to (Aurora Intents) → it lands in
// the user's own Kin account → one tap turns it into dollars. Real money only (Aurora runs on mainnet).
// Source labels ("USDC on Base") are names people see in their other apps, so they stay as-is.

type Pending = { q: AddQuote; source: string };
type Live = { status: AddStatus; amountOut: string | null };
const KEY = "kin.add"; // sessionStorage: depositAddress + quote only, so a reload resumes. No keys.

const ticker = (label: string) => label.split(" on ")[0];
const about = (s: number) => (s < 90 ? `about ${Math.max(10, Math.round(s / 10) * 10)} seconds` : `about ${Math.round(s / 60)} minutes`);

const QUOTE_ERRORS: Record<string, string> = {
  "not connected": "Adding money this way is resting right now. Try again soon.",
  "no quote": "Couldn't get a price for that right now. Try another amount.",
  invalid: "Check the amount and try again.",
  "refund address": "That Solana account doesn't look right. Check it and try again.",
  busy: "Couldn't reach our partner. Your money is safe — try again.",
  "slow down": "Too many tries. Wait a minute, then try again.",
};

export default function AddMoney() {
  const mode = useMode();
  return <Screen title="Add money" back="/money">{mode === "main" ? <Add /> : <PracticeNote />}</Screen>;
}

function PracticeNote() {
  return (
    <Card className="flex flex-col gap-3">
      <p>Adding money from another account works with real money. Turn on Real money in Me → Money.</p>
      <Link href="/me" className="flex min-h-11 items-center font-semibold text-brand">Go to Me</Link>
    </Card>
  );
}

function Add() {
  const [pending, setPending] = useState<Pending | null>(null);

  // Resume an in-progress add after a reload.
  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of browser-only storage
      if (saved) setPending(JSON.parse(saved));
    } catch {}
  }, []);

  function start(p: Pending | null) {
    try {
      if (p) sessionStorage.setItem(KEY, JSON.stringify(p));
      else sessionStorage.removeItem(KEY);
    } catch {}
    setPending(p);
  }

  return pending ? <Tracking p={pending} onReset={() => start(null)} /> : <><Waiting /><Form onQuote={start} /></>;
}

/** Money that already arrived in the user's account but isn't dollars yet (e.g. the screen was closed before the
 *  last tap) → one tap turns all of it into dollars. */
function Waiting() {
  const me = useSignedIn()?.address;
  const [units, setUnits] = useState(0n);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<{ hash: string; ausdOut: bigint } | null>(null);

  useEffect(() => {
    if (!me) return;
    networks.main.client
      .readContract({ address: MONAD_USDC, abi: erc20Abi, functionName: "balanceOf", args: [me] })
      .then(setUnits)
      .catch(() => {});
  }, [me, done]);

  async function convert() {
    setBusy(true);
    setErr("");
    try {
      setDone(await convertToDollars(units));
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  if (done)
    return (
      <Card className="mb-4 flex flex-col gap-2 text-center">
        <p className="font-display text-2xl">{formatMoney(done.ausdOut)} added</p>
        <Link href={`/details?tx=${done.hash}`} className="text-sm font-semibold text-brand">Proof of payment</Link>
      </Card>
    );
  if (units < 10_000n) return null; // under a cent: not worth a tap
  return (
    <Card className="mb-4 flex flex-col gap-3">
      <p className="font-semibold">{formatMoney(units)} arrived and is waiting</p>
      <p className="text-sm text-muted">Add it to your balance to send or spend it.</p>
      <Button onClick={convert} busy={busy} disabled={busy}>Add {formatMoney(units)} to your balance</Button>
      <ErrorText>{err}</ErrorText>
    </Card>
  );
}

function Form({ onQuote }: { onQuote: (p: Pending) => void }) {
  const me = useSignedIn()?.address;
  const [source, setSource] = useState(SOURCES[0].id);
  const [amount, setAmount] = useState("");
  const [refundTo, setRefundTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const src = SOURCES.find((s) => s.id === source)!;
  const coin = ticker(src.label);
  const ok = Number(amount) > 0 && (src.evm || refundTo.trim().length >= 32);

  async function submit() {
    if (!me || !ok) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/addmoney", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, amount, address: me, refundTo: src.evm ? undefined : refundTo.trim() }),
      });
      const j = await res.json();
      if (j.depositAddress) return onQuote({ q: j as AddQuote, source });
      setErr(j.error === "too little" && j.min ? `Add at least ${j.min} ${coin}.` : QUOTE_ERRORS[j.error] ?? "Something went wrong. Your money is safe.");
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Field label="Where is the money now?">
        <div role="radiogroup" className="grid grid-cols-2 gap-2">
          {SOURCES.map((s) => (
            <button key={s.id} type="button" role="radio" aria-checked={s.id === source}
              onClick={() => (setSource(s.id), setErr(""))}
              className={`min-h-12 rounded-2xl border px-3 text-left text-sm font-semibold transition active:scale-[0.98] ${
                s.id === source ? "border-brand bg-brand-soft text-ink" : "border-line bg-surface text-ink"
              }`}>
              {s.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label={`How much ${coin}?`}>
        <div className="relative">
          <input className={`${inputClass} pr-20 tabular`} inputMode="decimal" placeholder="0" value={amount}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (!new RegExp(`^\\d{0,7}(\\.\\d{0,${src.decimals}})?$`).test(v)) return;
              setAmount(v);
              setErr("");
            }} />
          <span className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center font-semibold text-muted">{coin}</span>
        </div>
      </Field>

      {!src.evm && (
        <Field label="Your Solana account, for refunds" hint="If anything goes wrong, the money goes back here.">
          <input className={`${inputClass} font-mono text-sm`} autoComplete="off" spellCheck={false} placeholder="Paste from your Solana app"
            value={refundTo} onChange={(e) => (setRefundTo(e.target.value), setErr(""))} />
        </Field>
      )}

      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button onClick={submit} busy={busy} disabled={!ok || busy}>Continue</Button>
        {busy && <p className="mt-3 text-center text-sm text-muted">Getting today&apos;s price…</p>}
      </div>
    </>
  );
}

type StepState = "todo" | "doing" | "done";
const ORDER: AddStatus[] = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS"];

function Tracking({ p, onReset }: { p: Pending; onReset: () => void }) {
  const { q } = p;
  const coin = ticker(SOURCES.find((s) => s.id === p.source)?.label ?? "");
  const [live, setLive] = useState<Live>({ status: "PENDING_DEPOSIT", amountOut: null });
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState<"" | "code" | "amount">("");
  const [converting, setConverting] = useState(false);
  const [done, setDone] = useState<{ hash: string; ausdOut: bigint } | null>(null);
  const [err, setErr] = useState("");
  const final = live.status === "SUCCESS" || live.status === "REFUNDED" || live.status === "FAILED";

  // Poll every 4s until it arrives or comes back.
  useEffect(() => {
    if (final) return;
    let on = true;
    const tick = () =>
      fetch(`/api/addmoney?depositAddress=${encodeURIComponent(q.depositAddress)}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: Partial<Live>) => on && j.status && setLive({ status: j.status, amountOut: j.amountOut ?? null }))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 4000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [q.depositAddress, final]);

  const waiting = live.status === "PENDING_DEPOSIT";
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [waiting]);

  const out = BigInt(live.amountOut ?? q.amountOut);
  const left = Math.max(0, Math.floor((Date.parse(q.deadline) - now) / 1000));
  const expired = waiting && left === 0;

  async function copy(text: string, what: "code" | "amount") {
    await navigator.clipboard?.writeText(text).then(() => setCopied(what), () => {});
  }

  async function convert() {
    setConverting(true);
    setErr("");
    try {
      const r = await convertToDollars(out);
      try {
        sessionStorage.removeItem(KEY);
      } catch {}
      setDone(r);
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setConverting(false);
    }
  }

  if (done)
    return (
      <>
        <Delivered title={`${formatMoney(done.ausdOut)} added`} subtitle="It's in your balance, ready to send">
          <Link href={`/details?tx=${done.hash}`} className="block text-center text-sm font-semibold text-brand">Proof of payment</Link>
        </Delivered>
        <div className="mt-auto pt-2">
          <Link href="/send" className="grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">Send money</Link>
        </div>
      </>
    );

  if (live.status === "REFUNDED" || live.status === "FAILED")
    return (
      <>
        <Card className="flex flex-col gap-2 text-center">
          <p className="font-display text-2xl">{live.status === "REFUNDED" ? "Sent back to you" : "This one didn't go through"}</p>
          <p className="text-sm text-muted">
            {live.status === "REFUNDED" ? `Your ${coin} is back where it came from.` : "If you sent money, it comes back to you automatically. Your money is safe."}
          </p>
        </Card>
        <div className="mt-auto pt-2">
          <Button onClick={onReset}>Try again</Button>
        </div>
      </>
    );

  const at = ORDER.indexOf(live.status === "INCOMPLETE_DEPOSIT" ? "KNOWN_DEPOSIT_TX" : live.status);
  const state = (i: number): StepState => (live.status === "SUCCESS" || at > i ? "done" : at === i ? "doing" : "todo");
  const steps: { icon: IconName; title: string; sub?: string }[] = [
    { icon: "pending", title: "Waiting for your money", sub: waiting ? `Send within ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} or this code expires` : undefined },
    {
      icon: "check",
      title: live.status === "INCOMPLETE_DEPOSIT" ? "Amount didn't match" : "Received",
      sub: live.status === "INCOMPLETE_DEPOSIT" ? "We're sending it back to you" : undefined,
    },
    { icon: "send", title: "On its way", sub: live.status === "PROCESSING" ? `Usually ${about(q.timeEstimate)}` : undefined },
    { icon: "dollar", title: "Arrived", sub: live.status === "SUCCESS" ? `${formatMoney(out)} in your account` : undefined },
  ];

  return (
    <>
      {waiting && !expired && (
        <section className="flex flex-col items-center rounded-[32px] border border-line bg-surface p-6 text-center">
          <p className="text-sm text-muted">Send exactly</p>
          <button type="button" onClick={() => copy(q.amountInFormatted, "amount")} className="min-h-11 rounded-full px-3 active:bg-brand-soft">
            <span className="tabular font-display text-4xl">{q.amountInFormatted} {coin}</span>
          </button>
          <p className="text-sm text-muted">You&apos;ll get about {formatMoney(BigInt(q.amountOut))} · {about(q.timeEstimate)}</p>
          <div className="mt-5 w-full max-w-64 overflow-hidden rounded-3xl">
            <PayQr text={q.depositAddress} label="QR code to send your money here" />
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
          <p className="mt-4 text-sm text-muted">Send exactly this amount from any app or exchange. If anything goes wrong it comes back to you automatically.</p>
        </section>
      )}

      {expired ? (
        <Card className="flex flex-col gap-2 text-center">
          <p className="font-display text-2xl">This code expired</p>
          <p className="text-sm text-muted">Don&apos;t send to it. Start again for a fresh one. If you already sent, it comes back to you automatically.</p>
        </Card>
      ) : (
        <Card className="flex flex-col gap-4" aria-live="polite">
          <ol className="flex flex-col gap-4">
            {steps.map((s, i) => (
              <li key={s.icon} className={`flex items-start gap-3 ${state(i) === "todo" ? "opacity-50" : ""}`}>
                <span className={`grid size-9 shrink-0 place-items-center rounded-full ${state(i) === "done" ? "bg-good text-fun-ink" : "bg-surface-2 text-ink"} ${state(i) === "doing" ? "animate-pulse" : ""}`}>
                  <Ico name={state(i) === "done" ? "check" : s.icon} size={18} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-semibold">{s.title}</span>
                  {s.sub && <span className="tabular text-sm text-muted">{s.sub}</span>}
                </span>
              </li>
            ))}
          </ol>
        </Card>
      )}

      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        {live.status === "SUCCESS" ? (
          <>
            <Button onClick={convert} busy={converting} disabled={converting}>Add {formatMoney(out)} to your balance</Button>
            {converting && <p className="mt-3 text-center text-sm text-muted">Adding it to your balance — a few seconds…</p>}
          </>
        ) : (
          (waiting || expired) && <Button variant="soft" onClick={onReset}>{expired ? "Start again" : "Start over"}</Button>
        )}
      </div>
    </>
  );
}
