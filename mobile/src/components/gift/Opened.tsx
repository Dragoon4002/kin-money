import { View } from "react-native";
import { Kinko } from "@/components/Kinko";
import { Amount } from "@/components/trips/bits";
import { Button, Footer, Screen, Serif, Text } from "@/components/ui";
import { useAccount } from "@/lib/account";
import { savedLook } from "@/lib/kinko";
import { shareCard } from "@/lib/shareCard";
import { useTheme } from "@/theme";

// Native stand-in for web Celebrate on a just-opened gift: party Kinko, amount, share card.

export function Opened({ amount, money, subtitle, from, onClose }: { amount: bigint; money: string; subtitle: string; from?: string; onClose: () => void }) {
  const t = useTheme();
  const me = useAccount().profile?.address;
  return (
    <Screen>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Kinko look={savedLook(me)} mood="celebrate" size={140} />
        <Serif size={40}>Your gift is open!</Serif>
        <Amount value={money} />
        <Text style={{ color: t.muted, fontSize: 16, textAlign: "center" }}>{subtitle}</Text>
      </View>
      <Footer>
        <Button title="Share" variant="soft" onPress={() => void shareCard({ kind: "gift", amount, from }, "I just opened a gift on Kin 🎁")} />
        <Button title="Done" onPress={onClose} />
      </Footer>
    </Screen>
  );
}
