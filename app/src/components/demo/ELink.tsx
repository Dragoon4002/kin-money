"use client";
// Section E1 demo (Pay), in the real Pay screen's look (app/send/SendForm.tsx): To a person → pick, amount, note →
// sending → the real receipt ticket. As a link → holding → "Your link is ready" (WhatsApp / share). Collect = the real
// claim screen (ClaimView), and the sender's side in Activity: waiting, expired → Take it back → the row goes away.
// A pasted account (not on Kin) is picked directly, like the real PersonPicker; no Gifts chip here (gifts have their own flow).
import Link from "next/link";
import { useState } from "react";
import { getAddress, isAddress } from "viem";
import { share } from "@/components/core/share";
import { AmountInput } from "@/components/social/bits";
import { Avatar, Button, Card, Delivered, ErrorText, Ico, Screen, Tabs, inputClass } from "@/components/ui";
import { humanError } from "@/lib/errors";
import { CATEGORIES } from "@/lib/categories";
import { formatMoney, toUnits } from "@/lib/money";
import { shortAddr } from "@/lib/names";
import { ClaimView, type ClaimViewProps } from "./ClaimView";
import { PENDING, PendingLinks } from "./EActivity";
import * as F from "./fixtures";
import { Ticket } from "./Slip";
import type { DemoState } from "./screens";

const noop = () => {};
const LINK_URL = "https://getkin.space/claim#42.s3cr3t";
const AMT = 30_000_000n;
// An account from another app (pasted or scanned): checksummed like the real picker's getAddress.
const ADDR = getAddress("0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b9f0e");
const CATS = CATEGORIES.filter((c) => c.id !== "gifts");
const isAcct = (who: string) => who.startsWith("0x");
const whoLabel = (who: string) => (isAcct(who) ? shortAddr(who) : `@${who}`);

/* ── Send by link ────────────────────────────────────────────────────────────────────────────────── */

const MODES = [["person", "To a person"], ["link", "As a link"]] as const;
type Mode = (typeof MODES)[number][0];
const RECENTS = ["maya", "mom", "raj", "lena"];

/** Static stand-in for the real PersonPicker (that one reads the phonebook and looks names up). */
function Picker({ onPick, typed }: { onPick: (who: string) => void; typed?: string }) {
  const [typing, setTyping] = useState(typed !== undefined);
  const [q, setQ] = useState(typed ?? "");
  const h = q.trim().replace(/^@/, "").toLowerCase();
  const miss = h.length >= 3 && !RECENTS.includes(h) && !isAddress(h);
  const lookup = (v: string) => {
    setQ(v);
    const t = v.trim().replace(/^@/, "").toLowerCase();
    if (isAddress(t)) onPick(getAddress(t));
    else if (RECENTS.includes(t)) onPick(t);
  };
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <span className="text-sm font-medium text-muted">To</span>
      <div className="flex flex-wrap gap-x-4 gap-y-3" aria-label="Recent people">
        <button type="button" onClick={() => setTyping((t) => !t)} aria-pressed={typing} className="flex w-14 shrink-0 flex-col items-center gap-1.5 text-xs text-muted active:scale-95">
          <span className={`grid size-14 place-items-center rounded-full border border-dashed text-2xl ${typing ? "border-brand text-brand" : "border-line text-ink"}`}>+</span>
          Add new
        </button>
        {RECENTS.map((n) => (
          <button key={n} type="button" onClick={() => onPick(n)} className="flex w-14 shrink-0 flex-col items-center gap-1.5 text-xs active:scale-95">
            <span className="rounded-full p-0.5 ring-2 ring-transparent"><Avatar name={n} size={52} /></span>
            <span className="w-full truncate text-center text-muted">@{n}</span>
          </button>
        ))}
      </div>
      {typing && (
        <label className="flex flex-col gap-1.5">
          <span className="sr-only">Kin name</span>
          <input className={inputClass} placeholder="@name" autoCapitalize="none" autoCorrect="off" value={q} onChange={(e) => lookup(e.target.value)} />
          {miss && <span className="text-xs text-muted">No one on Kin with that name yet.</span>}
        </label>
      )}
    </div>
  );
}

