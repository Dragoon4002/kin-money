"use client";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { zeroHash, type Address } from "viem";
import { Loading, Pad, Sheet, Status, Who, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { share } from "@/components/core/share";
import type { Mood } from "@/components/kinko/Kinko";
import { AddressKinko } from "@/components/kinko/PersonKinko";
import { Kinko } from "@/components/kinko/Kinko";
import { Amount, Band, Button, Chip, Countdown, ErrorText, Ico, Row, Screen } from "@/components/ui";
import { KinCircleAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { createCircleInvite, disableCircleInvite, readInviteKey, savedCircleLink } from "@/lib/circleLinks";
import { recordPayment } from "@/lib/contacts";
import { formatMoney } from "@/lib/money";
import { canSettle, circleHistory, circlePhase, getCircle, same, ZERO, type Circle, type CircleMember, type CirclePhase } from "@/lib/programs";
import { call } from "@/lib/tx";

export default function CircleDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const now = useNow();
  const { data, error, reload } = useLoad(async () => {
    const [c, history, myKey] = await Promise.all([getCircle(BigInt(id)), circleHistory(BigInt(id)), me ? readInviteKey(BigInt(id), me) : ZERO]);
    return { c, history, myKey };
  }, me && `${id}.${me}`); // wait for me: only members see the circle
  const { busy, status, error: actionError, run } = useAction();
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  // Others join and pay from their phones — keep this screen current.
  useEffect(() => {
    const i = setInterval(() => document.visibilityState === "visible" && reload(), 10_000);
    return () => clearInterval(i);
  }, [reload]);

  if (!data) return <Screen title="Savings circle" back="/circle">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { c, history, myKey } = data;
  const mine = c.members.find((m) => same(m.address, me));
  // Only seat holders (joined or invited) see it; invite links go through /circle/join.
  if (!mine) return <Screen title="Savings circle" back="/circle"><ErrorText>We couldn&apos;t find this circle.</ErrorText></Screen>;

  const n = c.seats;
  const phase = circlePhase(c, now);
  const open = n - c.members.length;
  const pot = c.contribution * BigInt(n);
  const turn = c.members[c.round];
  const roundEnds = c.roundStart + c.roundLength;
  const iPaid = mine?.paidRound === c.round + 1;

  async function act(fn: () => Promise<unknown>, after?: () => void) {
    const ok = await run(async () => (await fn(), true));
    if (ok) {
      after?.();
      reload();
    }
  }
  const join = () =>
    act(() =>
      mine!.depositFor
        ? call(addr.circle, KinCircleAbi, "join", [c.id], { fund: mine!.depositFor })
        : call(addr.circle, KinCircleAbi, "join", [c.id, 0n, 0n, 0n, zeroHash, "0x"]),
    );
  const pay = () => act(() => call(addr.circle, KinCircleAbi, "pay", [c.id], { fund: c.contribution }));
  const settle = () => act(() => call(addr.circle, KinCircleAbi, "settle", [c.id]), () => void recordPayment(turn.address, c.pot));
  const leave = () => act(() => call(addr.circle, KinCircleAbi, "leave", [c.id]));

  async function openInvite() {
    if (!me) return;
    setCopied(false);
    setInviting(true);
    const saved = savedCircleLink(c.id, me, myKey);
    if (saved) return setLink(saved);
    setLink("");
    const url = await run(async (say) => (say("Making your link…"), createCircleInvite(c.id, me)));
    if (url) {
      setLink(url);
      reload();
    }
  }
  async function turnOff() {
    const ok = await run(async () => (await disableCircleInvite(c.id, me!), true));
    if (ok) {
      setLink("");
      setInviting(false);
      reload();
    }
  }
  const inviteText = `Join my savings circle on Kin — ${formatMoney(c.contribution)} each round, and everyone takes home ${formatMoney(pot)} once. Tap to join:`;

  let primary: ReactNode = null;
  if (mine && phase === "gathering" && !mine.joined) {
    primary = <Button onClick={join} busy={busy}>{mine.depositFor ? `Join · ${formatMoney(mine.depositFor)} safety deposit` : "Join"}</Button>;
  } else if (mine && phase === "stalled" && mine.joined) {
    primary = <Button onClick={leave} busy={busy}>Get my deposit back</Button>;
  } else if (mine && phase === "running" && !iPaid && !mine.defaulted && !canSettle(c, now)) {
    primary = <Button onClick={pay} busy={busy}>Put in {formatMoney(c.contribution)}</Button>;
  } else if (phase === "running" && canSettle(c, now)) {
    primary = (
      <Button onClick={settle} busy={busy}>Pay out turn {c.round + 1}</Button>
    );
  }

  return (
    <Screen title="Savings circle" back="/circle" wide>
      <Table c={c} phase={phase} me={me} />

      <Pad className="flex flex-col items-center gap-2 text-center">
        {phase === "running" ? (
          now < roundEnds ? (
            <>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted">Round closes in</p>
              <Countdown seconds={roundEnds - now} />
            </>
          ) : (
            <p className="font-semibold">Round is over — time to pay out.</p>
          )
        ) : phase === "gathering" ? (
          <>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted">Starts when everyone joins · join closes in</p>
            <Countdown seconds={c.joinBy - now} />
          </>
        ) : phase === "stalled" ? (
          <p className="text-muted">Not everyone joined in time. Deposits go back to whoever joined.</p>
        ) : (
          <p className="font-display text-3xl">Everyone had their turn</p>
        )}
      </Pad>

      <section>
        <Band>Turns</Band>
        {c.members.map((m, i) => {
          const past = phase === "done" || (phase === "running" && i < c.round);
          const isTurn = phase === "running" && i === c.round;
          return (
            <Row
              key={m.address}
              icon={
                <span className={`grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold ${isTurn ? "bg-brand text-brand-ink" : past ? "bg-good/15 text-good" : "bg-surface-2 text-muted"}`}>
                  {past ? <Ico name="check" size={16} /> : i + 1}
                </span>
              }
              title={<Who a={m.address} me={me} />}
              sub={isTurn ? `Takes home ${formatMoney(pot)} this round` : past ? "Had their turn" : `Turn ${i + 1}`}
              trail={<Badge m={m} phase={phase} paidNow={m.paidRound === c.round + 1} />}
            />
          );
        })}
        {phase === "gathering" && Array.from({ length: open }, (_, k) => c.members.length + k).map((i) => (
          <Row
            key={`open${i}`}
            icon={<span className="grid size-9 shrink-0 place-items-center rounded-full border border-dashed border-line text-sm font-bold text-muted">{i + 1}</span>}
            title={<span className="text-muted">Open spot</span>}
            sub={`Turn ${i + 1} · whoever joins next`}
          />
        ))}
      </section>

      {phase === "gathering" && (
        <Pad>
          <p className="text-sm text-muted">
            A small safety deposit keeps everyone honest. Earlier turns put down a bigger one — it&apos;s returned at the end.
          </p>
        </Pad>
      )}

      {history.length > 0 && (
        <section>
          <Band>What happened</Band>
          {history.map((l, i) => <Story key={i} l={l} me={me} />)}
        </section>
      )}

      <Pad className="mt-auto flex flex-col gap-2 pt-4">
        <ErrorText>{!inviting && actionError}</ErrorText>
        <Status>{!inviting && busy && status}</Status>
        {primary}
        {mine && phase === "gathering" && open > 0 && <Button variant="soft" onClick={openInvite}>Invite to circle</Button>}
      </Pad>

      <Sheet open={inviting} onClose={() => !busy && setInviting(false)} label="Invite to circle">
        <h2 className="font-display text-3xl">Invite to circle</h2>
        <p className="text-muted">
          {open} {open === 1 ? "spot is" : "spots are"} open. Whoever opens your link first takes the next turn. You can turn it off any time.
        </p>
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy && status}</Status>
        {link && (
          <>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${inviteText} ${link}`)}`} target="_blank" rel="noreferrer"
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-good font-semibold text-fun-ink active:scale-[0.98]">
              <Ico name="share" /> Send on WhatsApp
            </a>
            <Button variant="soft" onClick={async () => (await share(inviteText, link)) === "copied" && setCopied(true)}>
              {copied ? "Link copied ✓" : "Share another way"}
            </Button>
          </>
        )}
        {(link || myKey !== ZERO) && <Button variant="ghost" onClick={turnOff} busy={busy}>Turn off my link</Button>}
      </Sheet>
    </Screen>
  );
}

