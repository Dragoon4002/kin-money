import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  AlignLeft, Briefcase, ChartPie, ChevronRight, Gift, House, ListChecks, Lock, type LucideIcon, PiggyBank, Receipt,
  RefreshCcw, Smile, Split, Sprout, SunMoon, Trash2, UserPlus, Users,
} from "lucide-react-native";
import { Alert, Pressable, View } from "react-native";
import { Screen, Text } from "@/components/ui";
import { lock, signOut, useAccount } from "@/lib/account";
import { API_BASE } from "@/lib/config";
import { useTheme } from "@/theme";

// Native core covers send/scan/QR/activity; everything else opens the web app in a Custom Tab.
const WEB: [string, string, LucideIcon][] = [
  ["Allowance", "/allowance", Sprout],
  ["Savings jars", "/jars", PiggyBank],
  ["Family pots", "/pot", House],
  ["Circles", "/circle", RefreshCcw],
  ["Chores", "/chores", ListChecks],
  ["Pay a bill", "/earmark", Receipt],
  ["Invoice", "/invoice", Briefcase],
  ["Gifts", "/gift", Gift],
  ["Split a bill", "/split", Split],
  ["Kinko", "/kinko", Smile],
  ["Invite & earn", "/invite", UserPlus],
  ["This month's spends", "/spends", ChartPie],
  ["People", "/contacts", Users],
  ["Me & settings", "/me", SunMoon],
];

function Row({ icon: Icon, label, onPress, danger }: { icon: LucideIcon; label: string; onPress: () => void; danger?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={({ pressed }) => ({ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 12, borderRadius: 16, backgroundColor: pressed ? t.surface2 : "transparent" })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
        <Icon color={danger ? t.bad : t.ink} size={20} />
      </View>
      <Text style={{ flex: 1, color: danger ? t.bad : t.ink, fontSize: 16, fontWeight: "600" }}>{label}</Text>
      <ChevronRight color={t.muted} size={18} />
    </Pressable>
  );
}

function Band({ children }: { children: string }) {
  const t = useTheme();
  return <Text style={{ color: t.muted, fontSize: 12, fontWeight: "700", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 8 }}>{children}</Text>;
}

export default function More() {
  const { profile } = useAccount();

  function remove() {
    Alert.alert("Remove Kin from this phone?", "Your money stays safe. Unlock again any time with Face ID.", [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void signOut().then(() => (router.dismissAll(), router.replace("/onboard"))) },
    ]);
  }

  return (
    <Screen title={profile?.name ? `@${profile.name}` : "More"} back scroll>
      <Row icon={AlignLeft} label="Activity" onPress={() => router.push("/activity")} />
      <Band>More on Kin</Band>
      {WEB.map(([label, path, icon]) => (
        <Row key={path} icon={icon} label={label} onPress={() => void WebBrowser.openBrowserAsync(API_BASE + path)} />
      ))}
      <Band>Safety</Band>
      <Row icon={Lock} label="Lock" onPress={() => (lock(), router.back())} />
      <Row icon={Trash2} label="Remove Kin from this phone" onPress={remove} danger />
    </Screen>
  );
}
