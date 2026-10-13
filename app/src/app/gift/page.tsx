"use client";
import { useEffect, useRef, useState } from "react";
import type { Address } from "viem";
import { Empty, Loading, Pad, Status, Who, dateLabel, timeLeft, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { GiftReveal } from "@/components/gift/GiftReveal";
import { GiftWrap } from "@/components/gift/GiftWrap";
import { Band, Button, Card, Chip, ErrorText, Ico, IconTile, Screen } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { useAccount } from "@/lib/account";
import { addr } from "@/lib/chain";
import { api, loadNameTrie, recordPayment } from "@/lib/contacts";
import { createGiftLink, isBound, listGiftLinks, openGift, refundGift, type GiftLink } from "@/lib/giftLinks";
import { formatMoney, fromLocal } from "@/lib/money";
import { nameOf, resolveName } from "@/lib/names";
import { canRelease, createdId, listEscrows, same, ZERO, type Escrow } from "@/lib/programs";
import type { Trie } from "@/lib/trie";
import { call } from "@/lib/tx";

// "$500 when you graduate": money that opens on a date. Send = GiftWrap, open = GiftReveal (components/gift).
// "Someone to OK it" hidden for now (user, Oct 13); guardian gifts made before still show and can be OK'd here.

export default function GiftPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  // Ready gift for me → the box arrival (tap → it opens → note unfolds). msg: Kin-name gifts' note from /api/gift-notes.
  const [opening, setOpening] = useState<{ amount: bigint; from: Address; msg: string; open: () => Promise<unknown> } | null>(null);
  const opener = opening?.from; // not opening!.from: React Compiler would read it at render, while opening is null
  const sender = useLoad(() => (opener ? nameOf(opener).catch(() => "") : Promise.resolve("")), opener);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "gift").then((r) => r.escrows), me);
  const links = useLoad(() => listGiftLinks(me!), me);
  const reloadAll = () => (reload(), links.reload());

  if (creating) return <NewGift me={me} onClose={() => { setCreating(false); reloadAll(); }} />;
  if (opening) {
    return (
      <GiftReveal amount={opening.amount} sender={sender.data ?? ""} msg={opening.msg} signedIn
        onOpen={async (say) => { say("Opening your gift…"); await opening.open(); }}
        onLeave={() => { setOpening(null); reloadAll(); }} />
    );
  }

  const forMe = data?.filter((e) => same(e.to, me)) ?? [];
  const rest = data?.filter((e) => !same(e.to, me)) ?? [];
  const linksForMe = links.data?.filter((g) => same(g.recipient, me)) ?? [];
  const linksSent = links.data?.filter((g) => !same(g.recipient, me)) ?? [];
  const none = !!data && !!links.data && !data.length && !links.data.length;
  const sent = rest.length + linksSent.length > 0;

  return (
    <Screen title="Gifts" back="/explore" wide>
      <Pad className="flex flex-col gap-3">
        <ErrorText>{error ?? links.error}</ErrorText>
        {(!data || !links.data) && !error && !links.error && <Loading />}
        {none && <Empty icon="gift" title="No gifts yet" sub="Send money that opens on their birthday, or when they graduate." />}
        {linksForMe.map((g) => <GiftLinkCard key={`l${g.id}`} g={g} me={me} onOpen={() => setOpening({ amount: g.amount, from: g.from, msg: "", open: () => openGift(g.id) })} onDone={links.reload} />)}
        {forMe.map((e) => <GiftCard key={String(e.id)} e={e} me={me} onOpen={async () => {
          const msg = await api<{ body: string | null }>(`/api/gift-notes?id=${e.id}`).then((n) => n.body ?? "", () => "");
          setOpening({ amount: e.amount, from: e.from, msg, open: () => call(addr.escrow, KinEscrowAbi, "release", [e.id]) });
        }} onDone={reload} />)}
      </Pad>
      {sent && <Band>Sent or looked after by you</Band>}
      {sent && (
        <Pad className="flex flex-col gap-3">
          {linksSent.map((g) => <GiftLinkCard key={`l${g.id}`} g={g} me={me} onDone={links.reload} />)}
          {rest.map((e) => <GiftCard key={String(e.id)} e={e} me={me} onDone={reload} />)}
        </Pad>
      )}
      <Pad className="mt-auto pt-4">
        <Button onClick={() => setCreating(true)}>Send a gift</Button>
      </Pad>
    </Screen>
  );
}

