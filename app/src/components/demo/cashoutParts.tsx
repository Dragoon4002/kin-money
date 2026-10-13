"use client";
// Proposed extraction of app/src/app/cashout/page.tsx — not wired into the real screen yet.
// Route / Steps / Flow / RealSoon copied 1:1, plus RunView = the `if (run)` render branch of Practice as pure props
// (Practice would keep quoting, cashOutVia, saveCashout and pass `run` + onAgain in). Next page files can't export extras.
import Link from "next/link";
import { CountUp } from "@/components/receipt/motion";
import { Button, Card, Chip, Delivered, Ico } from "@/components/ui";
import { inr } from "@/lib/cashout";
import type { IconName } from "@/lib/icons";
import type { Hop } from "@/lib/offramp";
import type { OnrampQuote } from "@/lib/onrampWidget";
import { CountText } from "./motion";

export type StepState = "todo" | "doing" | "done" | "practice";
export type Step = { icon: IconName; title: string; sub?: string; state: StepState };
export type Run = { phase: 1 | 2 | 3; hash?: string; hops?: Hop[]; usdc?: number; rupees?: number; quote?: OnrampQuote };

const usd = (n: number) => n.toFixed(2);

/**
 * AUSD —Agora→ USDC —Onramp→ INR, with the amount at each stop. A bar marks where the money is now, the arrow
 * it's crossing nudges, and each stop's amount counts up when it arrives.
 */
export function Route({ ausd, usdc, rupees, live }: { ausd?: number; usdc?: number; rupees?: number; live?: 0 | 1 | 2 | 3 }) {
  const stops = [
    ["AUSD", ausd, usd],
    ["USDC", usdc, usd],
    ["INR", rupees, inr],
  ] as const;
  const by = ["Agora", "Onramp"];
  const at = (live ?? 0) - 1;
  return (
    <Card className="flex items-center justify-between gap-1 text-center">
      {stops.map(([coin, n, fmt], i) => (
        <div key={coin} className="contents">
          <div className={`relative flex min-w-0 flex-col transition-opacity duration-300 ${live !== undefined && live < i + 1 ? "opacity-50" : ""}`}>
            <span className="text-xs font-semibold text-muted">{coin}</span>
            <span className="tabular truncate font-display text-lg">{n === undefined ? "—" : i === 0 ? fmt(n) : <CountUp value={n} format={fmt} />}</span>
            {i === at && <span aria-hidden className="kd-bar absolute -bottom-2 left-1/2 -ml-3 h-0.5 w-6 rounded-full bg-brand" />}
          </div>
          {i < 2 && (
            <div className="flex shrink-0 flex-col items-center text-xs text-muted">
              <span>{by[i]}</span>
              <span aria-hidden className={`text-lg leading-none ${live === i + 1 ? "kd-nudge text-brand" : ""}`}>→</span>
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}

/** Practice cash-out in flight (phase 1 → 2) and done (3). `ausd` = amount being cashed out, in dollars. */
export function RunView({ ausd, run, onAgain }: { ausd: number; run: Run; onAgain: () => void }) {
  const at = (p: number): StepState => (run.phase > p ? "done" : run.phase === p ? "doing" : "todo");
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
        <Button variant="soft" onClick={onAgain}>Cash out again</Button>
      </div>
    </>
  );
}

/** Real money: the same route, switched on once Agora onboarding and Onramp's payout are live. */
export function RealSoon() {
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

const lit = (s: Step) => s.state === "done" || s.state === "practice";

/**
 * Steps on a track: the line under a step fills (top down) once the next step is reached, a dot travels down
 * the line the money is crossing now, and a finished step's check pops with one ring. Fills/pops stagger 120 ms
 * on first paint, so a reopened run replays its progress.
 */
export function Steps({ steps }: { steps: Step[] }) {
  return (
    <Card className="flex flex-col gap-4" aria-live="polite">
      <ol className="flex flex-col gap-4">
        {steps.map((s, i) => {
          const next = steps[i + 1];
          const delay = { animationDelay: `${i * 120}ms` };
          return (
            <li key={s.title} className={`relative flex items-start gap-3 transition-opacity duration-300 ${s.state === "todo" ? "opacity-50" : ""}`}>
              {next && (
                <span aria-hidden className="absolute -bottom-3 left-[15px] top-10 w-1.5 overflow-hidden">
                  <span className="absolute inset-y-0 left-[2px] w-0.5 rounded-full bg-line" />
                  {lit(next) && <span className="kd-fill absolute inset-y-0 left-[2px] w-0.5 rounded-full bg-good" style={delay} />}
                  {next.state === "doing" && (
                    <span className="kd-travel absolute inset-0"><span className="absolute left-0 top-0 size-1.5 rounded-full bg-good" /></span>
                  )}
                </span>
              )}
              <span className="relative size-9 shrink-0">
                {s.state === "done" && <span aria-hidden className="kin-ring absolute inset-0 rounded-full bg-good" style={delay} />}
                <span
                  style={s.state === "done" ? delay : undefined}
                  className={`relative grid size-9 place-items-center rounded-full ${
                    s.state === "done" ? "kin-pop bg-good text-fun-ink" : s.state === "practice" ? "bg-warn/20 text-ink" : "bg-surface-2 text-ink"
                  } ${s.state === "doing" ? "animate-pulse" : ""}`}
                >
                  <Ico name={s.state === "done" ? "check" : s.icon} size={18} />
                </span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="font-semibold">{s.title}</span>
                {s.sub && <span className="text-sm text-muted">{s.sub}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

/** Every money movement in the cash-out, read from the receipt, plus the rupee leg. */
export function Flow({ hops, rupees }: { hops: Hop[]; rupees?: number }) {
  return (
    <Card className="flex flex-col gap-2 text-sm">
      <span className="font-semibold">Where your money goes</span>
      <ol className="kd-stagger flex flex-col gap-2">
        {hops.map((h, i) => (
          <li key={i} className="flex items-start justify-between gap-3">
            <span>{i + 1}. {h.from} → {h.to}</span>
            <span className="tabular shrink-0 text-muted"><CountText text={h.amount} delay={60 + i * 35} /></span>
          </li>
        ))}
        <li className="flex items-start justify-between gap-3 text-muted">
          <span>{hops.length + 1}. Onramp → your bank</span>
          <span className="tabular shrink-0">{rupees ? <><CountUp value={rupees} format={inr} /> · practice</> : "…"}</span>
        </li>
      </ol>
    </Card>
  );
}
