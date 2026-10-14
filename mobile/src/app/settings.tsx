import * as Notifications from "expo-notifications";
import { Check } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, Switch, View } from "react-native";
import { Choice } from "@/components/programs/kit";
import { Band, Screen, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { setMode, useMode } from "@/lib/config";
import { FX, getCurrency, setCurrency } from "@/lib/money";
import { usePush } from "@/lib/push";
import { setPrivate, usePrivate } from "@/lib/privacy";
import { setSoundOn, useSoundOn } from "@/lib/sound";
import { getThemePref, setThemePref, useTheme, type ThemePref } from "@/theme";

// Settings part of web (tabs)/me/page.tsx: appearance, notifications, currency.
// Account switch, "When I pay", Security, Lock and Remove already live on native More/Security.

const CURRENCY_NAME: Record<string, string> = {
  USD: "US dollar", INR: "Indian rupee", PHP: "Philippine peso", MXN: "Mexican peso",
  NGN: "Nigerian naira", AED: "UAE dirham", GBP: "British pound", EUR: "Euro",
};
const THEMES: { value: ThemePref; label: string }[] = [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }];

type Perm = "on" | "off" | "denied" | null;

export default function Settings() {
  const t = useTheme();
  const sound = useSoundOn();
  const hidden = usePrivate();
  const moneyMode = useMode();
  const { unlocked } = useAccount();
  const push = usePush(unlocked);
  const [theme, setTheme] = useState(getThemePref);
  const [currency, setCur] = useState(getCurrency);
  const [perm, setPerm] = useState<Perm>(null);

  const readPerm = () =>
    Notifications.getPermissionsAsync()
      .then((p) => setPerm(p.granted ? "on" : p.canAskAgain ? "off" : "denied"))
      .catch(() => setPerm("denied"));
  useEffect(() => {
    void readPerm();
  }, []);

  async function togglePush(on: boolean) {
    // The phone owns the off switch (and a "never ask again" denial) — send them to Kin's settings there.
    if (!on || perm === "denied") return void Linking.openSettings();
    setPerm("on"); // optimistic
    await push.allow(); // asks, then registers this phone for alerts
    await readPerm();
  }

  return (
    <Screen title="Settings" back scroll>
      <Band>Appearance</Band>
      <Choice options={THEMES} value={theme} onChange={(v) => (setThemePref(v), setTheme(v))} />

      <Band>Money</Band>
      <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontWeight: "600" }}>Real money</Text>
          <Text style={{ color: t.muted, fontSize: 14 }}>
            {moneyMode === "main" ? "Sending and cashing out real dollars. Jars, pots and circles use practice money." : "Off: you're using practice money to try Kin"}
          </Text>
        </View>
        <Switch accessibilityLabel="Real money" value={moneyMode === "main"} onValueChange={(v) => setMode(v ? "main" : "test")}
          trackColor={{ true: t.brand, false: t.line }} thumbColor="#ffffff" />
      </View>

      <Band>Privacy</Band>
      <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontWeight: "600" }}>Hide amounts</Text>
          <Text style={{ color: t.muted, fontSize: 14 }}>Your balance shows as •••• — tap it to peek</Text>
        </View>
        <Switch accessibilityLabel="Hide amounts" value={hidden} onValueChange={setPrivate}
          trackColor={{ true: t.brand, false: t.line }} thumbColor="#ffffff" />
      </View>

      <Band>Sounds</Band>
      <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontWeight: "600" }}>Sounds</Text>
          <Text style={{ color: t.muted, fontSize: 14 }}>Little sounds when money moves</Text>
        </View>
        <Switch accessibilityLabel="Sounds" value={sound} onValueChange={setSoundOn}
          trackColor={{ true: t.brand, false: t.line }} thumbColor="#ffffff" />
      </View>

      <Band>Notifications</Band>
      <View style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: t.ink, fontWeight: "600" }}>Notifications</Text>
          <Text style={{ color: t.muted, fontSize: 14 }}>
            {perm === "denied" ? "Allow notifications for Kin in your phone settings" : perm === "on" ? "Money in, chores done, gifts opened · turn off in phone settings" : "Money in, chores done, gifts opened"}
          </Text>
        </View>
        <Switch accessibilityLabel="Notifications" value={perm === "on"} disabled={perm === null} onValueChange={(v) => void togglePush(v)}
          trackColor={{ true: t.brand, false: t.line }} thumbColor="#ffffff" />
      </View>

      <Band>Show my money in</Band>
      <View accessibilityRole="radiogroup" accessibilityLabel="Currency" style={{ marginHorizontal: -20 }}>
        {Object.keys(FX).map((c) => {
          const on = c === currency;
          return (
            <Pressable key={c} onPress={() => (setCurrency(c), setCur(c))} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={({ pressed }) => ({ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, backgroundColor: pressed ? t.surface2 : "transparent" })}>
              <Text style={{ flex: 1, color: t.ink, fontWeight: on ? "600" : "400" }}>{CURRENCY_NAME[c] ?? c}</Text>
              {on && <Check color={t.brand} size={20} />}
            </Pressable>
          );
        })}
      </View>
      <Text style={{ color: t.muted, fontSize: 12 }}>Your balance is kept in US dollars. We show it in the currency you pick.</Text>
    </Screen>
  );
}
