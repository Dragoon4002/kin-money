import { router } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { Bell, Check, ChevronRight, Copy, Fingerprint, Lock, type LucideIcon, MessageCircle, QrCode, ShieldCheck, Smile, SunMoon, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Alert, Platform, Pressable, ToastAndroid, View } from "react-native";
import { Screen, Serif, Text } from "@/components/ui";
import { getPayCheck, lock, setPayCheck, signOut, switchAccount, useAccount, type PayCheck } from "@/lib/account";
import { openKin } from "@/lib/nav";
import { formatMoney } from "@/lib/money";
import { shortAddr } from "@/lib/names";
import { useTheme } from "@/theme";

// "Me": avatar menu (web MeButton → /me). Features live on the Money/Explore tabs; web-only settings open in a Custom Tab.

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
  const t = useTheme();
  const { profile, accounts } = useAccount();
  const [pay, setPay] = useState(getPayCheck);
  const over = `Ask for payments over ${formatMoney(BigInt(pay.limit))}`;
  const payLabel = pay.mode === "always" ? "Ask every time" : pay.mode === "over" ? over : "Don’t ask again while unlocked";

  function choosePay() {
    const pick = (mode: PayCheck["mode"]) => () => {
      const next = { ...pay, mode };
      setPayCheck(next);
      setPay(next);
    };
    // ponytail: limit editable on web only (Me → When I pay); phone keeps its own, default $50.
    Alert.alert("When I pay", "When Kin is locked, every payment asks for Face ID. Kin still locks after 5 minutes of no use.", [
      { text: "Ask every time", onPress: pick("always") },
      { text: over, onPress: pick("over") },
      { text: "Don’t ask again while unlocked", onPress: pick("unlocked") },
    ]);
  }

  const [copied, setCopied] = useState(false);
  const circle = { width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" } as const;
  async function copyName(name: string) {
    await Clipboard.setStringAsync(`@${name}`);
    if (Platform.OS === "android") ToastAndroid.show("Copied", ToastAndroid.SHORT);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function remove() {
    const extra = accounts.length > 1 ? " Accounts you added from other wallets are forgotten too: you’ll need their recovery phrase to add them again." : "";
    Alert.alert("Remove Kin from this phone?", `Your money stays safe. Unlock again any time with Face ID.${extra}`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void signOut().then(() => (router.dismissAll(), router.replace("/onboard"))) },
    ]);
  }

  return (
    <Screen title="Me" back scroll>
      {!!profile?.name && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ flexShrink: 1 }}><Serif size={32}>@{profile.name}</Serif></View>
          <Pressable onPress={() => void copyName(profile.name!)} accessibilityRole="button" accessibilityLabel="Copy your Kin name" style={circle}>
            {copied ? <Check color={t.good} size={18} /> : <Copy color={t.muted} size={18} />}
          </Pressable>
          <Pressable onPress={() => router.push("/receive")} accessibilityRole="button" accessibilityLabel="My QR" style={circle}>
            <QrCode color={t.muted} size={18} />
          </Pressable>
        </View>
      )}
      {accounts.length > 1 && (
        <View accessibilityRole="radiogroup" accessibilityLabel="Account in use" style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {accounts.map((a) => {
            const on = a.address === profile?.address;
            return (
              <Pressable key={a.address} onPress={() => void switchAccount(a.address)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: "center", backgroundColor: on ? t.brand : t.surface2 }}>
                <Text style={{ fontWeight: "600", color: on ? t.brandInk : t.ink }}>
                  {a.kin ? `Kin account${a.name ? ` (@${a.name})` : ""}` : a.name ? `@${a.name}` : shortAddr(a.address)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      <Row icon={QrCode} label="My QR" onPress={() => router.push("/receive")} />
      <Row icon={MessageCircle} label="Messages" onPress={() => router.push("/messages")} />
      <Row icon={Bell} label="Notifications" onPress={() => router.push("/inbox")} />
      <Row icon={Smile} label="Kinko" onPress={() => router.push("/closet")} />
      <Row icon={SunMoon} label="Currency, looks & more" onPress={() => openKin("/settings")} />
      <Band>Safety</Band>
      <Row icon={Fingerprint} label={`When I pay: ${payLabel}`} onPress={choosePay} />
      <Row icon={ShieldCheck} label="Security" onPress={() => router.push("/security")} />
      <Row icon={Lock} label="Lock" onPress={() => (lock(), router.back())} />
      <Row icon={Trash2} label="Remove Kin from this phone" onPress={remove} danger />
    </Screen>
  );
}
