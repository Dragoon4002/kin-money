import { router } from "expo-router";
import { Bell, ChevronDown, ChevronUp, MessageCircle, ScanLine } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Avatar, Button, IconButton, Keypad, MeButton, Screen, Serif, TabHeader, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { cachedFeed, feedLabel, feedPayments, getBalance } from "@/lib/activity";
import { openKin } from "@/lib/nav";
import { recentPeople, type Person } from "@/lib/contacts";
import { useUnread } from "@/lib/live";
import { currencySymbol, formatMoney } from "@/lib/money";
import { usePush } from "@/lib/push";
import { useTheme } from "@/theme";

export default function Home() {
  const t = useTheme();
  const { profile, unlocked, canRead } = useAccount();
  const me = profile?.address;
  const [amount, setAmount] = useState("");
  const [show, setShow] = useState(false);
  const [balance, setBalance] = useState<bigint | null>(null);
  const [failed, setFailed] = useState(false);
  const [people, setPeople] = useState<Person[]>([]);
  const push = usePush(unlocked);
  const unread = useUnread();

  function toggle() {
    if (show && !failed) return setShow(false);
    setShow(true);
    setFailed(false);
    setBalance(null);
    if (me) getBalance(me).then(setBalance).catch(() => setFailed(true));
  }

  // Warm Activity so its tab opens with the newest payments ready.
  useEffect(() => {
    if (me && !cachedFeed(me)) feedPayments(me).then((p) => feedLabel(p.slice(0, 5), me)).catch(() => {});
  }, [me]);

  // People need a read session (or unlocked) — Home never pops Face ID.
  useEffect(() => {
    if (!canRead) return;
    let live = true;
    recentPeople().then((p) => live && setPeople(p));
    return () => {
      live = false;
    };
  }, [canRead]);

  const hasAmount = Number(amount) > 0;
  const shown = `${currencySymbol()}${amount || "0"}`;
  const size = shown.length > 10 ? 48 : shown.length > 7 ? 60 : 76;
  const send = (to?: string) => router.push({ pathname: "/send", params: { ...(hasAmount && { amount }), ...(to && { to }) } });

  return (
    <Screen tab>
      <TabHeader title={`Hi${profile?.name ? `, ${profile.name}` : ""}`}>
        <IconButton icon={MessageCircle} label="Messages" badge={unread.messages} onPress={() => router.push("/messages")} />
        <IconButton icon={Bell} label="Notifications" badge={unread.inbox} onPress={() => router.push("/inbox")} />
        <IconButton icon={ScanLine} label="Scan to pay" onPress={() => router.push("/scan")} />
        <MeButton name={profile?.name} />
      </TabHeader>

      {push.ask && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 12 }}>
          <Bell color={t.brand} size={22} />
          <Text style={{ flex: 1, color: t.ink, fontSize: 14, fontWeight: "600" }}>Get told when money arrives</Text>
          <Pressable onPress={push.dismiss} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 6 }}>
            <Text style={{ color: t.muted, fontSize: 14, fontWeight: "600" }}>Not now</Text>
          </Pressable>
          <Pressable onPress={() => void push.allow()} accessibilityRole="button"
            style={{ minHeight: 44, justifyContent: "center", borderRadius: 22, backgroundColor: t.brand, paddingHorizontal: 16 }}>
            <Text style={{ color: t.brandInk, fontSize: 14, fontWeight: "700" }}>Allow</Text>
          </Pressable>
        </View>
      )}

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
          <Button title="Request" variant="soft" onPress={() => openKin(`/request${hasAmount ? `?amount=${amount}` : ""}`)} />
        </View>
        <View style={{ flex: 1 }}>
          <Button title="Send" onPress={() => send()} />
        </View>
      </View>

      {people.length > 0 && (
        <View style={{ marginTop: 8, gap: 8 }}>
        <Text style={{ color: t.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase" }}>People</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
          {people.map((p) => (
            <Pressable key={p.address} onPress={() => send(p.name)} accessibilityRole="button" style={{ width: 64, alignItems: "center", gap: 6 }}>
              <Avatar name={p.name} size={52} />
              <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>{p.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        </View>
      )}
    </Screen>
  );
}
