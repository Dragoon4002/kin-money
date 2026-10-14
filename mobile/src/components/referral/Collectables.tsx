import { Lock } from "lucide-react-native";
import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Ellipse } from "react-native-svg";
import { Sheet } from "@/components/programs/kit";
import { Kinko, type Mood } from "@/components/Kinko";
import { Button, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { useKinko } from "@/lib/kinko";
import { useAvatarLook } from "@/lib/names";
import { COLLECTABLES, type Collectable, type RefInvites } from "@/lib/referralPerks";
import { fonts, useTheme } from "@/theme";

// Port of app/src/components/referral/Collectables.tsx.

function MyKinko({ size, mood }: { size: number; mood: Mood }) {
  const { look } = useKinko(useAccount().profile?.address);
  return <Kinko look={look} size={size} mood={mood} />;
}
const PersonKinko = ({ name, size }: { name?: string; size: number }) => <Kinko look={useAvatarLook(name)} size={size} mood="calm" />;

/** Two Kinkos leaning in, hands meeting in the middle. */
function Handshake({ friend, size }: { friend?: string; size: number }) {
  return (
    <View style={{ width: size * 1.66, height: size }}>
      <View style={{ position: "absolute", left: 0, top: 0, transformOrigin: "50% 100%", transform: [{ rotate: "6deg" }] }}><MyKinko size={size} mood="calm" /></View>
      <View style={{ position: "absolute", top: 0, left: size * 0.66, transformOrigin: "50% 100%", transform: [{ rotate: "-6deg" }, { scaleX: -1 }] }}>
        <PersonKinko name={friend} size={size} />
      </View>
      <Svg width={size * 0.3} height={size * 0.2} viewBox="0 0 60 40" style={{ position: "absolute", left: size * 0.68, top: size * 0.56 }}>
        <Ellipse cx={24} cy={20} rx={20} ry={13} fill="#f2b830" stroke="#ffffff" strokeWidth={3} />
        <Ellipse cx={36} cy={20} rx={20} ry={13} fill="#22b573" stroke="#ffffff" strokeWidth={3} />
      </Svg>
    </View>
  );
}

/** Me in front and centre, friends lined up behind. */
function Crew({ friends, size }: { friends: string[]; size: number }) {
  const w = size * (1 + friends.length * 0.45), small = size * 0.78;
  return (
    <View style={{ width: w, height: size * 1.1 }}>
      {friends.map((f, i) => (
        <View key={f} style={{ position: "absolute", top: 0, left: ((i + 0.5) / friends.length) * w - small / 2, opacity: 0.95 }}>
          <PersonKinko name={f} size={small} />
        </View>
      ))}
      <View style={{ position: "absolute", bottom: 0, left: w / 2 - size / 2 }}><MyKinko size={size} mood="celebrate" /></View>
    </View>
  );
}

const Scene = ({ c, friends, size }: { c: Collectable; friends: string[]; size: number }) =>
  c.crew === 1 ? <Handshake friend={friends[0]} size={size} /> : <Crew friends={friends} size={size} />;

/** Collectable scenes unlocked by friends who joined and made a payment. Tap one to see it big and share it. */
export function Collectables({ invites, onShare }: { invites: RefInvites; onShare: (text: string) => void }) {
  const t = useTheme();
  const [open, setOpen] = useState<Collectable | null>(null);
  const active = invites.invited.filter((p) => p.active).map((p) => p.name).reverse(); // earliest friends first
  const friendsOf = (c: Collectable) => (c.crew === 1 ? [active[0] ?? invites.invitedBy ?? ""] : active.slice(0, c.crew));
  const have = (c: Collectable) => (c.crew === 1 ? active.length >= 1 || !!invites.invitedBy : active.length >= c.at);

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ paddingHorizontal: 4, color: t.muted, fontSize: 14, fontWeight: "600" }}>Collectables</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {COLLECTABLES.map((c) => {
          const got = have(c);
          return (
            <Pressable key={c.id} disabled={!got} onPress={() => setOpen(c)} accessibilityRole="button" accessibilityState={{ disabled: !got }}
              style={({ pressed }) => ({ flexBasis: "47%", flexGrow: 1, alignItems: "center", gap: 8, borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, padding: 12, transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <View style={{ height: 96, width: "100%", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {got ? <Scene c={c} friends={friendsOf(c)} size={c.crew === 1 ? 56 : 44} /> : <View style={{ opacity: 0.3 }}><Kinko size={64} mood="calm" /></View>}
              </View>
              <Text style={{ color: t.ink, fontSize: 14, fontWeight: "600", textAlign: "center" }}>{got ? c.title : "???"}</Text>
              {got ? (
                <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>Tap to share</Text>
              ) : (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Lock color={t.muted} size={12} />
                  <Text style={{ color: t.muted, fontSize: 12, textAlign: "center" }}>{c.at} friend{c.at > 1 ? "s" : ""} making a payment</Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={{ marginTop: 4, color: t.muted, fontSize: 14, textAlign: "center" }}>🎁 Rewards for your crew are dropping soon.</Text>

      <Sheet open={!!open} onClose={() => setOpen(null)}>
        {open && (
          <>
            <View style={{ alignItems: "center", overflow: "hidden", borderRadius: 28, backgroundColor: "#3b8cf026", paddingVertical: 24 }}>
              <Scene c={open} friends={friendsOf(open)} size={open.crew === 1 ? 130 : 96} />
            </View>
            <Text style={{ color: t.ink, fontFamily: fonts.serif, fontSize: 30, lineHeight: 33, textAlign: "center" }}>{open.title}</Text>
            <Text style={{ color: t.muted, textAlign: "center" }}>{open.sub}</Text>
            <Button title="Share with a friend" onPress={() => onShare(`${open.title}! Our Kinkos on Kin 🎉`)} />
          </>
        )}
      </Sheet>
    </View>
  );
}
