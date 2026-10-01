import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { Avatar, Button, ErrorText, Label, Screen, Serif, useInputStyle } from "@/components/ui";
import { getAccount, isUnlocked } from "@/lib/account";
import { getBalance } from "@/lib/activity";
import { recentPeople, recordPayment, type Person } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { currencySymbol, formatMoney, fromLocal, getCurrency } from "@/lib/money";
import { HANDLE_RE, resolveName } from "@/lib/names";
import { parseAmt, unitsToLocal } from "@/lib/payLink";
import { sendDollars } from "@/lib/tx";
import { useTheme } from "@/theme";

const AMOUNT_RE = /^\d{0,9}(\.\d{0,2})?$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Pay a person: native port of web SendForm (person mode). */
export default function Send() {
  const t = useTheme();
  const input = useInputStyle();
  const params = useLocalSearchParams<{ to?: string; amt?: string; amount?: string; note?: string }>();
  const [currency] = useState(getCurrency);
  // From a pay link / QR: exact dollar units (`amt`) win over a typed local `amount`.
  const [linkUnits] = useState(() => parseAmt(one(params.amt)));
  const [amount, setAmount] = useState(() => {
    if (linkUnits) return unitsToLocal(linkUnits, currency);
    const a = one(params.amount);
    return AMOUNT_RE.test(a) ? a : "";
  });
  const [note, setNote] = useState(() => one(params.note).slice(0, 80));
  const [to, setTo] = useState(() => one(params.to).replace(/^@/, "").toLowerCase());
  const [person, setPerson] = useState<Person | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [done, setDone] = useState<{ ms: number; units: bigint; name: string } | null>(null);
  const [err, setErr] = useState("");
  const seq = useRef(0);

  const [finding, setFinding] = useState(() => HANDLE_RE.test(to));

  function lookup(h: string) {
    const n = ++seq.current;
    resolveName(h)
      .then((a) => n === seq.current && setPerson(a ? { address: a, name: h } : null))
      .catch(() => {})
      .finally(() => n === seq.current && setFinding(false));
  }

  function onTo(v: string) {
    const h = v.replace(/^@/, "").toLowerCase().replace(/\s/g, "");
    setTo(h);
    setPerson(null);
    seq.current++;
    setFinding(HANDLE_RE.test(h));
    if (HANDLE_RE.test(h)) lookup(h);
  }

  // From a pay link / QR / deep link: resolve the prefilled @name once.
  useEffect(() => {
    if (HANDLE_RE.test(to)) lookup(to);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, for the prefilled name
  }, []);

  useEffect(() => {
    if (!isUnlocked()) return; // never pop Face ID just to show suggestions
    let live = true;
    recentPeople().then((p) => live && setPeople(p));
    return () => {
      live = false;
    };
  }, []);

  const units = linkUnits && amount === unitsToLocal(linkUnits, currency) ? linkUnits : Number(amount) > 0 ? fromLocal(amount, currency) : 0n;
  const ready = units > 0n && !!person;

  async function send() {
    if (!ready || !person) return;
    setErr("");
    setStatus(isUnlocked() ? "Sending…" : "Confirm with Face ID");
    const slow = setTimeout(() => setStatus("Almost there…"), 2500);
    try {
      const account = await getAccount();
      if ((await getBalance(account.address)) < units) throw new Error("insufficient balance");
      setStatus(`Sending to @${person.name}…`);
      const t0 = Date.now();
      await sendDollars(person.address, units);
      recordPayment(person.address, units).catch(() => {});
      setDone({ ms: Date.now() - t0, units, name: person.name });
    } catch (e) {
      setErr(humanError(e));
    } finally {
      clearTimeout(slow);
      setStatus(null);
    }
  }

  if (done) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <Text style={{ color: t.good, fontSize: 20, fontWeight: "700" }}>Delivered ✓✓ in {(done.ms / 1000).toFixed(1)}s</Text>
          <Serif size={64}>{formatMoney(done.units, currency)}</Serif>
          <Text style={{ color: t.muted }}>to @{done.name}{note.trim() ? ` · “${note.trim()}”` : ""}</Text>
        </View>
        <Button title="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace("/home"))} />
      </Screen>
    );
  }

  if (status) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 20 }}>
          <Avatar name={person?.name} size={88} />
          <ActivityIndicator color={t.brand} size="large" />
          <Serif size={56}>{formatMoney(units, currency)}</Serif>
          <Text style={{ color: t.muted }} accessibilityLiveRegion="polite">{status}</Text>
        </View>
      </Screen>
    );
  }

  const hint = !to ? "" : finding ? `Finding @${to}…` : person ? `@${person.name} ✓` : HANDLE_RE.test(to) ? "No one on Kin with that name yet." : "";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen title="Pay" back scroll>
        <Label>To</Label>
        <TextInput style={input} value={to ? `@${to}` : ""} placeholder="@name" placeholderTextColor={t.muted}
          onChangeText={onTo}
          autoCapitalize="none" autoCorrect={false} maxLength={21} />
        {!!hint && <Text style={{ color: person ? t.good : t.muted }}>{hint}</Text>}
        {!person && people.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 16 }}>
            {people.map((p) => (
              <Pressable key={p.address} onPress={() => onTo(p.name)} style={{ width: 64, alignItems: "center", gap: 6 }}>
                <Avatar name={p.name} size={48} />
                <Text numberOfLines={1} style={{ color: t.muted, fontSize: 12 }}>{p.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}

        <Label>Amount in {currency}</Label>
        <View style={{ justifyContent: "center" }}>
          <Text style={{ position: "absolute", left: 16, color: t.muted, fontSize: 17, fontWeight: "600" }}>{currencySymbol(currency)}</Text>
          <TextInput style={[input, { paddingLeft: 40 }]} value={amount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={t.muted}
            onChangeText={(v) => AMOUNT_RE.test(v) && setAmount(v)} />
        </View>
        {currency !== "USD" && units > 0n && <Text style={{ color: t.muted }}>≈ {formatMoney(units, "USD")}</Text>}

        <TextInput style={[input, { textAlign: "center" }]} placeholder="Add a note" placeholderTextColor={t.muted}
          value={note} maxLength={80} onChangeText={setNote} />

        <ErrorText>{err}</ErrorText>
        <View style={{ marginTop: "auto" }}>
          <Button title={units > 0n ? `Send ${formatMoney(units, currency)}` : "Send now"} onPress={send} disabled={!ready} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