/** The circle table: everyone's Kinko seated around the pot, spotlight on whose turn it is. */
function Table({ c, phase, me }: { c: Circle; phase: CirclePhase; me?: Address }) {
  const n = c.seats;
  const size = n <= 6 ? 60 : n <= 10 ? 46 : 34;
  const turn = c.members[c.round];
  const pot = c.contribution * BigInt(n);
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[340px]">
      <div className="absolute inset-[18%] grid place-items-center rounded-full border border-line bg-surface text-center">
        <div className="flex flex-col items-center gap-1 px-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted">
            {phase === "running" ? `Turn ${c.round + 1} of ${n}` : phase === "gathering" ? `${c.joined} of ${n} joined` : phase === "done" ? "Complete" : "Didn't start"}
          </p>
          <Amount value={formatMoney(pot)} size="md" />
          {phase === "running" && turn && (
            <p className="max-w-36 truncate text-sm font-semibold text-brand">
              <Who a={turn.address} me={me} you="Your" />{same(turn.address, me) ? "" : "'s"} turn
            </p>
          )}
          {phase === "running" && <p className="text-xs text-muted">{c.paidCount} of {n} put in</p>}
        </div>
      </div>
      {c.members.map((m, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        const isTurn = phase === "running" && i === c.round;
        const paid = phase === "running" && m.paidRound === c.round + 1;
        const ok = phase === "gathering" || phase === "stalled" ? m.joined : paid;
        const mood: Mood = m.defaulted ? "sad" : isTurn ? "celebrate" : ok ? "happy" : "calm";
        return (
          <div
            key={m.address}
            className={`absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center transition ${isTurn ? "z-10 scale-125" : ""} ${(phase === "gathering" && !m.joined) || m.defaulted ? "opacity-50" : ""}`}
            style={{ left: `${50 + 41 * Math.cos(a)}%`, top: `${50 + 41 * Math.sin(a)}%` }}
          >
            <div className="relative">
              {isTurn && <span aria-hidden className="absolute -inset-3 animate-pulse rounded-full bg-brand/30 blur-md" />}
              <span className={`relative block rounded-full ${isTurn ? "ring-2 ring-brand ring-offset-2 ring-offset-bg" : ""}`}>
                <AddressKinko address={m.address} size={size} mood={mood} />
              </span>
              {(ok || m.defaulted) && (
                <span className={`absolute -bottom-0.5 -right-0.5 grid size-5 place-items-center rounded-full border-2 border-bg text-[10px] font-bold text-fun-ink ${m.defaulted ? "bg-bad" : "bg-good"}`}>
                  {m.defaulted ? "!" : <Ico name="check" size={12} />}
                </span>
              )}
            </div>
            {n <= 8 && (
              <span className="mt-1 max-w-20 truncate text-[11px] font-semibold"><Who a={m.address} me={me} /></span>
            )}
          </div>
        );
      })}
      {phase === "gathering" && Array.from({ length: n - c.members.length }, (_, k) => c.members.length + k).map((i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        return (
          <div key={`open${i}`} aria-label="Open spot" className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
            style={{ left: `${50 + 41 * Math.cos(a)}%`, top: `${50 + 41 * Math.sin(a)}%` }}>
            <span className="relative block rounded-full border-2 border-dashed border-line opacity-60" style={{ width: size, height: size }}>
              <span className="absolute inset-0 grid place-items-center opacity-40 grayscale"><Kinko size={size - 8} mood="calm" /></span>
            </span>
            {n <= 8 && <span className="mt-1 text-[11px] font-semibold text-muted">Open</span>}
          </div>
        );
      })}
    </div>
  );
}

