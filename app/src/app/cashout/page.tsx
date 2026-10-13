"use client";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { formatUnits } from "viem";
import { AmountInput, useSignedIn } from "@/components/social/bits";
import { Button, Card, Chip, Delivered, ErrorText, Ico, Screen } from "@/components/ui";
import { getBalance } from "@/lib/activity";
import { inr, rupeesFor, saveCashout } from "@/lib/cashout";
import { ROUTES } from "@/lib/cashoutRoutes";
import { humanError } from "@/lib/errors";
import type { IconName } from "@/lib/icons";
import { useMode } from "@/lib/mode";
import { formatMoney, fromLocal } from "@/lib/money";
import { cashOutVia, quoteVia, venueStatus, type Hop } from "@/lib/offramp";
import { onrampQuote, type OnrampQuote } from "@/lib/onrampWidget";

// Cash out = AUSD → USDC with Agora → INR with Onramp. Amount → Agora's fixed price + Onramp's rupee quote →
// one Identity check → AUSD settles into USDC through Agora (KinCashoutV2, Instant Settlement pair) → Onramp prices
// the USDC in rupees → rupees to the bank verified with Onramp. Practice money: the Agora leg is real (testnet, test
// USDC); the rupee payout is the practice part. Real money shows the same route as "coming soon".
// AUSD/USDC are named on this screen on purpose (user decision, Oct 11; docs/PRODUCT.md).

type StepState = "todo" | "doing" | "done" | "practice";
type Step = { icon: IconName; title: string; sub?: string; state: StepState };
type Run = { phase: 1 | 2 | 3; hash?: string; hops?: Hop[]; usdc?: number; rupees?: number; quote?: OnrampQuote; at?: number };

export default function CashOut() {
  const mode = useMode();
  return <Screen title="Cash out" back="/money">{mode === "main" ? <RealSoon /> : <Practice />}</Screen>;
}

const usd = (n: number) => n.toFixed(2);

