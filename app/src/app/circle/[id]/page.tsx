"use client";
import { useParams } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { zeroHash, type Address } from "viem";
import { Loading, Pad, Status, Who, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { Kinko, type Mood } from "@/components/kinko/Kinko";
import { Amount, Band, Button, Chip, Countdown, ErrorText, Ico, Row, Screen } from "@/components/ui";
import { KinCircleAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney } from "@/lib/money";
import { canSettle, circleHistory, circlePhase, getCircle, same, type Circle, type CircleMember, type CirclePhase } from "@/lib/programs";
import { call } from "@/lib/tx";

export default function CircleDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const now = useNow();
  const { data, error, reload } = useLoad(async () => {
    const [c, history] = await Promise.all([getCircle(BigInt(id)), circleHistory(BigInt(id))]);
    return { c, history };
  }, id);
  const { busy, status, error: actionError, run } = useAction();

  // Others join and pay from their phones — keep this screen current.
  useEffect(() => {
    const i = setInterval(reload, 10_000);
    return () => clearInterval(i);
  }, [reload]);

  if (!data) return <Screen title="Savings circle" back="/circle">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { c, history } = data;
  if (!c.members.length) return <Screen title="Savings circle" back="/circle"><ErrorText>We couldn&apos;t find this circle.</ErrorText></Screen>;

  const n = c.members.length;
  const phase = circlePhase(c, now);
  const mine = c.members.find((m) => same(m.address, me));
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
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy && status}</Status>
        {primary}
      </Pad>
    </Screen>
  );
}

/** The circle table: everyone's Kinko seated around the pot, spotlight on whose turn it is. */
function Table({ c, phase, me }: { c: Circle; phase: CirclePhase; me?: Address }) {
  const n = c.members.length;
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
                <Kinko size={size} mood={mood} />
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
