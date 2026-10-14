import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";
import type { Address } from "viem";
import { Sheet } from "@/components/programs/kit";
import { Avatar, Button, Text, TextInput, useInputStyle } from "@/components/ui";
import { addContact, listContacts, listInvites } from "@/lib/contacts";
import { resolveName } from "@/lib/names";
import { fonts, useTheme } from "@/theme";

// Port of app/src/components/referral/RefPrompt.tsx.
let skipped = false; // ponytail: "Skip for now" lasts this app run (web: sessionStorage)

/** "You joined with @a. Save as a friend?" Shows until saved with a name; "Skip for now" hides it for this run. */
export function RefPrompt({ enabled }: { enabled: boolean }) {
  const t = useTheme();
  const input = useInputStyle();
  const [who, setWho] = useState<{ name: string; address: Address } | null>(null);
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!enabled || skipped) return;
    let live = true;
    (async () => {
      const { invitedBy } = await listInvites();
      if (!invitedBy) return;
      const [address, book] = await Promise.all([resolveName(invitedBy), listContacts()]);
      if (!address || book.contacts.some((c) => c.address.toLowerCase() === address.toLowerCase() && c.label)) return;
      if (live) setWho({ name: invitedBy, address });
    })().catch(() => {});
    return () => {
      live = false;
    };
  }, [enabled]);

  const skip = () => ((skipped = true), setWho(null));
  async function save() {
    if (!who) return;
    setBusy(true);
    await addContact({ address: who.address, name: who.name }, label.trim() || who.name).catch(() => {});
    setWho(null);
    setBusy(false);
  }

  return (
    <Sheet open={!!who} onClose={skip}>
      {who && (
        <>
          <View style={{ alignItems: "center", gap: 8 }}>
            <Avatar name={who.name} size={64} />
            <Text style={{ color: t.ink, fontFamily: fonts.serif, fontSize: 30, lineHeight: 33, textAlign: "center" }}>You joined with @{who.name}</Text>
            <Text style={{ color: t.muted, textAlign: "center" }}>Save them as a friend so they&apos;re easy to find.</Text>
          </View>
          <TextInput style={input} placeholder={`Name (e.g. ${who.name})`} placeholderTextColor={t.muted} value={label} maxLength={30} onChangeText={setLabel} />
          <Button title="Save friend" busy={busy} onPress={save} />
          <Pressable onPress={skip} accessibilityRole="button" style={{ height: 44, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: t.muted, fontSize: 14, fontWeight: "600" }}>Skip for now</Text>
          </Pressable>
        </>
      )}
    </Sheet>
  );
}
