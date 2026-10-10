"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { erc20Abi, isAddressEqual, isHash, parseEventLogs, type Address, type Hex } from "viem";
import { share } from "@/components/core/share";
import { MyKinko } from "@/components/kinko/PersonKinko";
import { Amount, Band, Button, Card, Chip, Ico, IconTile, Row, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { CATEGORIES, categoryOf, setCategory, noteOf } from "@/lib/categories";
import { money as moneyNet, networks, type Network } from "@/lib/chain";
import { savedLook } from "@/lib/kinko";
import { formatMoney } from "@/lib/money";
import { shareCard, warmCard, type CardParams } from "@/lib/shareCard";
import { describe, isKinContract } from "@/lib/counterparty";
import { nameOf, shortAddr } from "@/lib/names";
import { play } from "@/lib/sound";

type Receipt = { net: Network; amount: bigint; from: string; to: string; fromA?: Address; toA?: Address; out: boolean; at: Date; block: bigint; ok: boolean };

// Not on Kin (no @name) → short address; the full one is copyable below.
const label = (n: string, a?: Address) => (n ? `@${n}` : a ? shortAddr(a) : "someone");

async function load(hash: Hex, me?: Address): Promise<Receipt> {
  // Current mode's network first, then the other one (a practice receipt opened in real-money mode, or vice versa).
  const first = moneyNet();
  const nets = [first, first.mode === "main" ? networks.test : networks.main];
  let found: { net: Network; r: Awaited<ReturnType<Network["client"]["getTransactionReceipt"]>> } | null = null;
  for (const net of nets) {
    const r = await net.client.getTransactionReceipt({ hash }).catch(() => null);
    if (r) {
      found = { net, r };
      break;
    }
  }
  if (!found) throw new Error("receipt not found");
  const { net, r } = found;
  const block = await net.client.getBlock({ blockNumber: r.blockNumber });
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: r.logs }).filter((l) => isAddressEqual(l.address, net.ausd));
  const t = transfers.find((l) => me && (isAddressEqual(l.args.from, me) || isAddressEqual(l.args.to, me))) ?? transfers[0];
  // A Kin contract on either side → describe what it was for ("Chore for @b"), else the person's @name.
  const side = async (a: Address, dir: "in" | "out") =>
    isKinContract(a) && me ? describe(hash, a, dir, me) : label(await nameOf(a).catch(() => ""), a);
  const [from, to] = t ? await Promise.all([side(t.args.from, "in"), side(t.args.to, "out")]) : [label(""), label("")];
  return {
    net,
    amount: t?.args.value ?? 0n,
    from,
    to,
    fromA: t?.args.from,
    toA: t?.args.to,
    out: !!(t && me && isAddressEqual(t.args.from, me)),
    at: new Date(Number(block.timestamp) * 1000),
    block: r.blockNumber,
    ok: r.status === "success",
  };
}

const onKin = (s: string) => (s.startsWith("0x") ? "Not on Kin" : "On Kin");
const copyOf = (s: string, a?: Address) =>
  s.startsWith("@") ? <Copy text={s} what="name" /> : s.startsWith("0x") && a ? <Copy text={a} what="address" /> : null;

/** Friendly short receipt number: "A1B2C3…9F0E". */
const paymentId = (h: string) => `${h.slice(2, 8)}…${h.slice(-4)}`.toUpperCase();

function Copy({ text, what }: { text: string; what: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      aria-label={`Copy ${what}`}
      onClick={() => navigator.clipboard.writeText(text).then(() => (setDone(true), setTimeout(() => setDone(false), 1500)))}
      className="grid size-11 place-items-center rounded-full text-muted active:bg-surface-2"
    >
      {done ? (
        <Ico name="check" className="text-good" />
      ) : (
        <Ico name="copy" />
      )}
    </button>
  );
}

