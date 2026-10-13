"use client";
// /demo registry: every screen id → its states, each a render of the proposed pure views with fake data.
// Side effects are no-ops here: no storage writes, no fetches against fake hashes, no chain calls.
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { ActivityRow } from "@/components/core/ActivityRow";
import { useNow } from "@/components/programs/kit";
import { Card, Delivered, Screen, Tabs } from "@/components/ui";
import { humanError } from "@/lib/errors";
import { Moments } from "./activityParts";
import { RealSoon, RunView } from "./cashoutParts";
import { ClaimView, type ClaimViewProps } from "./ClaimView";
import * as F from "./fixtures";
import { Ticket } from "./Slip";
import { ACTIVITY_STATES } from "./EActivity";
import { CASHIN_STATES } from "./ECashin";
import { CASHOUT_STATES } from "./ECashout";
import { GIFT_STATES } from "./EGift";
import { LINK_STATES } from "./ELink";
import { GiftOpenView, type GiftOpenViewProps } from "./GiftOpenView";
import { cardUrl } from "@/lib/shareCard";
import { ReceiptTicketFailed, ReceiptTicketLoading, ReceiptTicketMissing, receiptCard, type Receipt as R } from "@/components/receipt/ReceiptTicket";
import { formatMoney } from "@/lib/money";

export type DemoState = { label: string; render: () => ReactNode };
export type DemoScreen = { id: string; group: string; title: string; states: DemoState[]; /** Real route for /demo/compare. */ real?: string; /** One line on the index. */ desc?: string };

const noop = () => {};
const failErr = humanError(new Error("x")); // "Something went wrong. Your money is safe."
const netErr = humanError(new Error("network"));

/** View Transition (crossfade) around a state change; plain update without it. */
const swap = (update: () => void) => (document.startViewTransition ? document.startViewTransition(() => flushSync(update)) : update());

/** Skeleton for 1.2 s, then the receipt crossfades in (like a slow load). */
function LoadsLater() {
  const [r, setR] = useState<R | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setR(F.RECEIPT_SENT), 1200);
    return () => clearTimeout(t);
  }, []);
  return r ? <Ticket r={r} back="/activity" /> : <ReceiptTicketLoading back="/activity" />;
}

/** One cash-out that moves itself through phase 1 → 2 → 3 without remounting, like the real screen. */
function LiveRun() {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (k >= F.RUNS.length - 1) return;
    const t = setTimeout(() => setK(k + 1), 1600);
    return () => clearTimeout(t);
  }, [k]);
  const run = F.RUNS[k];
  return (
    <Screen title="Cash out" back="/money">
      <RunView ausd={F.CASH_AUSD} run={{ ...run, hops: "hops" in run ? [...run.hops] : undefined }} onAgain={() => setK(0)} />
    </Screen>
  );
}

/** The image Share sends, straight from /api/card. */
function CardImg({ out, note }: { out?: boolean; note?: string }) {
  const r = out ? F.RECEIPT_SENT : F.RECEIPT_RECEIVED;
  const when = `${r.at.toLocaleDateString(undefined, { dateStyle: "medium" })} · ${r.at.toLocaleTimeString(undefined, { timeStyle: "short" })}`;
  const src = cardUrl(receiptCard({ hash: F.fakeHash(0x5a), r, ms: out ? 812 : 0, note, cat: out ? "food" : undefined, when }));
  return (
    <Screen title="Shared image">
      {/* eslint-disable-next-line @next/next/no-img-element -- generated PNG, shown as-is */}
      <img src={src} alt="Receipt image" className="w-full" />
      <a href={src} target="_blank" rel="noreferrer" className="text-center text-sm font-semibold text-brand">Open full size ↗</a>
    </Screen>
  );
}

const one = (render: () => ReactNode): DemoState[] => [{ label: "Default", render }];

function ActivityList() {
  const [list, setList] = useState(F.ITEMS);
  const [filter, setFilter] = useState<"all" | "out" | "in">("all");
  const shown = list.filter((i) => filter === "all" || i.dir === filter);
  return (
    <Screen wide title="Activity">
      <div className="px-5">
        <button onClick={() => {
          const add = () => setList((l) => [F.newItem(l.length), ...l]);
          // Older rows glide down to make room (View Transitions); without it they just move.
          swap(add);
        }}
          className="h-11 w-full rounded-full border border-dashed border-line text-sm font-semibold text-muted active:scale-95">
          Demo: add new payment
        </button>
      </div>
      <div className="px-5">
        <Tabs value={filter} options={[["all", "All"], ["out", "Sent"], ["in", "Received"]] as const} onChange={setFilter} />
      </div>
      <section className="kd-stagger flex flex-col">
        {shown.map((i) => (
          <div key={`${i.hash}:${i.logIndex}`} className={i.when === "just now" ? "kd-new" : ""} style={{ viewTransitionName: `r${i.hash.slice(2, 10)}-${i.logIndex}` }}>
            <ActivityRow item={i} />
          </div>
        ))}
      </section>
    </Screen>
  );
}