function GiftCard({ e, me, onOpen, onDone }: { e: Escrow; me?: Address; onOpen?: () => void; onDone: () => void }) {
  const now = useNow();
  const { busy, status, error, run } = useAction();
  const mine = same(e.to, me);
  const locked = now < e.unlockAt;
  const needsOk = e.approver !== ZERO && !e.approved;
  const iGuard = same(e.approver, me) && needsOk && !e.settled;
  const iRefund = same(e.from, me) && !e.settled && !!e.expiresAt && now >= e.expiresAt;

  async function act(fn: "approve" | "refund") {
    const ok = await run(async () => (await call(addr.escrow, KinEscrowAbi, fn, [e.id]), true));
    if (!ok) return;
    if (fn === "approve" && !locked) void recordPayment(e.to, e.amount);
    onDone();
  }

  return (
    <Card className={`relative flex flex-col gap-3 overflow-hidden ${mine && !e.settled ? "border-brand/40 bg-brand-soft" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={mine && canRelease(e, now) ? "animate-bounce" : ""}><IconTile name={e.settled ? "celebrate" : locked ? "lock" : "gift"} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">
            {mine ? <>From <Who a={e.from} me={me} /></> : <>For <Who a={e.to} me={me} /></>}
          </p>
          <p className="truncate text-sm text-muted">
            {e.settled ? "Opened ✓" : locked ? `Opens ${dateLabel(e.unlockAt)}` : needsOk ? <>Waiting for <Who a={e.approver} me={me} you="your" />{same(e.approver, me) ? "" : "'s"} OK</> : "Ready to open"}
          </p>
        </div>
        <p className="font-display text-2xl tabular">{mine && locked && !e.settled ? <span aria-label="Hidden until it opens"><Ico name="lock" size={24} /></span> : formatMoney(e.amount)}</p>
      </div>
      {!e.settled && locked && (
        <p className="text-center"><Chip>Opens in {timeLeft(e.unlockAt - now)}</Chip></p>
      )}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {mine && canRelease(e, now) && onOpen && <Button onClick={onOpen}>Open gift</Button>}
      {iGuard && (
        <Button variant={locked ? "soft" : "primary"} onClick={() => act("approve")} busy={busy}>
          {locked ? "OK it for the big day" : "OK it — send now"}
        </Button>
      )}
      {iRefund && <Button variant="soft" onClick={() => act("refund")} busy={busy}>Take it back</Button>}
    </Card>
  );
}

/** A dated gift sent as a link: I'm the sender, or it was accepted by me. */
function GiftLinkCard({ g, me, onOpen, onDone }: { g: GiftLink; me?: Address; onOpen?: () => void; onDone: () => void }) {
  const now = useNow();
  const { busy, status, error, run } = useAction();
  const mine = same(g.recipient, me);
  const locked = now < g.unlockAt;
  const canOpen = mine && !g.settled && !locked;
  const canTakeBack = same(g.from, me) && !g.settled && now >= g.expiresAt;

  async function takeBack() {
    if (await run(async () => (await refundGift(g.id), true))) onDone();
  }

  const sub = mine
    ? g.settled ? "Opened ✓" : locked ? `Opens ${dateLabel(g.unlockAt)}` : "Ready to open"
    : g.settled ? (isBound(g) ? "Opened ✓" : "Back in your balance")
    : isBound(g) ? <>Accepted by <Who a={g.recipient} me={me} /> · opens {dateLabel(g.unlockAt)}</> : "Waiting to be accepted";

  return (
    <Card className={`flex flex-col gap-3 ${mine && !g.settled ? "border-brand/40 bg-brand-soft" : ""}`}>
      <div className="flex items-center gap-3">
        <span className={canOpen ? "animate-bounce" : ""}><IconTile name={g.settled ? "celebrate" : locked ? "lock" : "gift"} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{mine ? <>From <Who a={g.from} me={me} /></> : isBound(g) ? <>For <Who a={g.recipient} me={me} /></> : "Gift link"}</p>
          <p className="truncate text-sm text-muted">{sub}</p>
        </div>
        <p className="font-display text-2xl tabular">{mine && locked && !g.settled ? <span aria-label="Hidden until it opens"><Ico name="lock" size={24} /></span> : formatMoney(g.amount)}</p>
      </div>
      {mine && !g.settled && locked && <p className="text-center"><Chip>Opens in {timeLeft(g.unlockAt - now)}</Chip></p>}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {canOpen && onOpen && <Button onClick={onOpen}>Open gift</Button>}
      {canTakeBack && <Button variant="soft" onClick={takeBack} busy={busy}>Take back</Button>}
    </Card>
  );
}

function NewGift({ me, onClose }: { me?: Address; onClose: () => void }) {
  const { profile } = useAccount();
  const [trie, setTrie] = useState<Trie | null>(null);
  const to = useRef<Address | null>(null); // resolved in check, used by send
  useEffect(() => { loadNameTrie().then(setTrie, () => setTrie(null)); }, []); // no suggestions; exact lookup still works

  return (
    <GiftWrap from={profile?.name ?? ""} onClose={onClose} suggest={(p) => trie?.suggest(p, 6) ?? []}
      check={async (d) => {
        if (d.mode === "link") return null;
        to.current = await resolveName(d.to);
        if (!to.current) return "No one on Kin with that name yet.";
        return same(to.current, me) ? "That's you. Pick someone else." : null;
      }}
      send={async (d, unlockAt) => {
        const value = fromLocal(String(d.amount));
        if (d.mode === "link") return (await createGiftLink(value, unlockAt, d.msg.trim())).url;
        const who = to.current!;
        const hash = await call(addr.escrow, KinEscrowAbi, "create", [who, ZERO, ZERO, unlockAt, 0, 0], { fund: value });
        void recordPayment(who, value);
        // The message rides next to the gift (KinEscrow has no field for it). Best effort: the gift is already held.
        if (d.msg.trim()) void createdId(hash, KinEscrowAbi, "Created").then((id) => api("/api/gift-notes", "POST", { id: String(id), body: d.msg.trim() })).catch(() => {});
      }} />
  );
}
