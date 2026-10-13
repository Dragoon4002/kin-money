"use client";
// Section E4 demo: the whole Add money page (app/add/page.tsx + app/add/pay) in the printed-ticket model.
// From another account (Aurora): pick + amount → payment request slip (exact amount, QR, code) → tracking tape →
// arrived → added = cash-in receipt. Already here: money that arrived but isn't dollars yet → one tap → receipt;
// paid straight to Kin → the normal received receipt. Plus the payer's /add/pay view.
// "Chain"/"Token" picker labels + source names ("ETH on Ethereum"): PRODUCT.md exception (Oct 13), this page only.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PayQr } from "@/components/core/PayQr";
import { share } from "@/components/core/share";
import { Button, ErrorText, Ico, Screen } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { money } from "@/components/receipt/motion";
import * as F from "./fixtures";
import { After, Big, Cols, Dash, Field, IdBlock, Label, Line, Ok, Paper, Slip, SlotWait, Stamp, Ticket, Track, pill, type Step } from "./Slip";
import type { DemoState } from "./screens";

const CODE = "0x3f5CE5FBFe3E9af3971dD833D26bA9b5C936f0bE";
const OUT = 100_000_000n; // $100.00 arriving
const SENDS = "0.040347";
const WAITING = 12_400_000n; // $12.40 already here
type Status = "PENDING_DEPOSIT" | "KNOWN_DEPOSIT_TX" | "INCOMPLETE_DEPOSIT" | "PROCESSING" | "SUCCESS";

