"use client";
// Section E3 demo: the whole cash-out page (app/cashout/page.tsx) in the printed-ticket model. Route = a printed
// strip, quote = an itemized bill, run = a progress tape, done = the cash-out receipt slip (₹ amount, practice stamp).
// AUSD / USDC / Agora / Onramp are named here on purpose (PRODUCT.md exception, Oct 11).
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { share } from "@/components/core/share";
import { AmountInput } from "@/components/social/bits";
import { Button, ErrorText, Ico, Screen } from "@/components/ui";
import { inr } from "@/lib/cashout";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import * as F from "./fixtures";
import { After, Big, Dash, IdBlock, Label, Line, Paper, Slip, Stamp, Track, type Step } from "./Slip";
import type { DemoState } from "./screens";

const usd = (n: number) => n.toFixed(2);
const RATE = 95.21;
const HASH = F.fakeHash(0x77);

/** Same math shape as the real quote: Agora 1:1 minus a hair, Onramp rate, Onramp + bank fees, 1% TDS. */
function quoteFor(ausd: number) {
  const usdc = Math.round(ausd * 0.9996 * 100) / 100;
  const gross = usdc * RATE;
  const fees = gross * 0.005 + 5.31;
  const tds = gross * 0.01;
  return { usdc, gross, fees, tds, rupees: Math.max(0, gross - fees - tds) };
}

