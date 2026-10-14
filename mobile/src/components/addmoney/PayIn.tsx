import * as Clipboard from "expo-clipboard";
import { type ReactNode, useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import { PayQr } from "@/app/receive";
import { Serif, Text } from "@/components/ui";
import { SOURCES, chainOf, coinOf, type AddQuote, type AddStatus } from "@/lib/addMoney";
import { API_BASE } from "@/lib/config";
import { ICON } from "@/lib/icons";
import { formatMoney } from "@/lib/money";
import { useTheme } from "@/theme";

// Port of app/src/components/core/PayIn.tsx. Shared by Add money (the person asking) and /add/pay (whoever they
// shared the link with).

export type Live = { status: AddStatus; amountOut: string | null; quote: AddQuote | null; missing?: boolean };

export const isFinal = (s: AddStatus) => s === "SUCCESS" || s === "REFUNDED" || s === "FAILED";
export const about = (s: number) => (s < 90 ? `about ${Math.max(10, Math.round(s / 10) * 10)} seconds` : `about ${Math.round(s / 60)} minutes`);

/** Poll Aurora (via /api/addmoney) every 4 s until the money arrives or comes back. `missing` = Aurora doesn't know it. */
export function useAddStatus(depositAddress: string | null): Live | null {
  const [live, setLive] = useState<Live | null>(null);
  const final = live ? isFinal(live.status) || !!live.missing : false;
  useEffect(() => {
    if (!depositAddress || final) return;
    let on = true;
    const tick = () =>
      fetch(`${API_BASE}/api/addmoney?depositAddress=${encodeURIComponent(depositAddress)}`, { cache: "no-store" })
        .then((r) => (r.status === 404 || r.status === 400 ? { missing: true } : r.json()))
        .then((j) => {
          if (!on) return;
          if (j.missing) return setLive({ status: "FAILED", amountOut: null, quote: null, missing: true });
          if (j.status) setLive({ status: j.status, amountOut: j.amountOut ?? null, quote: j.quote ?? null });
        })
        .catch(() => {});
    tick();
    const t = setInterval(tick, 4000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [depositAddress, final]);
  return live;
}

/** Seconds until the deposit code expires, ticking while `on`. */
export function useSecondsLeft(deadline: string | undefined, on: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return deadline ? Math.max(0, Math.floor((Date.parse(deadline) - now) / 1000)) : 0;
}

/** Time left, readable at any size: "2 days", "5 h 12 min", "4:09". Codes can live up to ~3 days. */
export function timeLeft(s: number): string {
  if (s >= 2 * 86400) return `${Math.floor(s / 86400)} days`;
  if (s >= 3600) return `${Math.floor(s / 3600)} h ${Math.floor((s % 3600) / 60)} min`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Send exactly 0.040347 ETH on Ethereum" + QR + code + copy buttons. */
export function SendThis({ q, left, children }: { q: AddQuote; left: number; children?: ReactNode }) {
  const t = useTheme();
  const src = SOURCES.find((s) => s.id === q.source);
  const coin = src ? coinOf(src) : "";
  const [copied, setCopied] = useState<"" | "code" | "amount">("");
  const copy = (text: string, what: "code" | "amount") => Clipboard.setStringAsync(text).then(() => setCopied(what), () => {});
  const muted = { color: t.muted, fontSize: 14, textAlign: "center" } as const;

  const copyBtn = (what: "code" | "amount", label: string) => {
    const Icon = copied === what ? ICON.check : ICON.copy;
    return (
      <Pressable key={what} onPress={() => copy(what === "code" ? q.depositAddress : q.amountInFormatted, what)} accessibilityRole="button"
        style={({ pressed }) => ({ flex: 1, height: 48, borderRadius: 24, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: t.surface2, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
        <Icon color={t.ink} size={16} />
        <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>{copied === what ? "Copied" : label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={{ alignItems: "center", borderRadius: 32, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 24 }}>
      <Text style={muted}>Send exactly</Text>
      <Pressable onPress={() => copy(q.amountInFormatted, "amount")} accessibilityRole="button" accessibilityHint="Copies the amount"
        style={({ pressed }) => ({ minHeight: 44, justifyContent: "center", borderRadius: 999, paddingHorizontal: 12, backgroundColor: pressed ? t.brandSoft : "transparent" })}>
        <Serif size={36}>{q.amountInFormatted} {coin}</Serif>
      </Pressable>
      {src && <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>on {chainOf(src)}</Text>}
      <Text style={[muted, { marginTop: 4 }]}>Arrives as {formatMoney(BigInt(q.amountOut))} · {about(q.timeEstimate)}</Text>
      <View style={{ marginTop: 20, width: "100%", maxWidth: 256, overflow: "hidden", borderRadius: 24 }}>
        <PayQr text={q.depositAddress} label="QR code to send the money here" />
      </View>
      <Text style={{ marginTop: 16, color: t.muted, fontSize: 12 }}>Send to this code</Text>
      <Text selectable style={{ color: t.ink, fontSize: 14, fontFamily: "monospace", textAlign: "center" }}>{q.depositAddress}</Text>
      <View style={{ marginTop: 12, width: "100%", flexDirection: "row", gap: 8 }}>
        {copyBtn("code", "Copy code")}
        {copyBtn("amount", "Copy amount")}
      </View>
      <Text style={[muted, { marginTop: 16, fontVariant: ["tabular-nums"] }]}>
        Send within {timeLeft(left)} from any app or exchange{src ? ` that holds ${coin} on ${chainOf(src)}` : ""}.
      </Text>
      {children}
    </View>
  );
}
