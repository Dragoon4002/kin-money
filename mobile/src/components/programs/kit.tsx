import * as SecureStore from "expo-secure-store";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, Modal, Pressable, Share, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Address } from "viem";
import { Avatar, Band, ErrorText, Field, IconTile, Row, Text, TextInput, useInputStyle } from "@/components/ui";
import { isUnlocked, useAccount } from "@/lib/account";
import { humanError } from "@/lib/errors";
import { ICON, type IconName } from "@/lib/icons";
import { currencySymbol, formatMoney, FX, getCurrency } from "@/lib/money";
import { nameOf } from "@/lib/names";
import { listOldPots, nowSec, OLD_POT, OldPotAbi, same } from "@/lib/programs";
import { call } from "@/lib/tx";
import { fonts, useTheme } from "@/theme";

// Port of app/src/components/programs/kit.tsx — shared bits for programmable-money screens.

/** My address (undefined while signed out). */
export const useMe = (): Address | undefined => useAccount().profile?.address;

/** Load async data keyed by `key`; `reload()` refetches. */
export function useLoad<T>(fn: () => Promise<T>, key: string | undefined) {
  const [state, setState] = useState<{ data?: T; error?: string; key?: string }>({});
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!key) return;
    let live = true;
    fn().then(
      (data) => live && setState({ data, key }),
      (e) => live && setState((s) => ({ ...s, error: humanError(e) })),
    );
    return () => void (live = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures fn's inputs
  }, [key, tick]);
  return { data: state.data, error: state.error, loading: state.data === undefined && !state.error, reload: () => setTick((t) => t + 1) };
}

/** Seconds clock that re-renders every `ms`. */
export function useNow(ms = 1000) {
  const [t, setT] = useState(nowSec);
  useEffect(() => {
    const i = setInterval(() => setT(nowSec()), ms);
    return () => clearInterval(i);
  }, [ms]);
  return t;
}

/** Run a money action with busy state, progress copy and human errors. `say("…")` updates the status line. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  async function run<T>(fn: (say: (s: string) => void) => Promise<T>): Promise<T | undefined> {
    setBusy(true);
    setError("");
    setStatus(isUnlocked() ? "Working on it…" : "Confirm with Face ID…");
    try {
      return await fn(setStatus);
    } catch (e) {
      setError(humanError(e));
    } finally {
      setBusy(false);
      setStatus("");
    }
  }
  return { busy, status, error, run };
}

const names = new Map<string, Promise<string>>();
export function useName(a?: Address) {
  const { data } = useLoad(() => {
    const k = a!.toLowerCase();
    if (!names.has(k)) names.set(k, nameOf(a!).catch(() => ""));
    return names.get(k)!;
  }, a);
  return data;
}

/** "@alice", or "You". Never shows an account number. Render inside <Text>. */
export function Who({ a, me, you = "You" }: { a?: Address; me?: Address; you?: string }) {
  const n = useName(a);
  if (same(a, me)) return <>{you}</>;
  return <>{n ? `@${n}` : "A Kin friend"}</>;
}

export function WhoAvatar({ a, size = 40 }: { a?: Address; size?: number }) {
  const n = useName(a);
  return <Avatar name={n || "?"} size={size} />;
}

/** Who a family pot pays: "everyone" or "@a, @b" (you → `you`). Render inside <Text>. */
export function PotFor({ p, me, you = "you" }: { p: { toAll: boolean; beneficiaries: Address[] }; me?: Address; you?: string }) {
  if (p.toAll) return <>everyone</>;
  return <>{p.beneficiaries.map((b, i) => <Fragment key={b}>{i ? ", " : ""}<Who a={b} me={me} you={you} /></Fragment>)}</>;
}

