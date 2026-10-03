import * as Clipboard from "expo-clipboard";
import { ChevronRight, Plus, ShieldCheck, Trash2, type LucideIcon } from "lucide-react-native";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, AppState, Pressable, View } from "react-native";
import { Button, ErrorText, Label, Screen, Text, TextInput, useInputStyle } from "@/components/ui";
import { importAccount, removeImported, revealSecrets, useAccount } from "@/lib/account";
import { humanError } from "@/lib/errors";
import { parseSecret } from "@/lib/keys";
import { nameOf, shortAddr } from "@/lib/names";
import { useTheme } from "@/theme";

// Me → Security (same as web /security). Only screen allowed to say "recovery phrase", "private key", "wallet".
// Secrets exist only in this screen's state after a fresh Face ID; backgrounding, back or "Done" drops them.

type Secrets = { mnemonic: string; privateKeyHex: string };
type Step = "menu" | "warn" | "show" | "add";

export default function Security() {
  const { profile, accounts } = useAccount();
  const [step, setStep] = useState<Step>("menu");
  const [secrets, setSecrets] = useState<Secrets | null>(null);

  // Auto-hide when the app goes to the background (also covers the app switcher thumbnail on Android).
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => s !== "active" && (setSecrets(null), setStep((x) => (x === "show" ? "menu" : x))));
    return () => sub.remove();
  }, []);

  const back = () => (setSecrets(null), setStep("menu"));
  if (step === "warn") return <Warn onBack={back} onShown={(s) => (setSecrets(s), setStep("show"))} />;
  if (step === "show" && secrets) return <Show secrets={secrets} onDone={back} />;
  if (step === "add") return <Add kinAddress={accounts.find((a) => a.kin)?.address} onDone={back} />;

  const others = accounts.filter((a) => !a.kin);
  function remove(address: `0x${string}`, label: string) {
    Alert.alert(`Remove ${label}?`, "This only forgets it on this phone. Its money stays with its recovery phrase.", [
      { text: "Keep", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void removeImported(address) },
    ]);
  }

  return (
    <Screen title="Security" back scroll>
      <Label>Use Kin in another wallet</Label>
      <Row icon={ShieldCheck} label="Show my recovery phrase" sub="Back up, or open this account in MetaMask, Rabby…" onPress={() => setStep("warn")} />
      <Label>Bring an account to Kin</Label>
      <Row icon={Plus} label="Add an account from another wallet" sub="Paste its recovery phrase or private key" onPress={() => setStep("add")} />
      {others.length > 0 && <Label>Other accounts on this phone</Label>}
      {others.map((a) => {
        const label = a.name ? `@${a.name}` : shortAddr(a.address);
        return <Row key={a.address} icon={Trash2} danger label={label} sub={a.address === profile?.address ? "In use" : undefined} onPress={() => remove(a.address, label)} />;
      })}
    </Screen>
  );
}

function Row({ icon: Icon, label, sub, onPress, danger }: { icon: LucideIcon; label: string; sub?: string; onPress: () => void; danger?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={danger ? `Remove ${label}` : label}
      style={({ pressed }) => ({ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 12, borderRadius: 16, backgroundColor: pressed ? t.surface2 : "transparent" })}>
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
        <Icon color={danger ? t.bad : t.ink} size={20} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600" }}>{label}</Text>
        {sub ? <Text style={{ color: t.muted, fontSize: 13 }}>{sub}</Text> : null}
      </View>
      {!danger && <ChevronRight color={t.muted} size={18} />}
    </Pressable>
  );
}

function Warn({ onBack, onShown }: { onBack: () => void; onShown: (s: Secrets) => void }) {
  const t = useTheme();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function reveal() {
    setBusy(true);
    setErr("");
    try {
      onShown(await revealSecrets());
    } catch (e) {
      setErr(humanError(e));
      setBusy(false);
    }
  }
  return (
    <Screen title="Your recovery phrase" scroll>
      <View style={{ borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 16, gap: 10 }}>
        <Text style={{ color: t.ink, fontWeight: "700" }}>Before you look</Text>
        {["Anyone with these words controls your money. Keep them offline and private.", "Don’t take a screenshot or paste them into chats.", "Kin will never ask for them. Anyone who does is a scam."].map((l) => (
          <Text key={l} style={{ color: t.muted }}>• {l}</Text>
        ))}
      </View>
      <Pressable onPress={() => setOk(!ok)} accessibilityRole="checkbox" accessibilityState={{ checked: ok }}
        style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12 }}>
        <View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: ok ? t.brand : t.muted, backgroundColor: ok ? t.brand : "transparent" }} />
        <Text style={{ color: t.ink, fontWeight: "600" }}>I understand</Text>
      </Pressable>
      <ErrorText>{err}</ErrorText>
      <View style={{ marginTop: "auto", gap: 8 }}>
        <Button title="Show with Identity check" disabled={!ok} busy={busy} onPress={reveal} />
        <Button title="Cancel" variant="ghost" onPress={onBack} />
      </View>
    </Screen>
  );
}

