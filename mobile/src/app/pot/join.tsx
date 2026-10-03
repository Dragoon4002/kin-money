import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, View } from "react-native";
import { privateKeyToAccount } from "viem/accounts";
import { Kinko } from "@/components/Kinko";
import { PotFor, WhoAvatar } from "@/components/programs/kit";
import { Button, ErrorText, Footer, IconTile, Screen, Text } from "@/components/ui";
import { getAccount, useAccount } from "@/lib/account";
import { registerMe } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { ICON } from "@/lib/icons";
import { notifyAdded } from "@/lib/live";
import { formatMoney } from "@/lib/money";
import { nameOf } from "@/lib/names";
import { inviteKeyOf, joinPot, parsePotLink } from "@/lib/potLinks";
import { getPot, same, type Pot } from "@/lib/programs";
import { fonts, useTheme } from "@/theme";

// Port of app/src/app/pot/join/page.tsx. The link key arrives as param `hash` (openKin passes the #fragment).
const MAX = 20;

export default function JoinPot() {
  const t = useTheme();
  const { hash = "" } = useLocalSearchParams<{ hash?: string }>();
  const link = parsePotLink(hash);
  const id = link?.id.toString();
  const { profile, unlocked } = useAccount();
  const me = profile?.address;
  const [info, setInfo] = useState<{ pot: Pot; inviter: string; live: boolean } | null>(null);
  const [phase, setPhase] = useState<"view" | "joining" | "joined">("view");
  const [err, setErr] = useState("");
  const tried = useRef(false);

  useEffect(() => {
    if (!link) return;
    Promise.all([getPot(link.id), inviteKeyOf(link.id, link.inviter), nameOf(link.inviter).catch(() => "")])
      .then(([pot, key, inviter]) => setInfo({ pot, inviter, live: same(key, privateKeyToAccount(link.key).address) }))
      .catch((e) => setErr(humanError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `id` identifies the link
  }, [id]);

  const pot = info?.pot;
  const member = !!pot && pot.members.some((m) => same(m, me));
  const blocked = !pot || !pot.target ? "missing" : pot.closed ? "closed" : !info?.live ? "off" : pot.members.length >= MAX ? "full" : "";

  // Already in → straight to the pot.
  useEffect(() => {
    if (member && phase === "view" && pot) router.replace(`/pot/${pot.id}`);
  }, [member, phase, pot]);

  async function join() {
    if (!link) return;
    tried.current = true;
    setErr("");
    setPhase("joining");
    try {
      const mine = (await getAccount()).address;
      const p = await getPot(link.id);
      if (!p.members.some((m) => same(m, mine))) {
        await joinPot(link.id, link.inviter, link.key, mine);
        notifyAdded("pot", link.id, [mine]);
      }
      void registerMe();
      setPhase("joined");
    } catch (e) {
      setErr(humanError(e));
      setPhase("view");
      // The pot may have filled up or the link was turned off a moment ago; show the real state.
      getPot(link.id).then((p) => setInfo((i) => (i ? { ...i, pot: p } : i))).catch(() => {});
    }
  }

  // Signed in and unlocked → join straight away, no extra tap.
  const canJoin = !!info && !blocked && !member && !!me;
  useEffect(() => {
    if (canJoin && unlocked && phase === "view" && !tried.current) {
      tried.current = true;
      void Promise.resolve().then(join);
    }
  });

  const openKin = <Button title="Open Kin" variant="soft" onPress={() => router.replace(profile ? "/tabs" : "/")} />;
  const muted = { color: t.muted, fontSize: 16, textAlign: "center" } as const;
  const serif = { fontFamily: fonts.serif, color: t.ink, textAlign: "center" } as const;

  if (!link) {
    return (
      <Screen title="Kin">
        <Text style={{ color: t.ink, fontSize: 16, backgroundColor: t.surface, borderRadius: 28, padding: 20 }}>This invite link looks incomplete. Ask for it to be shared again.</Text>
        <Footer>{openKin}</Footer>
      </Screen>
    );
  }

  const from = info?.inviter ? `@${info.inviter}` : "Your family";

  let body: ReactNode;
  if (!info || !pot) {
    body = err ? <ErrorText>{err}</ErrorText> : <ActivityIndicator color={t.brand} size="large" />;
  } else if (phase === "joined") {
    body = (
      <>
        <Kinko size={120} mood="celebrate" />
        <Text style={{ ...serif, fontSize: 36 }}>You&apos;re in! 🎉</Text>
        <Text style={muted}>You can chip in to the pot for <PotFor p={pot} me={me} /> now.</Text>
      </>
    );
  } else {
    body = (
      <>
        <View style={{ width: 112, height: 112, borderRadius: 56, alignItems: "center", justifyContent: "center", backgroundColor: t.brandSoft }}>
          <IconTile icon={ICON.pot} size={72} brand />
        </View>
        <Text style={{ color: t.ink, fontSize: 18, textAlign: "center" }}>{from} invited you to a family pot</Text>
        <Text style={{ ...serif, fontSize: 30 }}>For <PotFor p={pot} me={me} /></Text>
        <Text style={muted}>
          Goal {formatMoney(pot.target)} · it pays out by itself when full{pot.beneficiaries.length > 1 ? `, split between ${pot.beneficiaries.length} people` : ""}.
        </Text>
        <View accessibilityLabel={`${pot.members.length} in the pot`} style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 4 }}>
          {pot.members.slice(0, 10).map((m) => <WhoAvatar key={m} a={m} size={40} />)}
        </View>
        <Text style={{ ...muted, fontSize: 14 }}>{pot.members.length} {pot.members.length === 1 ? "person" : "people"} chipping in</Text>
        {!!blocked && (
          <Text style={muted}>
            {blocked === "missing" ? "We couldn't find this pot."
              : blocked === "closed" ? "This pot is closed."
              : blocked === "full" ? "This pot is full — it already has 20 people."
              : "This invite link was turned off. Ask for a new one."}
          </Text>
        )}
      </>
    );
  }

  return (
    <Screen title="Kin">
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>{body}</View>
      <Footer>
        {!!info && <ErrorText>{err}</ErrorText>}
        {phase === "joining" && <Text accessibilityLiveRegion="polite" style={{ ...muted, fontSize: 14 }}>Adding you to the pot…</Text>}
        {phase === "joined" && !!pot && <Button title="Go to the pot" onPress={() => router.replace(`/pot/${pot.id}`)} />}
        {phase !== "joined" && canJoin && <Button title="Join pot" busy={phase === "joining"} onPress={join} />}
        {phase !== "joined" && !!info && !blocked && !profile && (
          <>
            {/* ponytail: onboarding lands on Home; reopen the link after. Add a `next` param to /onboard if that hurts. */}
            <Button title="Create free account to join" onPress={() => router.push("/onboard")} />
            <Text style={{ ...muted, fontSize: 12 }}>Takes 20 seconds. Just your name and Face ID.</Text>
          </>
        )}
        {!!info && !!blocked && openKin}
      </Footer>
    </Screen>
  );
}
