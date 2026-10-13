"use client";
// Section E1 demo (links): Pay → As a link → holding → link slip (Copy / WhatsApp / Share, take back later),
// collect it in every state of app/claim/page.tsx (done = the real receipt ticket), and the sender's side in
// Activity: waiting, expired → Take it back → taking back → back in your balance (slip).
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { share } from "@/components/core/share";
import { AmountInput } from "@/components/social/bits";
import { Avatar, Button, Card, ErrorText, Ico, Screen, Tabs, inputClass } from "@/components/ui";
import type { LinkInfo } from "@/lib/claimLink";
import { humanError } from "@/lib/errors";
import { formatMoney, toUnits } from "@/lib/money";
import { money } from "@/components/receipt/motion";
import { PENDING, PendingLinks } from "./EActivity";
import * as F from "./fixtures";
import { After, Big, Cols, Dash, Field, IdBlock, Label, LinkStrip, Ok, Paper, Slip, SlotNote, SlotWait, Stamp, Ticket } from "./Slip";
import type { DemoState } from "./screens";

const LINK_URL = "https://getkin.space/claim#42.s3cr3t";
const AMT = 30_000_000n;
const expires = Math.floor(Date.now() / 1000) + 7 * 86_400;
const day = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { dateStyle: "medium" });

/* ── Send by link ────────────────────────────────────────────────────────────────────────────────── */

function LinkForm({ err = "" }: { err?: string }) {
  const [amount, setAmount] = useState("30");
  const units = Number(amount) > 0 ? toUnits(amount) : 0n;
  return (
    <Screen title="Pay" back="/demo">
      <Tabs value="link" options={[["person", "To a person"], ["link", "As a link"]] as const} onChange={() => {}} />
      <Paper className="flex items-center gap-3 px-4 pb-6 pt-4">
        <span className="kt-pill grid size-12 shrink-0 place-items-center rounded-lg"><Ico name="link" size={24} /></span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
          <Label>LINK · HELD 7 DAYS</Label>
          <span className="text-2xl font-bold tabular-nums">{units ? formatMoney(units) : "—"}</span>
          <span className="font-mono text-[11px] leading-snug text-[var(--kt-muted)]">For someone not on Kin yet. Not collected? Take it back.</span>
        </span>
      </Paper>
      <AmountInput label="Amount in USD" value={amount} onChange={setAmount} />
      <input className={`${inputClass} text-center`} placeholder="Add a note" defaultValue="Dinner last night" maxLength={80} aria-label="Note" />
      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button disabled={!units}>{units ? `Create link for ${formatMoney(units)}` : "Enter an amount"}</Button>
      </div>
    </Screen>
  );
}

function Holding({ slow }: { slow?: boolean }) {
  return (
    <Screen>
      <SlotWait title={formatMoney(AMT)} text={slow ? "Almost there…" : "Holding it safely…"} />
    </Screen>
  );
}

