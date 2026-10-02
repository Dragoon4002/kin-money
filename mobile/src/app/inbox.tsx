import { Bell } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Button, ErrorText, Screen, Text } from "@/components/ui";
import { unlock, useAccount } from "@/lib/account";
import { humanError } from "@/lib/errors";
import { ago, listInbox, markInboxRead, onLive, type Notice } from "@/lib/live";
import { openPath } from "@/lib/push";
import { useTheme } from "@/theme";

/** Notification center: everything Kin told you, newest first. */
export default function Inbox() {
  const t = useTheme();
  const { canRead } = useAccount();
  const [items, setItems] = useState<Notice[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!canRead) return;
    const load = () => listInbox().then((r) => setItems(r.items), (e) => setErr(humanError(e)));
    void load();
    return onLive((event) => event === "notification" && void load());
  }, [canRead]);

  function open(n: Notice) {
    if (!n.read) {
      setItems((xs) => xs && xs.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      void markInboxRead([n.id]);
    }
    openPath(n.url || "/home");
  }

  function readAll() {
    setItems((xs) => xs && xs.map((n) => ({ ...n, read: true })));
    void markInboxRead();
  }

  const unread = items?.filter((n) => !n.read).length ?? 0;

  return (
    <Screen title="Notifications" back scroll>
      {unread > 0 && (
        <Pressable onPress={readAll} accessibilityRole="button" hitSlop={8} style={{ alignSelf: "flex-end", minHeight: 44, justifyContent: "center", marginTop: -8 }}>
          <Text style={{ color: t.brand, fontSize: 14, fontWeight: "700" }}>Mark all read</Text>
        </Pressable>
      )}
      {!canRead && (
        <View style={{ alignItems: "center", gap: 12, borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 20 }}>
          <Text style={{ color: t.ink, fontWeight: "600" }}>Your notifications are private</Text>
          <Button title="Confirm with Face ID" onPress={() => unlock().catch((e) => setErr(humanError(e)))} />
        </View>
      )}
      <ErrorText>{err}</ErrorText>
      {canRead && !items && !err && <ActivityIndicator color={t.muted} style={{ marginTop: 40 }} />}

      {items && !items.length && (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 8 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: t.surface2, alignItems: "center", justifyContent: "center" }}>
            <Bell color={t.ink} size={28} />
          </View>
          <Text style={{ color: t.ink, fontWeight: "600" }}>All quiet</Text>
          <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>Payments, requests and invites show up here.</Text>
        </View>
      )}

      {!!items?.length && (
        <View style={{ marginHorizontal: -12 }}>
          {items.map((n) => (
            <Pressable key={n.id} onPress={() => open(n)} accessibilityRole="button" accessibilityLabel={`${n.read ? "" : "New. "}${n.title}. ${n.body}`}
              style={({ pressed }) => ({ minHeight: 64, flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 16, backgroundColor: pressed ? t.surface2 : "transparent" })}>
              <View style={{ marginTop: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: n.read ? "transparent" : t.brand }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: n.read ? t.muted : t.ink, fontWeight: n.read ? "500" : "600" }}>{n.title}</Text>
                {!!n.body && <Text style={{ color: t.muted, fontSize: 14 }}>{n.body}</Text>}
              </View>
              <Text style={{ color: t.muted, fontSize: 12, paddingTop: 2 }}>{ago(n.at)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Screen>
  );
}