/** Static look of the real custom dropdown (add/page.tsx Pick), optionally open. */
function PickBox({ label, value, open, options = [] }: { label: string; value: string; open?: boolean; options?: string[] }) {
  return (
    <div className="relative flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      <button type="button" aria-expanded={!!open} className={`flex h-14 w-full items-center justify-between rounded-2xl border bg-surface px-4 text-left font-semibold ${open ? "border-brand" : "border-line"}`}>
        {value}<Ico name="chevron" size={18} className={`text-muted ${open ? "-rotate-90" : "rotate-90"}`} />
      </button>
      {open && (
        <ul role="listbox" className="absolute inset-x-0 top-full z-20 mt-2 max-h-72 overflow-auto rounded-2xl border border-line bg-surface p-1.5 shadow-lg">
          {options.map((o) => (
            <li key={o} role="option" aria-selected={o === value} className={`flex min-h-12 items-center justify-between rounded-xl px-3 font-semibold ${o === value ? "bg-brand-soft" : ""}`}>
              {o}{o === value && <Ico name="check" size={18} className="text-brand" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Money that already arrived in the account but isn't dollars yet: a stub on top, one tap. */
function Waiting({ busy, err = "" }: { busy?: boolean; err?: string }) {
  return (
    <Paper className="flex flex-col gap-2 px-5 pb-8 pt-5 text-left">
      <Label>ALREADY ARRIVED</Label>
      <p className="text-2xl font-bold tabular-nums">{formatMoney(WAITING)} <span className="font-mono text-sm font-bold text-[var(--kt-muted)]">is waiting</span></p>
      <p className="font-mono text-xs text-[var(--kt-muted)]">Add it to your balance to send or spend it.</p>
      <button disabled={busy} aria-busy={busy} className="mt-1 flex h-12 items-center justify-center gap-2 rounded-full bg-[var(--kt-ink)] font-semibold text-[var(--kt-paper)] active:scale-[0.98] disabled:opacity-80">
        {busy ? <><span aria-hidden className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> Adding it to your balance…</> : `Add ${formatMoney(WAITING)} to your balance`}
      </button>
      {err && <ErrorText>{err}</ErrorText>}
    </Paper>
  );
}

function Form({ amount = "", picking, busy, err = "", waiting }: { amount?: string; picking?: boolean; busy?: boolean; err?: string; waiting?: "yes" | "busy" }) {
  const [v, setV] = useState(amount);
  return (
    <Screen title="Add money" back="/money">
      {waiting && <Waiting busy={waiting === "busy"} />}
      <div className="grid grid-cols-2 gap-3">
        <PickBox label="Chain" value="Ethereum" open={picking} options={["Base", "Arbitrum", "Ethereum", "Optimism", "Polygon", "BNB Chain", "Solana"]} />
        <PickBox label="Token" value="ETH" />
      </div>
      <label className="mt-2 flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Amount</span>
        <span className="flex items-baseline justify-center gap-1 font-display text-6xl">
          <span className="text-muted">$</span>
          <input className="tabular min-w-0 bg-transparent text-center text-ink outline-none placeholder:text-muted/50" inputMode="decimal" placeholder="0" value={v}
            aria-label="Amount in dollars" style={{ width: `${Math.max(1, v.length || 1) + 0.5}ch` }} onChange={(e) => /^\d{0,6}(\.\d{0,2})?$/.test(e.target.value) && setV(e.target.value)} />
        </span>
      </label>
      <Paper edge={false} className="px-4 py-3">
        <p className="font-mono text-xs leading-snug text-[var(--kt-muted)]">You&apos;ll get a link to share. Whoever opens it sees exactly what to send and where. If something goes wrong, the money is held safely in your name and we help you get it back.</p>
      </Paper>
      <Link href="/receive" className="flex min-h-11 items-center gap-2 rounded-2xl border-2 border-dashed border-line px-4 py-2 text-sm active:bg-surface-2">
        <Ico name="qr" size={20} />
        <span className="flex-1">Someone paying from another app? Show your <b>Kin QR</b>. It lands in your balance right away.</span>
      </Link>
      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button busy={busy} disabled={!(Number(v) > 0) || busy}>Request payment</Button>
        {busy && <p className="mt-3 text-center text-sm text-muted" aria-live="polite">Getting today&apos;s price…</p>}
      </div>
    </Screen>
  );
}

/** The payment request: what to send, where, by when. Prints once; the same slip is the payer's page. */
function RequestSlip({ footer }: { footer?: string }) {
  const [copied, setCopied] = useState("");
  const copy = (t: string, what: string) => navigator.clipboard?.writeText(t).then(() => setCopied(what), () => {});
  return (
    <Slip label="Payment request">
      <h2 className="font-mono text-base font-bold tracking-[0.25em]">PAYMENT REQUEST</h2>
      <Dash />
      <Label>SEND EXACTLY</Label>
      <button onClick={() => copy(SENDS, "amount")} className="-mt-2 min-h-11 rounded-xl px-2 active:scale-95">
        <span className="text-4xl font-bold tabular-nums">{SENDS}</span> <span className="font-mono text-sm font-bold">ETH</span>
      </button>
      <span className="-mt-3 font-mono text-sm font-bold">on Ethereum</span>
      <Ok>Arrives as {formatMoney(OUT)}</Ok>
      <Dash />
      <div className="w-full max-w-56 overflow-hidden rounded-2xl"><PayQr text={CODE} label="QR code to send the money here" /></div>
      <Label>SEND TO THIS CODE</Label>
      <p className="-mt-2 break-all font-mono text-[13px] font-bold">{CODE}</p>
      <div className="grid w-full grid-cols-2 gap-1.5">
        <button onClick={() => copy(CODE, "code")} className={pill}><Ico name={copied === "code" ? "check" : "copy"} size={14} />{copied === "code" ? "Copied" : "Copy code"}</button>
        <button onClick={() => copy(SENDS, "amount")} className={pill}><Ico name={copied === "amount" ? "check" : "copy"} size={14} />{copied === "amount" ? "Copied" : "Copy amount"}</button>
      </div>
      <Dash />
      <Cols><Field k="EXPIRES IN" v="2 days" /><Field k="TAKES" v="about 2 min" /></Cols>
      <p className="font-mono text-[11px] leading-snug text-[var(--kt-muted)]">{footer ?? "Send from any app or exchange that holds ETH on Ethereum."}</p>
    </Slip>
  );
}

const ORDER: Status[] = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS"];
function track(status: Status): Step[] {
  const at = ORDER.indexOf(status === "INCOMPLETE_DEPOSIT" ? "KNOWN_DEPOSIT_TX" : status);
  const st = (i: number): Step["state"] => (status === "SUCCESS" || at > i ? "done" : at === i ? (status === "INCOMPLETE_DEPOSIT" ? "bad" : "doing") : "todo");
  return [
    { icon: "pending", title: "Waiting for the money", sub: status === "PENDING_DEPOSIT" ? "Request expires in 2 days" : undefined, state: st(0) },
    { icon: "check", title: status === "INCOMPLETE_DEPOSIT" ? "Amount didn't match" : "Received", sub: status === "INCOMPLETE_DEPOSIT" ? "Send the rest, or it's held safely in your name" : undefined, state: st(1) },
    { icon: "send", title: "On its way", sub: status === "PROCESSING" ? "Usually about 2 minutes" : undefined, state: st(2) },
    { icon: "dollar", title: "Arrived", sub: status === "SUCCESS" ? `${formatMoney(OUT)} in your account` : undefined, state: st(3) },
  ];
}

function Tracking({ status, converting, shared }: { status: Status; converting?: boolean; shared?: boolean }) {
  const waiting = status === "PENDING_DEPOSIT";
  return (
    <Screen title="Add money" back="/money">
      {waiting && (
        <>
          <Button onClick={() => void share(`Pay me ${formatMoney(OUT)} with ETH on Ethereum`, "https://getkin.space/add/pay?d=demo")}>Share payment link</Button>
          {shared && <p className="text-center text-sm text-muted" aria-live="polite">Link copied</p>}
          <RequestSlip />
        </>
      )}
      <Track title="TRACKING" steps={track(status)} />
      <div className="mt-auto pt-2">
        {status === "SUCCESS" ? (
          <>
            <Button busy={converting} disabled={converting}>Add {formatMoney(OUT)} to your balance</Button>
            {converting && <p className="mt-3 text-center text-sm text-muted" aria-live="polite">Adding it to your balance — a few seconds…</p>}
          </>
        ) : waiting && <Button variant="soft">Start over</Button>}
      </div>
    </Screen>
  );
}

/** Ended without money arriving as dollars: expired / held for you / didn't go through. */
function Ended({ kind }: { kind: "expired" | "refunded" | "failed" }) {
  const t = {
    expired: ["EXPIRED", "This request expired", "Don't send to it. Start again for a fresh one. If money was already sent, it's held safely in your name.", "Start again"],
    refunded: ["HELD FOR YOU", "Held for you", "The money is held safely in your name with our partner. Message us and we'll help you get it back.", "Try again"],
    failed: ["DIDN'T GO THROUGH", "This one didn't go through", "If money was sent, it's held safely in your name.", "Try again"],
  }[kind];
  return (
    <Screen title="Add money" back="/money">
      <Paper className="flex flex-col items-center gap-3 px-5 pb-9 pt-6 text-center">
        <Stamp tone={kind === "refunded" ? "warn" : "bad"}>{t[0]}</Stamp>
        <p className="text-xl font-bold">{t[1]}</p>
        <p className="font-mono text-xs leading-snug text-[var(--kt-muted)]">{t[2]}</p>
      </Paper>
      {kind === "expired" && <Track title="TRACKING" steps={track("PENDING_DEPOSIT").map((s) => ({ ...s, sub: s.state === "doing" ? "Expired, nothing arrived" : s.sub, state: s.state === "doing" ? "bad" : s.state }))} />}
      <div className="mt-auto pt-2"><Button>{t[3]}</Button></div>
    </Screen>
  );
}

/** Done: the cash-in receipt. `waiting` = it was money already here (no other app involved). */
function AddedSlip({ waiting }: { waiting?: boolean }) {
  const router = useRouter();
  const amount = waiting ? WAITING : OUT;
  const at = new Date();
  const when = `${at.toLocaleDateString(undefined, { dateStyle: "medium" })} · ${at.toLocaleTimeString(undefined, { timeStyle: "short" })}`;
  return (
    <Screen title="Add money" back="/money">
      <Slip label="Money added receipt" onTear={() => router.push("/demo")}>
        <span className="relative">
          <span className="kt-pill grid size-14 place-items-center rounded-2xl"><Ico name="add" size={28} /></span>
          <span className="absolute -bottom-1 -right-3 grid size-8 place-items-center rounded-full border-2 border-[var(--kt-paper)] bg-[var(--kt-good)] text-white"><Ico name="check" size={16} /></span>
        </span>
        <h2 className="font-mono text-base font-bold tracking-[0.25em]">MONEY ADDED</h2>
        <Dash />
        <Big value={Number(amount)} format={money} label="ADDED TO YOUR BALANCE" />
        <Ok>Ready to send</Ok>
        <Dash />
        <div className="flex w-full flex-col gap-2">
          {waiting ? (
            <Line k="From" v="Money that was waiting" />
          ) : (
            <>
              <Line k="From" v="ETH on Ethereum" />
              <Line k="They sent" v={`${SENDS} ETH`} />
              <Line k="Took" v="2 min 14 s" />
            </>
          )}
          <Line k="Kin fee" v={formatMoney(0n)} muted />
          <Line k="Added" v={formatMoney(amount)} strong />
        </div>
        <Dash />
        <div className="flex w-full flex-col gap-1"><Label>DATE &amp; TIME</Label><span className="font-mono text-sm font-bold">{when}</span></div>
        <Dash />
        <IdBlock hash={F.fakeHash(0x66)} details="/demo/receipt-received" onShare={() => void share(`Added ${formatMoney(amount)} to Kin.`)} />
      </Slip>
      <After><Link href="/send" className="grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">Send money</Link></After>
    </Screen>
  );
}

function PracticeNote() {
  return (
    <Screen title="Add money" back="/money">
      <Paper className="flex flex-col gap-2 px-5 pb-8 pt-5 text-left">
        <Label>REAL MONEY ONLY</Label>
        <p>Adding money from another account works with real money. Turn on Real money in Me → Money.</p>
        <Link href="/me" className="flex min-h-11 items-center font-semibold text-brand">Go to Me</Link>
      </Paper>
    </Screen>
  );
}

/** The person who got the link (/add/pay). */
function Payer({ kind = "ask" }: { kind?: "ask" | "on-way" | "paid" | "bad" }) {
  return (
    <Screen title="Payment request">
      {kind === "ask" && (
        <>
          <p className="text-center text-lg"><b>@sam</b> asked you for <b className="tabular">{formatMoney(OUT)}</b></p>
          <RequestSlip footer="If something goes wrong, the money is held safely for @sam, who can send it back." />
        </>
      )}
      {kind === "on-way" && <SlotWait text="Received — on its way"><span className="text-sm">@sam gets {formatMoney(OUT)} in a moment. You can close this page.</span></SlotWait>}
      {kind === "paid" && (
        <Slip label="Paid">
          <h2 className="font-mono text-base font-bold tracking-[0.25em]">PAID</h2>
          <Dash />
          <Big value={Number(OUT)} format={money} label="@SAM GOT" />
          <Ok>Delivered</Ok>
          <p className="font-mono text-xs text-[var(--kt-muted)]">Thank you!</p>
        </Slip>
      )}
      {kind === "bad" && (
        <Paper className="flex flex-col items-center gap-2 px-5 pb-9 pt-6 text-center">
          <Stamp tone="bad">NOT VALID</Stamp>
          <p className="text-xl font-bold">This link isn&apos;t valid</p>
          <p className="font-mono text-xs text-[var(--kt-muted)]">Ask for a new payment link.</p>
        </Paper>
      )}
    </Screen>
  );
}

/** One add that moves itself: waiting → received → on its way → arrived → adding → receipt. */
const SEQ = ["PENDING_DEPOSIT", "KNOWN_DEPOSIT_TX", "PROCESSING", "SUCCESS", "converting", "done"] as const;
function Live() {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (k >= SEQ.length - 1) return;
    const t = setTimeout(() => setK(k + 1), k === 0 ? 2600 : 1600);
    return () => clearTimeout(t);
  }, [k]);
  const s = SEQ[k];
  return s === "done" ? <AddedSlip /> : s === "converting" ? <Tracking status="SUCCESS" converting /> : <Tracking status={s} />;
}

export const CASHIN_STATES: DemoState[] = [
  { label: "Practice money: real only", render: () => <PracticeNote /> },
  { label: "Form", render: () => <Form /> },
  { label: "Form: chain list open", render: () => <Form amount="100" picking /> },
  { label: "Form: $100 entered", render: () => <Form amount="100" /> },
  { label: "Getting today's price…", render: () => <Form amount="100" busy /> },
  { label: "Too little", render: () => <Form amount="0.05" err="Ask for at least $0.15." /> },
  { label: "Live: wait → arrive → receipt", render: () => <Live /> },
  { label: "Waiting for the money (request slip)", render: () => <Tracking status="PENDING_DEPOSIT" /> },
  { label: "Payment link copied", render: () => <Tracking status="PENDING_DEPOSIT" shared /> },
  { label: "Received", render: () => <Tracking status="KNOWN_DEPOSIT_TX" /> },
  { label: "Amount didn't match", render: () => <Tracking status="INCOMPLETE_DEPOSIT" /> },
  { label: "On its way", render: () => <Tracking status="PROCESSING" /> },
  { label: "Arrived: add to balance", render: () => <Tracking status="SUCCESS" /> },
  { label: "Adding…", render: () => <Tracking status="SUCCESS" converting /> },
  { label: "Done: money added receipt", render: () => <AddedSlip /> },
  { label: "Request expired", render: () => <Ended kind="expired" /> },
  { label: "Held for you (refunded)", render: () => <Ended kind="refunded" /> },
  { label: "Didn't go through", render: () => <Ended kind="failed" /> },
  { label: "Already here: money waiting", render: () => <Form waiting="yes" /> },
  { label: "Already here: adding…", render: () => <Form waiting="busy" /> },
  { label: "Already here: added receipt", render: () => <AddedSlip waiting /> },
  { label: "Paid straight to Kin (receipt)", render: () => <Ticket r={{ ...F.RECEIPT_RECEIVED, from: "0x1a2b…9f0e", fromA: `0x1a2b${"0".repeat(30)}9f0e` }} back="/activity" /> },
  { label: "Payer: asked you for", render: () => <Payer /> },
  { label: "Payer: on its way", render: () => <Payer kind="on-way" /> },
  { label: "Payer: paid", render: () => <Payer kind="paid" /> },
  { label: "Payer: link not valid", render: () => <Payer kind="bad" /> },
];
