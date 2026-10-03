import { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { Choice, MoneyInput } from "@/components/programs/kit";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Card, Delivered, PeopleChips } from "@/components/trips/bits";
import { Avatar, Button, ErrorText, Field, Footer, Screen, Serif, Text, TextInput, useInputStyle } from "@/components/ui";
import { createRequest } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { ICON } from "@/lib/icons";
import { formatMoney, fromLocal } from "@/lib/money";
import { openKin } from "@/lib/nav";
import { useTheme } from "@/theme";

// Port of app/src/app/split/page.tsx. #26 Split a bill evenly or by custom amounts; sends a request to each person.


const MODES = [{ value: "even", label: "Split evenly" }, { value: "custom", label: "Custom amounts" }] as const;

export default function SplitPage() {
  const t = useTheme();
  const input = useInputStyle();
  const [people, setPeople] = useState<Person[]>([]);
  const [pickerKey, setPickerKey] = useState(0);
  const [total, setTotal] = useState("");
  const [note, setNote] = useState("");
  const [withMe, setWithMe] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [asked, setAsked] = useState<string[]>([]);
  const [mode, setMode] = useState<"even" | "custom">("even");
  const [custom, setCustom] = useState<Record<string, string>>({}); // address → local amount typed

  const units = Number(total) > 0 ? fromLocal(total) : 0n;
  const ways = BigInt(people.length + (withMe ? 1 : 0));
  // ponytail: floor split; the few leftover cents stay with you.
  const share = people.length && ways ? units / ways : 0n;
  // Custom: everyone's part (incl. mine if included) must add up to the total.
  const owe = (p: Person) => (mode === "even" ? share : Number(custom[p.address]) > 0 ? fromLocal(custom[p.address]) : 0n);
  const mine = withMe && Number(custom.me) > 0 ? fromLocal(custom.me) : 0n;
  const left = units - people.reduce((a, p) => a + owe(p), 0n) - mine;
  // ponytail: fromLocal rounding can leave <1¢ of drift; treat anything under a cent as settled.
  const balanced = left < 10_000n && left > -10_000n;
  const ready = mode === "even" ? share > 0n : units > 0n && people.length > 0 && balanced && people.every((p) => owe(p) > 0n);

  function add(p: Person | null) {
    if (!p) return;
    setPeople((ps) => (ps.some((x) => x.address === p.address) ? ps : [...ps, p]));
    setPickerKey((k) => k + 1); // fresh, empty picker for the next person
  }

  async function send() {
    setBusy(true);
    setErr("");
    const pending = people.filter((p) => !asked.includes(p.address));
    const results = await Promise.allSettled(pending.map((p) => createRequest(p.address, owe(p), note.trim())));
    const ok = pending.filter((_, i) => results[i].status === "fulfilled").map((p) => p.address);
    setAsked((a) => [...a, ...ok]);
    const failed = results.find((r) => r.status === "rejected");
    if (failed) setErr(humanError((failed as PromiseRejectedResult).reason));
    setBusy(false);
  }

  const n = `${people.length} ${people.length === 1 ? "person" : "people"}`;

  if (people.length && asked.length === people.length)
    return (
      <Screen>
        <Delivered title="Bill split" subtitle={mode === "even" ? `Asked ${n} for ${formatMoney(share)} each.` : `Asked ${n} for their part.`} />
        <Footer>
          <Button title="Track who paid" onPress={() => openKin("/requests", { replace: true })} />
        </Footer>
      </Screen>
    );

  return (
    <Screen title="Split a bill" back scroll>
      <Pressable onPress={() => openKin("/trips")} accessibilityRole="button"
        style={({ pressed }) => ({ alignSelf: "center", minHeight: 44, flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 22, paddingHorizontal: 16, backgroundColor: t.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
        <ICON.trip color={t.muted} size={16} />
        <Text style={{ color: t.muted, fontSize: 14, fontWeight: "500" }}>Planning a trip? Use Trips</Text>
      </Pressable>
      <MoneyInput label="Total bill" value={total} onChange={setTotal} />
      <Field label="What was it?">
        <TextInput style={[input, { textAlign: "center" }]} placeholder="Dinner 🍕" placeholderTextColor={t.muted} maxLength={140} value={note} onChangeText={setNote} />
      </Field>

      <PersonPicker key={pickerKey} label="Split with" onPick={add} exclude={new Set(people.map((p) => p.name))} />
      <PeopleChips label="Splitting with" people={people} onRemove={(p) => setPeople((ps) => ps.filter((x) => x.address !== p.address))} />

      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text style={{ color: t.ink, fontWeight: "500" }}>Include me in the split</Text>
        <Switch value={withMe} onValueChange={setWithMe} accessibilityLabel="Include me in the split" trackColor={{ true: t.brand, false: t.line }} thumbColor={t.surface} />
      </View>

      <Choice options={[...MODES]} value={mode} onChange={setMode} />

      {mode === "custom" && people.length > 0 && (
        <Card>
          {[...(withMe ? [{ address: "me", name: "You" }] : []), ...people].map((p) => (
            <View key={p.address} style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
              <Avatar name={p.name} size={32} />
              <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontWeight: "500" }}>{p.address === "me" ? "You" : `@${p.name}`}</Text>
              <TextInput
                style={[input, { height: 44, width: 112, textAlign: "right", fontVariant: ["tabular-nums"] }]}
                keyboardType="decimal-pad"
                placeholder="0"
                placeholderTextColor={t.muted}
                accessibilityLabel={p.address === "me" ? "Your part" : `@${p.name}'s part`}
                value={custom[p.address] ?? ""}
                onChangeText={(raw) => {
                  const v = raw.replace(",", ".");
                  if (/^\d{0,9}(\.\d{0,2})?$/.test(v)) setCustom((c) => ({ ...c, [p.address]: v }));
                }}
              />
            </View>
          ))}
          <Text accessibilityLiveRegion="polite" style={{ textAlign: "right", fontSize: 14, fontWeight: "500", color: balanced ? t.good : left < 0n ? t.bad : t.muted }}>
            {units === 0n ? "Enter the total first" : balanced ? "Adds up ✓" : left > 0n ? `${formatMoney(left)} left to split` : `${formatMoney(-left)} over the total`}
          </Text>
        </Card>
      )}

      {mode === "even" && share > 0n && (
        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <Text style={{ color: t.muted }}>Each person pays</Text>
          <Serif size={30}>{formatMoney(share)}</Serif>
        </Card>
      )}

      <ErrorText>{err}</ErrorText>
      <Footer>
        <Button title={people.length ? `Ask ${n}` : "Add people to split with"} onPress={send} disabled={!ready} busy={busy} />
      </Footer>
    </Screen>
  );
}