function LinkSlip({ copied }: { copied?: boolean }) {
  const router = useRouter();
  const [didCopy, setCopied] = useState(copied);
  const text = `I sent you ${formatMoney(AMT)} on Kin. "Dinner last night" Tap to collect it:`;
  const leave = () => router.push("/demo");
  return (
    <Screen title="Your link is ready">
      <Slip label="Link slip" onTear={leave}>
        <span className="kt-pill grid size-14 place-items-center rounded-2xl"><Ico name="link" size={28} /></span>
        <h2 className="font-mono text-base font-bold tracking-[0.25em]">LINK READY</h2>
        <Dash />
        <Big value={Number(AMT)} format={money} label="HELD FOR THEM" />
        <Ok>Held safely</Ok>
        <p className="font-mono text-sm">&ldquo;Dinner last night&rdquo;</p>
        <Dash />
        <Cols><Field k="FOR" v="Anyone" sub="with the link" /><Field k="EXPIRES" v={day(expires)} sub="in 7 days" /></Cols>
        <Dash />
        <LinkStrip url={LINK_URL} />
        <p className="font-mono text-[11px] leading-snug text-[var(--kt-muted)]">Whoever opens the link can collect it, so send it only to them. Not collected in 7 days? Take it back in Activity.</p>
        <Dash />
        <IdBlock hash={F.fakeHash(0x6c)} details="/demo/receipt-sent" />
      </Slip>
      <After>
        <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${LINK_URL}`)}`} target="_blank" rel="noreferrer"
          className="flex h-14 items-center justify-center gap-2 rounded-full bg-good font-semibold text-fun-ink active:scale-[0.98]">
          <Ico name="share" /> Send on WhatsApp
        </a>
        <Button variant="soft" onClick={async () => (await share(text, LINK_URL)) === "copied" && setCopied(true)}>{didCopy ? "Link copied ✓" : "Share another way"}</Button>
        <Button variant="ghost" onClick={leave}>Done</Button>
      </After>
    </Screen>
  );
}

/* ── Collect (app/claim) ─────────────────────────────────────────────────────────────────────────── */

type Phase = "view" | "signup" | "collecting" | "done";
const INFO = F.CLAIM_INFO;