/** Local money from a float of base units — for live, sub-cent displays. */
export function localParts(units: number, currency = getCurrency()) {
  const local = (units / 1e6) * (FX[currency] ?? 1);
  const cents = Math.floor(local * 100) / 100;
  const main = new Intl.NumberFormat(undefined, { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(cents);
  const tail = String(Math.floor(local * 1e6) % 10_000).padStart(4, "0");
  return { main, tail };
}

/** Local-currency amount field. `value` is what the person typed; convert with `fromLocal(value)`. */
export function MoneyInput({ label, value, onChange, hint }: { label: string; value: string; onChange: (v: string) => void; hint?: string }) {
  const t = useTheme();
  const input = useInputStyle();
  return (
    <Field label={label} hint={hint}>
      <View>
        <Text style={{ position: "absolute", left: 16, top: 0, bottom: 0, textAlignVertical: "center", lineHeight: 64, fontFamily: fonts.serif, fontSize: 30, color: t.muted }}>{currencySymbol()}</Text>
        <TextInput
          style={[input, { height: 64, paddingLeft: 52, fontFamily: fonts.serif, fontSize: 30, fontVariant: ["tabular-nums"] }]}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={t.muted}
          accessibilityLabel={label}
          value={value}
          onChangeText={(v) => onChange(v.replace(/[^\d.]/g, ""))}
        />
      </View>
    </Field>
  );
}

/** Pill choice, full width, 44px targets. */
export function Choice<T extends string | number>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: "row", gap: 8 }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: on }}
            style={({ pressed }) => ({ flex: 1, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.ink : t.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
            <Text style={{ color: on ? t.bg : t.muted, fontSize: 14, fontWeight: "600" }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** "3 days 4 hrs" / "12 min" / "45 sec". */
export function timeLeft(sec: number) {
  if (sec <= 0) return "now";
  const d = Math.floor(sec / 86_400), h = Math.floor((sec % 86_400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return `${d} day${d > 1 ? "s" : ""}${h ? ` ${h} hr${h > 1 ? "s" : ""}` : ""}`;
  if (h) return `${h} hr${h > 1 ? "s" : ""} ${m} min`;
  if (m) return `${m} min ${sec % 60} sec`;
  return `${sec} sec`;
}

export const dateLabel = (t: number) => new Date(t * 1000).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** Bottom sheet for confirmations. */
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const t = useTheme();
  const { bottom } = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.55)" }}>
        <Pressable onPress={() => {}} accessibilityViewIsModal
          style={{ gap: 12, padding: 20, paddingBottom: Math.max(24, bottom + 16), borderTopLeftRadius: 32, borderTopRightRadius: 32, borderTopWidth: 1, borderColor: t.line, backgroundColor: t.surface }}>
          <View style={{ alignSelf: "center", width: 40, height: 6, borderRadius: 3, backgroundColor: t.line, marginBottom: 4 }} />
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export function Status({ children }: { children?: ReactNode }) {
  const t = useTheme();
  if (!children) return null;
  return <Text accessibilityLiveRegion="polite" style={{ textAlign: "center", color: t.muted, fontSize: 14 }}>{children}</Text>;
}

export function Empty({ icon, title, sub }: { icon: IconName; title: string; sub: string }) {
  const t = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 8, paddingVertical: 40 }}>
      <IconTile icon={ICON[icon]} size={64} />
      <Text style={{ color: t.ink, fontSize: 16, fontWeight: "600", textAlign: "center" }}>{title}</Text>
      <Text style={{ color: t.muted, fontSize: 14, textAlign: "center", maxWidth: 256 }}>{sub}</Text>
    </View>
  );
}

export function Loading() {
  const t = useTheme();
  return <ActivityIndicator color={t.brand} size="large" style={{ marginVertical: 40 }} />;
}

/** Native share sheet (web `share`). */
export const share = (text: string, url?: string) => Share.share({ message: url ? `${text} ${url}` : text }).catch(() => null);

/** Small device-only labels for things the contracts don't store (chore titles, jar names). Keys: [A-Za-z0-9._-]. */
export function getMeta<T>(key: string): T | null {
  try {
    return JSON.parse(SecureStore.getItem(key) ?? "null") as T | null;
  } catch {
    return null;
  }
}
export const setMeta = (key: string, v: unknown) => SecureStore.setItem(key, JSON.stringify(v));

// Stored as `{name, emoji}` (same as web); `emoji` holds an ICON key. Unknown values fall back to "jars".
export const jarKey = (id: bigint | string) => `kin.jar.${id}`;
export function jarMeta(id: bigint): { name: string; icon: IconName } {
  const m = getMeta<{ name?: string; emoji?: string }>(jarKey(id));
  return { name: m?.name ?? "Savings jar", icon: m?.emoji && m.emoji in ICON ? (m.emoji as IconName) : "jars" };
}

/** Pots/jars from before the update: still hold money; the receiver can move it to their balance. */
export function OldPots({ me, jars }: { me?: Address; jars: boolean }) {
  const t = useTheme();
  const { data, reload } = useLoad(() => listOldPots(me!), me);
  const { busy, error, run } = useAction();
  const list = data?.filter((p) => p.jar === jars);
  if (!list?.length) return null;
  return (
    <>
      <Band>From before the update</Band>
      {list.map((p) => (
        <Row
          key={String(p.id)}
          icon={<IconTile icon={ICON[jars ? "jars" : "pot"]} />}
          title={`${formatMoney(p.balance)} saved`}
          sub={`Goal ${formatMoney(p.target)}`}
          trail={
            <Pressable disabled={busy} onPress={() => run(() => call(OLD_POT, OldPotAbi, "close", [p.id])).then(reload)} accessibilityRole="button"
              style={{ minHeight: 44, justifyContent: "center", borderRadius: 22, paddingHorizontal: 14, backgroundColor: t.ink, opacity: busy ? 0.5 : 1 }}>
              <Text style={{ color: t.bg, fontSize: 12, fontWeight: "600" }}>Move to balance</Text>
            </Pressable>
          }
        />
      ))}
      <ErrorText>{error}</ErrorText>
    </>
  );
}
