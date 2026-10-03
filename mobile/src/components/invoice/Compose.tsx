import { useEffect, useState } from "react";
import { BackHandler, Pressable, View } from "react-native";
import type { Address } from "viem";
import { Choice, MoneyInput, share, useName } from "@/components/programs/kit";
import { Card } from "@/components/trips/bits";
import { Button, Field, Footer, Label, Screen, Text, TextInput, useInputStyle } from "@/components/ui";
import { API_BASE } from "@/lib/config";
import { formatMoney, fromLocal } from "@/lib/money";
import { query } from "@/lib/query";
import { useTheme } from "@/theme";

// Port of Compose in app/src/app/invoice/page.tsx: build a pay link for a client.

const DAYS = [{ value: 3, label: "3 days" }, { value: 7, label: "7 days" }, { value: 14, label: "14 days" }];

export function Compose({ me, onClose }: { me?: Address; onClose: () => void }) {
  const t = useTheme();
  const input = useInputStyle();
  const handle = useName(me);
  const [title, setTitle] = useState("");
  const [parts, setParts] = useState<string[]>([""]);
  const [days, setDays] = useState(7);

  // Hardware back closes the form, like the web Cancel.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => (onClose(), true));
    return () => sub.remove();
  }, [onClose]);

  const units = parts.map((p) => (Number(p) > 0 ? fromLocal(p) : 0n));
  const ready = !!title.trim() && units.every((u) => u > 0n);
  const total = units.reduce((a, b) => a + b, 0n);

  function send() {
    const url = `${API_BASE}/invoice/new?${query({ to: handle || me, m: units.join(","), d: String(days), t: title.trim() })}`;
    void share(`Pay for "${title.trim()}" on Kin`, url);
  }

  return (
    <Screen title="New invoice" scroll>
      <Field label="What's it for?">
        <TextInput style={input} placeholder="Logo design" placeholderTextColor={t.muted} value={title} maxLength={60} onChangeText={setTitle} />
      </Field>
      {parts.map((p, i) => (
        <View key={i} style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <MoneyInput label={parts.length > 1 ? `Part ${i + 1}` : "Amount"} value={p} onChange={(v) => setParts(parts.map((x, j) => (j === i ? v : x)))} />
          </View>
          {parts.length > 1 && (
            <Pressable onPress={() => setParts(parts.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove part ${i + 1}`}
              style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 1, borderColor: t.line, alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: t.muted, fontSize: 20 }}>×</Text>
            </Pressable>
          )}
        </View>
      ))}
      {parts.length < 3 && (
        <Pressable onPress={() => setParts([...parts, ""])} accessibilityRole="button" style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}>
          <Text style={{ color: t.brand, fontSize: 14, fontWeight: "600" }}>+ Split into parts</Text>
        </Pressable>
      )}
      <View style={{ gap: 6 }}>
        <Label>If they don&apos;t reply, pay me after</Label>
        <Choice options={DAYS} value={days} onChange={setDays} />
      </View>
      {ready && (
        <Card>
          <Text style={{ color: t.muted, fontSize: 14 }}>
            Your client pays {formatMoney(total)} with Face ID. It&apos;s held safely and reaches you when they OK each part — or automatically after {days} quiet days.
          </Text>
        </Card>
      )}
      <Footer>
        <Button title="Share pay link" onPress={send} disabled={!ready} />
        <Button title="Cancel" variant="ghost" onPress={onClose} />
      </Footer>
    </Screen>
  );
}