function Collect({ hash = "#demo", link = {}, info = INFO, err = "", phase = "view", signedIn = true }: {
  hash?: string | null; link?: object | null; info?: (LinkInfo & { sender: string }) | null; err?: string; phase?: Phase; signedIn?: boolean;
}) {
  if (hash === null) return <Screen title="Kin">{null}</Screen>;
  if (!link)
    return (
      <Screen title="Kin">
        <SlotNote title="LINK INCOMPLETE">This link looks incomplete. Ask the sender to share it again.</SlotNote>
        <Link href="/" className="mt-auto grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      </Screen>
    );
  const amt = info ? formatMoney(info.amount) : "";
  if (phase === "signup")
    return <Screen title={`Collect ${amt}`}><Card className="text-sm text-muted">Demo: the real sign-up screen goes here (not rendered, it creates a real account).</Card></Screen>;
  // Collected: the real receipt ticket prints (money received, delivered in 0.8 s).
  if (phase === "done" && info)
    return <Ticket r={{ ...F.RECEIPT_RECEIVED, amount: info.amount, from: `@${info.sender}`, to: "@sam", at: new Date() }} ms={812} back="/home" />;
  if (!info)
    return <Screen title="Kin">{err ? <SlotNote bad title="COULDN'T OPEN THE LINK">{err}</SlotNote> : <SlotWait text="Opening your link…" />}</Screen>;

  const from = info.sender ? `@${info.sender}` : "Someone";
  return (
    <Screen title="Kin">
      <Slip label="Money for you">
        <Avatar name={info.sender || "?"} size={64} />
        <h2 className="font-mono text-sm font-bold tracking-[0.2em]">{from.toUpperCase()} SENT YOU</h2>
        <Dash />
        <Big value={Number(info.amount)} format={money} label="WAITING FOR YOU" />
        {info.settled ? <Stamp>COLLECTED</Stamp> : <Ok>Held safely</Ok>}
        <Dash />
        <Cols><Field k="FROM" v={from} /><Field k={info.settled ? "STATUS" : "COLLECT BY"} v={info.settled ? "Collected" : day(info.expiresAt)} /></Cols>
        <p className="font-mono text-xs leading-snug text-[var(--kt-muted)]">
          {info.settled ? "This money has already been collected." : "Held safely until you collect it. No fees."}
        </p>
      </Slip>
      {!info.settled ? (
        <div className="mt-auto flex flex-col gap-3 pt-2">
          <ErrorText>{err}</ErrorText>
          {phase === "collecting" && <p className="text-center text-sm text-muted" aria-live="polite">Moving it to your balance…</p>}
          {signedIn ? (
            <Button busy={phase === "collecting"}>Collect {amt}</Button>
          ) : (
            <>
              <Button>Create free account to collect</Button>
              <p className="text-center text-xs text-muted">Takes 20 seconds. Just your name and an Identity check.</p>
            </>
          )}
        </div>
      ) : (
        <Link href={signedIn ? "/home" : "/"} className="mt-auto grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      )}
    </Screen>
  );
}

/* ── Sender's side: Activity → links waiting ─────────────────────────────────────────────────────── */

function Waiting({ links = PENDING, busy = null, err = "" }: { links?: typeof PENDING; busy?: bigint | null; err?: string }) {
  const [list, setList] = useState(links);
  const [taking, setTaking] = useState(busy);
  return (
    <Screen wide title="Activity">
      <PendingLinks links={list} busy={taking} err={err}
        onTakeBack={(id) => (setTaking(id), setTimeout(() => (setList((l) => l.filter((x) => x.id !== id)), setTaking(null)), 1200))} />
      {!list.length && <p className="px-5 text-center font-mono text-sm text-muted">No links waiting.</p>}
    </Screen>
  );
}

function TakenBack() {
  const router = useRouter();
  const leave = () => router.push("/demo");
  return (
    <Screen title="Taken back">
      <Slip label="Money back" onTear={leave}>
        <span className="kt-pill grid size-14 place-items-center rounded-2xl"><Ico name="takeBack" size={28} /></span>
        <h2 className="font-mono text-base font-bold tracking-[0.25em]">MONEY BACK</h2>
        <Dash />
        <Big value={12_500_000} format={money} label="BACK IN YOUR BALANCE" />
        <Ok>Done</Ok>
        <Dash />
        <Cols><Field k="LINK" v="Closed" sub="Nobody can collect it now" /><Field k="FEE" v={formatMoney(0n)} /></Cols>
        <Dash />
        <IdBlock hash={F.fakeHash(0x6d)} details="/demo/receipt-received" />
      </Slip>
      <After><Button onClick={leave}>Done</Button></After>
    </Screen>
  );
}

const failErr = humanError(new Error("x"));
const netErr = humanError(new Error("network"));

export const LINK_STATES: DemoState[] = [
  { label: "Send: as a link", render: () => <LinkForm /> },
  { label: "Send: not enough balance", render: () => <LinkForm err={humanError(new Error("insufficient balance"))} /> },
  { label: "Send: holding it…", render: () => <Holding /> },
  { label: "Send: slow (>2.5 s)", render: () => <Holding slow /> },
  { label: "Done: link slip", render: () => <LinkSlip /> },
  { label: "Done: link copied", render: () => <LinkSlip copied /> },
  { label: "Collect: before load (blank)", render: () => <Collect hash={null} /> },
  { label: "Collect: link incomplete", render: () => <Collect link={null} /> },
  { label: "Collect: loading", render: () => <Collect info={null} /> },
  { label: "Collect: couldn't load", render: () => <Collect info={null} err={netErr} /> },
  { label: "Collect: signed out", render: () => <Collect signedIn={false} /> },
  { label: "Collect: sign-up", render: () => <Collect phase="signup" signedIn={false} /> },
  { label: "Collect", render: () => <Collect /> },
  { label: "Collect: collecting…", render: () => <Collect phase="collecting" /> },
  { label: "Collect: failed", render: () => <Collect err={failErr} /> },
  { label: "Collect: done (receipt prints)", render: () => <Collect phase="done" /> },
  { label: "Collect: already collected", render: () => <Collect info={{ ...INFO, settled: true }} /> },
  { label: "Sender: waiting + expired (tap Take it back)", render: () => <Waiting /> },
  { label: "Sender: taking back…", render: () => <Waiting busy={2n} /> },
  { label: "Sender: take back failed", render: () => <Waiting err={failErr} /> },
  { label: "Sender: money back slip", render: () => <TakenBack /> },
];
