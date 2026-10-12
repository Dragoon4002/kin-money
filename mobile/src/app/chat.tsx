import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft, Ellipsis, SendHorizontal } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getAddress, isAddress, type Address } from "viem";
import { Avatar, Button, ErrorText, Serif, Text, TextInput } from "@/components/ui";
import { isUnlocked, unlock, useAccount } from "@/lib/account";
import { getBalance } from "@/lib/activity";
import { recordPayment } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { isActive, isLive, listMessages, listThreads, markThreadRead, onLive, same, sendMessage, setThread, settleRequest, type ChatMessage, type Thread } from "@/lib/live";
import { formatMoney } from "@/lib/money";
import { nameOf, resolveName } from "@/lib/names";
import { sendDollars } from "@/lib/tx";
import { useTheme } from "@/theme";

type Shown = ChatMessage & { pending?: boolean; failed?: boolean };

/** Optimistic bubble shown until the server answers. */
function draft(from: Address, to: Address, body: string, id?: string): Shown {
  const at = Date.now();
  return { id: id ?? `tmp-${at}`, from, to, body, kind: "text", ref: "", at, pending: true };
}

const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

/** Chat with one person: texts, money requests (Pay / Decline) and payments. `?with=` account or @name. */
export default function Chat() {
  const t = useTheme();
  const { profile, canRead } = useAccount();
  const me = profile?.address;
  const raw = useLocalSearchParams<{ with?: string }>().with;
  const who = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const direct = isAddress(who) ? getAddress(who) : null;
  const [found, setFound] = useState<{ address: Address; name: string } | null>(null);
  const [missing, setMissing] = useState(false);
  const [msgs, setMsgs] = useState<Shown[] | null>(null);
  const [status, setStatus] = useState<Thread["status"]>("ok");
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [paying, setPaying] = useState<string | null>(null);
  const [payNote, setPayNote] = useState("");
  const scroll = useRef<ScrollView>(null);

  // Who is this? Account → read their @name; @name → look up their account.
  useEffect(() => {
    const h = who.replace(/^@/, "").toLowerCase();
    if (direct) nameOf(direct).then((name) => setFound({ address: direct, name }), () => {});
    else resolveName(h).then((a) => (a ? setFound({ address: a, name: h }) : setMissing(true)), () => setMissing(true));
  }, [who, direct]);
  const them = found ?? (direct ? { address: direct, name: "" } : null);
  const addr = them?.address;
  const name = them?.name ? `@${them.name}` : "them";
  const blocked = status === "blocked";

  useEffect(() => {
    if (!canRead || !addr) return;
    let live = true;
    const load = () =>
      listMessages(addr).then((m) => {
        if (!live) return;
        setMsgs((prev) => [...m, ...(prev ?? []).filter((x) => x.pending || x.failed)]);
        if (m.some((x) => same(x.to, me) && !x.read)) void markThreadRead(addr);
      }, (e) => live && setErr(humanError(e)));
    void load();
    listThreads().then((ts) => live && setStatus(ts.find((x) => same(x.with.address, addr))?.status ?? "ok"), () => {});
    const off = onLive((event, data) => {
      const m = data as ChatMessage;
      if (event === "message" && (same(m.from, addr) || same(m.to, addr))) void load();
    });
    // Fallback while the realtime connection is down: check every 4s.
    const iv = setInterval(() => !isLive() && isActive() && load(), 4000);
    return () => {
      live = false;
      off();
      clearInterval(iv);
    };
  }, [canRead, addr, me]);

  async function send(body = text.trim(), retryId?: string) {
    if (!addr || !me || !body) return;
    setErr("");
    setText("");
    const tmp = draft(me, addr, body, retryId);
    setMsgs((m) => [...(m ?? []).filter((x) => x.id !== tmp.id), tmp]);
    try {
      const real = await sendMessage(addr, body);
      setMsgs((m) => (m ?? []).filter((x) => x.id !== tmp.id && x.id !== real.id).concat(real).sort((a, b) => a.at - b.at));
      if (status === "request") setStatus("ok"); // replying accepts them
    } catch (e) {
      setMsgs((m) => (m ?? []).map((x) => (x.id === tmp.id ? { ...x, pending: false, failed: true } : x)));
      const s = String(e);
      setErr(s.includes("403") ? "You can't message each other right now." : s.includes("429") ? "Slow down a little. Try again in a minute." : "Message didn't send. Tap it to try again.");
    }
  }

  async function act(action: "block" | "unblock" | "accept") {
    if (!addr) return;
    setErr("");
    const prev = status;
    setStatus(action === "block" ? "blocked" : "ok");
    try {
      await setThread(action, addr);
    } catch (e) {
      setStatus(prev);
      setErr(humanError(e));
    }
  }

  const mark = (id: string, s: "paid" | "declined" | "open") =>
    setMsgs((m) => (m ?? []).map((x) => (x.kind === "request" && x.ref === id && x.req ? { ...x, req: { ...x.req, status: s } } : x)));

  async function pay(m: ChatMessage) {
    if (!m.req || !me) return;
    setErr("");
    setPaying(m.ref);
    setPayNote(isUnlocked() ? "Sending…" : "Confirm with Identity check");
    const slow = setTimeout(() => setPayNote(`Delivering to ${name}…`), 2500);
    try {
      const units = BigInt(m.req.amount);
      if ((await getBalance(me)) < units) throw new Error("insufficient balance");
      const hash = await sendDollars(m.from, units);
      mark(m.ref, "paid");
      void settleRequest(m.ref, "paid", hash).catch(() => {});
      void recordPayment(m.from, units, hash);
    } catch (e) {
      setErr(humanError(e));
    } finally {
      clearTimeout(slow);
      setPaying(null);
    }
  }

  async function decline(m: ChatMessage) {
    setErr("");
    mark(m.ref, "declined");
    try {
      await settleRequest(m.ref, "declined");
    } catch (e) {
      mark(m.ref, "open");
      setErr(humanError(e));
    }
  }


  function menu() {
    Alert.alert(them?.name ? `@${them.name}` : "This person", undefined, [
      { text: "Cancel", style: "cancel" },
      blocked ? { text: `Unblock ${name}`, onPress: () => void act("unblock") } : { text: `Block ${name}`, style: "destructive", onPress: () => void act("block") },
    ]);
  }

  const chip = (label: string, color: string) => (
    <Text style={{ alignSelf: "center", color, fontSize: 13, fontWeight: "700", backgroundColor: t.surface2, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 4, overflow: "hidden" }}>{label}</Text>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }}>
        <View style={{ minHeight: 60, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderColor: t.line }}>
          <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/messages"))} accessibilityLabel="Back" hitSlop={8}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <ChevronLeft color={t.ink} size={26} />
          </Pressable>
          <Avatar name={them?.name} size={36} />
          <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontSize: 18, fontWeight: "700" }}>{them?.name ? `@${them.name}` : ""}</Text>
          {!!addr && (
            <Pressable onPress={() => router.push({ pathname: "/send", params: { to: them?.name || addr } })} accessibilityRole="button"
              style={{ height: 44, borderRadius: 22, paddingHorizontal: 14, justifyContent: "center", backgroundColor: t.brandSoft }}>
              <Text style={{ color: t.brand, fontSize: 14, fontWeight: "700" }}>Send money</Text>
            </Pressable>
          )}
          <Pressable onPress={menu} accessibilityLabel="More" accessibilityRole="button" hitSlop={4}
            style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
            <Ellipsis color={t.ink} size={22} />
          </Pressable>
        </View>

        <ScrollView ref={scroll} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })} keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexGrow: 1, gap: 8, padding: 16 }}>
          {missing && <Text style={{ margin: "auto", color: t.muted, textAlign: "center" }}>No one on Kin with that name yet.</Text>}
          {!canRead && (
            <View style={{ margin: "auto", alignItems: "center", gap: 12, borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 20 }}>
              <Text style={{ color: t.ink, fontWeight: "600" }}>Your messages are private</Text>
              <Button title="Confirm with Identity check" onPress={() => unlock().catch((e) => setErr(humanError(e)))} />
            </View>
          )}
          {canRead && !msgs && !missing && <ActivityIndicator color={t.muted} style={{ margin: "auto" }} />}
          {msgs && !msgs.length && (
            <Text style={{ margin: "auto", maxWidth: 240, color: t.muted, fontSize: 14, textAlign: "center" }}>
              Say hi to {name}. Requests and payments between you show up here too.
            </Text>
          )}
          {msgs?.map((m) => {
            const mine = same(m.from, me);
            if (m.kind === "payment")
              return <View key={m.id} style={{ marginVertical: 4 }}>{chip(`${mine ? "You paid" : `${name} paid you`} ${formatMoney(BigInt(m.ref || "0"))} ✓`, t.good)}</View>;
            if (m.kind === "request" && m.req) {
              const r = m.req;
              const amount = formatMoney(BigInt(r.amount));
              return (
                <View key={m.id} style={{ marginVertical: 4, alignItems: mine ? "flex-end" : "flex-start", gap: 6 }}>
                  <View style={{ maxWidth: "85%", borderRadius: 28, paddingHorizontal: 20, paddingVertical: 16, backgroundColor: mine ? t.brand : t.surface, borderWidth: mine ? 0 : 1, borderColor: t.line,
                    ...(mine ? { borderBottomRightRadius: 10 } : { borderBottomLeftRadius: 10 }) }}>
                    <Serif size={36} color={mine ? t.brandInk : t.ink}>{amount}</Serif>
                    {!!r.note && <Text style={{ marginTop: 8, color: mine ? t.brandInk : t.ink, fontSize: 16 }}>{r.note}</Text>}
                  </View>
                  <Text style={{ color: t.muted, fontSize: 12 }}>{mine ? "You asked" : `${name} asked you`} · {time(m.at)}</Text>
                  {!mine && r.status === "open" && (
                    <View style={{ flexDirection: "row", gap: 8, width: "100%", maxWidth: 320 }}>
                      <View style={{ flex: 1 }}><Button title="Decline" variant="soft" onPress={() => void decline(m)} disabled={!!paying} /></View>
                      <View style={{ flex: 2 }}><Button title={`Pay ${amount}`} onPress={() => void pay(m)} busy={paying === m.ref} disabled={!!paying && paying !== m.ref} /></View>
                    </View>
                  )}
                  {paying === m.ref && <Text accessibilityLiveRegion="polite" style={{ color: t.muted, fontSize: 14 }}>{payNote}</Text>}
                  {r.status !== "open" && chip(r.status === "paid" ? "Paid ✓" : "Declined", r.status === "paid" ? t.good : t.muted)}
                </View>
              );
            }
            if (m.kind === "request") return null; // request vanished
            return (
              <View key={m.id} style={{ alignItems: mine ? "flex-end" : "flex-start" }}>
                <Pressable disabled={!m.failed} onPress={() => void send(m.body, m.id)} accessibilityRole={m.failed ? "button" : undefined}
                  style={{ maxWidth: "80%", borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10, opacity: m.pending ? 0.6 : 1,
                    backgroundColor: mine ? t.brand : t.surface, borderWidth: m.failed ? 2 : mine ? 0 : 1, borderColor: m.failed ? t.bad : t.line,
                    ...(mine ? { borderBottomRightRadius: 8 } : { borderBottomLeftRadius: 8 }) }}>
                  <Text selectable style={{ color: mine ? t.brandInk : t.ink, fontSize: 16 }}>{m.body}</Text>
                </Pressable>
                <Text style={{ paddingHorizontal: 8, color: t.muted, fontSize: 11 }}>{m.failed ? "Not sent · tap to retry" : m.pending ? "Sending…" : time(m.at)}</Text>
              </View>
            );
          })}
        </ScrollView>

        {!!err && <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}><ErrorText>{err}</ErrorText></View>}

        {status === "request" && (
          <View style={{ gap: 8, borderTopWidth: 1, borderColor: t.line, paddingHorizontal: 16, paddingVertical: 12 }}>
            <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>{name} isn&apos;t in your people yet.</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}><Button title="Block" variant="soft" onPress={() => void act("block")} /></View>
              <View style={{ flex: 1 }}><Button title="Accept" onPress={() => void act("accept")} /></View>
            </View>
          </View>
        )}

        {blocked ? (
          <Text style={{ borderTopWidth: 1, borderColor: t.line, padding: 16, color: t.muted, fontSize: 14, textAlign: "center" }}>You blocked {name}. Unblock to chat.</Text>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, borderTopWidth: 1, borderColor: t.line, paddingHorizontal: 12, paddingVertical: 8 }}>
            <TextInput value={text} onChangeText={setText} placeholder={`Message ${name}`} placeholderTextColor={t.muted} multiline maxLength={1000}
              editable={canRead && !!addr} accessibilityLabel="Message"
              style={{ flex: 1, minHeight: 48, maxHeight: 128, borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, color: t.ink, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, fontSize: 16 }} />
            <Pressable onPress={() => void send()} disabled={!text.trim() || !canRead || !addr} accessibilityLabel="Send" accessibilityRole="button"
              style={({ pressed }) => ({ width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: t.brand,
                opacity: !text.trim() || !canRead || !addr ? 0.4 : 1, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
              <SendHorizontal color={t.brandInk} size={22} />
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
