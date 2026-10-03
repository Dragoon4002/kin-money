import * as Clipboard from "expo-clipboard";
import * as SecureStore from "expo-secure-store";
import { Check, Copy } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { share } from "@/components/programs/kit";
import { Kinko } from "@/components/Kinko";
import { Avatar, Button, Footer, Screen, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { ago } from "@/lib/activity";
import { API_BASE } from "@/lib/config";
import { listInvites, type Invites } from "@/lib/contacts";
import { useKinko } from "@/lib/kinko";
import { fonts, useTheme } from "@/theme";

// Port of app/src/app/invite/page.tsx.

/** Counts toward the "invite" Kinko achievement (lib/kinko reads `kin.invited`). */
function noteInvite() {
  try {
    SecureStore.setItem("kin.invited", String(Number(SecureStore.getItem("kin.invited") ?? 0) + 1));
  } catch {}
}

export default function Invite() {
  const t = useTheme();
  const { profile, canRead } = useAccount();
  const { look } = useKinko(profile?.address);
  const [copied, setCopied] = useState(false);
  const [invites, setInvites] = useState<Invites | null>(null);

  useEffect(() => {
    if (canRead) listInvites().then(setInvites, () => {});
  }, [canRead]);

  const handle = profile?.name;
  const link = handle ? `${API_BASE}/?ref=${encodeURIComponent(handle)}` : "";
  const text = `Join me on Kin, money for family and friends. We both get a party hat for our Kinko 🎉 ${link}`;

  function copy() {
    void Clipboard.setStringAsync(link).then(() => (noteInvite(), setCopied(true), setTimeout(() => setCopied(false), 2000)));
  }

  return (
    <Screen title="Invite & earn" back scroll>
      <View style={{ alignItems: "center", borderRadius: 32, paddingHorizontal: 20, paddingVertical: 32, backgroundColor: "#3b8cf026" }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
          <Kinko look={{ ...look, accessories: ["party"] }} mood="celebrate" size={140} />
          <View style={{ marginLeft: -24 }}>
            <Kinko look={{ skin: "mint", expression: "grin", accessories: ["party"] }} size={110} />
          </View>
        </View>
        <Text style={{ marginTop: 16, color: t.ink, fontFamily: fonts.serif, fontSize: 36, lineHeight: 40, textAlign: "center" }}>You both get a party hat</Text>
        <Text style={{ marginTop: 8, maxWidth: 288, color: t.muted, textAlign: "center" }}>Share your link with a friend.{"\n"}You both unlock a party hat for Kinko.</Text>
      </View>

      {invites?.invitedBy && (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Avatar name={invites.invitedBy} size={24} />
          <Text style={{ color: t.muted, fontSize: 14 }}>You joined with @{invites.invitedBy}&apos;s invite</Text>
        </View>
      )}

      {profile && !handle && <Text style={{ color: t.muted, fontSize: 14, textAlign: "center" }}>Pick your @name first to get your link.</Text>}

      {!!link && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, paddingHorizontal: 20, paddingVertical: 12 }}>
          <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, color: t.muted, fontSize: 14 }}>{link.replace(/^https?:\/\//, "")}</Text>
          <Pressable onPress={copy} accessibilityRole="button"
            style={({ pressed }) => ({ height: 44, flexDirection: "row", alignItems: "center", gap: 6, borderRadius: 22, paddingHorizontal: 16, backgroundColor: t.surface2, transform: [{ scale: pressed ? 0.95 : 1 }] })}>
            {copied ? <Check color={t.ink} size={16} /> : <Copy color={t.ink} size={16} />}
            <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600" }}>{copied ? "Copied" : "Copy"}</Text>
          </Pressable>
        </View>
      )}

      {invites && (
        <View style={{ gap: 8 }}>
          <Text style={{ paddingHorizontal: 4, color: t.muted, fontSize: 14, fontWeight: "600" }}>People who joined with your link</Text>
          <View style={{ overflow: "hidden", borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface }}>
            {invites.invited.length ? (
              invites.invited.map((p) => (
                <View key={p.name} style={{ minHeight: 64, flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 20, paddingVertical: 12 }}>
                  <Avatar name={p.name} />
                  <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontWeight: "600" }}>@{p.name}</Text>
                  <Text style={{ color: t.muted, fontSize: 14 }}>{ago(p.at)}</Text>
                </View>
              ))
            ) : (
              <Text style={{ paddingHorizontal: 20, paddingVertical: 16, color: t.muted, fontSize: 14 }}>No one yet. Friends who join with your link show up here.</Text>
            )}
          </View>
        </View>
      )}

      <Footer>
        <Pressable disabled={!link} accessibilityRole="button" accessibilityState={{ disabled: !link }}
          onPress={() => (noteInvite(), void Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`).catch(() => share(text)))}
          style={({ pressed }) => ({ height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "#22b573", opacity: link ? 1 : 0.4, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
          <Text style={{ color: "#1b1815", fontSize: 16, fontWeight: "700" }}>Invite on WhatsApp</Text>
        </Pressable>
        <Button title="More ways to share" variant="ghost" disabled={!link} onPress={() => (noteInvite(), void share(text))} />
      </Footer>
    </Screen>
  );
}
