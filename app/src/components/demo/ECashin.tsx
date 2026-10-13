"use client";
// Section E4 demo: the whole Add money page (app/add/page.tsx + app/add/pay), in the real page's own look
// (Card / SendThis / step list / Delivered) with fake data. Only "Paid straight to Kin" is the receipt ticket.
// "Chain"/"Token" picker labels + source names ("ETH on Ethereum"): PRODUCT.md exception (Oct 13), this page only.
import Link from "next/link";
import { useEffect, useState } from "react";
import { SendThis, about, timeLeft } from "@/components/core/PayIn";
import { share } from "@/components/core/share";
import { Button, Card, Delivered, ErrorText, Ico, Screen, inputClass } from "@/components/ui";
import type { AddQuote } from "@/lib/addMoney";
import type { IconName } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import * as F from "./fixtures";
import { Ticket } from "./Slip";
import type { DemoState } from "./screens";

const OUT = 100_000_000n; // $100.00 arriving
const WAITING = 12_400_000n; // $12.40 already here
const LEFT = 2 * 86400; // "2 days"
const Q: AddQuote = {
  depositAddress: "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE", source: "eth-eth", recipient: F.ME, amountIn: "40347000000000000",
  amountInFormatted: "0.040347", amountOut: String(OUT), minAmountOut: String(OUT), timeEstimate: 130, deadline: "2099-01-01T00:00:00Z",
};
type Status = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "INCOMPLETE_DEPOSIT" | "PROCESSING" | "SUCCESS";

