import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { HandCoins, MessageCircle, Users } from "lucide-react-native";
import { useEffect, useState, type ReactNode } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Avatar, Button, ErrorText, IconButton, Label, Text, TextInput, useInputStyle } from "@/components/ui";
import { unlock, useAccount } from "@/lib/account";
import { API_BASE } from "@/lib/config";
import { addContact, listContacts, type Person, type Phonebook } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { useUnread } from "@/lib/live";
import { formatMoney } from "@/lib/money";
import { HANDLE_RE, resolveName } from "@/lib/names";
import { useTheme } from "@/theme";

const pay = (p: Person) => router.push({ pathname: "/send", params: { to: p.name } });
const message = (p: Person) => router.push({ pathname: "/chat", params: { with: p.address } });
// ponytail: web /request has its own person picker; open it rather than port the request flow.
const request = () => void WebBrowser.openBrowserAsync(`${API_BASE}/request`);

export default function People() {
  const t = useTheme();
  const { canRead } = useAccount();
  const unread = useUnread();
  const input = useInputStyle();
  const [book, setBook] = useState<Phonebook | null>(null);
  const [err, setErr] = useState("");
  const [adding, setAdding] = useState(false);
  const [handle, setHandle] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  // Loading people needs a read session (or unlocked), so opening this tab never pops Face ID.
  useEffect(() => {
    if (canRead) listContacts().then(setBook, (e) => setErr(humanError(e)));
  }, [canRead]);

  async function save(p: Person, nick: string) {
    setErr("");
    const prev = book;
    // Optimistic: show them in "Your people" right away.
    setBook((b) => b && {
      ...b,
      contacts: [...b.contacts.filter((c) => c.address !== p.address), { ...p, label: nick }],
      suggested: b.suggested.filter((s) => s.address !== p.address),
    });
    try {
      await addContact(p, nick);
      return true;
    } catch (e) {
      setBook(prev);
      setErr(humanError(e));
      return false;
    }
  }

  function close() {
    setAdding(false);
    setHandle("");
    setLabel("");
  }

  async function submit() {
    setBusy(true);
    setErr("");
    try {
      const name = handle.trim().replace(/^@/, "").toLowerCase();
      const address = HANDLE_RE.test(name) ? await resolveName(name) : null;
      if (!address) setErr("No one on Kin with that name yet.");
      else if (await save({ address, name }, label.trim())) close();
    } catch (e) {
      setErr(humanError(e));
    }
    setBusy(false);
  }

  const known = new Set(book?.contacts.map((c) => c.address));
  const recents = book?.recents.filter((r) => r.name && !known.has(r.address)) ?? [];
  const empty = book && !book.contacts.length && !recents.length && !book.suggested.length;
  const pill = { height: 44, borderRadius: 22, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: t.brandSoft } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingTop: 16, paddingBottom: 120, gap: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20 }}>
        <Text style={{ flex: 1, color: t.ink, fontSize: 20, fontWeight: "700" }}>People</Text>
        <IconButton icon={MessageCircle} label="Messages" badge={unread.messages} onPress={() => router.push("/messages")} />
        {!adding && (
          <Pressable onPress={() => setAdding(true)} accessibilityRole="button" style={({ pressed }) => [pill, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
            <Text style={{ color: t.brand, fontSize: 14, fontWeight: "600" }}>+ Add</Text>
          </Pressable>
        )}
      </View>

      {!canRead && (
        <Card>
          <View style={{ alignItems: "center", gap: 6 }}>
            <Text style={{ color: t.ink, fontWeight: "600" }}>Your people are private</Text>
            <Text style={{ color: t.muted, fontSize: 14 }}>Confirm with Face ID to see them.</Text>
          </View>
          <Button title="Show my people" onPress={() => unlock().catch((e) => setErr(humanError(e)))} />
        </Card>
      )}

      {adding && (
        <Card>
          <View style={{ gap: 8 }}>
            <Label>Who?</Label>
            <TextInput style={input} placeholder="@name" placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false} autoFocus value={handle} onChangeText={setHandle} />
          </View>
          <View style={{ gap: 8 }}>
            <Label>What do you call them?</Label>
            <TextInput style={input} placeholder="Mum, Ravi, Landlord…" placeholderTextColor={t.muted} maxLength={40} value={label} onChangeText={setLabel} />
            <Text style={{ color: t.muted, fontSize: 13 }}>Only you see this.</Text>
          </View>
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1 }}><Button title="Cancel" variant="ghost" onPress={close} /></View>
            <View style={{ flex: 1 }}><Button title="Save" onPress={submit} disabled={!handle.trim()} busy={busy} /></View>
          </View>
        </Card>
      )}

      {!!err && <View style={{ paddingHorizontal: 20 }}><ErrorText>{err}</ErrorText></View>}

      {canRead && !book && !err && (
        <View style={{ paddingHorizontal: 20, gap: 16 }} accessibilityLabel="Loading">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface2 }} />
              <View style={{ flex: 1, height: 14, borderRadius: 7, backgroundColor: t.surface2 }} />
            </View>
          ))}
        </View>
      )}

      {empty && !adding && (
        <View style={{ alignItems: "center", gap: 8, paddingHorizontal: 20, paddingTop: 40 }}>
          <View style={{ width: 56, height: 56, borderRadius: 20, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
            <Users color={t.ink} size={26} />
          </View>
          <Text style={{ color: t.ink, fontWeight: "600" }}>No one here yet</Text>
          <Text style={{ color: t.muted, fontSize: 14 }}>Add the people you send money to.</Text>
        </View>
      )}

      {!!book?.contacts.length && (
        <Section title="Your people">
          {book.contacts.map((c) => (
            <PersonRow key={c.address} p={c} title={c.label || `@${c.name}`} sub={c.label && c.name ? `@${c.name}` : undefined} />
          ))}
        </Section>
      )}

      {recents.length > 0 && (
        <Section title="Recent">
          {recents.map((r) => (
            <PersonRow key={r.address} p={r} title={`@${r.name}`} sub={`You've sent ${formatMoney(BigInt(r.total))}`} />
          ))}
        </Section>
      )}

      {!!book?.suggested.length && (
        <Section title="People you may know">
          {book.suggested.map((s) => (
            <PersonRow key={s.address} p={s} title={`@${s.name}`} sub={`${s.mutual} ${s.mutual === 1 ? "friend" : "friends"} in common`}
              action={
                <Pressable onPress={() => void save(s, "")} accessibilityRole="button" accessibilityLabel={`Add @${s.name}`} style={pill}>
                  <Text style={{ color: t.brand, fontSize: 14, fontWeight: "600" }}>Add</Text>
                </Pressable>
              } />
          ))}
        </Section>
      )}
    </ScrollView>
  );
}

