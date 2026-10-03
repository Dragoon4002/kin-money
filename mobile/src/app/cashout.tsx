import { useState } from "react";
import { Pressable, View } from "react-native";
import { MoneyInput } from "@/components/programs/kit";
import { Pill } from "@/components/requests/bits";
import { Button, Footer, Label, Screen, Text } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { useTheme } from "@/theme";

// Port of app/src/app/cashout/page.tsx. #8 Cash-out preview.
// ponytail: no bank partner yet — nothing moves; wire a real offramp here later.
const BANKS = ["HDFC Bank", "State Bank of India", "BDO Unibank", "BBVA México", "Access Bank", "Emirates NBD"];

export default function CashOut() {
  const t = useTheme();
  const [bank, setBank] = useState("");
  const [amount, setAmount] = useState("");
  const [tried, setTried] = useState(false);

  return (
    <Screen title="Cash out to bank" back scroll>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 16 }}>
        <Pill tone="warn">Coming soon</Pill>
        <Text style={{ flex: 1, color: t.muted, fontSize: 14 }}>Cash out is coming soon. Nothing moves yet.</Text>
      </View>

      <MoneyInput label="How much?" value={amount} onChange={(v) => /^\d{0,9}(\.\d{0,2})?$/.test(v) && setAmount(v)} />

      <View accessibilityRole="radiogroup" accessibilityLabel="To which bank?" style={{ gap: 8 }}>
        <Label>To which bank?</Label>
        {BANKS.map((b) => {
          const on = bank === b;
          return (
            <Pressable key={b} onPress={() => (setBank(b), setTried(false))} accessibilityRole="radio" accessibilityState={{ checked: on }}
              style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 20, borderWidth: 1, paddingHorizontal: 16, borderColor: on ? t.brand : t.line, backgroundColor: on ? t.brandSoft : t.surface }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? t.brand : t.muted, alignItems: "center", justifyContent: "center" }}>
                {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.brand }} />}
              </View>
              <Text style={{ flex: 1, color: t.ink, fontWeight: "500" }}>{b}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>Arrives in 1–2 days · fee {formatMoney(0n)}</Text>

      <Footer>
        {tried && (
          <Text accessibilityLiveRegion="polite" style={{ color: t.ink, fontSize: 14, fontWeight: "500", textAlign: "center" }}>
            We&apos;ll let you know when cash out is ready. Your money stays in your balance.
          </Text>
        )}
        <Button title={tried ? "Coming soon" : "Cash out"} onPress={() => setTried(true)} disabled={!bank || !(Number(amount) > 0) || tried} />
      </Footer>
    </Screen>
  );
}
