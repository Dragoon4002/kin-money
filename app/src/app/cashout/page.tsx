"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { AmountInput, useSignedIn } from "@/components/social/bits";
import { Button, Card, Chip, Delivered, ErrorText, Field, Ico, Screen, inputClass } from "@/components/ui";
import { getBalance } from "@/lib/activity";
import { inr, rupeesFor, saveCashout, UPI_RE } from "@/lib/cashout";
import { ROUTES } from "@/lib/cashoutRoutes";
import { humanError } from "@/lib/errors";
import type { IconName } from "@/lib/icons";
import { useMode } from "@/lib/mode";
import { formatMoney, fromLocal } from "@/lib/money";
import { cashOutVia, quoteVia, venueStatus, type Hop } from "@/lib/offramp";
import { onrampQuote, type OnrampQuote } from "@/lib/onrampWidget";

// One cash-out: amount + UPI ID → Agora's fixed price → one Identity check → dollars settle through Agora
// (KinCashoutV2, Instant Settlement pair) → Onramp prices the rupees → rupees to the UPI ID.
// Practice money: the settlement is real (testnet); the rupee payout is the practice part. Real money shows the
// same route as "coming soon" until Agora onboarding (Via) and Onramp's payout are switched on.

type StepState = "todo" | "doing" | "done" | "practice";
type Step = { icon: IconName; title: string; sub?: string; state: StepState };
type Run = { phase: 1 | 2 | 3; hash?: string; hops?: Hop[]; rupees?: number; quote?: OnrampQuote };

export default function CashOut() {
  const mode = useMode();
  return <Screen title="Cash out to UPI" back="/money">{mode === "main" ? <RealSoon /> : <Practice />}</Screen>;
}

function Practice() {
  const me = useSignedIn()?.address;
  const [amount, setAmount] = useState("");
  const [upi, setUpi] = useState("");
  const [ready, setReady] = useState<boolean | null>(null);
  const [q, setQ] = useState<{ units: bigint; out: bigint } | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [err, setErr] = useState("");

  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const upiOk = UPI_RE.test(upi.trim());
  const settle = ROUTES.test.settle;

  useEffect(() => {
    venueStatus("test").then((s) => setReady(s.agora.ok), () => setReady(false));
  }, []);

  // Re-quote as the amount changes (debounced): Agora's live fixed price on its settlement pair.
  useEffect(() => {
    if (units === 0n || !ready) return;
    let live = true;
    const t = setTimeout(() => quoteVia("test", "agora", units).then((out) => live && setQ({ units, out }), () => live && setQ(null)), 300);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [units, ready]);
  const shown = q && q.units === units ? q : null;
  const dollars = shown ? Number(formatUnits(shown.out, settle.decimals)) : 0;
  const est = rupeesFor(dollars);

  async function submit() {
    if (!me || !shown) return;
    const to = upi.trim();
    setErr("");
    setRun({ phase: 1 });
    try {
      if ((await getBalance(me)) < shown.units) throw new Error("insufficient balance");
      const l1 = await cashOutVia("test", "agora", shown.units, shown.out, to);
      setRun({ phase: 2, hash: l1.hash, hops: l1.hops });
      const got = formatUnits(l1.received, settle.decimals).replace(/(\.\d{6})\d+$/, "$1");
      const quote = await onrampQuote(got).catch(() => undefined);
      const rupees = quote?.rupees ?? rupeesFor(Number(got)).inr;
      saveCashout(l1.hash, { upi: to, rupees, practice: true });
      setRun({ phase: 3, hash: l1.hash, hops: l1.hops, rupees, quote });
    } catch (e) {
      setRun(null);
      setErr(humanError(e));
    }
  }

  if (run) {
    const at = (p: number): StepState => (run.phase > p ? "done" : run.phase === p ? "doing" : "todo");
    const steps: Step[] = [
      { icon: "lock", title: "Price locked with Agora", sub: `${formatMoney(shown?.units ?? 0n, "USD")} at Agora's fixed price`, state: "done" },
      { icon: "dollar", title: "Your dollars settle through Agora", sub: run.phase === 1 ? "Confirm with your Identity check" : "Settled in about a second", state: at(1) },
      {
        icon: "payout",
        title: "Onramp prices your rupees",
        sub: run.quote ? `₹${run.quote.rate.toFixed(2)} per dollar · fees and 1% tax included` : run.phase === 3 ? "Estimated at today's rate" : undefined,
        state: at(2),
      },
      { icon: "send", title: run.rupees ? `${inr(run.rupees)} to ${upi.trim()}` : `Rupees to ${upi.trim()}`, sub: "Practice money: no rupees move", state: run.phase === 3 ? "practice" : "todo" },
    ];
    const body = (
      <div className="flex flex-col gap-4 text-left">
        <Steps steps={steps} />
        {run.hops && <Flow hops={run.hops} rupees={run.rupees} upi={upi.trim()} />}
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
        <Delivered sound="cashout" title={`${inr(run.rupees!)} on its way`} subtitle={`To ${upi.trim()} · Practice cash-out`}>
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

      <Field label="Your UPI ID" hint={upi && !upiOk ? "Looks like name@bank" : undefined}>
        <input className={inputClass} placeholder="name@okbank" value={upi} onChange={(e) => (setUpi(e.target.value), setErr(""))}
          autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" maxLength={100} />
      </Field>

      {ready === false && <ErrorText>Cash out is resting right now. Try again soon.</ErrorText>}

      {shown && (
        <Card className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-semibold">You get about</span>
            <span className="font-display text-2xl">{inr(est.inr)}</span>
          </div>
          <Row k={`${formatMoney(shown.units, "USD")} at ${inr(est.rate)} / $1`} v={inr(est.gross)} />
          <Row k="Payout fee" v={`− ${inr(est.fee)}`} />
          <Row k="Tax deducted (TDS 1%)" v={`− ${inr(est.tds)}`} />
          <p className="pt-1 text-xs text-muted">Agora settles your dollars at a fixed price · Onramp pays the rupees · Practice money</p>
        </Card>
      )}

      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button onClick={submit} disabled={!shown || !upiOk || est.inr <= 0}>
          {shown ? `Cash out ${inr(est.inr)}` : "Cash out"}
        </Button>
      </div>
    </>
  );
}

/** Real money: the same route, switched on once Agora onboarding and Onramp's payout are live. */
function RealSoon() {
  const steps: Step[] = [
    { icon: "lock", title: "Agora quotes a fixed price", sub: "Locked for 3 minutes", state: "todo" },
    { icon: "dollar", title: "Your dollars settle through Agora", sub: "One Identity check, no fees from Kin", state: "todo" },
    { icon: "payout", title: "Onramp pays rupees to your UPI ID", sub: "Verified once with Onramp", state: "todo" },
  ];
  return (
    <>
      <Card className="flex flex-col gap-2">
        <Chip tone="warn">Coming soon</Chip>
        <p className="text-sm text-muted">
          Real-money cash-out to Indian bank accounts is in onboarding with Agora and Onramp. Here&apos;s how it will work.
        </p>
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
function Flow({ hops, rupees, upi }: { hops: Hop[]; rupees?: number; upi: string }) {
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
          <span>{hops.length + 1}. Onramp → {upi}</span>
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
