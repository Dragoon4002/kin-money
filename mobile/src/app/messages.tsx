import { router } from "expo-router";
import { MessageCircle } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Avatar, Button, ErrorText, Screen, Text } from "@/components/ui";
import { unlock, useAccount } from "@/lib/account";
import { humanError } from "@/lib/errors";
import { ago, listThreads, onLive, preview, type Thread } from "@/lib/live";
import { useTheme } from "@/theme";

/** Chats + a Requests folder for people you haven't talked to yet. */
export default function Messages() {
  const t = useTheme();
  const { profile, canRead } = useAccount();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [tab, setTab] = useState<"chats" | "requests">("chats");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!canRead) return;
    const load = () => listThreads().then(setThreads, (e) => setErr(humanError(e)));
    void load();
    return onLive((event) => event === "message" && void load());
  }, [canRead]);

  const chats = threads?.filter((x) => x.status === "ok") ?? [];
  const requests = threads?.filter((x) => x.status !== "ok") ?? [];
  const waiting = requests.filter((x) => x.status === "request").length;
  const shown = tab === "chats" ? chats : requests;
  const tabs = [["chats", "Chats"], ["requests", waiting ? `Requests · ${waiting}` : "Requests"]] as const;

  return (
    <Screen title="Messages" back scroll>
      {!canRead && (
        <View style={{ alignItems: "center", gap: 12, borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 20 }}>
          <Text style={{ color: t.ink, fontWeight: "600" }}>Your messages are private</Text>
          <Button title="Confirm with Face ID" onPress={() => unlock().catch((e) => setErr(humanError(e)))} />
        </View>
      )}

      <View accessibilityRole="tablist" style={{ flexDirection: "row", borderRadius: 24, backgroundColor: t.surface2, padding: 4 }}>
        {tabs.map(([id, label]) => {
          const on = tab === id;
          return (
            <Pressable key={id} onPress={() => setTab(id)} accessibilityRole="tab" accessibilityState={{ selected: on }}
              style={{ flex: 1, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: on ? t.surface : "transparent" }}>
              <Text style={{ color: on ? t.ink : t.muted, fontWeight: "600" }}>{label}</Text>
            </Pressable>
          );
        })}
      </View>

      <ErrorText>{err}</ErrorText>
      {canRead && !threads && !err && <ActivityIndicator color={t.muted} style={{ marginTop: 40 }} />}

      {threads && !shown.length && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
            <MessageCircle color={t.ink} size={28} />
          </View>
          <Text style={{ color: t.ink, fontWeight: "600" }}>{tab === "chats" ? "No chats yet" : "No requests"}</Text>
          <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>
            {tab === "chats" ? "Say hi to someone you send money to." : "Messages from people you don't know yet wait here."}
          </Text>
        </View>
      )}

      <View style={{ marginHorizontal: -12 }}>
        {shown.map((x) => (
          <Pressable key={x.with.address} onPress={() => router.push({ pathname: "/chat", params: { with: x.with.address } })} accessibilityRole="button"
            style={({ pressed }) => ({ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 16, backgroundColor: pressed ? t.surface2 : "transparent" })}>
            <Avatar name={x.with.name} size={48} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text numberOfLines={1} style={{ flexShrink: 1, color: t.ink, fontWeight: x.unread ? "700" : "600" }}>@{x.with.name || "someone"}</Text>
                {x.status === "blocked" && (
                  <Text style={{ color: t.bad, fontSize: 12, fontWeight: "700", backgroundColor: t.surface2, borderRadius: 10, paddingHorizontal: 8, overflow: "hidden" }}>Blocked</Text>
                )}
              </View>
              <Text numberOfLines={1} style={{ color: x.unread ? t.ink : t.muted, fontSize: 14 }}>{preview(x.last, profile?.address)}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 4 }}>
              <Text style={{ color: t.muted, fontSize: 12 }}>{ago(x.last.at)}</Text>
              {x.unread > 0 && (
                <View accessibilityLabel={`${x.unread} new`} style={{ minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 5, alignItems: "center", justifyContent: "center", backgroundColor: t.brand }}>
                  <Text style={{ color: t.brandInk, fontSize: 11, fontWeight: "700" }}>{x.unread}</Text>
                </View>
              )}
            </View>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