/** AUSD —Agora→ USDC —Onramp→ INR, with the amount at each stop. */
function Route({ ausd, usdc, rupees, live }: { ausd?: number; usdc?: number; rupees?: number; live?: 0 | 1 | 2 | 3 }) {
  const stops = [
    ["AUSD", ausd !== undefined ? usd(ausd) : "—"],
    ["USDC", usdc !== undefined ? usd(usdc) : "—"],
    ["INR", rupees !== undefined ? inr(rupees) : "—"],
  ] as const;
  const by = ["Agora", "Onramp"];
  return (
    <Card className="flex items-center justify-between gap-1 text-center">
      {stops.map(([coin, amt], i) => (
        <div key={coin} className="contents">
          <div className={`flex min-w-0 flex-col ${live !== undefined && live < i + 1 ? "opacity-50" : ""}`}>
            <span className="text-xs font-semibold text-muted">{coin}</span>
            <span className="tabular truncate font-display text-lg">{amt}</span>
          </div>
          {i < 2 && (
            <div className="flex shrink-0 flex-col items-center text-xs text-muted">
              <span>{by[i]}</span>
              <span aria-hidden className="text-lg leading-none">→</span>
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}

function Practice() {
  const me = useSignedIn()?.address;
  const [amount, setAmount] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const [q, setQ] = useState<{ units: bigint; out: bigint; quote?: OnrampQuote } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [err, setErr] = useState("");

  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const settle = ROUTES.test.settle;

  useEffect(() => {
    venueStatus("test").then((s) => setReady(s.agora.ok), () => setReady(false));
  }, []);

  // Re-quote as the amount changes (debounced): Agora's fixed price, then Onramp's rupees for that USDC.
  useEffect(() => {
    if (units === 0n || !ready) return;
    let live = true;
    const t = setTimeout(async () => {
      try {
        const out = await quoteVia("test", "agora", units);
        const quote = await onrampQuote(formatUnits(out, settle.decimals).replace(/(\.\d{6})\d+$/, "$1")).catch(() => undefined);
        if (live) setQ({ units, out, quote });
      } catch {
        if (live) setQ(null);
      }
    }, 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [units, ready, settle.decimals]);
  const shown = q && q.units === units ? q : null;
  const usdc = shown ? Number(formatUnits(shown.out, settle.decimals)) : 0;
  const est = rupeesFor(usdc);
  const rupees = shown?.quote?.rupees ?? est.inr;

  async function submit() {
    if (!me || !shown) return;
    setErr("");
    setRun({ phase: 1 });
    try {
      if ((await getBalance(me)) < shown.units) throw new Error("insufficient balance");
      const l1 = await cashOutVia("test", "agora", shown.units, shown.out, "");
      const got = Number(formatUnits(l1.received, settle.decimals));
      setRun({ phase: 2, hash: l1.hash, hops: l1.hops, usdc: got });
      const quote = await onrampQuote(got.toFixed(6)).catch(() => undefined);
      const paid = quote?.rupees ?? rupeesFor(got).inr;
      saveCashout(l1.hash, { rupees: paid, practice: true });
      setRun({ phase: 3, hash: l1.hash, hops: l1.hops, usdc: got, rupees: paid, quote, at: Date.now() });
    } catch (e) {
      setRun(null);
      setErr(humanError(e));
    }
  }

  if (run) {
    const at = (p: number): StepState => (run.phase > p ? "done" : run.phase === p ? "doing" : "todo");
    const ausd = Number(formatUnits(shown?.units ?? 0n, 6));
    const steps: Step[] = [
      { icon: "lock", title: "Price locked", sub: `${usd(ausd)} AUSD at Agora's fixed price`, state: "done" },
      {
        icon: "dollar",
        title: "AUSD → USDC with Agora",
        sub: run.phase === 1 ? "Confirm with your Identity check" : `${usd(run.usdc ?? 0)} USDC settled in about a second`,
        state: at(1),
      },
      {
        icon: "payout",
        title: "USDC → INR with Onramp",
        sub: run.quote ? `₹${run.quote.rate.toFixed(2)} per USDC · fees and 1% tax included` : run.phase === 3 ? "Estimated at today's rate" : undefined,
        state: at(2),
      },
      { icon: "send", title: run.rupees ? `${inr(run.rupees)} to your bank` : "Rupees to your bank", sub: "Practice money: no rupees move", state: run.phase === 3 ? "practice" : "todo" },
    ];
    const body = (
      <div className="flex flex-col gap-4 text-left">
        <Route ausd={ausd} usdc={run.usdc} rupees={run.rupees} live={run.phase === 3 ? 3 : run.phase === 2 ? 2 : 1} />
        <Steps steps={steps} />
        {run.phase === 3 && <DoneBill ausd={ausd} run={run} />}
        {run.hops && <Flow hops={run.hops} rupees={run.rupees} />}
        {run.hash && (
          <Link href={`/details?tx=${run.hash}`} className="block text-center text-sm font-semibold text-brand">
            Proof of payment
          </Link>
        )}
      </div>
    );
    if (run.phase < 3) return body;
    return (
      <>
        <Delivered sound="cashout" title={`${inr(run.rupees!)} on its way`} subtitle="AUSD → USDC → INR · Practice cash-out">
          {body}
        </Delivered>
        <div className="mt-auto pt-2">
          <Button variant="soft" onClick={() => (setRun(null), setAmount(""))}>Cash out again</Button>
        </div>
      </>
    );
  }

  return (
    <>
      <AmountInput label="How much?" value={amount} onChange={(v) => (setAmount(v), setErr(""))} />

      <Route ausd={units ? Number(formatUnits(units, 6)) : undefined} usdc={shown ? usdc : undefined} rupees={shown ? rupees : undefined} />

      {ready === false && <ErrorText>Cash out is resting right now. Try again soon.</ErrorText>}

      {shown && <Bill usdc={usdc} rupees={rupees} quote={shown.quote} />}

      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button onClick={submit} disabled={!shown || rupees <= 0}>
          {shown ? `Cash out ${inr(rupees)}` : "Cash out"}
        </Button>
      </div>
    </>
  );
}

/** Real money: the same route, switched on once Agora onboarding and Onramp's payout are live. */
function RealSoon() {
  const steps: Step[] = [
    { icon: "dollar", title: "AUSD → USDC with Agora", sub: "Fixed price, locked for 3 minutes", state: "todo" },
    { icon: "payout", title: "USDC → INR with Onramp", sub: "Live rate, fees and 1% tax shown first", state: "todo" },
    { icon: "send", title: "Rupees to your bank", sub: "Verified once with Onramp", state: "todo" },
  ];
  return (
    <>
      <Route />
      <Card className="flex flex-col gap-2">
        <Chip tone="warn">Coming soon</Chip>
        <p className="text-sm text-muted">Real-money cash-out is in onboarding with Agora and Onramp. Here&apos;s how it will work.</p>
      </Card>
      <Steps steps={steps} />
      <p className="px-1 text-sm text-muted">Turn off Real money in Me to try a practice cash-out now.</p>
      <div className="mt-auto pt-2">
        <Button disabled>Coming soon</Button>
      </div>
    </>
  );
}

function Steps({ steps }: { steps: Step[] }) {
  return (
    <Card className="flex flex-col gap-4" aria-live="polite">
      <ol className="flex flex-col gap-4">
        {steps.map((s) => (
          <li key={s.title} className={`flex items-start gap-3 ${s.state === "todo" ? "opacity-50" : ""}`}>
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-full ${
                s.state === "done" ? "bg-good text-fun-ink" : s.state === "practice" ? "bg-warn/20 text-ink" : "bg-surface-2 text-ink"
              } ${s.state === "doing" ? "animate-pulse" : ""}`}
            >
              <Ico name={s.state === "done" ? "check" : s.icon} size={18} />
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold">{s.title}</span>
              {s.sub && <span className="text-sm text-muted">{s.sub}</span>}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/** Every money movement in the cash-out, read from the receipt, plus the rupee leg. Printed on paper. */
function Flow({ hops, rupees }: { hops: Hop[]; rupees?: number }) {
  return (
    <Paper>
      <Label>WHERE YOUR MONEY GOES</Label>
      <ol className="flex flex-col gap-1.5">
        {hops.map((h, i) => <li key={i}><Line k={`${i + 1}. ${h.from} → ${h.to}`} v={h.amount} /></li>)}
        <li><Line k={`${hops.length + 1}. Onramp → your bank`} v={rupees ? `${inr(rupees)} · practice` : "…"} muted /></li>
      </ol>
    </Paper>
  );
}

/** Rupee breakdown for `usdc`: Onramp's quote when it answered, else today's estimate. Same numbers the page shows. */
function breakdown(usdc: number, quote?: OnrampQuote) {
  if (quote) return { rate: `₹${quote.rate.toFixed(2)}`, gross: usdc * quote.rate, feeLabel: "Onramp + bank fees", fees: quote.fees.onramp + quote.fees.gateway, tds: quote.fees.tds };
  const e = rupeesFor(usdc);
  return { rate: inr(e.rate), gross: e.gross, feeLabel: "Payout fee", fees: e.fee, tds: e.tds };
}

/** The quote as an itemized bill on paper. No Onramp quote = estimated rate. */
function Bill({ usdc, rupees, quote }: { usdc: number; rupees: number; quote?: OnrampQuote }) {
  const b = breakdown(usdc, quote);
  return (
    <Paper>
      <div className="flex items-center justify-between"><Label>QUOTE</Label><Label>{quote ? "LIVE QUOTE" : "ESTIMATE"}</Label></div>
      <Line k="AUSD → USDC with Agora" v={`${usd(usdc)} USDC`} />
      <Line k={`USDC → INR at ${b.rate}`} v={inr(b.gross)} />
      <Line k={b.feeLabel} v={`− ${inr(b.fees)}`} muted />
      <Line k="Tax deducted (TDS 1%)" v={`− ${inr(b.tds)}`} muted />
      <Total k={quote ? "YOU GET" : "YOU GET ABOUT"} v={inr(rupees)} />
      <p className="font-mono text-[11px] leading-snug text-[var(--kt-muted)]">
        Practice money: Agora settles into its test USDC; Onramp {quote?.sandbox ? "quotes from its sandbox" : "rate estimated"}; rupees go to the bank you verify once with Onramp.
      </p>
    </Paper>
  );
}

/** Done details on paper: what you cashed out → what reached the bank, plus Kin fee and time. */
function DoneBill({ ausd, run }: { ausd: number; run: Run }) {
  const usdc = run.usdc ?? 0;
  const b = breakdown(usdc, run.quote);
  const at = run.at ? new Date(run.at) : null;
  return (
    <Paper>
      <Label>CASH-OUT DETAILS</Label>
      <Line k="You cashed out" v={`${usd(ausd)} AUSD`} />
      <Line k="Agora settled" v={`${usd(usdc)} USDC`} />
      <Line k={run.quote ? "Onramp rate" : "Estimated rate"} v={`${b.rate} / USDC`} />
      <Line k={b.feeLabel} v={`− ${inr(b.fees)}`} muted />
      <Line k="Tax deducted (TDS 1%)" v={`− ${inr(b.tds)}`} muted />
      <Total k="TO YOUR BANK" v={inr(run.rupees ?? 0)} />
      <hr aria-hidden className="kt-dash" />
      <div className="grid grid-cols-2 gap-x-2 gap-y-3">
        <Field k="KIN FEE" v={formatMoney(0n)} />
        {at && <Field k="DATE & TIME" v={`${at.toLocaleDateString(undefined, { dateStyle: "medium" })} · ${at.toLocaleTimeString(undefined, { timeStyle: "short" })}`} wide />}
      </div>
    </Paper>
  );
}

// Printed-paper bits (same paper as the receipt ticket; kt-* / kd-paper-shadow in globals.css).
function Paper({ children }: { children: ReactNode }) {
  return (
    <div className="kt-printer kd-paper-shadow">
      <div className="kt-sheet flex flex-col gap-2 px-5 pb-8 pt-5">{children}</div>
    </div>
  );
}
const Label = ({ children }: { children: ReactNode }) => <span className="kt-label">{children}</span>;

/** "Label ........ value" printed line. */
function Line({ k, v, muted }: { k: string; v: string; muted?: boolean }) {
  return (
    <div className={`flex w-full items-baseline gap-2 text-left font-mono text-[13px] ${muted ? "text-[var(--kt-muted)]" : ""}`}>
      <span className="min-w-0 shrink">{k}</span>
      <span aria-hidden className="min-w-4 flex-1 border-b-2 border-dotted border-[var(--kt-line)]" />
      <span className="shrink-0 font-bold tabular-nums">{v}</span>
    </div>
  );
}

function Total({ k, v }: { k: string; v: string }) {
  return (
    <>
      <hr aria-hidden className="kt-dash" />
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm font-bold">{k}</span>
        <span className="text-3xl font-bold tabular-nums">{v}</span>
      </div>
    </>
  );
}

function Field({ k, v, wide }: { k: string; v: string; wide?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 ${wide ? "col-span-full" : ""}`}>
      <Label>{k}</Label>
      <span className="font-mono text-sm font-bold">{v}</span>
    </div>
  );
}