function Show({ secrets, onDone }: { secrets: Secrets; onDone: () => void }) {
  const t = useTheme();
  const words = secrets.mnemonic.split(" ");
  return (
    <Screen title="Your recovery phrase" scroll>
      <Text style={{ color: t.muted }}>Works in MetaMask, Rabby and other wallets: import with this phrase (first account).</Text>
      <Hold label="Hold to show your 24 words">
        {(on) => (
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
            {words.map((w, i) => (
              <Text key={i} style={{ width: "50%", color: t.ink, fontSize: 16 }}>
                <Text style={{ color: t.muted }}>{String(i + 1).padStart(2, " ")}  </Text>
                <Text style={{ fontWeight: "600" }}>{on ? w : "•••••"}</Text>
              </Text>
            ))}
          </View>
        )}
      </Hold>
      <CopyBtn text={secrets.mnemonic} label="Copy recovery phrase" />
      <Label>Private key</Label>
      <Hold label="Hold to show private key">
        {(on) => <Text style={{ color: t.ink, fontFamily: "monospace", fontSize: 13 }}>{on ? secrets.privateKeyHex : "•".repeat(32)}</Text>}
      </Hold>
      <CopyBtn text={secrets.privateKeyHex} label="Copy private key" />
      <View style={{ marginTop: "auto" }}>
        <Button title="Done, hide it" onPress={onDone} />
      </View>
    </Screen>
  );
}

/** Hidden until pressed and held. */
function Hold({ label, children }: { label: string; children: (on: boolean) => ReactNode }) {
  const t = useTheme();
  const [on, setOn] = useState(false);
  return (
    <Pressable onPressIn={() => setOn(true)} onPressOut={() => setOn(false)} accessibilityRole="button" accessibilityLabel={label}
      style={{ borderRadius: 20, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 16, gap: 8 }}>
      {children(on)}
      {!on && <Text style={{ color: t.muted, fontSize: 13, fontWeight: "600", textAlign: "center" }}>{label}</Text>}
    </Pressable>
  );
}

/** Copies, then wipes the clipboard after 60s. */
function CopyBtn({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => (void Clipboard.setStringAsync(""), setCopied(false)), 60_000);
  }
  return <Button variant="soft" title={copied ? "Copied. Clears in 1 minute" : label} onPress={copy} />;
}

function Add({ kinAddress, onDone }: { kinAddress?: string; onDone: () => void }) {
  const t = useTheme();
  const input = useInputStyle();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [found, setFound] = useState<{ address: string; name: string } | null>(null);
  // Preview only: key bytes zeroed straight away; parsed again on submit.
  const address = useMemo(() => {
    const p = parseSecret(text);
    p?.privateKey.fill(0);
    return p?.address ?? null;
  }, [text]);
  const mine = !!address && address === kinAddress;

  useEffect(() => {
    if (!address) return;
    let live = true;
    nameOf(address).then((name) => live && setFound({ address, name }), () => {});
    return () => void (live = false);
  }, [address]);
  const name = found?.address === address ? found.name : "";

  async function add() {
    const p = parseSecret(text);
    if (!p) return;
    setBusy(true);
    setErr("");
    try {
      await importAccount(p.privateKey, name || undefined);
      setText("");
      onDone();
    } catch (e) {
      p.privateKey.fill(0);
      setErr(humanError(e));
      setBusy(false);
    }
  }

  return (
    <Screen title="Add an account" scroll>
      <Text style={{ color: t.muted }}>Paste the 12 or 24-word recovery phrase, or the private key, from your other wallet. It stays locked on this phone behind your Identity check.</Text>
      <TextInput value={text} onChangeText={setText} multiline accessibilityLabel="Recovery phrase or private key"
        autoComplete="off" autoCorrect={false} autoCapitalize="none" spellCheck={false} importantForAutofill="no"
        placeholder="word word word…" placeholderTextColor={t.muted}
        style={[input, { height: 120, paddingTop: 14, textAlignVertical: "top" }]} />
      {address ? (
        <Text style={{ color: t.ink }}>
          {mine ? "That’s already your Kin account." : <>Account <Text style={{ fontWeight: "700" }}>{name ? `@${name}` : shortAddr(address)}</Text> found</>}
        </Text>
      ) : text.trim() ? (
        <Text style={{ color: t.muted }}>Check the words: 12 or 24, spelled exactly, one space apart.</Text>
      ) : null}
      <ErrorText>{err}</ErrorText>
      <View style={{ marginTop: "auto", gap: 8 }}>
        <Button title="Add with Identity check" disabled={!address || mine} busy={busy} onPress={add} />
        <Button title="Cancel" variant="ghost" onPress={onDone} />
      </View>
    </Screen>
  );
}