function PayForm({ mode: m0 = "link", picking, typed, to = "maya", err = "" }: { mode?: Mode; picking?: boolean; typed?: string; to?: string; err?: string }) {
  const [mode, setMode] = useState<Mode>(m0);
  const [who, setWho] = useState(picking ? "" : to);
  const [copied, setCopied] = useState(false);
  const [amount, setAmount] = useState(m0 === "person" ? "25" : "30");
  const [cat, setCat] = useState<string | null>(m0 === "person" ? "food" : null);
  const units = Number(amount) > 0 ? toUnits(amount) : 0n;
  const person = mode === "person";
  const ready = units > 0n && (!person || !!who);
  return (
    <Screen title="Pay" back="/demo">
      <Tabs value={mode} options={MODES} onChange={setMode} />
      {person ? (who ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3 rounded-[28px] border border-line bg-surface p-3">
            <Avatar name={isAcct(who) ? undefined : who} size={48} plain={isAcct(who)} />
            <span className="flex-1"><span className="block text-xs text-muted">To</span><span className="whitespace-nowrap font-semibold">{whoLabel(who)}</span></span>
            {isAcct(who) && (
              <button onClick={() => navigator.clipboard.writeText(who).then(() => setCopied(true))} aria-label="Copy address"
                className="grid size-11 place-items-center rounded-full text-muted active:bg-surface-2">
                <Ico name={copied ? "check" : "copy"} className={copied ? "text-good" : undefined} />
              </button>
            )}
            <button onClick={() => setWho("")} className="h-11 rounded-full px-4 text-sm font-semibold text-brand active:bg-brand-soft">Change</button>
          </div>
          {isAcct(who) && <p className="px-3 text-sm text-muted">Not on Kin — make sure this address is right.</p>}
        </div>
      ) : <Picker onPick={setWho} typed={typed} />) : (
        <p className="rounded-[28px] bg-brand-soft px-5 py-4 text-sm">
          For someone not on Kin yet. We&apos;ll hold the money safely and give you a link for WhatsApp. Not collected in 7 days? You can take it back.
        </p>
      )}
      <AmountInput label="Amount in USD" value={amount} onChange={setAmount} />
      <input className={`${inputClass} text-center`} placeholder="Add a note" defaultValue="Dinner last night" maxLength={80} aria-label="Note" />
      <div className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Category</span>
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none]" role="radiogroup" aria-label="Category">
          {CATS.map((c) => (
            <button key={c.id} type="button" role="radio" aria-checked={cat === c.id} onClick={() => setCat(cat === c.id ? null : c.id)}
              className={`flex h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold transition active:scale-95 ${cat === c.id ? "bg-ink text-bg" : "bg-surface-2 text-muted"}`}>
              <Ico name={c.icon} size={18} /> {c.label}
            </button>
          ))}
        </div>
      </div>
      <ErrorText>{err}</ErrorText>
      <div className="mt-auto pt-2">
        <Button disabled={!ready}>{person ? "Send now" : units ? `Create link for ${formatMoney(units)}` : "Enter an amount"}</Button>
      </div>
    </Screen>
  );
}

/** The real progress screen: avatar ringed by a spinner, the amount, one status line. */
function Holding({ status, to }: { status: string; to?: string }) {
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <div className="relative">
          <Avatar name={to && isAcct(to) ? undefined : to ?? "Link"} size={88} plain={!!to && isAcct(to)} />
          <span className="absolute -inset-2 animate-spin rounded-full border-4 border-brand border-t-transparent" />
        </div>
        <p className="font-display tabular text-6xl leading-none">{formatMoney(to ? 25_000_000n : AMT)}</p>
        <p className="text-muted" aria-live="polite">{status}</p>
      </div>
    </Screen>
  );
}

/** The real "Your link is ready" screen. */
function LinkReady({ copied }: { copied?: boolean }) {
  const [didCopy, setCopied] = useState(copied);
  const m = formatMoney(AMT);
  const text = `I sent you ${m} on Kin. "Dinner last night" Tap to collect it:`;
  return (
    <Screen>
      <Delivered title="Your link is ready" subtitle={`${m} is held safely for 7 days. Whoever opens the link can collect it.`}>
        <div className="flex flex-col gap-2">
          <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${LINK_URL}`)}`} target="_blank" rel="noreferrer"
            className="flex h-14 items-center justify-center gap-2 rounded-full bg-good font-semibold text-fun-ink active:scale-[0.98]">
            <Ico name="share" /> Send on WhatsApp
          </a>
          <Button variant="soft" onClick={async () => (await share(text, LINK_URL)) === "copied" && setCopied(true)}>{didCopy ? "Link copied ✓" : "Share another way"}</Button>
          <Link href="/demo" className="grid h-14 place-items-center font-semibold text-muted">Done</Link>
        </div>
      </Delivered>
    </Screen>
  );
}

/* ── Collect (app/claim): the real screen's markup via ClaimView ─────────────────────────────────── */

