import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { Status } from "@/components/programs/kit";
import { Amount, Card, Delivered } from "@/components/trips/bits";
import { Avatar, Button, ErrorText, Footer, Screen, Text } from "@/components/ui";
import { getAccount, useAccount } from "@/lib/account";
import { collectLink, parseLink, readLink, type LinkInfo } from "@/lib/claimLink";
import { addContact, registerMe } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { nameOf } from "@/lib/names";
import { useTheme } from "@/theme";

// Port of app/src/app/claim/page.tsx. The link key rides in the #fragment; openKin passes it as `hash`.

const home = () => router.replace("/tabs");

export default function Claim() {
  const t = useTheme();
  const { hash = "" } = useLocalSearchParams<{ hash?: string }>();
  const [link] = useState(() => parseLink(hash));
  const id = link?.id.toString();
  const { profile } = useAccount();
  const [info, setInfo] = useState<(LinkInfo & { sender: string }) | null>(null);
  const [phase, setPhase] = useState<"view" | "collecting" | "done">("view");
  const [secs, setSecs] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!id) return;
    readLink(BigInt(id))
      .then(async (i) => setInfo({ ...i, sender: await nameOf(i.from).catch(() => "") }))
      .catch((e) => setErr(humanError(e)));
  }, [id]);

  async function collect() {
    if (!link) return;
    setErr("");
    setPhase("collecting");
    try {
      const me = (await getAccount()).address;
      const t0 = Date.now();
      await collectLink(link.id, link.key, me);
      void registerMe();
      // Sender shows up in People. Fire-and-forget; never blocks the collect.
      if (info?.sender) void addContact({ address: info.from, name: info.sender }).catch(() => {});
      setSecs(((Date.now() - t0) / 1000).toFixed(1));
      setPhase("done");
    } catch (e) {
      setErr(humanError(e));
      setPhase("view");
    }
  }

  if (!link) {
    return (
      <Screen title="Kin" back>
        <Card><Text style={{ color: t.ink }}>This link looks incomplete. Ask the sender to share it again.</Text></Card>
        <Footer><Button title="Open Kin" variant="soft" onPress={home} /></Footer>
      </Screen>
    );
  }

  const from = info?.sender ? `@${info.sender}` : "Someone";
  const money = info ? formatMoney(info.amount) : "";

  if (phase === "done") {
    return (
      <Screen>
        <Delivered title={`${money} is yours`} subtitle={`From ${from} · Delivered in ${secs}s ✓✓`} />
        <Footer><Button title="See my balance" onPress={home} /></Footer>
      </Screen>
    );
  }

  return (
    <Screen title="Kin" back>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        {!info ? (
          err ? <ErrorText>{err}</ErrorText> : <View style={{ height: 160, alignSelf: "stretch", borderRadius: 28, backgroundColor: t.surface2 }} />
        ) : (
          <>
            <View style={{ width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", backgroundColor: t.brandSoft }}>
              <Avatar name={info.sender || "?"} size={72} />
            </View>
            <Text style={{ color: t.ink, fontSize: 18 }}>{from} sent you</Text>
            <Amount value={money} />
            <Text style={{ color: t.muted, textAlign: "center" }}>
              {info.settled ? "This money has already been collected." : "Held safely until you collect it."}
            </Text>
          </>
        )}
      </View>
      {!!info && !info.settled && (
        <Footer>
          <ErrorText>{err}</ErrorText>
          {phase === "collecting" && <Status>Moving it to your balance…</Status>}
          {profile ? (
            <Button title={`Collect ${money}`} busy={phase === "collecting"} onPress={collect} />
          ) : (
            <>
              <Button title="Create free account to collect" onPress={() => router.push("/onboard")} />
              <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>Takes 20 seconds. Just your name and Face ID.</Text>
            </>
          )}
        </Footer>
      )}
      {!!info?.settled && <Footer><Button title="Open Kin" variant="soft" onPress={home} /></Footer>}
    </Screen>
  );
}