/** AUSD —Agora→ USDC —Onramp→ INR, printed. `live` = where the money is now (1..3). */
function RouteStrip({ ausd, usdc, rupees, live }: { ausd?: number; usdc?: number; rupees?: number; live?: 1 | 2 | 3 }) {
  const stops = [["AUSD", ausd !== undefined ? usd(ausd) : "—"], ["USDC", usdc !== undefined ? usd(usdc) : "—"], ["INR", rupees !== undefined ? inr(rupees) : "—"]] as const;
  return (
    <Paper className="flex flex-col gap-2 px-4 pb-7 pt-4">
      <Label>ROUTE</Label>
      <div className="flex items-center justify-between gap-1 text-center">
        {stops.map(([coin, amt], i) => (
          <div key={coin} className="contents">
            <div className={`relative flex min-w-0 flex-col transition-opacity duration-300 ${live && live < i + 1 ? "opacity-40" : ""}`}>
              <span className="font-mono text-[11px] font-bold tracking-widest text-[var(--kt-muted)]">{coin}</span>
              <span className="truncate font-mono text-base font-bold tabular-nums">{amt}</span>
              {live === i + 1 && <span aria-hidden className="kd-bar absolute -bottom-1.5 left-1/2 -ml-3 h-0.5 w-6 rounded-full bg-[var(--kt-ink)]" />}
            </div>
            {i < 2 && (
              <div className="flex shrink-0 flex-col items-center font-mono text-[10px] font-bold text-[var(--kt-muted)]">
                <span>{["AGORA", "ONRAMP"][i]}</span>
                <span aria-hidden className={`text-lg leading-none ${live === i + 1 ? "kd-nudge text-[var(--kt-ink)]" : ""}`}>→</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </Paper>
  );
}

/** The quote as an itemized bill. `est` = no Onramp quote (estimated rate). */
function Bill({ ausd, est }: { ausd: number; est?: boolean }) {
  const q = quoteFor(ausd);
  return (
    <Paper className="flex flex-col gap-2 px-5 pb-8 pt-5">
      <div className="flex items-center justify-between"><Label>QUOTE</Label><Label>{est ? "ESTIMATE" : "LOCKED 3 MIN"}</Label></div>
      <Line k="AUSD → USDC with Agora" v={`${usd(q.usdc)} USDC`} />
      <Line k={`USDC → INR at ₹${RATE.toFixed(2)}`} v={inr(q.gross)} />
      <Line k={est ? "Payout fee" : "Onramp + bank fees"} v={`− ${inr(q.fees)}`} muted />
      <Line k="Tax deducted (TDS 1%)" v={`− ${inr(q.tds)}`} muted />
      <Dash />
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-sm font-bold">YOU GET{est ? " ABOUT" : ""}</span>
        <span className="text-3xl font-bold tabular-nums">{inr(q.rupees)}</span>
      </div>
      <p className="font-mono text-[11px] leading-snug text-[var(--kt-muted)]">
        Practice money: Agora settles into its test USDC; Onramp {est ? "rate estimated" : "quotes from its sandbox"}; rupees go to the bank you verify once with Onramp.
      </p>
    </Paper>
  );
}

function Form({ amount: a0 = "50", resting, err = "", est }: { amount?: string; resting?: boolean; err?: string; est?: boolean }) {
  const [amount, setAmount] = useState(a0);
  const ausd = Number(amount) || 0;
  const q = ausd > 0 && !resting ? quoteFor(ausd) : null;
  return (
    <Screen title="Cash out" back="/money">
      <AmountInput label="How much?" value={amount} onChange={setAmount} />
      <RouteStrip ausd={ausd || undefined} usdc={q?.usdc} rupees={q?.rupees} />
      {resting && <ErrorText>Cash out is resting right now. Try again soon.</ErrorText>}
      {q && <Bill ausd={ausd} est={est} />}
      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button disabled={!q}>{q ? `Cash out ${inr(q.rupees)}` : "Cash out"}</Button>
      </div>
    </Screen>
  );
}

const steps = (phase: 1 | 2 | 3): Step[] => {
  const at = (p: number) => (phase > p ? "done" : phase === p ? "doing" : "todo") as Step["state"];
  const q = quoteFor(F.CASH_AUSD);
  return [
    { icon: "lock", title: "Price locked", sub: `${usd(F.CASH_AUSD)} AUSD at Agora's fixed price`, state: "done" },
    { icon: "dollar", title: "AUSD → USDC with Agora", sub: phase === 1 ? "Confirm with your Identity check" : `${usd(q.usdc)} USDC settled in about a second`, state: at(1) },
    { icon: "payout", title: "USDC → INR with Onramp", sub: phase >= 2 ? `₹${RATE.toFixed(2)} per USDC · fees and 1% tax included` : undefined, state: at(2) },
    { icon: "send", title: phase === 3 ? `${inr(q.rupees)} to your bank` : "Rupees to your bank", sub: "Practice money: no rupees move", state: phase === 3 ? "practice" : "todo" },
  ];
};

function Running({ phase }: { phase: 1 | 2 }) {
  const q = quoteFor(F.CASH_AUSD);
  return (
    <Screen title="Cash out" back="/money">
      <RouteStrip ausd={F.CASH_AUSD} usdc={phase >= 2 ? q.usdc : undefined} live={phase} />
      <Track title={phase === 1 ? "CASHING OUT · STEP 1 OF 3" : "CASHING OUT · STEP 2 OF 3"} steps={steps(phase)} />
      <p className="text-center text-sm text-muted" aria-live="polite">{phase === 1 ? "Waiting for your Identity check…" : "Getting rupees for your USDC — a few seconds…"}</p>
    </Screen>
  );
}

/** Done: the cash-out receipt. */
function CashoutSlip({ onAgain }: { onAgain: () => void }) {
  const router = useRouter();
  const q = quoteFor(F.CASH_AUSD);
  const at = new Date();
  const when = `${at.toLocaleDateString(undefined, { dateStyle: "medium" })} · ${at.toLocaleTimeString(undefined, { timeStyle: "short" })}`;
  return (
    <Screen title="Cash out" back="/money">
      <Slip label="Cash-out receipt" onTear={() => router.push("/demo")}>
        <span className="relative">
          <span className="kt-pill grid size-14 place-items-center rounded-2xl"><Ico name="payout" size={28} /></span>
          <span className="absolute -bottom-1 -right-3 grid size-8 place-items-center rounded-full border-2 border-[var(--kt-paper)] bg-[var(--kt-good)] text-white"><Ico name="check" size={16} /></span>
        </span>
        <h2 className="font-mono text-base font-bold tracking-[0.25em]">CASH-OUT RECEIPT</h2>
        <Dash />
        <Big value={q.rupees} format={inr} label="TO YOUR BANK" />
        <Stamp tone="warn">PRACTICE</Stamp>
        <span className="font-mono text-xs text-[var(--kt-muted)]">On its way · no rupees move in practice</span>
        <Dash />
        <div className="flex w-full flex-col gap-1.5">
          <Label>ROUTE</Label>
          <p className="font-mono text-sm font-bold">AUSD → USDC with Agora → INR with Onramp</p>
        </div>
        <Dash />
        <div className="flex w-full flex-col gap-2">
          <Line k="You cashed out" v={`${usd(F.CASH_AUSD)} AUSD`} />
          <Line k="Agora settled" v={`${usd(q.usdc)} USDC`} />
          <Line k="Onramp rate" v={`₹${RATE.toFixed(2)} / USDC`} />
          <Line k="Onramp + bank fees" v={`− ${inr(q.fees)}`} muted />
          <Line k="Tax deducted (TDS 1%)" v={`− ${inr(q.tds)}`} muted />
          <Line k="To your bank" v={inr(q.rupees)} strong />
        </div>
        <Dash />
        <div className="flex w-full flex-col gap-1.5 text-left">
          <Label>WHERE YOUR MONEY WENT</Label>
          <ol className="flex flex-col gap-1 font-mono text-xs">
            {[["You → Kin cash-out", `${usd(F.CASH_AUSD)} AUSD`], ["Kin cash-out → Agora settlement", `${usd(F.CASH_AUSD)} AUSD`], ["Agora settlement → You", `${usd(q.usdc)} USDC`], ["Onramp → your bank", `${inr(q.rupees)} · practice`]].map(([k, v], i) => (
              <li key={k} className="flex justify-between gap-2"><span>{i + 1}. {k}</span><span className="shrink-0 font-bold tabular-nums">{v}</span></li>
            ))}
          </ol>
        </div>
        <Dash />
        <div className="grid w-full grid-cols-2 gap-x-2">
          <div className="flex flex-col gap-1"><Label>SPEED</Label><span className="font-mono text-sm font-bold">1.1s</span></div>
          <div className="flex flex-col gap-1"><Label>KIN FEE</Label><span className="font-mono text-sm font-bold">{formatMoney(0n)}</span></div>
          <div className="col-span-full mt-3 flex flex-col gap-1"><Label>DATE &amp; TIME</Label><span className="font-mono text-sm font-bold">{when}</span></div>
        </div>
        <Dash />
        <IdBlock hash={HASH} details="/demo/receipt-sent" onShare={() => void share(`Cashed out ${inr(q.rupees)} with Kin (practice). AUSD → USDC with Agora → INR with Onramp.`)} />
      </Slip>
      <After><Button variant="soft" onClick={onAgain}>Cash out again</Button></After>
    </Screen>
  );
}

/** One cash-out that moves through phase 1 → 2 → receipt, like the real screen. */
function Live() {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (k >= 2) return;
    const t = setTimeout(() => setK(k + 1), 1600);
    return () => clearTimeout(t);
  }, [k]);
  return k < 2 ? <Running phase={(k + 1) as 1 | 2} /> : <CashoutSlip onAgain={() => setK(0)} />;
}

/** Receipt; "Cash out again" goes back to the form, like the real screen. */
function Done() {
  const [again, setAgain] = useState(false);
  return again ? <Form amount="" /> : <CashoutSlip onAgain={() => setAgain(true)} />;
}

function RealSoon() {
  const soon: Step[] = [
    { icon: "dollar", title: "AUSD → USDC with Agora", sub: "Fixed price, locked for 3 minutes", state: "todo" },
    { icon: "payout", title: "USDC → INR with Onramp", sub: "Live rate, fees and 1% tax shown first", state: "todo" },
    { icon: "send", title: "Rupees to your bank", sub: "Verified once with Onramp", state: "todo" },
  ];
  return (
    <Screen title="Cash out" back="/money">
      <RouteStrip />
      <Paper className="flex flex-col items-center gap-2 px-5 pb-8 pt-5 text-center">
        <Stamp tone="warn">COMING SOON</Stamp>
        <p className="font-mono text-xs leading-snug text-[var(--kt-muted)]">Real-money cash-out is in onboarding with Agora and Onramp. Here&apos;s how it will work.</p>
      </Paper>
      <Track title="HOW IT WILL WORK" steps={soon} />
      <p className="px-1 text-sm text-muted">Turn off Real money in Me to try a practice cash-out now.</p>
      <div className="mt-auto pt-2"><Button disabled>Coming soon</Button></div>
    </Screen>
  );
}

export const CASHOUT_STATES: DemoState[] = [
  { label: "Enter amount", render: () => <Form amount="" /> },
  { label: "Quote (Onramp sandbox)", render: () => <Form /> },
  { label: "Quote (estimated rate)", render: () => <Form est /> },
  { label: "Cash out is resting", render: () => <Form resting /> },
  { label: "Not enough balance", render: () => <Form err={humanError(new Error("insufficient balance"))} /> },
  { label: "Didn't go through", render: () => <Form err={humanError(new Error("x"))} /> },
  { label: "Live: 1 → 2 → receipt", render: () => <Live /> },
  { label: "Step 1: Identity check", render: () => <Running phase={1} /> },
  { label: "Step 2: Agora settled", render: () => <Running phase={2} /> },
  { label: "Done: cash-out receipt", render: () => <Done /> },
  { label: "Real money: coming soon", render: () => <RealSoon /> },
];
