import { useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import { zeroHash, type Address } from "viem";
import { Countdown, Table } from "@/components/circle/Table";
import { InviteSheet } from "@/components/pot/bits";
import { Loading, Status, Who, useAction, useLoad, useMe, useNow } from "@/components/programs/kit";
import { Band, Button, Chip, ErrorText, Footer, Row, Screen, Serif, Text } from "@/components/ui";
import { KinCircleAbi } from "@/lib/abi";
import { createCircleInvite, disableCircleInvite, readInviteKey, savedCircleLink } from "@/lib/circleLinks";
import { addr } from "@/lib/config";
import { recordPayment } from "@/lib/contacts";
import { formatMoney } from "@/lib/money";
import { canSettle, circleHistory, circlePhase, getCircle, same, ZERO, type CircleMember, type CirclePhase } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/circle/[id]/page.tsx.
export default function CircleDetail() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const now = useNow();
  // Others join and pay from their phones: the key ticks every 10s so this screen stays current.
  const { data, error, reload } = useLoad(async () => {
    const [c, history, myKey] = await Promise.all([getCircle(BigInt(id)), circleHistory(BigInt(id)), me ? readInviteKey(BigInt(id), me) : ZERO]);
    return { c, history, myKey };
  }, me && id && /^\d+$/.test(id) ? `${id}.${me}.${Math.floor(now / 10)}` : undefined); // wait for me: only members see it
  const { busy, status, error: actionError, run } = useAction();
  const [inviting, setInviting] = useState(false);
  const [link, setLink] = useState("");

  if (!data) return <Screen title="Savings circle" back>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { c, history, myKey } = data;
  // Only seat holders (joined or invited) see it; invite links go through /circle/join.
  if (!c.members.some((m) => same(m.address, me))) return <Screen title="Savings circle" back><ErrorText>We couldn&apos;t find this circle.</ErrorText></Screen>;

  const n = c.seats;
  const phase = circlePhase(c, now);
  const open = n - c.members.length;
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

  async function openInvite() {
    if (!me) return;
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

  let primary: ReactNode = null;
  if (mine && phase === "gathering" && !mine.joined) {
    primary = <Button title={mine.depositFor ? `Join · ${formatMoney(mine.depositFor)} safety deposit` : "Join"} onPress={join} busy={busy} />;
  } else if (mine && phase === "stalled" && mine.joined) {
    primary = <Button title="Get my deposit back" onPress={leave} busy={busy} />;
  } else if (mine && phase === "running" && !iPaid && !mine.defaulted && !canSettle(c, now)) {
    primary = <Button title={`Put in ${formatMoney(c.contribution)}`} onPress={pay} busy={busy} />;
  } else if (phase === "running" && canSettle(c, now)) {
    primary = <Button title={`Pay out turn ${c.round + 1}`} onPress={settle} busy={busy} />;
  }

  const kicker = { color: t.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase", textAlign: "center" } as const;
  return (
    <Screen title="Savings circle" back scroll>
      <Table c={c} phase={phase} me={me} />

      <View style={{ alignItems: "center", gap: 8 }}>
        {phase === "running" ? (
          now < roundEnds ? (
            <>
              <Text style={kicker}>Round closes in</Text>
              <Countdown seconds={roundEnds - now} />
            </>
          ) : (
            <Text style={{ color: t.ink, fontWeight: "600" }}>Round is over — time to pay out.</Text>
          )
        ) : phase === "gathering" ? (
          <>
            <Text style={kicker}>Starts when everyone joins · join closes in</Text>
            <Countdown seconds={c.joinBy - now} />
          </>
        ) : phase === "stalled" ? (
          <Text style={{ color: t.muted, textAlign: "center" }}>Not everyone joined in time. Deposits go back to whoever joined.</Text>
        ) : (
          <Serif size={30}>Everyone had their turn</Serif>
        )}
      </View>

      <View>
        <Band>Turns</Band>
        {c.members.map((m, i) => {
          const past = phase === "done" || (phase === "running" && i < c.round);
          const isTurn = phase === "running" && i === c.round;
          return (
            <Row
              key={m.address}
              icon={
                <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: isTurn ? t.brand : past ? `${t.good}26` : t.surface2 }}>
                  {past ? <Check color={t.good} size={16} /> : <Text style={{ color: isTurn ? t.brandInk : t.muted, fontSize: 14, fontWeight: "700" }}>{i + 1}</Text>}
                </View>
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
            icon={
              <View style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1, borderStyle: "dashed", borderColor: t.line, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: t.muted, fontSize: 14, fontWeight: "700" }}>{i + 1}</Text>
              </View>
            }
            title={<Text style={{ color: t.muted }}>Open spot</Text>}
            sub={`Turn ${i + 1} · whoever joins next`}
          />
        ))}
      </View>

      {phase === "gathering" && (
        <Text style={{ color: t.muted, fontSize: 14 }}>
          A small safety deposit keeps everyone honest. Earlier turns put down a bigger one — it&apos;s returned at the end.
        </Text>
      )}

      {history.length > 0 && (
        <View>
          <Band>What happened</Band>
          {history.map((l, i) => <Story key={i} l={l} me={me} />)}
        </View>
      )}

      <InviteSheet
        open={inviting}
        onClose={() => !busy && setInviting(false)}
        title="Invite to circle"
        sub={`${open} ${open === 1 ? "spot is" : "spots are"} open. Whoever opens your link first takes the next turn. You can turn it off any time.`}
        text={`Join my savings circle on Kin — ${formatMoney(c.contribution)} each round, and everyone takes home ${formatMoney(pot)} once. Tap to join:`}
        link={link}
        canOff={!!link || myKey !== ZERO}
        onOff={turnOff}
        busy={busy}
        status={status}
        error={actionError}
      />

      <Footer>
        <ErrorText>{inviting ? "" : actionError}</ErrorText>
        <Status>{!inviting && busy ? status : ""}</Status>
        {primary}
        {!!mine && phase === "gathering" && open > 0 && <Button title="Invite to circle" variant="soft" onPress={openInvite} />}
      </Footer>
    </Screen>
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
  const t = useTheme();
  const a = l.args as { member?: Address; to?: Address; round?: bigint; amount?: bigint; covered?: bigint };
  const who = <Who a={a.member ?? a.to} me={me} />;
  const turn = a.round !== undefined ? Number(a.round) + 1 : 0;
  const line: Record<string, ReactNode> = {
    PaidOut: <>Turn {turn}: {who} took home {formatMoney(a.amount ?? 0n)} ✓</>,
    Defaulted: <>{who} missed turn {turn}. Their deposit covered {formatMoney(a.covered ?? 0n)}.</>,
    Forfeited: <>Turn {turn}&apos;s pot is shared at the end, since {who} missed a round.</>,
    DepositReturned: <>{who} got {formatMoney(a.amount ?? 0n)} deposit back ✓</>,
    ForfeitShared: <>{who} got {formatMoney(a.amount ?? 0n)} as their share for staying honest ✓</>,
  };
  if (!line[l.eventName]) return null;
  return <Text style={{ paddingVertical: 12, color: t.ink, fontSize: 14, fontWeight: "500" }}>{line[l.eventName]}</Text>;
}
