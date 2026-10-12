import * as Clipboard from "expo-clipboard";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Pressable, ScrollView, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { Avatar, Button, ErrorText, Label, Screen, Serif, Text, TextInput, useInputStyle } from "@/components/ui";
import { getAccount, getProfile, isUnlocked, readToken } from "@/lib/account";
import { getBalance } from "@/lib/activity";
import { CATEGORIES, setCategory, type CategoryId } from "@/lib/categories";
import { recentPeople, recordPayment, type Person } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { currencySymbol, formatMoney, fromLocal, getCurrency } from "@/lib/money";
import { isAddress, type Address } from "viem";
import { HANDLE_RE, loadDirectory, nameOf, resolveName, shortAddr } from "@/lib/names";
import { parseAmt, unitsToLocal } from "@/lib/payLink";
import { shareCard } from "@/lib/shareCard";
import { play } from "@/lib/sound";
import { sendDollars } from "@/lib/tx";
import type { Trie } from "@/lib/trie";
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
  const [category, setCat] = useState<CategoryId | null>(null);
  const [trie, setTrie] = useState<Trie | null>(null);
  const seq = useRef(0);

  const [finding, setFinding] = useState(() => HANDLE_RE.test(to));
  // `?to=0x…` (scanned from another wallet's code): pay the account directly; show its Kin name if it has one.
  const [rawTo] = useState(() => (isAddress(one(params.to)) ? (one(params.to) as Address) : null));
  useEffect(() => {
    if (!rawTo) return;
    nameOf(rawTo).catch(() => "").then((n) => (setPerson({ address: rawTo, name: n }), setTo(n))); // Kin user → their @name in the box, never the address
  }, [rawTo]);
  // Not on Kin (no @name) → show the short address; the full one is copyable.
  const label = (n?: string) => (n ? `@${n}` : rawTo ? shortAddr(rawTo) : "");
  const [copied, setCopied] = useState(false);

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

  // Autocomplete: prefix tree of all Kin names (same as web PersonPicker).
  useEffect(() => {
    loadDirectory().then((d) => setTrie(d.trie));
  }, []);

  useEffect(() => {
    if (!isUnlocked() && !readToken()) return; // never pop Face ID just to show suggestions
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
    setStatus(isUnlocked() ? "Sending…" : "Confirm with Identity check");
    const slow = setTimeout(() => setStatus("Almost there…"), 2500);
    try {
      const account = await getAccount();
      if ((await getBalance(account.address)) < units) throw new Error("insufficient balance");
      setStatus(`Sending to ${label(person.name)}…`);
      const t0 = Date.now();
      const hash = await sendDollars(person.address, units);
      if (category) setCategory(hash, category).catch(() => {});
      if (person.name) recordPayment(person.address, units, hash).catch(() => {}); // not on Kin: keep them out of the phonebook
      setDone({ ms: Date.now() - t0, units, name: person.name });
      play("sent");
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
          <Animated.View entering={ZoomIn.springify().damping(12)}>
            <Text style={{ color: t.good, fontSize: 20, fontWeight: "700" }}>Delivered ✓ in {(done.ms / 1000).toFixed(1)}s</Text>
          </Animated.View>
          <Animated.View entering={FadeInDown.delay(120)}><Serif size={64}>{formatMoney(done.units, currency)}</Serif></Animated.View>
          <Text style={{ color: t.muted }}>to {label(done.name)}{note.trim() ? ` · '${note.trim()}'` : ""}</Text>
        </View>
        <View style={{ gap: 8 }}>
          <Button title="Share card" variant="soft"
            onPress={() => shareCard({ kind: "sent", amount: done.units, to: done.name || undefined, from: getProfile()?.name, secs: done.ms < 60_000 ? (done.ms / 1000).toFixed(1) : undefined },
              `Sent ${formatMoney(done.units, currency)} with Kin. Delivered ✓`)} />
          <Button title="Done" onPress={() => (router.canGoBack() ? router.back() : router.replace("/tabs"))} />
        </View>
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

  const me = getProfile()?.name;
  const suggestions = to && !person ? (trie?.suggest(to, 6) ?? []).filter((n) => n !== me && n !== to).slice(0, 5) : [];
  const hint = !to || (person && !person.name) ? "" : finding ? `Finding @${to}…` : person ? `${label(person.name)} ✓` : HANDLE_RE.test(to) ? "No one on Kin with that name yet." : "";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen title="Pay" back scroll>
        <Label>To</Label>
        {rawTo && person && !person.name ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 12 }}>
              <Avatar name="" size={40} />
              <Text style={{ flex: 1, color: t.ink, fontWeight: "600" }}>{shortAddr(rawTo)}</Text>
              <Pressable onPress={() => void Clipboard.setStringAsync(rawTo).then(() => setCopied(true))} accessibilityRole="button" accessibilityLabel="Copy address"
                style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}>
                <Text style={{ color: t.brand, fontWeight: "600" }}>{copied ? "Copied ✓" : "Copy"}</Text>
              </Pressable>
            </View>
            <Text style={{ color: t.muted }}>Not on Kin — make sure this address is right.</Text>
          </>
        ) : (
          <TextInput style={input} value={to ? `@${to}` : ""} placeholder="@name" placeholderTextColor={t.muted}
            onChangeText={onTo}
            autoCapitalize="none" autoCorrect={false} maxLength={21} />
        )}
        {suggestions.length > 0 && (
          <View accessibilityLabel="Suggestions" style={{ borderRadius: 20, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, overflow: "hidden" }}>
            {suggestions.map((n) => (
              <Pressable key={n} onPress={() => onTo(n)} accessibilityRole="button" accessibilityLabel={`@${n}`}
                style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, backgroundColor: pressed ? t.surface2 : "transparent" })}>
                <Avatar name={n} size={32} />
                <Text style={{ fontWeight: "600", color: t.muted }}><Text style={{ fontWeight: "600", color: t.ink }}>@{n.slice(0, to.length)}</Text>{n.slice(to.length)}</Text>
              </Pressable>
            ))}
          </View>
        )}
        {!!hint && !suggestions.length && <Text style={{ color: person ? t.good : t.muted }}>{hint}</Text>}
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

        <Label>What&apos;s it for?</Label>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 8 }}>
          {CATEGORIES.map(({ id, label, icon: Icon }) => {
            const on = category === id;
            return (
              <Pressable key={id} onPress={() => setCat(on ? null : id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ height: 40, borderRadius: 20, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderColor: on ? t.brand : t.line, backgroundColor: on ? t.brandSoft : t.surface }}>
                <Icon color={on ? t.brand : t.muted} size={16} />
                <Text style={{ color: on ? t.brand : t.ink, fontSize: 14, fontWeight: "600" }}>{label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ErrorText>{err}</ErrorText>
        <View style={{ marginTop: "auto" }}>
          <Button title={units > 0n ? `Send ${formatMoney(units, currency)}` : "Send now"} onPress={send} disabled={!ready} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
