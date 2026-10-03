import type { ReactNode } from "react";
import { View } from "react-native";
import { Text } from "@/components/ui";
import { fonts, useTheme } from "@/theme";

// Native web social/bits Bubble + toned Chip, shared by Requests and Request.

/** Money-request chat bubble (mine = brand, right). */
export function Bubble({ mine, amount, note }: { mine?: boolean; amount: string; note?: string }) {
  const t = useTheme();
  const ink = mine ? t.brandInk : t.ink;
  return (
    <View style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
      <View style={{
        maxWidth: "85%", borderRadius: 28, paddingHorizontal: 20, paddingVertical: 16,
        ...(mine ? { borderBottomRightRadius: 8, backgroundColor: t.brand } : { borderBottomLeftRadius: 8, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface }),
      }}>
        <Text style={{ color: ink, fontFamily: fonts.serif, fontSize: 36, lineHeight: 38, fontVariant: ["tabular-nums"] }}>{amount}</Text>
        {!!note && <Text style={{ color: ink, fontSize: 16, marginTop: 8 }}>{note}</Text>}
      </View>
    </View>
  );
}

type Tone = "good" | "bad" | "warn" | "muted";

/** Pill label with a tone (web Chip tone=…). */
export function Pill({ tone = "muted", children }: { tone?: Tone; children: ReactNode }) {
  const t = useTheme();
  const c = tone === "muted" ? t.muted : t[tone];
  return (
    <View style={{ alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: tone === "muted" ? t.surface2 : `${c}26` }}>
      <Text style={{ color: c, fontSize: 12, fontWeight: "600" }}>{children}</Text>
    </View>
  );
}
