"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { SendThis, about, timeLeft, useAddStatus, useSecondsLeft } from "@/components/core/PayIn";
import { share } from "@/components/core/share";
import { useSignedIn } from "@/components/social/bits";
import { Button, Card, Delivered, ErrorText, Ico, Screen, inputClass } from "@/components/ui";
import { MONAD_USDC, SOURCES, chainOf, coinOf, type AddQuote, type AddStatus } from "@/lib/addMoney";
import { networks } from "@/lib/chain";
import { erc20Abi } from "viem";
import { convertToDollars } from "@/lib/offramp";
import { humanError } from "@/lib/errors";
import type { IconName } from "@/lib/icons";
import { useMode } from "@/lib/mode";
import { formatMoney } from "@/lib/money";

// Add money from another account: pick chain + token, ask for N dollars → one-time code (Aurora Intents, EXACT_OUTPUT)
// → the user sends, or shares a pay link (/add/pay?d=) so someone else does → it lands in the user's own Kin account →
// one tap turns it into dollars. Real money only (Aurora runs on mainnet).
// "Chain" / "Token" labels: user exception (PRODUCT.md, Oct 13). Source names ("USDC", "Base") are what people see in
// their other apps, so they stay as-is.

type Pending = { q: AddQuote; source: string };
const KEY = "kin.add"; // sessionStorage: depositAddress + quote only, so a reload resumes. No keys.

const CHAINS = [...new Set(SOURCES.map(chainOf))];

