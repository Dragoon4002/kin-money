import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ChevronDown, ChevronUp, QrCode, ScanLine } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Avatar, Button, IconButton, Keypad, Screen, Serif, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { getBalance } from "@/lib/activity";
import { API_BASE } from "@/lib/config";
import { recentPeople, type Person } from "@/lib/contacts";
import { currencySymbol, formatMoney } from "@/lib/money";
import { useTheme } from "@/theme";

export default function Home() {
  const t = useTheme();
  const { profile, unlocked } = useAccount();
  const me = profile?.address;
  const [amount, setAmount] = useState("");
  const [show, setShow] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [failed, setFailed] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);

  function toggle() {
    if (show && !failed) return setShow(false);
    setShow(true);
    setFailed(false);
    setBalance(null);
    if (me) getBalance(me).then(setBalance).catch(() => setFailed(true));
  }

  // Contacts need a signed request — only ask when already unlocked so Home never pops Face ID.
  useEffect(() => {
    if (!unlocked) return;
    let live = true;
    recentPeople().then((p) => live && setPeople(p));
    return () => {
      live = false;
    };
  }, [unlocked]);

  const hasAmount = Number(amount) > 0;
  const shown = `${currencySymbol()}${amount || "0"}`;
  const size = shown.length > 10 ? 48 : shown.length > 7 ? 60 : 76;
  const send = (to?: string) => router.push({ pathname: "/send", params: { ...(hasAmount && { amount }), ...(to && { to }) } });

  return (
    <Screen>
      <View style={{ height: 56, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 18, fontWeight: "700" }}>Hi{profile?.name ? ` @${profile.name}` : ""}</Text>
        <IconButton icon={ScanLine} label="Scan to pay" onPress={() => router.push("/scan")} />
        <IconButton icon={QrCode} label="My QR" onPress={() => router.push("/receive")} />
        <Pressable onPress={() => router.push("/more")} accessibilityLabel="More" accessibilityRole="button" hitSlop={4}>
          <Avatar name={profile?.name} size={44} />
        </Pressable>
      </View>

      <View style={{ alignItems: "center" }}>
        <Pressable onPress={toggle} accessibilityState={{ expanded: show }}
          style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 22, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, paddingHorizontal: 16 }}>
          {!show ? (
            <><Text style={{ color: t.muted, fontWeight: "600" }}>Check balance</Text><ChevronDown color={t.muted} size={16} /></>
          ) : failed ? (
            <Text style={{ color: t.muted, fontWeight: "600" }}>Couldn&apos;t check. Tap to retry</Text>
          ) : balance === null ? (
            <View style={{ width: 96, height: 20, borderRadius: 10, backgroundColor: t.surface2 }} />
          ) : (
            <><Serif size={24}>{formatMoney(balance)}</Serif><ChevronUp color={t.muted} size={16} /></>
          )}
        </Pressable>
      </View>

      <View style={{ flex: 1, minHeight: 140, alignItems: "center", justifyContent: "center" }}>
        <Serif size={size} color={amount ? t.ink : t.muted}>{shown}</Serif>
        <Text style={{ color: t.muted, marginTop: 12 }}>{amount ? "Who's it for?" : "Type an amount"}</Text>
      </View>

      <Keypad value={amount} onChange={setAmount} />

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Button title="Request" variant="soft" onPress={() => WebBrowser.openBrowserAsync(`${API_BASE}/request${hasAmount ? `?amount=${amount}` : ""}`)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Send" onPress={() => send()} />
        </View>
      </View>

      {people.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
          {people.map((p) => (
            <Pressable key={p.address} onPress={() => send(p.name)} style={{ width: 64, alignItems: "center", gap: 6 }}>
              <Avatar name={p.name} size={52} />
              <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>{p.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}