/** Static look of the real custom dropdown (add/page.tsx Pick), optionally open. */
function PickBox({ label, value, open, options = [] }: { label: string; value: string; open?: boolean; options?: string[] }) {
  return (
    <div className="relative flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      <button type="button" aria-expanded={!!open} className={`${inputClass} flex items-center justify-between text-left font-semibold ${open ? "border-brand" : ""}`}>
        {value}<Ico name="chevron" size={18} className={`text-muted ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-20 mt-2 max-h-72 overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-lg">
          {options.map((o) => (
            <li key={o} role="option" aria-selected={o === value} className={`flex min-h-12 items-center justify-between rounded-xl px-3 font-semibold text-ink ${o === value ? "bg-brand-soft" : ""}`}>
              {o}{o === value && <Ico name="check" size={18} className="text-brand" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Money that already arrived in the account but isn't dollars yet (real Waiting card; after the tap it shrinks to "added"). */
function Waiting({ state }: { state: "yes" | "busy" | "done" }) {
  if (state === "done")
    return (
      <Card className="mb-4 flex flex-col gap-2 text-center">
        <p className="font-display text-2xl">{formatMoney(WAITING)} added</p>
        <Link href="/demo/receipt-received" className="text-sm font-semibold text-brand">Proof of payment</Link>
      </Card>
    );
  return (
    <Card className="mb-4 flex flex-col gap-3">
      <p className="font-semibold">{formatMoney(WAITING)} arrived and is waiting</p>
      <p className="text-sm text-muted">Add it to your balance to send or spend it.</p>
      <Button busy={state === "busy"} disabled={state === "busy"}>Add {formatMoney(WAITING)} to your balance</Button>
    </Card>
  );
}

function Form({ amount = "", picking, busy, err = "", waiting }: { amount?: string; picking?: boolean; busy?: boolean; err?: string; waiting?: "yes" | "busy" | "done" }) {
  const [v, setV] = useState(amount);
  return (
    <Screen title="Add money" back="/money">
      {waiting && <Waiting state={waiting} />}
      <div className="grid grid-cols-2 gap-3">
        <PickBox label="Chain" value="Ethereum" open={picking} options={["Base", "Arbitrum", "Ethereum", "Optimism", "Polygon", "BNB Chain", "Solana"]} />
        <PickBox label="Token" value="ETH" />
      </div>
      <label className="mt-4 flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Amount</span>
        <span className="flex items-baseline justify-center gap-1 font-display text-6xl">
          <span className="text-muted">$</span>
          <input className="tabular min-w-0 bg-transparent text-center text-ink outline-none placeholder:text-muted/50" inputMode="decimal" placeholder="0" value={v}
            aria-label="Amount in dollars" style={{ width: `${Math.max(1, v.length || 1) + 0.5}ch` }} onChange={(e) => /^\d{0,6}(\.\d{0,2})?$/.test(e.target.value) && setV(e.target.value)} />
        </span>
      </label>
      <p className="mt-4 rounded-2xl border border-dashed border-line p-4 text-sm text-muted">
        You&apos;ll get a link to share. Whoever opens it sees exactly what to send and where. If something goes wrong, the money is held safely in your name and we help you get it back.
      </p>
      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button busy={busy} disabled={!(Number(v) > 0) || busy}>Request payment</Button>
        {busy && <p className="mt-3 text-center text-sm text-muted">Getting today&apos;s price…</p>}
      </div>
    </Screen>
  );
}

type StepState = "todo" | "doing" | "done";
const ORDER: Status[] = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS"];

/** The real step card (add/page.tsx Tracking). */
function Steps({ status }: { status: Status }) {
  const at = ORDER.indexOf(status === "INCOMPLETE_DEPOSIT" ? "KNOWN_DEPOSIT_TX" : status);
  const state = (i: number): StepState => (status === "SUCCESS" || at > i ? "done" : at === i ? "doing" : "todo");
  const steps: { icon: IconName; title: string; sub?: string }[] = [
    { icon: "pending", title: "Waiting for the money", sub: status === "PENDING_DEPOSIT" ? `Request expires in ${timeLeft(LEFT)}` : undefined },
    { icon: "check", title: status === "INCOMPLETE_DEPOSIT" ? "Amount didn't match" : "Received", sub: status === "INCOMPLETE_DEPOSIT" ? "Send the rest, or it's held safely in your name" : undefined },
    { icon: "send", title: "On its way", sub: status === "PROCESSING" ? `Usually ${about(Q.timeEstimate)}` : undefined },
    { icon: "dollar", title: "Arrived", sub: status === "SUCCESS" ? `${formatMoney(OUT)} in your account` : undefined },
  ];
  return (
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
  );
}

function Tracking({ status, converting, shared }: { status: Status; converting?: boolean; shared?: boolean }) {
  const waiting = status === "PENDING_DEPOSIT";
  return (
    <Screen title="Add money" back="/money">
      {waiting && (
        <>
          <Button onClick={() => void share(`Pay me ${formatMoney(OUT)} with ETH on Ethereum`, "https://getkin.space/add/pay?d=demo")}>Share payment link</Button>
          {shared && <p className="text-center text-sm text-muted" aria-live="polite">Link copied</p>}
          <SendThis q={Q} left={LEFT} />
        </>
      )}
      <Steps status={status} />
      <div className="mt-auto pt-2">
        {status === "SUCCESS" ? (
          <>
            <Button busy={converting} disabled={converting}>Add {formatMoney(OUT)} to your balance</Button>
            {converting && <p className="mt-3 text-center text-sm text-muted">Adding it to your balance — a few seconds…</p>}
          </>
        ) : waiting && <Button variant="soft">Start over</Button>}
      </div>
    </Screen>
  );
}

/** Ended without money arriving as dollars: expired / held for you / didn't go through (real cards). */
function Ended({ kind }: { kind: "expired" | "refunded" | "failed" }) {
  const t = {
    expired: ["This request expired", "Don't send to it. Start again for a fresh one. If money was already sent, it's held safely in your name.", "Start again"],
    refunded: ["Held for you", "The money is held safely in your name with our partner. Message us and we'll help you get it back.", "Try again"],
    failed: ["This one didn't go through", "If money was sent, it's held safely in your name.", "Try again"],
  }[kind];
  return (
    <Screen title="Add money" back="/money">
      <Card className="flex flex-col gap-2 text-center">
        <p className="font-display text-2xl">{t[0]}</p>
        <p className="text-sm text-muted">{t[1]}</p>
      </Card>
      <div className="mt-auto pt-2"><Button variant={kind === "expired" ? "soft" : undefined}>{t[2]}</Button></div>
    </Screen>
  );
}

/** Done: the real Delivered screen. */
function Added() {
  return (
    <Screen title="Add money" back="/money">
      <Delivered title={`${formatMoney(OUT)} added`} subtitle="It's in your balance, ready to send">
        <Link href="/demo/receipt-received" className="block text-center text-sm font-semibold text-brand">Proof of payment</Link>
      </Delivered>
      <div className="mt-auto pt-2">
        <Link href="/send" className="grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">Send money</Link>
      </div>
    </Screen>
  );
}

function PracticeNote() {
  return (
    <Screen title="Add money" back="/money">
      <Card className="flex flex-col gap-3">
        <p>Adding money from another account works with real money. Turn on Real money in Me → Money.</p>
        <Link href="/me" className="flex min-h-11 items-center font-semibold text-brand">Go to Me</Link>
      </Card>
    </Screen>
  );
}

function Note({ title, text }: { title: string; text: string }) {
  return (
    <Card className="flex flex-col gap-2 text-center" aria-live="polite">
      <p className="font-display text-2xl">{title}</p>
      <p className="text-sm text-muted">{text}</p>
    </Card>
  );
}

/** The person who got the link (/add/pay). */
function Payer({ kind = "ask" }: { kind?: "ask" | "on-way" | "paid" | "bad" }) {
  return (
    <Screen title="Payment request">
      {kind === "ask" && (
        <>
          <p className="text-center text-lg"><span className="font-semibold">@sam</span> asked you for <span className="tabular font-semibold">{formatMoney(OUT)}</span></p>
          <SendThis q={Q} left={LEFT}>
            <p className="mt-2 text-xs text-muted">If something goes wrong, the money is held safely for @sam, who can send it back.</p>
          </SendThis>
        </>
      )}
      {kind === "on-way" && <Note title="Received — on its way" text={`@sam gets ${formatMoney(OUT)} in a moment. You can close this page.`} />}
      {kind === "paid" && <Delivered title="Paid" subtitle={`@sam got ${formatMoney(OUT)}. Thank you!`} />}
      {kind === "bad" && <Note title="This link isn't valid" text="Ask for a new payment link." />}
    </Screen>
  );
}

/** One add that moves itself: waiting → received → on its way → arrived → adding → done. */
const SEQ = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS", "converting", "done"] as const;
function Live() {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (k >= SEQ.length - 1) return;
    const t = setTimeout(() => setK(k + 1), k === 0 ? 2600 : 1600);
    return () => clearTimeout(t);
  }, [k]);
  const s = SEQ[k];
  return s === "done" ? <Added /> : s === "converting" ? <Tracking status="SUCCESS" converting /> : <Tracking status={s} />;
}

export const CASHIN_STATES: DemoState[] = [
  { label: "Practice money: real only", render: () => <PracticeNote /> },
  { label: "Form", render: () => <Form /> },
  { label: "Form: chain list open", render: () => <Form amount="100" picking /> },
  { label: "Form: $100 entered", render: () => <Form amount="100" /> },
  { label: "Getting today's price…", render: () => <Form amount="100" busy /> },
  { label: "Too little", render: () => <Form amount="0.05" err="Ask for at least $0.15." /> },
  { label: "Live: wait → arrive → added", render: () => <Live /> },
  { label: "Waiting for the money", render: () => <Tracking status="PENDING_DEPOSIT" /> },
  { label: "Payment link copied", render: () => <Tracking status="PENDING_DEPOSIT" shared /> },
  { label: "Received", render: () => <Tracking status="KNOWN_DEPOSIT_TX" /> },
  { label: "Amount didn't match", render: () => <Tracking status="INCOMPLETE_DEPOSIT" /> },
  { label: "On its way", render: () => <Tracking status="PROCESSING" /> },
  { label: "Arrived: add to balance", render: () => <Tracking status="SUCCESS" /> },
  { label: "Adding…", render: () => <Tracking status="SUCCESS" converting /> },
  { label: "Done: money added", render: () => <Added /> },
  { label: "Request expired", render: () => <Ended kind="expired" /> },
  { label: "Held for you (refunded)", render: () => <Ended kind="refunded" /> },
  { label: "Didn't go through", render: () => <Ended kind="failed" /> },
  { label: "Already here: money waiting", render: () => <Form waiting="yes" /> },
  { label: "Already here: adding…", render: () => <Form waiting="busy" /> },
  { label: "Already here: added", render: () => <Form waiting="done" /> },
  { label: "Paid straight to Kin (receipt)", render: () => <Ticket r={{ ...F.RECEIPT_RECEIVED, from: "0x1a2b…9f0e", fromA: `0x1a2b${"0".repeat(30)}9f0e` }} back="/activity" /> },
  { label: "Payer: asked you for", render: () => <Payer /> },
  { label: "Payer: on its way", render: () => <Payer kind="on-way" /> },
  { label: "Payer: paid", render: () => <Payer kind="paid" /> },
  { label: "Payer: link not valid", render: () => <Payer kind="bad" /> },
];
