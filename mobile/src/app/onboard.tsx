import { router } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, View, ActivityIndicator } from "react-native";
import { Button, ErrorText, KinMark, Label, Screen, Serif, Text, TextInput, useInputStyle } from "@/components/ui";
import { KinNamesAbi } from "@/lib/abi";
import { setName, signUp, unlock, useAccount } from "@/lib/account";
import { addr, API_BASE } from "@/lib/config";
import { registerMe } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { moveOldAccount } from "@/lib/move";
import { formatMoney, toUnits } from "@/lib/money";
import { HANDLE_RE, nameOf, resolveName } from "@/lib/names";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

type Step = "welcome" | "name" | "handle" | "gift";
type Check = "idle" | "checking" | "free" | "taken";

const suggest = (name: string) => name.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
const home = () => router.replace("/tabs");

/** Welcome → first name → Face ID → @handle → welcome money. Or "Already have Kin?" → unlock. */
export default function Onboard() {
  const t = useTheme();
  const input = useInputStyle();
  const { profile } = useAccount();
  // Signed up earlier but never picked a name → straight to the name step.
  const [step, setStep] = useState<Step>(profile ? "handle" : "welcome");
  const [first, setFirst] = useState("");
  const [handle, setHandle] = useState("");
  const [check, setCheck] = useState<Check>("idle");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const seq = useRef(0);

  function onHandle(v: string) {
    const h = v.toLowerCase().replace(/^@/, "").replace(/\s/g, "");
    setHandle(h);
    setErr("");
    const n = ++seq.current;
    if (!HANDLE_RE.test(h)) return setCheck("idle");
    setCheck("checking");
    resolveName(h)
      .then((a) => n === seq.current && setCheck(a ? "taken" : "free"))
      .catch(() => n === seq.current && setCheck("idle"));
  }

  async function createAccount() {
    setBusy(true);
    setErr("");
    try {
      await signUp(first.trim());
      onHandle(suggest(first));
      setStep("handle");
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  async function bringOld() {
    setBusy(true);
    setErr("");
    try {
      const n = await moveOldAccount();
      void registerMe();
      if (n) setName(n);
      home();
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  async function haveKin() {
    setBusy(true);
    setErr("");
    try {
      const p = await unlock();
      void registerMe();
      const n = p.name || (await nameOf(p.address).catch(() => ""));
      if (n) {
        setName(n);
        home();
      } else setStep("handle");
    } catch (e) {
      setErr(humanError(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveHandle() {
    if (!profile || check !== "free") return;
    setBusy(true);
    setErr("");
    try {
      await call(addr.names, KinNamesAbi, "claim", [handle]);
      setName(handle);
    } catch (e) {
      // Already has a name (set up earlier) → keep it; name just got taken → say so.
      const existing = await nameOf(profile.address).catch(() => "");
      if (existing) setName(existing);
      else {
        const taken = await resolveName(handle).catch(() => null);
        setErr(taken ? "Someone just took that name. Try another." : humanError(e));
        if (taken) setCheck("taken");
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    setStep("gift");
    void registerMe(); // show up in other people's phonebook right away
    // Testnet welcome gift; failure is fine — the account works without it.
    await fetch(`${API_BASE}/api/faucet`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: profile.address }) }).catch(() => {});
    home();
  }

  if (step === "gift") {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
          <ActivityIndicator color={t.brand} size="large" />
          <Serif size={36}>Adding {formatMoney(toUnits(10_000))} welcome money</Serif>
          <Text style={{ color: t.muted, textAlign: "center" }}>Practice money so you can try Kin. Just a moment…</Text>
        </View>
      </Screen>
    );
  }

  if (step === "welcome") {
    return (
      <Screen>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <KinMark color={t.brand} />
          <Serif size={40} color={t.brand}>kin</Serif>
        </View>
        <View style={{ flex: 1, justifyContent: "center", gap: 16 }}>
          <Serif size={52}>Money for the people you <Text style={{ color: t.brand }}>love</Text>, anywhere.</Serif>
          <Text style={{ color: t.muted, fontSize: 18 }}>Send dollars home in a second. Free, with just an Identity check.</Text>
        </View>
        <ErrorText>{err}</ErrorText>
        <Button title="Create my account" onPress={() => setStep("name")} disabled={busy} />
        <Pressable onPress={haveKin} disabled={busy} style={{ height: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.muted, fontWeight: "600" }}>{busy ? "Opening Identity check…" : "Already have Kin?"}</Text>
        </Pressable>
        <Pressable onPress={bringOld} disabled={busy} style={{ height: 40, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: t.muted, fontSize: 13 }}>Used Kin before Oct 6? Bring your account</Text>
        </Pressable>
      </Screen>
    );
  }

  if (step === "handle") {
    const hint = {
      idle: handle && !HANDLE_RE.test(handle) ? "3–20 letters, numbers or _" : "Family finds you by this name.",
      checking: "Checking…",
      free: `@${handle} is yours to take ✓`,
      taken: `@${handle} is taken. Try another.`,
    }[check];
    return (
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <Screen>
          <Serif size={36}>Pick your Kin name</Serif>
          <Label>Your name on Kin</Label>
          <TextInput style={input} value={handle} onChangeText={onHandle} placeholder="@name" placeholderTextColor={t.muted}
            autoCapitalize="none" autoCorrect={false} maxLength={21} autoFocus onSubmitEditing={saveHandle} />
          <Text style={{ color: check === "taken" ? t.bad : check === "free" ? t.good : t.muted }}>{hint}</Text>
          <ErrorText>{err}</ErrorText>
          <View style={{ marginTop: "auto", gap: 8 }}>
            <Button title={busy ? "Saving" : `Continue as @${handle || "…"}`} onPress={saveHandle} busy={busy} disabled={check !== "free"} />
            {busy && <Text style={{ color: t.muted, textAlign: "center" }}>Saving @{handle} — a few seconds…</Text>}
          </View>
        </Screen>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Screen>
        <Serif size={36}>What should family call you?</Serif>
        <Label>First name</Label>
        <TextInput style={input} value={first} onChangeText={setFirst} autoComplete="given-name" maxLength={40} autoFocus
          onSubmitEditing={() => first.trim() && createAccount()} />
        <Text style={{ color: t.muted }}>No password, no forms. Your phone&apos;s Identity check keeps your account safe.</Text>
        <ErrorText>{err}</ErrorText>
        <View style={{ marginTop: "auto" }}>
          <Button title="Create with Identity check" onPress={createAccount} busy={busy} disabled={!first.trim()} />
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}
