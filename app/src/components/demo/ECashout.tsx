"use client";
// Section E3 demo: the whole cash-out page (app/cashout/page.tsx). Amount, route card, steps, buttons, coming soon,
// errors and the done layout are the real page's look (Route/Steps/RealSoon from cashoutParts). Only the details
// under the route are the printed-paper model: quote = an itemized bill, "where your money goes" + done details = paper.
// AUSD / USDC / Agora / Onramp are named here on purpose (PRODUCT.md exception, Oct 11).
import Link from "next/link";
import { useEffect, useState } from "react";
import { AmountInput } from "@/components/social/bits";
import { Button, Delivered, ErrorText, Screen } from "@/components/ui";
import { inr } from "@/lib/cashout";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { RealSoon, Route, Steps, type Step } from "./cashoutParts";
import * as F from "./fixtures";
import { Dash, Label, Line, Paper } from "./Slip";
import type { DemoState } from "./screens";

const usd = (n: number) => n.toFixed(2);
const RATE = 95.21;

/** Same math shape as the real quote: Agora 1:1 minus a hair, Onramp rate, Onramp + bank fees, 1% TDS. */
function quoteFor(ausd: number) {
  const usdc = Math.round(ausd * 0.9996 * 100) / 100;
  const gross = usdc * RATE;
  const fees = gross * 0.005 + 5.31;
  const tds = gross * 0.01;
  return { usdc, gross, fees, tds, rupees: Math.max(0, gross - fees - tds) };
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
      <Route ausd={ausd || undefined} usdc={q?.usdc} rupees={q?.rupees} />
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

/** "Where your money goes", printed: every movement + the rupee leg (`rupees` unset = still pricing). */
function Where({ rupees }: { rupees?: number }) {
  const q = quoteFor(F.CASH_AUSD);
  const hops = [["You → Kin cash-out", `${usd(F.CASH_AUSD)} AUSD`], ["Kin cash-out → Agora settlement", `${usd(F.CASH_AUSD)} AUSD`], ["Agora settlement → You", `${usd(q.usdc)} USDC`], ["Onramp → your bank", rupees ? `${inr(rupees)} · practice` : "…"]];
  return (
    <Paper className="flex flex-col gap-2 px-5 pb-8 pt-5">
      <Label>WHERE YOUR MONEY GOES</Label>
      <ol className="kd-stagger flex flex-col gap-1.5">
        {hops.map(([k, v], i) => <li key={k}><Line k={`${i + 1}. ${k}`} v={v} muted={i === 3} /></li>)}
      </ol>
    </Paper>
  );
}

/** Done details, printed: what you cashed out → what reached the bank, plus speed / fee / time. */
function DoneBill() {
  const q = quoteFor(F.CASH_AUSD);
  const at = new Date();
  const when = `${at.toLocaleDateString(undefined, { dateStyle: "medium" })} · ${at.toLocaleTimeString(undefined, { timeStyle: "short" })}`;
  return (
    <Paper className="flex flex-col gap-2 px-5 pb-8 pt-5">
      <Label>CASH-OUT DETAILS</Label>
      <Line k="You cashed out" v={`${usd(F.CASH_AUSD)} AUSD`} />
      <Line k="Agora settled" v={`${usd(q.usdc)} USDC`} />
      <Line k="Onramp rate" v={`₹${RATE.toFixed(2)} / USDC`} />
      <Line k="Onramp + bank fees" v={`− ${inr(q.fees)}`} muted />
      <Line k="Tax deducted (TDS 1%)" v={`− ${inr(q.tds)}`} muted />
      <Dash />
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-sm font-bold">TO YOUR BANK</span>
        <span className="text-3xl font-bold tabular-nums">{inr(q.rupees)}</span>
      </div>
      <Dash />
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <div className="flex flex-col gap-1"><Label>SPEED</Label><span className="font-mono text-sm font-bold">1.1s</span></div>
        <div className="flex flex-col gap-1"><Label>KIN FEE</Label><span className="font-mono text-sm font-bold">{formatMoney(0n)}</span></div>
        <div className="col-span-full flex flex-col gap-1"><Label>DATE &amp; TIME</Label><span className="font-mono text-sm font-bold">{when}</span></div>
      </div>
    </Paper>
  );
}

const proof = <Link href="/demo/receipt-sent" className="block text-center text-sm font-semibold text-brand">Proof of payment</Link>;

function Running({ phase }: { phase: 1 | 2 }) {
  const q = quoteFor(F.CASH_AUSD);
  return (
    <Screen title="Cash out" back="/money">
      <div className="flex flex-col gap-4 text-left">
        <Route ausd={F.CASH_AUSD} usdc={phase >= 2 ? q.usdc : undefined} live={phase} />
        <Steps steps={steps(phase)} />
        {phase === 2 && <Where />}
        {phase === 2 && proof}
      </div>
      <p className="text-center text-sm text-muted" aria-live="polite">{phase === 1 ? "Waiting for your Identity check…" : "Getting rupees for your USDC — a few seconds…"}</p>
    </Screen>
  );
}

/** Done: the real Delivered layout, with the printed details under the route. */
function Finished({ onAgain }: { onAgain: () => void }) {
  const q = quoteFor(F.CASH_AUSD);
  return (
    <Screen title="Cash out" back="/money">
      <Delivered sound="cashout" title={`${inr(q.rupees)} on its way`} subtitle="AUSD → USDC → INR · Practice cash-out">
        <div className="flex flex-col gap-4 text-left">
          <Route ausd={F.CASH_AUSD} usdc={q.usdc} rupees={q.rupees} live={3} />
          <Steps steps={steps(3)} />
          <DoneBill />
          <Where rupees={q.rupees} />
          {proof}
        </div>
      </Delivered>
      <div className="mt-auto pt-2"><Button variant="soft" onClick={onAgain}>Cash out again</Button></div>
    </Screen>
  );
}

/** One cash-out that moves through phase 1 → 2 → done, like the real screen. */
function Live() {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (k >= 2) return;
    const t = setTimeout(() => setK(k + 1), 1600);
    return () => clearTimeout(t);
  }, [k]);
  return k < 2 ? <Running phase={(k + 1) as 1 | 2} /> : <Finished onAgain={() => setK(0)} />;
}

/** Done; "Cash out again" goes back to the form, like the real screen. */
function Done() {
  const [again, setAgain] = useState(false);
  return again ? <Form amount="" /> : <Finished onAgain={() => setAgain(true)} />;
}

export const CASHOUT_STATES: DemoState[] = [
  { label: "Enter amount", render: () => <Form amount="" /> },
  { label: "Quote (Onramp sandbox)", render: () => <Form /> },
  { label: "Quote (estimated rate)", render: () => <Form est /> },
  { label: "Cash out is resting", render: () => <Form resting /> },
  { label: "Not enough balance", render: () => <Form err={humanError(new Error("insufficient balance"))} /> },
  { label: "Didn't go through", render: () => <Form err={humanError(new Error("x"))} /> },
  { label: "Live: 1 → 2 → done", render: () => <Live /> },
  { label: "Step 1: Identity check", render: () => <Running phase={1} /> },
  { label: "Step 2: Agora settled", render: () => <Running phase={2} /> },
  { label: "Done: on its way", render: () => <Done /> },
  { label: "Real money: coming soon", render: () => <Screen title="Cash out" back="/money"><RealSoon /></Screen> },
];
