import { Check, Plus } from "lucide-react-native";
import { useEffect, useState } from "react";
import { getAddress, isAddress } from "viem";
import { Pressable, View } from "react-native";
import { Avatar, Label, Text, TextInput, useInputStyle } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { recentPeople, type Person } from "@/lib/contacts";
import { loadDirectory, resolveName } from "@/lib/names";
import type { Trie } from "@/lib/trie";
import { useTheme } from "@/theme";

export type { Person };

/**
 * Port of app/src/components/PersonPicker.tsx. Pick a person: calls onPick with a resolved Person, or null when cleared.
 * Recent/saved people as a one-tap avatar row; "Add new" opens the @name field.
 * `recents={false}` skips the row (field only); `exclude` (@names or lowercase addresses) hides people already chosen from the row; names also from autocomplete.
 */
export function PersonPicker({ label = "To", onPick, recents: showRecents = true, exclude }: {
  label?: string;
  onPick: (p: Person | null) => void;
  recents?: boolean;
  exclude?: Set<string>;
}) {
  const t = useTheme();
  const input = useInputStyle();
  const { canRead, profile } = useAccount();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Person | null>(null);
  const [miss, setMiss] = useState(false);
  const [allRecents, setRecents] = useState<Person[]>([]);
  const [typing, setTyping] = useState(false);
  const [trie, setTrie] = useState<Trie | null>(null);

  // Only with a read session (or unlocked): loading people must never trigger Face ID on its own.
  useEffect(() => {
    if (canRead && showRecents) recentPeople().then(setRecents);
  }, [canRead, showRecents]);

  function pick(p: Person) {
    setMiss(false);
    setFound(p);
    onPick(p);
  }

  async function lookup(v: string) {
    setQ(v);
    setMiss(false);
    setFound(null);
    onPick(null);
    const h = v.trim().replace(/^@/, "").toLowerCase();
    // A pasted account from another app: pay it directly (no Kin name; the send screen warns to double-check it).
    if (isAddress(h)) return pick({ address: getAddress(h), name: "" });
    if (h.length < 3) return;
    const a = await resolveName(h).catch(() => null);
    if (a) pick({ address: a, name: h });
    else setMiss(true);
  }

  const recents = exclude ? allRecents.filter((p) => !exclude.has(p.name) && !exclude.has(p.address.toLowerCase())) : allRecents;
  const showField = typing || recents.length === 0;

  useEffect(() => {
    if (showField) loadDirectory().then((d) => setTrie(d.trie));
  }, [showField]);
  const prefix = q.trim().replace(/^@/, "").toLowerCase();
  const suggestions = prefix && !found ? (trie?.suggest(prefix, 6) ?? []).filter((n) => n !== profile?.name && n !== prefix && !exclude?.has(n)).slice(0, 5) : [];

  return (
    <View style={{ gap: 12 }}>
      <Label>{label}</Label>
      {recents.length > 0 && (
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16, rowGap: 12 }} accessibilityLabel="Recent people">
          <Pressable onPress={() => setTyping((v) => !v)} accessibilityRole="button" accessibilityState={{ selected: typing }} style={{ width: 60, alignItems: "center", gap: 6 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 1, borderStyle: "dashed", borderColor: typing ? t.brand : t.line, alignItems: "center", justifyContent: "center" }}>
              <Plus color={typing ? t.brand : t.ink} size={24} />
            </View>
            <Text style={{ color: t.muted, fontSize: 12 }}>Add new</Text>
          </Pressable>
          {recents.map((p) => {
            const on = found?.address === p.address;
            return (
              <Pressable key={p.address} onPress={() => (setTyping(false), setQ(""), pick(p))} accessibilityRole="button" accessibilityState={{ selected: on }}
                style={{ width: 60, alignItems: "center", gap: 6 }}>
                <View style={{ borderRadius: 30, padding: 2, borderWidth: 2, borderColor: on ? t.brand : "transparent" }}>
                  <Avatar name={p.name} size={52} />
                </View>
                <Text numberOfLines={1} style={{ color: on ? t.ink : t.muted, fontSize: 12, fontWeight: on ? "600" : "400" }}>@{p.name}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {showField && (
        <View style={{ gap: 6 }}>
          <TextInput style={input} placeholder="@name" placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false} accessibilityLabel="Kin name"
            autoFocus={typing || !showRecents} value={q} onChangeText={lookup} />
          {suggestions.length > 0 && (
            <View accessibilityLabel="Suggestions" style={{ overflow: "hidden", borderRadius: 16, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface }}>
              {suggestions.map((n) => (
                <Pressable key={n} onPress={() => lookup(n)} accessibilityRole="button"
                  style={({ pressed }) => ({ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, backgroundColor: pressed ? t.surface2 : "transparent" })}>
                  <Avatar name={n} size={32} />
                  <Text style={{ color: t.muted, fontWeight: "600" }}>
                    <Text style={{ color: t.ink, fontWeight: "600" }}>@{n.slice(0, prefix.length)}</Text>
                    {n.slice(prefix.length)}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {miss && !suggestions.length && <Text style={{ color: t.muted, fontSize: 12 }}>No one on Kin with that name yet.</Text>}
          {found && !!q && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: `${t.good}1a` }}>
              <Avatar name={found.name} size={28} />
              <Text style={{ flex: 1, color: t.ink, fontWeight: "600" }}>@{found.name}</Text>
              <Check color={t.good} size={20} />
            </View>
          )}
        </View>
      )}
    </View>
  );
}
