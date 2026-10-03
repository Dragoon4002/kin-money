import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { zeroHash } from "viem";
import { Kinko } from "@/components/Kinko";
import { Button, Chip, ErrorText, Footer, Screen, Serif, Text } from "@/components/ui";
import { KinCircleAbi } from "@/lib/abi";
import { getAccount, useAccount } from "@/lib/account";
import { claimSeat, parseCircleLink } from "@/lib/circleLinks";
import { addr } from "@/lib/config";
import { addContact, registerMe } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { notifyAdded } from "@/lib/live";
import { formatMoney } from "@/lib/money";
import { nameOf } from "@/lib/names";
import { circlePhase, getCircle, same, type Circle } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/circle/join/page.tsx. The link key arrives as param `hash` (openKin passes the #fragment).
const every = (s: number) =>
  s === 7 * 86_400 ? "every week" : s === 30 * 86_400 ? "every month" : s % 86_400 === 0 ? `every ${s / 86_400} days` : `every ${Math.round(s / 60)} min`;

export default function JoinCircleLink() {
  const t = useTheme();
  const { hash = "" } = useLocalSearchParams<{ hash?: string }>();
  const link = parseCircleLink(hash);
  const key = link ? `${link.id}.${link.inviter}` : undefined;
  const { profile } = useAccount();
  const me = profile?.address;
  const [c, setC] = useState<Circle | null>(null);
  const [inviter, setInviter] = useState("");
  const [phase, setPhase] = useState<"view" | "claiming" | "joining">("view");
  const [err, setErr] = useState("");

  const load = (id: bigint) => getCircle(id).then(setC, (e) => setErr(humanError(e)));
  useEffect(() => {
    if (!link) return;
    void load(link.id);
    nameOf(link.inviter).then(setInviter, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the link
  }, [key]);

  async function take() {
    if (!link) return;
    setErr("");
    setPhase("claiming");
    try {
      const mine = (await getAccount()).address;
      await claimSeat(link.id, link.inviter, link.key, mine);
      notifyAdded("circle", link.id, [mine]);
      void registerMe();
      if (inviter) void addContact({ address: link.inviter, name: inviter }).catch(() => {});
    } catch (e) {
      setErr(humanError(e));
    }
    await load(link.id); // show the real state either way (someone may have taken the last spot)
    setPhase("view");
  }

  async function join(deposit: bigint) {
    if (!c) return;
    setErr("");
    setPhase("joining");
    try {
      await (deposit
        ? call(addr.circle, KinCircleAbi, "join", [c.id], { fund: deposit })
        : call(addr.circle, KinCircleAbi, "join", [c.id, 0n, 0n, 0n, zeroHash, "0x"]));
      router.replace(`/circle/${c.id}`);
      return;
    } catch (e) {
      setErr(humanError(e));
    }
    setPhase("view");
  }

  const muted = { color: t.muted, fontSize: 16, textAlign: "center" } as const;
  const openKin = <Button title="Open Kin" variant="soft" onPress={() => router.replace(profile ? "/tabs" : "/")} />;

  if (!link) {
    return (
      <Screen title="Kin">
        <Text style={{ color: t.ink, fontSize: 16, backgroundColor: t.surface, borderRadius: 28, padding: 20 }}>This invite link looks incomplete. Ask your friend to share it again.</Text>
        <Footer>{openKin}</Footer>
      </Screen>
    );
  }

  const from = inviter ? `@${inviter}` : "A friend";
  const mine = c?.members.find((m) => same(m.address, me));
  const slot = mine ? c!.members.indexOf(mine) : (c?.members.length ?? 0);
  const deposit = mine ? mine.depositFor : c ? BigInt(c.seats - 1 - slot) * c.contribution : 0n;
  const status = c ? circlePhase(c) : null;
  const open = c ? c.seats - c.members.length : 0;
  const canTake = !!c && !mine && status === "gathering" && open > 0;

  let body: ReactNode;
  let action: ReactNode = null;
  if (!c) {
    body = err ? <ErrorText>{err}</ErrorText> : <ActivityIndicator color={t.brand} size="large" />;
  } else if (!c.seats) {
    body = <Text style={muted}>We couldn&apos;t find this circle.</Text>;
  } else {
    const pot = c.contribution * BigInt(c.seats);
    body = (
      <>
        <Kinko size={110} mood={mine?.joined ? "celebrate" : "happy"} />
        <Text style={{ color: t.ink, fontSize: 18, textAlign: "center" }}>{mine ? "You're in the circle" : `${from} invited you to a savings circle`}</Text>
        <Serif size={56}>{formatMoney(c.contribution)}</Serif>
        <Text style={muted}>{every(c.roundLength)} · each round one person takes home {formatMoney(pot)}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 8 }}>
          <Chip>{c.members.length} of {c.seats} spots filled</Chip>
          {(!!mine || canTake) && <Chip tone="brand">Your turn: {slot + 1} of {c.seats}</Chip>}
        </View>
      </>
    );
    if (mine?.joined || (mine && status !== "gathering")) {
      action = <Button title="Go to circle" onPress={() => router.replace(`/circle/${c.id}`)} />;
    } else if (mine) {
      action = (
        <>
          <Text style={{ color: t.muted, fontSize: 14, backgroundColor: t.surface, borderRadius: 28, padding: 20 }}>
            {deposit
              ? <>A <Text style={{ color: t.ink, fontWeight: "700" }}>{formatMoney(deposit)}</Text> safety deposit keeps everyone honest. It&apos;s returned at the end — or right away if the circle never starts.</>
              : <>You&apos;re last in line, so there&apos;s no safety deposit for you.</>}
          </Text>
          <Button title={deposit ? `Put down ${formatMoney(deposit)} and join` : "Join the circle"} busy={phase === "joining"} onPress={() => join(deposit)} />
        </>
      );
    } else if (status === "running" || status === "done") {
      body = <>{body}<Text style={muted}>This circle has already started.</Text></>;
    } else if (status === "stalled") {
      body = <>{body}<Text style={muted}>This circle didn&apos;t start in time.</Text></>;
    } else if (!open) {
      body = <>{body}<Text style={muted}>This circle is full. Ask {from} to start a new one.</Text></>;
    } else if (!profile) {
      action = (
        <>
          {/* ponytail: onboarding lands on Home; reopen the link after. Add a `next` param to /onboard if that hurts. */}
          <Button title="Create free account to join" onPress={() => router.push("/onboard")} />
          <Text style={{ ...muted, fontSize: 12 }}>Takes 20 seconds. Just your name and an Identity check.</Text>
        </>
      );
    } else {
      action = <Button title={`Take turn ${slot + 1}`} busy={phase === "claiming"} onPress={take} />;
    }
  }

  return (
    <Screen title="Savings circle">
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>{body}</View>
      <Footer>
        {!!c && <ErrorText>{err}</ErrorText>}
        {phase === "claiming" && <Text accessibilityLiveRegion="polite" style={{ ...muted, fontSize: 14 }}>Saving your spot…</Text>}
        {phase === "joining" && <Text accessibilityLiveRegion="polite" style={{ ...muted, fontSize: 14 }}>Joining the circle…</Text>}
        {action}
        {!!c && !action && openKin}
      </Footer>
    </Screen>
  );
}
