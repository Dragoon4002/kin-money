import { router } from "expo-router";
import { Lock, Sparkles } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { Kinko, type Look } from "@/components/Kinko";
import { Button, Screen, Serif, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { ITEMS, LEVELS, saveLook, useKinko, type Item, type ItemKind } from "@/lib/kinko";
import { useTheme } from "@/theme";

// Native port of app/src/app/kinko/page.tsx.
const TABS = [["skin", "Skins"], ["expression", "Faces"], ["accessory", "Accessories"]] as const;

/** Look with `item` applied (accessories toggle, one per slot). */
function apply(look: Look, item: Item): Look {
  if (item.kind === "skin") return { ...look, skin: item.id };
  if (item.kind === "expression") return { ...look, expression: item.id };
  if (look.accessories.includes(item.id)) return { ...look, accessories: look.accessories.filter((a) => a !== item.id) };
  const sameSlot = ITEMS.filter((i) => i.slot === item.slot).map((i) => i.id);
  return { ...look, accessories: [...look.accessories.filter((a) => !sameSlot.includes(a)), item.id] };
}

const worn = (look: Look, item: Item) =>
  item.kind === "skin" ? look.skin === item.id : item.kind === "expression" ? look.expression === item.id : look.accessories.includes(item.id);

function Ring({ value, size = 64, stroke = 6, color, track }: { value: number; size?: number; stroke?: number; color: string; track: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <Svg width={size} height={size} style={{ position: "absolute" }}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
      <Circle cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
        strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
    </Svg>
  );
}

export default function Closet() {
  const t = useTheme();
  const { profile } = useAccount();
  const k = useKinko(profile?.address);
  const [tab, setTab] = useState<ItemKind>("skin");
  const [draft, setDraft] = useState<Look | null>(null);
  const [picked, setPicked] = useState<Item | null>(null);

  const look = draft ?? k.look;
  const locked = ITEMS.filter((i) => worn(look, i) && !k.unlocked.has(i.id));
  const changed = draft !== null && JSON.stringify(draft) !== JSON.stringify(k.look);
  const next = LEVELS.find(([min]) => min > k.score);

  function pick(item: Item) {
    setPicked(item);
    setDraft(apply(look, item));
  }

  function save() {
    if (!profile) return router.replace("/onboard");
    saveLook(profile.address, look);
    setDraft(null);
    setPicked(null);
  }

  return (
    <Screen title="Kinko" back scroll>
      <View style={{ alignItems: "center", borderRadius: 32, backgroundColor: t.brandSoft, paddingHorizontal: 20, paddingTop: 32, paddingBottom: 24 }}>
        <View style={{ position: "absolute", right: 16, top: 16, width: 64, height: 64, alignItems: "center", justifyContent: "center" }}
          accessibilityLabel={`Kin Score ${k.score}`}>
          <Ring value={k.progress} color={t.brand} track={t.line} />
          <Serif size={24}>{k.score}</Serif>
        </View>
        <Kinko look={look} size={200} />
        <View style={{ marginTop: 12 }}><Serif size={30}>{k.level}</Serif></View>
        <Text style={{ marginTop: 4, color: t.muted, fontSize: 14 }}>
          Kin Score {k.score}{next ? ` · ${next[0] - k.score} to ${next[1]}` : " · Top level"}
        </Text>
      </View>

      <View style={{ flexDirection: "row", gap: 4, padding: 4, borderRadius: 24, backgroundColor: t.surface2 }} accessibilityRole="tablist">
        {TABS.map(([id, label]) => (
          <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: tab === id }}
            style={{ flex: 1, height: 44, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: tab === id ? t.surface : "transparent" }}>
            <Text style={{ color: tab === id ? t.ink : t.muted, fontWeight: "700", fontSize: 14 }}>{label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {ITEMS.filter((i) => i.kind === tab).map((item) => {
          const open = k.unlocked.has(item.id);
          const on = worn(look, item);
          return (
            <Pressable key={item.id} onPress={() => pick(item)} accessibilityRole="button" accessibilityState={{ selected: on }}
              accessibilityLabel={open ? item.label : `${item.label}, locked. ${item.hint}`}
              style={({ pressed }) => ({
                width: "30.5%", aspectRatio: 1, borderRadius: 24, borderWidth: 2, alignItems: "center", justifyContent: "center", gap: 4,
                borderColor: on ? t.ink : "transparent", backgroundColor: on ? t.brandSoft : t.surface2, transform: [{ scale: pressed ? 0.95 : 1 }],
              })}>
              <View style={{ opacity: open ? 1 : 0.4 }}>
                <Kinko size={64} look={item.kind === "accessory" ? { skin: look.skin, expression: "smile", accessories: [item.id] } : apply({ ...look, accessories: [] }, item)} />
              </View>
              <Text style={{ color: t.ink, fontSize: 12, fontWeight: "600" }}>{item.label}</Text>
              {!open && <View style={{ position: "absolute", right: 8, top: 8 }}><Lock color={t.muted} size={16} /></View>}
            </Pressable>
          );
        })}
      </View>

      {picked && !k.unlocked.has(picked.id) && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 16, backgroundColor: t.surface2, paddingHorizontal: 16, paddingVertical: 12 }}>
          <Lock color={t.muted} size={16} />
          <Text style={{ flex: 1, color: t.muted, fontSize: 14 }}>
            <Text style={{ color: t.ink, fontWeight: "600", fontSize: 14 }}>{picked.label}</Text> · {picked.hint}
          </Text>
        </View>
      )}

      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12, borderRadius: 16, backgroundColor: t.surface2, paddingHorizontal: 16, paddingVertical: 12 }}>
        <Sparkles color={t.ink} size={18} style={{ marginTop: 2 }} />
        <Text style={{ flex: 1, color: t.muted, fontSize: 14 }}>
          <Text style={{ color: t.ink, fontWeight: "600", fontSize: 14 }}>Collectible packs, coming soon.</Text> Your Kinko items and Kin Score will turn into packs with rare drops and limited events to collect. Just for fun for now.
        </Text>
      </View>

      <View style={{ marginTop: "auto", paddingTop: 8 }}>
        <Button title={locked.length ? `Unlock ${locked[0].label} to wear` : changed ? "Save" : "Saved"} disabled={!changed || locked.length > 0} onPress={save} />
      </View>
    </Screen>
  );
}