const QUOTE_ERRORS: Record<string, string> = {
  "not connected": "Adding money this way is resting right now. Try again soon.",
  "no quote": "Couldn't get a price for that right now. Try another amount.",
  invalid: "Check the amount and try again.",
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

// Custom dropdown (select-only combobox, WAI-ARIA APG): button opens a list; arrows/Enter/Escape work; tap outside closes.
// Not a <Field>: a <label> around the list would re-click the button on every option tap.
function Pick({ label, value, options, onPick }: { label: string; value: string; options: { value: string; text: string }[]; onPick: (v: string) => void }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const off = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("pointerdown", off);
    return () => document.removeEventListener("pointerdown", off);
  }, [open]);

  function show() {
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }
  function choose(i: number) {
    onPick(options[i].value);
    setOpen(false);
  }
  function key(e: KeyboardEvent) {
    if (e.key === "Tab") return setOpen(false);
    const act = !open
      ? ["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key) && show
      : ({
          Escape: () => setOpen(false),
          ArrowDown: () => setHi((h) => Math.min(options.length - 1, h + 1)),
          ArrowUp: () => setHi((h) => Math.max(0, h - 1)),
          Enter: () => choose(hi),
          " ": () => choose(hi),
        } as Record<string, () => void>)[e.key];
    if (!act) return;
    e.preventDefault();
    act();
  }

  return (
    <div ref={box} className="relative flex flex-col gap-1.5">
      <span id={`${id}l`} className="text-sm font-medium text-muted">{label}</span>
      <button type="button" role="combobox" aria-haspopup="listbox" aria-expanded={open} aria-controls={`${id}x`}
        aria-labelledby={`${id}l`} aria-activedescendant={open ? `${id}o${hi}` : undefined}
        onClick={() => (open ? setOpen(false) : show())} onKeyDown={key}
        className={`${inputClass} flex items-center justify-between text-left font-semibold ${open ? "border-brand" : ""}`}>
        {current?.text}
        <Ico name="chevron" size={18} className={`text-muted transition-transform ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (
        <ul id={`${id}x`} role="listbox" aria-labelledby={`${id}l`}
          className="absolute inset-x-0 top-full z-20 mt-2 max-h-72 overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-lg">
          {options.map((o, i) => (
            <li key={o.value} id={`${id}o${i}`} role="option" aria-selected={o.value === value}
              onPointerMove={() => setHi(i)} onClick={() => choose(i)}
              className={`flex min-h-12 cursor-pointer items-center justify-between rounded-xl px-3 font-semibold text-ink ${i === hi ? "bg-brand-soft" : ""}`}>
              {o.text}
              {o.value === value && <Ico name="check" size={18} className="text-brand" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Form({ onQuote }: { onQuote: (p: Pending) => void }) {
  const me = useSignedIn()?.address;
  const [chain, setChain] = useState(chainOf(SOURCES[0]));
  const [source, setSource] = useState(SOURCES[0].id);
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const tokens = SOURCES.filter((s) => chainOf(s) === chain);
  const ok = Number(amount) > 0;

  async function submit() {
    if (!me || !ok) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch("/api/addmoney", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source, amount, address: me }),
      });
      const j = await res.json();
      if (j.depositAddress) return onQuote({ q: j as AddQuote, source });
      setErr(j.error === "too little" && j.min ? `Ask for at least $${j.min}.` : QUOTE_ERRORS[j.error] ?? "Something went wrong. Your money is safe.");
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Pick label="Chain" value={chain} options={CHAINS.map((c) => ({ value: c, text: c }))}
          onPick={(c) => (setChain(c), setSource(SOURCES.find((s) => chainOf(s) === c)!.id), setErr(""))} />
        <Pick label="Token" value={source} options={tokens.map((s) => ({ value: s.id, text: coinOf(s) }))}
          onPick={(id) => (setSource(id), setErr(""))} />
      </div>

      <label className="mt-4 flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Amount</span>
        <span className="flex items-baseline justify-center gap-1 font-display text-6xl">
          <span className="text-muted">$</span>
          <input className="tabular min-w-0 bg-transparent text-center text-ink outline-none placeholder:text-muted/50" inputMode="decimal"
            placeholder="0" value={amount} aria-label="Amount in dollars"
            style={{ width: `${Math.max(1, amount.length || 1) + 0.5}ch` }}
            onChange={(e) => {
              const v = e.target.value.replace(",", ".");
              if (!/^\d{0,6}(\.\d{0,2})?$/.test(v)) return;
              setAmount(v);
              setErr("");
            }} />
        </span>
      </label>

      <p className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
        You&apos;ll get a link to share. Whoever opens it sees exactly what to send and where. If something goes wrong, the money is held safely in your name and we help you get it back.
      </p>

      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button onClick={submit} busy={busy} disabled={!ok || busy}>Request payment</Button>
        {busy && <p className="mt-3 text-center text-sm text-muted">Getting today&apos;s price…</p>}
      </div>
    </>
  );
}

type StepState = "todo" | "doing" | "done";
const ORDER: AddStatus[] = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS"];

function Tracking({ p, onReset }: { p: Pending; onReset: () => void }) {
  const q: AddQuote = { ...p.q, source: p.q.source || p.source };
  const live = useAddStatus(q.depositAddress);
  const status: AddStatus = live?.status ?? "PENDING_DEPOSIT";
  const waiting = status === "PENDING_DEPOSIT";
  const left = useSecondsLeft(q.deadline, waiting);
  const expired = waiting && left === 0;
  const [converting, setConverting] = useState(false);
  const [done, setDone] = useState<{ hash: string; ausdOut: bigint } | null>(null);
  const [shared, setShared] = useState("");
  const [err, setErr] = useState("");
  const out = BigInt(live?.amountOut ?? q.amountOut);

  async function shareLink() {
    const src = SOURCES.find((s) => s.id === q.source);
    const r = await share(`Pay me ${formatMoney(BigInt(q.amountOut))}${src ? ` with ${src.label}` : ""}`, `${location.origin}/add/pay?d=${encodeURIComponent(q.depositAddress)}`);
    setShared(r === "copied" ? "Link copied" : "");
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

  if (status === "REFUNDED" || status === "FAILED")
    return (
      <>
        <Card className="flex flex-col gap-2 text-center">
          <p className="font-display text-2xl">{status === "REFUNDED" ? "Held for you" : "This one didn't go through"}</p>
          <p className="text-sm text-muted">
            {status === "REFUNDED" ? "The money is held safely in your name with our partner. Message us and we'll help you get it back." : "If money was sent, it's held safely in your name."}
          </p>
        </Card>
        <div className="mt-auto pt-2">
          <Button onClick={onReset}>Try again</Button>
        </div>
      </>
    );

  const at = ORDER.indexOf(status === "INCOMPLETE_DEPOSIT" ? "KNOWN_DEPOSIT_TX" : status);
  const state = (i: number): StepState => (status === "SUCCESS" || at > i ? "done" : at === i ? "doing" : "todo");
  const steps: { icon: IconName; title: string; sub?: string }[] = [
    { icon: "pending", title: "Waiting for the money", sub: waiting ? `Request expires in ${timeLeft(left)}` : undefined },
    {
      icon: "check",
      title: status === "INCOMPLETE_DEPOSIT" ? "Amount didn't match" : "Received",
      sub: status === "INCOMPLETE_DEPOSIT" ? "Send the rest, or it's held safely in your name" : undefined,
    },
    { icon: "send", title: "On its way", sub: status === "PROCESSING" ? `Usually ${about(q.timeEstimate)}` : undefined },
    { icon: "dollar", title: "Arrived", sub: status === "SUCCESS" ? `${formatMoney(out)} in your account` : undefined },
  ];

  return (
    <>
      {waiting && !expired && (
        <>
          <Button onClick={shareLink}>Share payment link</Button>
          {shared && <p className="text-center text-sm text-muted" aria-live="polite">{shared}</p>}
          <SendThis q={q} left={left} />
        </>
      )}

      {expired ? (
        <Card className="flex flex-col gap-2 text-center">
          <p className="font-display text-2xl">This request expired</p>
          <p className="text-sm text-muted">Don&apos;t send to it. Start again for a fresh one. If money was already sent, it&apos;s held safely in your name.</p>
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
        {status === "SUCCESS" ? (
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
