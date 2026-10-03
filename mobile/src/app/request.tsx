import { router, useLocalSearchParams } from "expo-router";
import { Check, Share2 } from "lucide-react-native";
import { useEffect, useState } from "react";
import { KeyboardAvoidingView, Linking, Pressable, ScrollView, View } from "react-native";
import { PayQr } from "@/app/receive";
import { PersonPicker, type Person } from "@/components/PersonPicker";
import { Choice, MoneyInput, share } from "@/components/programs/kit";
import { Bubble } from "@/components/requests/bits";
import { Avatar, Button, ErrorText, Field, Footer, Label, Screen, Serif, Text, TextInput, useInputStyle } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { createRequest } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { formatMoney, fromLocal } from "@/lib/money";
import { HANDLE_RE, resolveName } from "@/lib/names";
import { payLink, walletUri } from "@/lib/payLink";
import { dueLabel, endOfDay } from "@/lib/reminders";
import { useTheme } from "@/theme";

// Port of app/src/app/request/page.tsx. #18 Request as message: "Need $50 for books 📚".
// `?to=` (@name) and `?amount=` (local currency) prefill — People's and Home's Request buttons.

const MODES = [{ value: "person", label: "From a person" }, { value: "link", label: "As a link" }] as const;
const DUE = [{ value: "none", label: "Anytime" }, { value: "3", label: "In 3 days" }, { value: "7", label: "In a week" }, { value: "pick", label: "Pick a date" }] as const;
type DueMode = (typeof DUE)[number]["value"];
const EMOJI = ["📚", "🍕", "🏠", "🚕", "💊", "🎁"];
const AMOUNT_RE = /^\d{0,9}(\.\d{0,2})?$/;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const dayLabel = (ms: number) => new Date(ms).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export default function Request() {
  const t = useTheme();
  const input = useInputStyle();
  const { profile } = useAccount();
  const handle = profile?.name;
  const params = useLocalSearchParams<{ to?: string; amount?: string }>();
  const [prefillTo] = useState(() => one(params.to).replace(/^@/, "").toLowerCase());
  const [mode, setMode] = useState<"person" | "link">("person");
  const [person, setPerson] = useState<Person | null>(null);
  const [picking, setPicking] = useState(() => !HANDLE_RE.test(prefillTo));
  const [amount, setAmount] = useState(() => (AMOUNT_RE.test(one(params.amount)) ? one(params.amount) : ""));
  const [note, setNote] = useState("");
  const [dueMode, setDueMode] = useState<DueMode>("none");
  const [picked, setPicked] = useState<number | null>(null);
  const [now] = useState(Date.now); // render-stable "today"
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sent, setSent] = useState(false);

  // From People / a deep link: resolve the prefilled @name once; unknown name → the picker.
  useEffect(() => {
    if (!HANDLE_RE.test(prefillTo)) return;
    resolveName(prefillTo)
      .then((a) => (a ? setPerson({ address: a, name: prefillTo }) : setPicking(true)))
      .catch(() => setPicking(true));
  }, [prefillTo]);

  const units = Number(amount) > 0 ? fromLocal(amount) : 0n;
  const due = dueMode === "3" || dueMode === "7" ? endOfDay(now, Number(dueMode)) : dueMode === "pick" && picked ? endOfDay(picked) : null;

  async function send() {
    if (!person || !units) return;
    setBusy(true);
    setErr("");
    try {
      await createRequest(person.address, units, note.trim(), due);
      setSent(true);
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  // Link mode: a pay-me link (and QR) anyone can open — even people not on Kin yet.
  const link = mode === "link" && handle && units ? payLink(handle, units, note.trim()) : "";
  const linkText = `Hi! Please pay me ${formatMoney(units)}${note.trim() ? ` for ${note.trim()}` : ""} on Kin:`;

  if (sent && person)
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <View style={{ width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", backgroundColor: t.good }}>
            <Check color="#1b1815" size={36} />
          </View>
          <Serif size={36}>Request sent</Serif>
          <Text style={{ color: t.muted, textAlign: "center" }}>@{person.name} can pay you with one tap.</Text>
        </View>
        <Footer>
          <Button title="See your requests" onPress={() => router.replace("/requests")} />
        </Footer>
      </Screen>
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen title="Request" back scroll>
        <Choice options={[...MODES]} value={mode} onChange={setMode} />

        {mode === "person" &&
          (picking ? (
            <PersonPicker label="Ask who?" onPick={setPerson} />
          ) : (
            <View style={{ gap: 12 }}>
              <Label>Ask who?</Label>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 12 }}>
                <Avatar name={prefillTo} size={40} />
                <Text style={{ flex: 1, color: t.ink, fontWeight: "600" }}>{person ? `@${person.name}` : `Finding @${prefillTo}…`}</Text>
                <Pressable onPress={() => (setPerson(null), setPicking(true))} accessibilityRole="button" style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 12 }}>
                  <Text style={{ color: t.brand, fontWeight: "600" }}>Change</Text>
                </Pressable>
              </View>
            </View>
          ))}

        <MoneyInput label="How much?" value={amount} onChange={(v) => AMOUNT_RE.test(v) && setAmount(v)} />

        <Field label="What's it for?">
          <TextInput style={[input, { textAlign: "center" }]} placeholder="school books" placeholderTextColor={t.muted} maxLength={140} value={note} onChangeText={setNote} />
        </Field>
        <View accessibilityLabel="Add an emoji" style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginTop: -4 }}>
          {EMOJI.map((em) => (
            <Pressable key={em} accessibilityRole="button" accessibilityLabel={`Add ${em}`}
              onPress={() => setNote((n) => (n.includes(em) ? n : `${n.trim()} ${em}`.trim()))}
              style={({ pressed }) => ({ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: t.surface2, transform: [{ scale: pressed ? 0.9 : 1 }] })}>
              <Text style={{ fontSize: 20 }}>{em}</Text>
            </Pressable>
          ))}
        </View>

        {mode === "person" && (
          <View style={{ gap: 6 }} accessibilityLabel="Pay by">
            <Label>Pay by</Label>
            <Choice options={[...DUE]} value={dueMode} onChange={setDueMode} />
            {dueMode === "pick" && (
              // ponytail: day chips for the next 60 days instead of a date-picker dependency.
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel="Pay by date">
                {Array.from({ length: 60 }, (_, i) => endOfDay(now, i + 1)).map((d) => {
                  const on = picked === d;
                  return (
                    <Pressable key={d} onPress={() => setPicked(d)} accessibilityRole="button" accessibilityState={{ selected: on }}
                      style={{ height: 44, justifyContent: "center", borderRadius: 22, paddingHorizontal: 14, backgroundColor: on ? t.ink : t.surface2 }}>
                      <Text style={{ color: on ? t.bg : t.muted, fontSize: 14, fontWeight: "600" }}>{dayLabel(d)}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
            {!!due && <Text style={{ color: t.muted, fontSize: 12 }}>{dayLabel(due)}</Text>}
          </View>
        )}

        {mode === "person" && units > 0n && (
          <View style={{ gap: 4 }}>
            <Label>{person ? `@${person.name} will see` : "Preview"}</Label>
            <Bubble mine amount={`Need ${formatMoney(units)}`} note={note.trim() ? `for ${note.trim()}` : undefined} />
            {!!due && <Text style={{ color: t.muted, fontSize: 14, alignSelf: "flex-end" }}>{dueLabel(due)}</Text>}
          </View>
        )}

        {mode === "link" && !handle && (
          <View style={{ borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 20 }}>
            <Text style={{ color: t.ink, fontSize: 14, textAlign: "center" }}>Pick a Kin name first so people know who they&apos;re paying.</Text>
          </View>
        )}
        {!!link && profile && (
          <View style={{ alignItems: "center", gap: 8, borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 20 }}>
            <Text style={{ color: t.ink, fontWeight: "600" }}>Pay to @{handle}</Text>
            <View style={{ width: "100%", maxWidth: 224, borderRadius: 16, overflow: "hidden" }}>
              <PayQr text={walletUri(profile.address, units)} label={`QR code to pay @${handle} ${formatMoney(units)}`} />
            </View>
            <Text style={{ color: t.ink, fontWeight: "600" }}>{formatMoney(units)}{note.trim() ? ` for ${note.trim()}` : ""}</Text>
            <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>Scan with Kin or any wallet app</Text>
          </View>
        )}

        <ErrorText>{err}</ErrorText>
        <Footer>
          {mode === "person" ? (
            <Button title={person ? `Ask @${person.name}` : "Send request"} onPress={() => void send()} disabled={!person || !units} busy={busy} />
          ) : (
            <>
              <Pressable disabled={!link} accessibilityRole="button" accessibilityState={{ disabled: !link }}
                onPress={() => void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(`${linkText} ${link}`)}`).catch(() => share(linkText, link))}
                style={({ pressed }) => ({ height: 56, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: t.good, opacity: link ? 1 : 0.4, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
                <Share2 color="#1b1815" size={20} />
                <Text style={{ color: "#1b1815", fontSize: 16, fontWeight: "700" }}>Send on WhatsApp</Text>
              </Pressable>
              <Button title="Share or copy link" variant="ghost" onPress={() => void share(linkText, link)} disabled={!link} />
            </>
          )}
        </Footer>
      </Screen>
    </KeyboardAvoidingView>
  );
}