function Card({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <View style={{ marginHorizontal: 20, gap: 16, padding: 20, borderRadius: 28, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line }}>{children}</View>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const t = useTheme();
  return (
    <View>
      <Text style={{ backgroundColor: t.surface2, paddingHorizontal: 20, paddingVertical: 10, color: t.muted, fontSize: 12, fontWeight: "600", letterSpacing: 1.5, textTransform: "uppercase" }}>{title}</Text>
      <View style={{ paddingVertical: 4 }}>{children}</View>
    </View>
  );
}

/** Tap = pay; trailing Request + Message (or a custom action, e.g. Add). */
function PersonRow({ p, title, sub, action }: { p: Person; title: string; sub?: string; action?: ReactNode }) {
  const t = useTheme();
  const icon = { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" } as const;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", paddingRight: 12 }}>
      <Pressable onPress={p.name ? () => pay(p) : undefined} accessibilityRole="button" accessibilityLabel={`Pay ${title}`}
        style={({ pressed }) => ({ flex: 1, minHeight: 64, flexDirection: "row", alignItems: "center", gap: 16, paddingLeft: 20, paddingRight: 8, paddingVertical: 12, backgroundColor: pressed ? t.surface2 : "transparent" })}>
        <Avatar name={p.name} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: t.ink, fontWeight: "600" }} numberOfLines={1}>{title}</Text>
          {sub && <Text style={{ color: t.muted, fontSize: 14 }} numberOfLines={1}>{sub}</Text>}
        </View>
      </Pressable>
      {action ?? (
        <>
          <Pressable onPress={request} accessibilityRole="button" accessibilityLabel={`Request from ${title}`} style={({ pressed }) => [icon, { backgroundColor: pressed ? t.surface2 : "transparent" }]}>
            <HandCoins color={t.muted} size={22} />
          </Pressable>
          <Pressable onPress={() => message(p)} accessibilityRole="button" accessibilityLabel={`Message ${title}`} style={({ pressed }) => [icon, { backgroundColor: pressed ? t.surface2 : "transparent" }]}>
            <MessageCircle color={t.muted} size={22} />
          </Pressable>
        </>
      )}
    </View>
  );
}