function Badge({ m, phase, paidNow }: { m: CircleMember; phase: CirclePhase; paidNow: boolean }) {
  if (m.defaulted) return <Chip tone="bad">Missed a round</Chip>;
  if (phase === "gathering" || phase === "stalled") return m.joined ? <Chip tone="good">Joined</Chip> : <Chip>Invited</Chip>;
  if (phase === "running") return paidNow ? <Chip tone="good">Paid ✓</Chip> : <Chip>Not yet</Chip>;
  return null;
}

type HistoryLog = Awaited<ReturnType<typeof circleHistory>>[number];

function Story({ l, me }: { l: HistoryLog; me?: Address }) {
  const a = l.args as { member?: Address; to?: Address; round?: bigint; amount?: bigint; covered?: bigint };
  const who = <Who a={a.member ?? a.to} me={me} />;
  const turn = a.round !== undefined ? Number(a.round) + 1 : 0;
  const line: Record<string, ReactNode> = {
    PaidOut: <>Turn {turn}: {who} took home {formatMoney(a.amount ?? 0n)} ✓✓</>,
    Defaulted: <>{who} missed turn {turn}. Their deposit covered {formatMoney(a.covered ?? 0n)}.</>,
    Forfeited: <>Turn {turn}&apos;s pot is shared at the end, since {who} missed a round.</>,
    DepositReturned: <>{who} got {formatMoney(a.amount ?? 0n)} deposit back ✓✓</>,
    ForfeitShared: <>{who} got {formatMoney(a.amount ?? 0n)} as their share for staying honest ✓✓</>,
  };
  return <Row title={<span className="whitespace-normal text-sm font-medium">{line[l.eventName]}</span>} />;
}
