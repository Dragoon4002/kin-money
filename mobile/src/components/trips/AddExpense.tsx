import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import type { Address } from "viem";
import type { Person } from "@/components/PersonPicker";
import { MoneyInput } from "@/components/programs/kit";
import { Button, Field, Label, Text, TextInput, useInputStyle } from "@/components/ui";
import { CATEGORIES, type CategoryId } from "@/lib/categories";
import { formatMoney, fromLocal } from "@/lib/money";
import { useTheme } from "@/theme";
import { MemberChips } from "./bits";

// Port of app/src/components/trips/AddExpense.tsx.

export type NewExpense = { payer: Address; amount: bigint; participants: Address[]; note: string; category: CategoryId };

/** Sheet body: amount, who paid, split between, note + category. */
export function AddExpense({ members, me, onAdd }: { members: Person[]; me: Address; onAdd: (e: NewExpense) => void }) {
  const t = useTheme();
  const input = useInputStyle();
  const [amount, setAmount] = useState("");
  const [payer, setPayer] = useState<Address>(me);
  const [split, setSplit] = useState<Address[]>(() => members.map((m) => m.address));
  const [note, setNote] = useState("");
  const [category, setCategory] = useState<CategoryId>("food");

  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const each = split.length ? units / BigInt(split.length) : 0n;
  const toggle = (a: Address) => setSplit((s) => (s.includes(a) ? s.filter((x) => x !== a) : [...s, a]));
  const link = (title: string, onPress: () => void, color: string) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}>
      <Text style={{ color, fontSize: 14, fontWeight: "600" }}>{title}</Text>
    </Pressable>
  );

  return (
    <>
      <ScrollView style={{ maxHeight: 520 }} contentContainerStyle={{ gap: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
        <Text style={{ color: t.ink, fontSize: 18, fontWeight: "700" }}>Add expense</Text>
        <MoneyInput label="How much?" value={amount} onChange={setAmount} />

        <View style={{ gap: 8 }}>
          <Label>Who paid?</Label>
          <MemberChips label="Who paid" members={members} me={me} on={(a) => a === payer} onTap={setPayer} />
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Label>Split between</Label>
            <View style={{ flexDirection: "row" }}>
              {link("Everyone", () => setSplit(members.map((m) => m.address)), t.brand)}
              {link("Clear", () => setSplit([]), t.muted)}
            </View>
          </View>
          <MemberChips label="Split between" members={members} me={me} on={(a) => split.includes(a)} onTap={toggle} />
          {units > 0n && split.length > 0 && (
            <Text accessibilityLiveRegion="polite" style={{ color: t.muted, fontSize: 14 }}>
              {split.length === 1 ? "One person covers it all" : `About ${formatMoney(each)} each, ${split.length} ways`}
            </Text>
          )}
        </View>

        <Field label="What was it for?">
          <TextInput style={input} placeholder="Dinner by the beach" placeholderTextColor={t.muted} maxLength={80} value={note} onChangeText={setNote} />
        </Field>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }} accessibilityLabel="Category">
          {CATEGORIES.map(({ id, label, icon: Icon }) => {
            const on = id === category;
            return (
              <Pressable key={id} onPress={() => setCategory(id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={({ pressed }) => ({ height: 44, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 22, paddingHorizontal: 14, backgroundColor: on ? t.ink : t.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
                <Icon color={on ? t.bg : t.muted} size={16} />
                <Text style={{ color: on ? t.bg : t.muted, fontSize: 14, fontWeight: "500" }}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </ScrollView>

      {/* Footer stays visible below the fields, never on top of them. */}
      <View style={{ borderTopWidth: 1, borderColor: t.line, paddingTop: 12 }}>
        <Button title={units > 0n ? `Add ${formatMoney(units)}` : "Add expense"} disabled={units <= 0n || !split.length}
          onPress={() => onAdd({ payer, amount: units, participants: split, note: note.trim(), category })} />
      </View>
    </>
  );
}