const SignupStub = () => <Card className="text-sm text-muted">Demo: the real sign-up screen goes here (not rendered, it creates a real account).</Card>;
const Collect = (p: Partial<ClaimViewProps>) => (
  <ClaimView hash="#demo" link={{}} info={F.CLAIM_INFO} err="" phase="view" secs="0.8" signedIn signup={<SignupStub />} onCollect={noop} onSignup={noop} {...p} />
);

/* ── Sender's side: Activity → links waiting ─────────────────────────────────────────────────────── */

function Waiting({ links = PENDING, busy = null, err = "" }: { links?: typeof PENDING; busy?: bigint | null; err?: string }) {
  const [list, setList] = useState(links);
  const [taking, setTaking] = useState(busy);
  return (
    <Screen wide title="Activity">
      <PendingLinks links={list} busy={taking} err={err}
        onTakeBack={(id) => (setTaking(id), setTimeout(() => (setList((l) => l.filter((x) => x.id !== id)), setTaking(null)), 1200))} />
      {!list.length && <p className="px-5 py-6 text-center text-sm text-muted">No links waiting.</p>}
    </Screen>
  );
}

const failErr = humanError(new Error("x"));
const netErr = humanError(new Error("network"));

export const LINK_STATES: DemoState[] = [
  { label: "Person: pick who", render: () => <PayForm mode="person" picking /> },
  { label: "Person: @maya, amount, note", render: () => <PayForm mode="person" /> },
  { label: "Person: not enough balance", render: () => <PayForm mode="person" err={humanError(new Error("insufficient balance"))} /> },
  { label: "Person: Identity check", render: () => <Holding to="maya" status="Confirm with Identity check" /> },
  { label: "Person: sending…", render: () => <Holding to="maya" status="Sending to @maya…" /> },
  { label: "Person: slow (>2.5 s)", render: () => <Holding to="maya" status="Almost there…" /> },
  { label: "Person: done (receipt prints)", render: () => <Ticket ms={812} note="Dinner last night" /> },
  { label: "Person: paste an account", render: () => <PayForm mode="person" picking typed="" /> },
  { label: "Person: account not valid", render: () => <PayForm mode="person" picking typed="0x1a2b3c4d9f0e" /> },
  { label: "Person: account (not on Kin), amount, note", render: () => <PayForm mode="person" to={ADDR} /> },
  { label: "Person: sending to an account…", render: () => <Holding to={ADDR} status={`Sending to ${shortAddr(ADDR)}…`} /> },
  { label: "Person: account done (receipt prints)", render: () => <Ticket ms={812} r={{ ...F.RECEIPT_SENT, to: shortAddr(ADDR), toA: ADDR }} note="Dinner last night" /> },
  { label: "Link: as a link", render: () => <PayForm /> },
  { label: "Link: not enough balance", render: () => <PayForm err={humanError(new Error("insufficient balance"))} /> },
  { label: "Link: holding it…", render: () => <Holding status="Holding it safely…" /> },
  { label: "Link: slow (>2.5 s)", render: () => <Holding status="Almost there…" /> },
  { label: "Link: done (link ready)", render: () => <LinkReady /> },
  { label: "Link: link copied", render: () => <LinkReady copied /> },
  { label: "Collect: before load (blank)", render: () => <Collect hash={null} /> },
  { label: "Collect: link incomplete", render: () => <Collect link={null} /> },
  { label: "Collect: loading", render: () => <Collect info={null} /> },
  { label: "Collect: couldn't load", render: () => <Collect info={null} err={netErr} /> },
  { label: "Collect: signed out", render: () => <Collect signedIn={false} /> },
  { label: "Collect: sign-up", render: () => <Collect phase="signup" signedIn={false} /> },
  { label: "Collect", render: () => <Collect /> },
  { label: "Collect: collecting…", render: () => <Collect phase="collecting" /> },
  { label: "Collect: failed", render: () => <Collect err={failErr} /> },
  { label: "Collect: done", render: () => <Collect phase="done" /> },
  { label: "Collect: already collected", render: () => <Collect info={{ ...F.CLAIM_INFO, settled: true }} /> },
  { label: "Sender: waiting + expired (tap Take it back)", render: () => <Waiting /> },
  { label: "Sender: taking back…", render: () => <Waiting busy={2n} /> },
  { label: "Sender: take back failed", render: () => <Waiting err={failErr} /> },
  { label: "Sender: taken back (row gone)", render: () => <Waiting links={PENDING.filter((l) => !l.expired)} /> },
];
