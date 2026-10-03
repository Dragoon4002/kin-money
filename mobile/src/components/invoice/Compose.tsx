import { router } from "expo-router";
import { useEffect, useState } from "react";
import { BackHandler, Pressable, View } from "react-native";
import type { Address } from "viem";
import { Choice, MoneyInput, Status, useAction, useNow } from "@/components/programs/kit";
import { Card, DateField } from "@/components/trips/bits";
import { Button, ErrorText, Field, Footer, Label, Screen, Text, TextInput, useInputStyle } from "@/components/ui";
import { api } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { endOfDay } from "@/lib/reminders";
import { useTheme } from "@/theme";
import { MAX_PARTS } from "./meta";

// Port of Compose in app/src/app/invoice/page.tsx: save an invoice (parts with names + due dates), then send it.

const DAYS = [{ value: 3, label: "3 days" }, { value: 7, label: "7 days" }, { value: 14, label: "14 days" }];
type Draft = { name: string; amount: string; due: string };
const blank: Draft = { name: "", amount: "", due: "" };
const isoDay = (t: number) => new Date(t - new Date(t).getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export function Compose({ me, onClose }: { me?: Address; onClose: () => void }) {
  const t = useTheme();
  const input = useInputStyle();
  const [title, setTitle] = useState("");
  const [parts, setParts] = useState<Draft[]>([blank]);
  const [days, setDays] = useState(7);
  const { busy, status, error, run } = useAction();
  const today = isoDay(useNow(60_000) * 1000);

  // Hardware back closes the form, like the web Cancel.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => (onClose(), true));
    return () => sub.remove();
  }, [onClose]);

  const units = parts.map((p) => (Number(p.amount) > 0 ? fromLocal(p.amount) : 0n));
  const many = parts.length > 1;
  const ready = !!me && !!title.trim() && units.every((u) => u > 0n);
  const total = units.reduce((a, b) => a + b, 0n);
  const edit = (i: number, d: Partial<Draft>) => setParts(parts.map((x, j) => (j === i ? { ...x, ...d } : x)));

  async function create() {
    await run(async (say) => {
      say("Saving your invoice…");
      const { id } = await api<{ id: string }>("/api/invoices", "POST", {
        title: title.trim(),
        days,
        parts: parts.map((p, i) => ({ name: many ? p.name : title, amount: String(units[i]), due: p.due ? endOfDay(p.due) : 0 })),
      });
      onClose();
      router.push({ pathname: "/invoice/new", params: { i: id } });
    });
  }

  return (
    <Screen title="New invoice" scroll>
      <Field label="What's it for?">
        <TextInput style={input} placeholder="Logo design" placeholderTextColor={t.muted} value={title} maxLength={60} onChangeText={setTitle} />
      </Field>
      {parts.map((p, i) => (
        <Card key={i}>
          {many && (
            <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Field label={`Part ${i + 1}`}>
                  <TextInput style={input} placeholder={["First drafts", "Final files", "Changes"][i]} placeholderTextColor={t.muted} value={p.name} maxLength={30} onChangeText={(v) => edit(i, { name: v })} />
                </Field>
              </View>
              <Pressable onPress={() => setParts(parts.filter((_, j) => j !== i))} accessibilityRole="button" accessibilityLabel={`Remove part ${i + 1}`}
                style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderColor: t.line, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: t.muted, fontSize: 20 }}>×</Text>
              </Pressable>
            </View>
          )}
          <MoneyInput label="Amount" value={p.amount} onChange={(v) => edit(i, { amount: v })} />
          <DateField label="Due date (optional)" value={p.due} min={today} onChange={(v) => edit(i, { due: v })} />
        </Card>
      ))}
      {parts.length < MAX_PARTS && (
        <Pressable onPress={() => setParts([...parts, blank])} accessibilityRole="button" style={{ alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}>
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
      <ErrorText>{error}</ErrorText>
      <Footer>
        <Status>{busy && status}</Status>
        <Button title="Create invoice" onPress={create} busy={busy} disabled={!ready} />
        <Button title="Cancel" variant="ghost" onPress={onClose} disabled={busy} />
      </Footer>
    </Screen>
  );
}
