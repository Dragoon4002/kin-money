import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import { Kinko } from "@/components/Kinko";
import { Opened } from "@/components/gift/Opened";
import { dateLabel, Status, timeLeft, useNow } from "@/components/programs/kit";
import { Amount, Card } from "@/components/trips/bits";
import { Button, Chip, ErrorText, Footer, IconTile, Screen, Serif, Text } from "@/components/ui";
import { getAccount, useAccount } from "@/lib/account";
import { addContact, registerMe } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { bindGift, isBound, openGift, parseGiftLink, readGiftLink, type GiftLink } from "@/lib/giftLinks";
import { ICON } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { nameOf } from "@/lib/names";
import { same } from "@/lib/programs";
import { useTheme } from "@/theme";

// Port of app/src/app/gift/open/page.tsx. The link key rides in the #fragment; openKin passes it as `hash`.

const home = () => router.replace("/tabs");

export default function OpenGiftLink() {
  const t = useTheme();
  const { hash = "" } = useLocalSearchParams<{ hash?: string }>();
  const [link] = useState(() => parseGiftLink(hash));
  const id = link?.id.toString();
  const { profile, unlocked } = useAccount();
  const me = profile?.address;
  const now = useNow();
  const [info, setInfo] = useState<(GiftLink & { sender: string }) | null>(null);
  const [phase, setPhase] = useState<"view" | "binding" | "opening" | "opened">("view");
  const [justBound, setJustBound] = useState(false);
  const [err, setErr] = useState("");
  const tried = useRef(false);

  useEffect(() => {
    if (!id) return;
    readGiftLink(BigInt(id))
      .then(async (g) => setInfo({ ...g, sender: await nameOf(g.from).catch(() => "") }))
      .catch((e) => setErr(humanError(e)));
  }, [id]);

  async function accept() {
    if (!link || !info) return;
    tried.current = true;
    setErr("");
    setPhase("binding");
    try {
      const mine = (await getAccount()).address;
      await bindGift(link.id, link.key, mine);
      void registerMe();
      if (info.sender) void addContact({ address: info.from, name: info.sender }).catch(() => {});
      setInfo({ ...info, recipient: mine });
      setJustBound(true);
    } catch (e) {
      setErr(humanError(e));
      // Someone may have accepted it a moment earlier; show the real state.
      readGiftLink(link.id).then((g) => setInfo((i) => (i ? { ...i, ...g } : i))).catch(() => {});
    }
    setPhase("view");
  }

  async function open() {
    if (!info) return;
    setErr("");
    setPhase("opening");
    try {
      await openGift(info.id);
      setInfo({ ...info, settled: true });
      setPhase("opened");
    } catch (e) {
      setErr(humanError(e));
      setPhase("view");
    }
  }

  // Signed in and unlocked → accept straight away, no extra tap.
  const canAccept = !!info && !info.settled && !isBound(info) && !!me && !same(info.from, me);
  useEffect(() => {
    if (canAccept && unlocked && phase === "view" && !tried.current) {
      tried.current = true;
      void Promise.resolve().then(accept);
    }
  });

  if (!link) {
    return (
      <Screen title="Kin" back>
        <Card><Text style={{ color: t.ink }}>This gift link looks incomplete. Ask the sender to share it again.</Text></Card>
        <Footer><Button title="Open Kin" variant="soft" onPress={home} /></Footer>
      </Screen>
    );
  }

  const from = info?.sender ? `@${info.sender}` : "Someone";
  const money = info ? formatMoney(info.amount) : "";

  if (phase === "opened" && info) {
    return <Opened amount={info.amount} money={money} from={info.sender || undefined} subtitle={`From ${from}. It's in your balance now.`} onClose={home} />;
  }

  const mine = !!info && isBound(info) && same(info.recipient, me);
  const locked = !!info && now < info.unlockAt;
  const center = { textAlign: "center" } as const;

  let body: ReactNode;
  if (!info) {
    body = err ? <ErrorText>{err}</ErrorText> : <View style={{ height: 160, alignSelf: "stretch", borderRadius: 28, backgroundColor: t.surface2 }} />;
  } else if (mine) {
    body = (
      <>
        <Kinko size={120} mood="celebrate" />
        <Serif size={36}>{info.settled ? "Opened ✓" : justBound ? `This gift is now yours${profile?.name ? `, @${profile.name}` : ""}` : `Your gift from ${from}`}</Serif>
        {!!link.message && <Text style={[center, { color: t.ink, fontSize: 18 }]}>“{link.message}”</Text>}
        <Amount value={money} />
        {info.settled ? (
          <Text style={{ color: t.muted }}>It&apos;s in your balance.</Text>
        ) : locked ? (
          <>
            <Chip>Opens in {timeLeft(info.unlockAt - now)}</Chip>
            <Text style={[center, { color: t.muted, fontSize: 14 }]}>Held safely until {dateLabel(info.unlockAt)}. It opens by itself that day.</Text>
          </>
        ) : (
          <Text style={{ color: t.muted }}>It&apos;s ready to open!</Text>
        )}
      </>
    );
  } else {
    body = (
      <>
        <View style={{ width: 112, height: 112, borderRadius: 56, alignItems: "center", justifyContent: "center", backgroundColor: t.brandSoft }}>
          <IconTile icon={ICON.gift} size={72} brand />
        </View>
        <Text style={{ color: t.ink, fontSize: 18 }}>A gift from {from}</Text>
        {!!link.message && <Serif size={26}>“{link.message}”</Serif>}
        <Amount value={money} />
        <Text style={[center, { color: t.muted }]}>
          {info.settled ? "This gift is no longer available."
            : isBound(info) ? "This gift was already accepted."
            : same(info.from, me) ? "Share this link with the person it's for."
            : `Opens on ${dateLabel(info.unlockAt)}. Accept it now so it's yours.`}
        </Text>
      </>
    );
  }

  return (
    <Screen title="Kin" back scroll>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>{body}</View>
      <Footer>
        {!!info && <ErrorText>{err}</ErrorText>}
        {phase === "binding" && <Status>Accepting your gift…</Status>}
        {phase === "opening" && <Status>Opening your gift…</Status>}
        {canAccept && <Button title="Accept gift" busy={phase === "binding"} onPress={accept} />}
        {!!info && !info.settled && !isBound(info) && !profile && (
          <>
            <Button title="Create free account to accept" onPress={() => router.push("/onboard")} />
            <Text style={[center, { color: t.muted, fontSize: 12 }]}>Takes 20 seconds. Just your name and an Identity check.</Text>
          </>
        )}
        {mine && !info.settled && !locked && <Button title="Open gift" busy={phase === "opening"} onPress={open} />}
        {!!info && (info.settled || isBound(info) || same(info.from, me)) && <Button title="Open Kin" variant="soft" onPress={home} />}
      </Footer>
    </Screen>
  );
}