// Receipt. Proof of payment (public-ledger record) lives ONLY here, for the curious and for judges.
export function Proof() {
  const { profile } = useRequireAccount();
  const params = useSearchParams();
  const tx = params.get("tx") ?? "";
  const hash = isHash(tx) ? tx : null;
  const fresh = params.get("fresh") === "1";
  const ms = Number(params.get("ms"));
  const me = profile?.address;
  const [r, setR] = useState<Receipt | null>(null);
  const [failed, setFailed] = useState(false);
  // Client-only under Suspense (useSearchParams), so localStorage reads are safe here.
  const [cat, setCat] = useState(() => (hash ? categoryOf(hash) : null));
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [cardCopied, setCardCopied] = useState(false);
  const note = hash ? noteOf(hash) : "";

  useEffect(() => {
    if (hash) load(hash, me).then(setR).catch(() => setFailed(true));
  }, [hash, me]);

  // Share card: only the amount + @names, never the receipt number or account.
  const at = (s: string) => (s.startsWith("@") ? s.slice(1) : undefined);
  const card: CardParams | null = !r?.ok ? null : r.out
    ? { kind: "sent", amount: r.amount, to: at(r.to), from: profile?.name, secs: fresh && ms > 0 && ms < 60_000 ? (ms / 1000).toFixed(1) : undefined, look: me && savedLook(me) }
    : { kind: "received", amount: r.amount, from: at(r.from), look: me && savedLook(me) };
  useEffect(() => {
    if (card) warmCard(card); // memoized by URL; ready before the tap so the share sheet opens
  });

  // Just sent and it went through: the "sent" sound (lib/sound.ts).
  useEffect(() => {
    if (fresh && r?.ok) play("sent");
  }, [fresh, r?.ok]);

  // Nudge the server so the other person's notification goes out now (fire-and-forget).
  useEffect(() => {
    if (fresh) fetch("/api/push/tick").catch(() => {});
  }, [fresh]);

  if (!hash || failed) {
    return (
      <Screen title="Receipt" back="/activity">
        <Card>We couldn&apos;t find this receipt. Your money is safe.</Card>
      </Screen>
    );
  }

  if (!r) {
    return (
      <Screen title="Receipt" back="/activity">
        <div className="flex flex-col items-center gap-4 py-8" aria-busy="true" aria-label="Loading receipt">
          <span className="size-20 animate-pulse rounded-full bg-surface-2" />
          <span className="h-14 w-48 animate-pulse rounded-2xl bg-surface-2" />
          <span className="h-4 w-32 animate-pulse rounded-full bg-surface-2" />
        </div>
      </Screen>
    );
  }

  const money = formatMoney(r.amount);
  const other = r.out ? r.to : r.from;
  // r only exists after mount (loaded in an effect), so local-time formatting can't mismatch hydration.
  const offset = new Intl.DateTimeFormat(undefined, { timeZoneName: "shortOffset" }).formatToParts(r.at).find((p) => p.type === "timeZoneName")?.value;
  const when = `${r.at.toLocaleDateString(undefined, { dateStyle: "long" })}, ${r.at.toLocaleTimeString(undefined, { timeStyle: "short" })}${offset ? ` (${offset})` : ""}`;
  const secs = ms > 0 ? (ms / 1000).toFixed(1) : null;

  async function shareReceipt() {
    const text = `${r!.out ? `Paid ${money} to ${other}` : `Got ${money} from ${other}`} with Kin${note ? ` · ${note}` : ""}. Delivered ✓✓`;
    if ((await share(text)) === "copied") setCopied(true);
  }

  return (
    <Screen wide back={fresh ? "/home" : "/activity"} title="Receipt">
      <section className="flex flex-col items-center gap-3 px-5 pb-4 text-center">
        {!r.ok ? (
          <>
            <div className="grid size-20 place-items-center rounded-full bg-bad/15 text-3xl font-bold text-bad">!</div>
            <p className="text-muted">Didn&apos;t go through — money not moved</p>
          </>
        ) : fresh ? (
          <div className="kin-pop relative">
            <MyKinko mood="celebrate" size={56} />
            <span className="kin-pop absolute -bottom-1 -right-3 grid size-8 place-items-center rounded-full border-2 border-bg bg-good text-fun-ink [animation-delay:250ms]"><Ico name="check" size={16} /></span>
          </div>
        ) : (
          <div className="grid size-16 place-items-center rounded-full bg-good text-fun-ink"><Ico name="check" size={30} /></div>
        )}
        <div className="flex flex-col items-center gap-1">
          <span className="font-display text-3xl text-muted">{r.out ? "Paid" : "Received"}</span>
          <Amount value={money} />
        </div>
        {r.ok && fresh && secs && <Chip tone="good">Delivered in {secs}s ✓✓</Chip>}
        {r.ok && !fresh && <Chip tone="good">Delivered ✓✓</Chip>}
        {note && <Chip>“{note}”</Chip>}
      </section>

      <Card className="mx-5 mb-4 flex flex-col gap-1">
        <span className="text-sm text-muted">{r.out ? "Paid to" : "Received from"}</span>
        <span className="break-words font-display text-3xl">{other}</span>
        {other.startsWith("@") && (
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <Ico name="safe" size={16} className="text-good" /> Kin name: {other}
          </span>
        )}
        <span className="mt-2 text-sm text-muted">{when}</span>
        {other.startsWith("@") && (
          <Link href={`/messages/${other.slice(1)}`} className="mt-2 flex h-11 items-center gap-2 self-start rounded-full bg-surface-2 px-4 text-sm font-semibold active:scale-95">
            <Ico name="chat" size={18} /> Message {other}
          </Link>
        )}
      </Card>

      {r.out && cat && (
        <section className="flex flex-col">
          <Row
            icon={<IconTile name={cat.icon} size={44} />}
            title={cat.label}
            sub="Category"
            trail={
              <button onClick={() => setEditing((e) => !e)} className="h-11 rounded-full px-4 text-sm font-semibold text-brand active:bg-brand-soft">
                {editing ? "Done" : "Edit"}
              </button>
            }
          />
          {editing && (
            <div className="flex flex-wrap gap-2 px-5 pb-4" role="radiogroup" aria-label="Category">
              {CATEGORIES.map((c) => (
                <button key={c.id} role="radio" aria-checked={cat.id === c.id}
                  onClick={() => (setCategory(hash, c.id), setCat(c), setEditing(false))}
                  className={`flex h-11 items-center gap-1.5 rounded-full px-4 text-sm font-semibold active:scale-95 ${cat.id === c.id ? "bg-ink text-bg" : "bg-surface-2 text-muted"}`}>
                  <Ico name={c.icon} size={18} /> {c.label}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="flex flex-col">
        <Band>Details</Band>
        <Row title={`To: ${r.to}`} sub={r.out ? onKin(r.to) : "You"} trail={copyOf(r.to, r.toA)} />
        <Row title={`From: ${r.from}`} sub={r.out ? "You" : onKin(r.from)} trail={copyOf(r.from, r.fromA)} />
        <Row title="Payment ID" sub={paymentId(hash)} trail={<Copy text={paymentId(hash)} what="payment ID" />} />
      </section>

      <div className="flex flex-col gap-2 px-5">
        <Button variant="ink" onClick={shareReceipt}>{copied ? "Receipt copied ✓" : "Share receipt"}</Button>
        {card && (
          <Button variant="ghost" onClick={async () => (await shareCard(card, `${r.out ? "Sent" : "Got"} ${money} with Kin. Delivered ✓✓`)) === "copied" && setCardCopied(true)}>
            {cardCopied ? "Link copied ✓" : "Share card"}
          </Button>
        )}
      </div>

      <section className="flex flex-col">
        <Band>Proof of payment</Band>
        <div className="flex flex-col gap-3 px-5 pt-3">
          <p className="text-sm text-muted">
            Every Kin payment is recorded on the Monad public blockchain, so anyone can check it happened. Settled in dollars (AUSD), no fees.
          </p>
          <p className="text-xs text-muted">Block {r.block.toString()}</p>
          <code className="break-all rounded-2xl bg-surface-2 p-3 font-mono text-xs">{hash}</code>
          <a href={`${(r?.net ?? moneyNet()).explorer}/tx/${hash}`} target="_blank" rel="noreferrer"
            className="grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">
            Verify on the public explorer ↗
          </a>
        </div>
      </section>
    </Screen>
  );
}
