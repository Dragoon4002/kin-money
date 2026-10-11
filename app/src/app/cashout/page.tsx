"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { AmountInput, useSignedIn } from "@/components/social/bits";
import { Button, Card, Chip, Delivered, ErrorText, Ico, Screen } from "@/components/ui";
import { getBalance } from "@/lib/activity";
import { inr, rupeesFor, saveCashout } from "@/lib/cashout";
import { ROUTES } from "@/lib/cashoutRoutes";
import { humanError } from "@/lib/errors";
import type { IconName } from "@/lib/icons";
import { useMode } from "@/lib/mode";
import { fromLocal } from "@/lib/money";
import { cashOutVia, quoteVia, venueStatus, type Hop } from "@/lib/offramp";
import { onrampQuote, type OnrampQuote } from "@/lib/onrampWidget";

// Cash out = AUSD → USDC with Agora → INR with Onramp. Amount → Agora's fixed price + Onramp's rupee quote →
// one Identity check → AUSD settles into USDC through Agora (KinCashoutV2, Instant Settlement pair) → Onramp prices
// the USDC in rupees → rupees to the bank verified with Onramp. Practice money: the Agora leg is real (testnet, test
// USDC); the rupee payout is the practice part. Real money shows the same route as "coming soon".
// AUSD/USDC are named on this screen on purpose (user decision, Oct 11; docs/PRODUCT.md).

type StepState = "todo" | "doing" | "done" | "practice";
type Step = { icon: IconName; title: string; sub?: string; state: StepState };
type Run = { phase: 1 | 2 | 3; hash?: string; hops?: Hop[]; usdc?: number; rupees?: number; quote?: OnrampQuote };

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
      setRun({ phase: 3, hash: l1.hash, hops: l1.hops, usdc: got, rupees: paid, quote });
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

      {shown && (
        <Card className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">You get {shown.quote ? "" : "about"}</span>
            <span className="font-display text-2xl">{inr(rupees)}</span>
          </div>
          <Row k="AUSD → USDC with Agora" v={`${usd(usdc)} USDC`} />
          {shown.quote ? (
            <>
              <Row k={`USDC → INR at ₹${shown.quote.rate.toFixed(2)}`} v={inr(usdc * shown.quote.rate)} />
              <Row k="Onramp + bank fees" v={`− ${inr(shown.quote.fees.onramp + shown.quote.fees.gateway)}`} />
              <Row k="Tax deducted (TDS 1%)" v={`− ${inr(shown.quote.fees.tds)}`} />
            </>
          ) : (
            <>
              <Row k={`USDC → INR at ${inr(est.rate)}`} v={inr(est.gross)} />
              <Row k="Payout fee" v={`− ${inr(est.fee)}`} />
              <Row k="Tax deducted (TDS 1%)" v={`− ${inr(est.tds)}`} />
            </>
          )}
          <p className="pt-1 text-xs text-muted">
            Practice money: Agora settles into its test USDC; Onramp {shown.quote?.sandbox ? "quotes from its sandbox" : "rate estimated"}; rupees go to the bank you verify once with Onramp.
          </p>
        </Card>
      )}

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

/** Every money movement in the cash-out, read from the receipt, plus the rupee leg. */
function Flow({ hops, rupees }: { hops: Hop[]; rupees?: number }) {
  return (
    <Card className="flex flex-col gap-2 text-sm">
      <span className="font-semibold">Where your money goes</span>
      <ol className="flex flex-col gap-2">
        {hops.map((h, i) => (
          <li key={i} className="flex items-start justify-between gap-3">
            <span>{i + 1}. {h.from} → {h.to}</span>
            <span className="tabular shrink-0 text-muted">{h.amount}</span>
          </li>
        ))}
        <li className="flex items-start justify-between gap-3 text-muted">
          <span>{hops.length + 1}. Onramp → your bank</span>
          <span className="tabular shrink-0">{rupees ? `${inr(rupees)} · practice` : "…"}</span>
        </li>
      </ol>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between text-muted">
      <span>{k}</span>
      <span className="tabular">{v}</span>
    </div>
  );
}
