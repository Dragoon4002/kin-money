import { router, useLocalSearchParams } from "expo-router";
import { Check, ShieldCheck } from "lucide-react-native";
import { useState } from "react";
import { View } from "react-native";
import { isAddress } from "viem";
import { Loading, Status, Who, WhoAvatar, useAction, useLoad } from "@/components/programs/kit";
import { Amount, Card } from "@/components/trips/bits";
import { Button, ErrorText, Footer, Screen, Serif, Text } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { useAccount } from "@/lib/account";
import { addr } from "@/lib/config";
import { recordPayment } from "@/lib/contacts";
import { formatMoney } from "@/lib/money";
import { resolveName } from "@/lib/names";
import { createdId, expiryAfter, nowSec, same, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/invoice/new/page.tsx. Client side of a pay link: /invoice/new?to=<handle>&m=<units,units>&d=<days>&t=<title>

export default function PayInvoice() {
  const t = useTheme();
  const q = useLocalSearchParams<{ to?: string; m?: string; d?: string; t?: string }>();
  // No redirect: a new client must see the invoice first, then join.
  const me = useAccount().profile?.address;
  const to = q.to ?? "";
  const title = (q.t ?? "").slice(0, 60);
  const days = Math.min(60, Math.max(1, Number(q.d) || 7));
  const parts = (q.m ?? "").split(",").slice(0, 3).map((x) => (/^\d{1,15}$/.test(x) ? BigInt(x) : 0n));
  const valid = parts.length > 0 && parts.every((p) => p > 0n);
  const total = parts.reduce((a, b) => a + b, 0n);

  const { data: payee, error: lookupError } = useLoad(async () => (isAddress(to) ? to : await resolveName(to)) ?? ZERO, to || undefined);
  const [held, setHeld] = useState<bigint[]>([]);
  const { busy, status, error, run } = useAction();

  async function pay() {
    if (!me || !payee || payee === ZERO) return;
    const autoAt = nowSec() + days * 86_400;
    const ids = [...held];
    await run(async (say) => {
      for (let i = ids.length; i < parts.length; i++) {
        if (parts.length > 1) say(`Holding part ${i + 1} of ${parts.length}…`);
        const hash = await call(addr.escrow, KinEscrowAbi, "create", [payee, ZERO, me, 0, expiryAfter(autoAt), autoAt], { fund: parts[i] });
        ids.push(await createdId(hash, KinEscrowAbi, "Created"));
        setHeld([...ids]);
      }
      void recordPayment(payee, total);
      router.replace({ pathname: "/invoice/[id]", params: { id: ids.join("-"), t: title } });
    });
  }

  if (!valid || !to) return <Screen title="Invoice" back><ErrorText>This pay link looks broken. Ask for a new one.</ErrorText></Screen>;
  if (payee === undefined && !lookupError) return <Screen title="Invoice" back><Loading /></Screen>;
  if (!payee || payee === ZERO) return <Screen title="Invoice" back><ErrorText>No one on Kin with that name yet.</ErrorText></Screen>;
  const self = same(payee, me);

  return (
    <Screen title="Invoice" back scroll>
      <Card style={{ alignItems: "center", gap: 8, paddingVertical: 28 }}>
        <WhoAvatar a={payee} size={56} />
        <Text style={{ color: t.muted, fontSize: 14 }}><Who a={payee} me={me} /> asks for</Text>
        <Amount value={formatMoney(total)} size={64} />
        {!!title && <Text style={{ color: t.ink, fontWeight: "600" }}>“{title}”</Text>}
      </Card>
      {parts.length > 1 &&
        parts.map((p, i) => (
          <View key={i} style={{ height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 28, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, paddingHorizontal: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              {i < held.length ? <Check color={t.good} size={16} /> : <Text style={{ color: t.muted }}>{i + 1}</Text>}
              <Text style={{ color: t.ink }}>Part {i + 1}</Text>
            </View>
            <Serif size={20}>{formatMoney(p)}</Serif>
          </View>
        ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <ShieldCheck color={t.muted} size={18} style={{ marginTop: 2 }} />
        <Text style={{ flex: 1, color: t.muted, fontSize: 14 }}>
          Your money is held safely. It reaches them only when you OK the work — or automatically {days} days after you pay if you don&apos;t reply.
        </Text>
      </View>
      <ErrorText>{self ? "This is your own invoice — send the link to your client." : error}</ErrorText>
      <Footer>
        <Status>{busy && status}</Status>
        {me ? (
          <Button title={held.length ? "Hold the rest" : `Pay ${formatMoney(total)}`} onPress={pay} busy={busy} disabled={self} />
        ) : (
          <Button title="Join Kin to pay" onPress={() => router.push("/onboard")} />
        )}
      </Footer>
    </Screen>
  );
}