function Gift(p: Partial<GiftOpenViewProps>) {
  const now = useNow();
  return (
    <GiftOpenView hash="#demo" link={{ message: F.GIFT_MESSAGE }} info={F.GIFT.unbound} err="" phase="view" justBound={false}
      me={F.ME} profile={{ name: "sam" }} now={now} signup={<SignupStub />}
      onAccept={noop} onOpen={noop} onSignup={noop} onClose={noop} {...p} />
  );
}

function Claim(p: Partial<ClaimViewProps>) {
  return (
    <ClaimView hash="#demo" link={{}} info={F.CLAIM_INFO} err="" phase="view" secs="0.8" signedIn
      signup={<SignupStub />} onCollect={noop} onSignup={noop} {...p} />
  );
}

// The real sign-up (Onboard) creates a real account, so the demo shows a stand-in.
const SignupStub = () => <Card className="text-sm text-muted">Demo: the real sign-up screen goes here (not rendered, it creates a real account).</Card>;

export const SCREENS: DemoScreen[] = [
  { id: "e-gift", group: "Section E (new model)", title: "E1 Gifts: send → slip, open (every state)", real: "/gift",
    desc: "Wrap a gift → gift slip (to a name / as a link, countdown, share) + open a gift link, stamps for each state", states: GIFT_STATES },
  { id: "e-link", group: "Section E (new model)", title: "E1 Links: create → slip, collect, take back", real: "/send",
    desc: "Send by link → link slip (copy, WhatsApp, expiry) + collect (done = receipt) + sender's take-back", states: LINK_STATES },
  { id: "e-activity", group: "Section E (new model)", title: "E2 Activity: cards, rows, links", real: "/activity",
    desc: "Savings coupon, Moments ticket stubs, links waiting, filters, statement roll; tap → receipt", states: ACTIVITY_STATES },
  { id: "e-cashout", group: "Section E (new model)", title: "E3 Cash out: quote → steps → receipt", real: "/cashout",
    desc: "Amount, printed route + itemized quote, progress tape, cash-out receipt (₹, practice stamp), coming soon", states: CASHOUT_STATES },
  { id: "e-cashin", group: "Section E (new model)", title: "E4 Add money: other apps + already here", real: "/add",
    desc: "Pickers, payment request slip (QR, code), tracking tape, money added receipt, waiting money, payer's view", states: CASHIN_STATES },

  { id: "receipt-fresh", group: "Receipt", title: "Just sent: printed ticket (812 ms, note)", real: "/details?tx=TX&fresh=1&ms=812",
    states: one(() => <Ticket ms={812} />) },
  { id: "receipt-card", group: "Receipt", title: "Shared image (whole receipt)",
    states: [
      { label: "Sent, with note", render: () => <CardImg out note="Dinner at the beach with Maya, Sam and the whole family after the long trip home" /> },
      { label: "Received, no note", render: () => <CardImg /> },
    ] },
  { id: "receipt-sent", group: "Receipt", title: "Sent, opened later (category)", real: "/details?tx=TX",
    states: one(() => <Ticket back="/activity" />) },
  { id: "receipt-received", group: "Receipt", title: "Received", real: "/details?tx=TX",
    states: one(() => <Ticket r={F.RECEIPT_RECEIVED} back="/activity" />) },
  { id: "receipt-failed", group: "Receipt", title: "Didn't go through",
    states: one(() => <ReceiptTicketFailed r={F.RECEIPT_FAILED} note="Dinner last night" />) },
  { id: "receipt-loading", group: "Receipt", title: "Loading skeleton", real: "/details?tx=TX",
    states: [
      { label: "Printing in a sec", render: () => <ReceiptTicketLoading back="/activity" /> },
      { label: "Loading → prints (1.2 s)", render: () => <LoadsLater /> },
    ] },
  { id: "receipt-missing", group: "Receipt", title: "Not found", real: `/details?tx=${F.fakeHash(0x5a)}`,
    states: one(() => <ReceiptTicketMissing />) },

  { id: "cashout-run", group: "Money movement", title: "Cash out: phase 1 → 2 → 3 (old)", real: "/cashout",
    states: [
      { label: "Live 1 → 2 → 3", render: () => <LiveRun /> },
      ...F.RUNS.map((run) => ({ label: `Phase ${run.phase}`, render: () => (
        <Screen title="Cash out" back="/money"><RunView ausd={F.CASH_AUSD} run={{ ...run, hops: "hops" in run ? [...run.hops] : undefined }} onAgain={noop} /></Screen>
      ) })),
    ] },
  { id: "cashout-soon", group: "Money movement", title: "Cash out: real money, coming soon (old)", real: "/cashout",
    states: one(() => <Screen title="Cash out" back="/money"><RealSoon /></Screen>) },
  { id: "add-done", group: "Money movement", title: "Add money: done (old)",
    states: one(() => (
      <Screen title="Add money" back="/money">
        <Delivered title={`${formatMoney(100_000_000n)} added`} subtitle="It's in your balance, ready to send">
          <Link href={`/details?tx=${F.fakeHash(0x66)}`} className="block text-center text-sm font-semibold text-brand">Proof of payment</Link>
        </Delivered>
        <div className="mt-auto pt-2">
          <Link href="/send" className="grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">Send money</Link>
        </div>
      </Screen>
    )) },

  { id: "activity-list", group: "Activity", title: "Payment rows (+ add new) (old)", real: "/activity",
    states: one(() => <ActivityList />) },
  { id: "activity-moments", group: "Activity", title: "Moments cards (old)", real: "/activity",
    states: one(() => (
      <Screen wide title="Activity">
        <Moments items={F.ITEMS} />
        <section className="flex flex-col">{F.ITEMS.slice(0, 3).map((i) => <ActivityRow key={i.hash} item={i} />)}</section>
      </Screen>
    )) },

  { id: "gift-open", group: "Links", title: "Open a gift (every state) (old)", real: "/gift/open#bad",
    states: [
      { label: "Before load (blank)", render: () => <Gift hash={null} /> },
      { label: "Link incomplete", render: () => <Gift link={null} /> },
      { label: "Loading", render: () => <Gift info={null} /> },
      { label: "Couldn't load", render: () => <Gift info={null} err={netErr} /> },
      { label: "Signed out", render: () => <Gift me={undefined} profile={null} /> },
      { label: "Sign-up", render: () => <Gift phase="signup" profile={null} me={undefined} /> },
      { label: "Accept", render: () => <Gift /> },
      { label: "Accepting…", render: () => <Gift phase="binding" /> },
      { label: "Accept failed", render: () => <Gift err={failErr} /> },
      { label: "Just accepted, locked", render: () => <Gift info={F.GIFT.minelocked} justBound /> },
      { label: "Yours, locked", render: () => <Gift info={F.GIFT.minelocked} /> },
      { label: "Ready to open", render: () => <Gift info={F.GIFT.mineReady} /> },
      { label: "Opening…", render: () => <Gift info={F.GIFT.mineReady} phase="opening" /> },
      { label: "Opened (celebrate)", render: () => <Gift info={F.GIFT.mineOpened} phase="opened" /> },
      { label: "Opened ✓ (later)", render: () => <Gift info={F.GIFT.mineOpened} /> },
      { label: "Accepted by someone else", render: () => <Gift info={F.GIFT.otherBound} /> },
      { label: "No longer available", render: () => <Gift info={F.GIFT.gone} /> },
      { label: "Sender's own link", render: () => <Gift info={F.GIFT.fromMe} /> },
    ] },
  { id: "claim", group: "Links", title: "Collect a link (every state) (old)", real: "/claim#bad",
    states: [
      { label: "Before load (blank)", render: () => <Claim hash={null} /> },
      { label: "Link incomplete", render: () => <Claim link={null} /> },
      { label: "Loading", render: () => <Claim info={null} /> },
      { label: "Couldn't load", render: () => <Claim info={null} err={netErr} /> },
      { label: "Signed out", render: () => <Claim signedIn={false} /> },
      { label: "Sign-up", render: () => <Claim phase="signup" signedIn={false} /> },
      { label: "Collect", render: () => <Claim /> },
      { label: "Collecting…", render: () => <Claim phase="collecting" /> },
      { label: "Collect failed", render: () => <Claim err={failErr} /> },
      { label: "Done", render: () => <Claim phase="done" /> },
      { label: "Already collected", render: () => <Claim info={{ ...F.CLAIM_INFO, settled: true }} /> },
    ] },
];

export const screenOf = (id: string) => SCREENS.find((s) => s.id === id);
