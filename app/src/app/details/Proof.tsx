"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { erc20Abi, isAddressEqual, isHash, parseEventLogs, type Address, type Hex } from "viem";
import { share } from "@/components/core/share";
import { MyKinko } from "@/components/kinko/PersonKinko";
import { Amount, Band, Button, Card, Chip, Ico, IconTile, Row, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { CATEGORIES, categoryOf, setCategory, noteOf } from "@/lib/categories";
import { addr, explorerTx, publicClient } from "@/lib/chain";
import { savedLook } from "@/lib/kinko";
import { formatMoney } from "@/lib/money";
import { shareCard, warmCard, type CardParams } from "@/lib/shareCard";
import { describe, isKinContract } from "@/lib/counterparty";
import { nameOf } from "@/lib/names";

type Receipt = { amount: bigint; from: string; to: string; out: boolean; at: Date; block: bigint; ok: boolean };

const label = (n: string) => (n ? `@${n}` : "Kin account");

async function load(hash: Hex, me?: Address): Promise<Receipt> {
  const r = await publicClient.getTransactionReceipt({ hash });
  const block = await publicClient.getBlock({ blockNumber: r.blockNumber });
  const transfers = parseEventLogs({ abi: erc20Abi, eventName: "Transfer", logs: r.logs }).filter((l) => isAddressEqual(l.address, addr.ausd));
  const t = transfers.find((l) => me && (isAddressEqual(l.args.from, me) || isAddressEqual(l.args.to, me))) ?? transfers[0];
  // A Kin contract on either side → describe what it was for ("Chore for @b"), else the person's @name.
  const side = async (a: Address, dir: "in" | "out") =>
    isKinContract(a) && me ? describe(hash, a, dir, me) : label(await nameOf(a).catch(() => ""));
  const [from, to] = t ? await Promise.all([side(t.args.from, "in"), side(t.args.to, "out")]) : [label(""), label("")];
  return {
    amount: t?.args.value ?? 0n,
    from,
    to,
    out: !!(t && me && isAddressEqual(t.args.from, me)),
    at: new Date(Number(block.timestamp) * 1000),
    block: r.blockNumber,
    ok: r.status === "success",
  };
}

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
  const when = r.at.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
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
          <div className="relative">
            <MyKinko mood="celebrate" size={56} />
            <span className="absolute -bottom-1 -right-3 grid size-8 place-items-center rounded-full border-2 border-bg bg-good text-fun-ink"><Ico name="check" size={16} /></span>
          </div>
        ) : (
          <div className="grid size-16 place-items-center rounded-full bg-good text-fun-ink"><Ico name="check" size={30} /></div>
        )}
        <div className="flex flex-col items-center gap-1">
          <span className="font-display text-3xl text-muted">{r.out ? "Paid" : "Received"}</span>
          <Amount value={money} />
        </div>
        <p className="font-semibold">{r.out ? `to ${other}` : `from ${other}`}</p>
        <p className="text-sm text-muted">{when}</p>
        {r.ok && fresh && secs && <Chip tone="good">Delivered in {secs}s ✓✓</Chip>}
        {r.ok && !fresh && <Chip tone="good">Delivered ✓✓</Chip>}
        {note && <Chip>“{note}”</Chip>}
      </section>

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
        <Row title={`To: ${r.to}`} sub={r.out ? "On Kin" : "You"} trail={r.to.startsWith("@") && <Copy text={r.to} what="name" />} />
        <Row title={`From: ${r.from}`} sub={r.out ? "You" : "On Kin"} trail={r.from.startsWith("@") && <Copy text={r.from} what="name" />} />
        <Row title="Payment ID" sub={paymentId(hash)} trail={<Copy text={paymentId(hash)} what="payment ID" />} />
        <Row title="Date" sub={when} />
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
          <a href={explorerTx(hash)} target="_blank" rel="noreferrer"
            className="grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">
            Verify on the public explorer ↗
          </a>
        </div>
      </section>
    </Screen>
  );
}
