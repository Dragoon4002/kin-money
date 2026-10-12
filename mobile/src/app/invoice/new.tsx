import { router, useLocalSearchParams } from "expo-router";
import { Check, ShieldCheck } from "lucide-react-native";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { isAddress, type Address } from "viem";
import { partsTotal, type Invoice, type Part } from "@/components/invoice/meta";
import { fetchInvoice, MarkDone, PartChip, SendSheet } from "@/components/invoice/parts";
import { Loading, Status, Who, WhoAvatar, useAction, useLoad } from "@/components/programs/kit";
import { Amount, Card } from "@/components/trips/bits";
import { Button, ErrorText, Footer, Screen, Serif, Text } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { useAccount } from "@/lib/account";
import { addr } from "@/lib/config";
import { api, recordPayment } from "@/lib/contacts";
import { formatMoney } from "@/lib/money";
import { resolveName } from "@/lib/names";
import { createdId, expiryAfter, nowSec, same, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";
import { useTheme } from "@/theme";

// Port of app/src/app/invoice/new/page.tsx. Pay link: /invoice/new?i=<invoice id> (parts saved server-side).
// Older links still work: /invoice/new?to=<handle>&m=<units,units>&d=<days>&t=<title>

const Broken = () => <Screen title="Invoice" back><ErrorText>This pay link looks broken. Ask for a new one.</ErrorText></Screen>;

export default function PayInvoice() {
  const q = useLocalSearchParams<{ i?: string; to?: string; m?: string; d?: string; t?: string }>();
  const { data: inv, error, reload } = useLoad(() => fetchInvoice(q.i!), q.i || undefined);

  if (q.i) {
    if (inv === undefined) return <Screen title="Invoice" back>{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
    if (!inv) return <Broken />;
    return <Pay to={inv.owner} title={inv.title} days={inv.days} parts={inv.parts} inv={inv} reload={reload} />;
  }
  const parts: Part[] = (q.m ?? "").split(",").slice(0, 3).map((x, i) => ({ name: `Part ${i + 1}`, amount: /^[1-9]\d{0,14}$/.test(x) ? x : "", due: 0, done: false }));
  if (!q.to || parts.some((p) => !p.amount)) return <Broken />;
  return <Pay to={q.to} title={(q.t ?? "").slice(0, 60)} days={Math.min(60, Math.max(1, Number(q.d) || 7))} parts={parts} />;
}

function Pay({ to, title, days, parts, inv, reload }: { to: string; title: string; days: number; parts: Part[]; inv?: Invoice; reload?: () => void }) {
  const t = useTheme();
  // No redirect: a new client must see the invoice first, then join.
  const me = useAccount().profile?.address;
  const total = partsTotal(parts);
  const { data: payee, error: lookupError } = useLoad(async () => (isAddress(to) ? to : await resolveName(to)) ?? ZERO, to);
  const [held, setHeld] = useState<bigint[]>([]);
  const [sending, setSending] = useState(false);
  const { busy, status, error, run } = useAction();
  const self = !!payee && same(payee, me);
  const paidBy = inv?.escrows.length ? (inv.payer as Address) : null;
  const goHeld = paidBy && me && (self || same(paidBy, me)) ? inv!.escrows.join("-") : null;

  useEffect(() => {
    if (goHeld) router.replace({ pathname: "/invoice/[id]", params: { id: goHeld } });
  }, [goHeld]);

  async function pay() {
    if (!me || !payee || payee === ZERO) return;
    const autoAt = nowSec() + days * 86_400;
    const ids = [...held];
    await run(async (say) => {
      for (let i = ids.length; i < parts.length; i++) {
        if (parts.length > 1) say(`Holding part ${i + 1} of ${parts.length}…`);
        const hash = await call(addr.escrow, KinEscrowAbi, "create", [payee, ZERO, me, 0, expiryAfter(autoAt), autoAt], { fund: BigInt(parts[i].amount) });
        ids.push(await createdId(hash, KinEscrowAbi, "Created"));
        setHeld([...ids]);
      }
      void recordPayment(payee, total);
      // Link the held money to the invoice so both phones see part names and "done". Money is already safe if this fails.
      if (inv) await api("/api/invoices", "POST", { action: "held", id: inv.id, escrows: ids.map(String) }).catch(() => {});
      router.replace({ pathname: "/invoice/[id]", params: inv ? { id: ids.join("-") } : { id: ids.join("-"), t: title } });
    });
  }

  if (payee === undefined && !lookupError) return <Screen title="Invoice" back><Loading /></Screen>;
  if (!payee || payee === ZERO) return <Screen title="Invoice" back><ErrorText>No one on Kin with that name yet.</ErrorText></Screen>;
  if (goHeld) return <Screen title="Invoice" back><Loading /></Screen>;
  if (paidBy) return <Screen title="Invoice" back><ErrorText>This invoice is already paid.</ErrorText></Screen>;
  const owner = self && !!inv;

  return (
    <Screen title={owner ? title : "Invoice"} back scroll>
      <Card style={{ alignItems: "center", gap: 8, paddingVertical: 28 }}>
        <WhoAvatar a={payee} size={56} />
        <Text style={{ color: t.muted, fontSize: 14 }}><Who a={payee} me={me} /> {self ? "ask" : "asks"} for</Text>
        <Amount value={formatMoney(total)} size={64} />
        {!!title && <Text style={{ color: t.ink, fontWeight: "600" }}>'{title}'</Text>}
      </Card>
      {(parts.length > 1 || !!inv) &&
        parts.map((p, i) => (
          <View key={i} style={{ gap: 12, borderRadius: 24, borderWidth: 1, borderColor: t.line, backgroundColor: t.surface, paddingHorizontal: 20, paddingVertical: 16 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
              <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 8 }}>
                {i < held.length ? <Check color={t.good} size={16} /> : <Text style={{ color: t.muted }}>{i + 1}</Text>}
                <Text numberOfLines={1} style={{ flex: 1, color: t.ink, fontWeight: "600" }}>{p.name}</Text>
              </View>
              <Serif size={20}>{formatMoney(BigInt(p.amount))}</Serif>
            </View>
            {!!inv && <PartChip p={p} settled={false} iWork={self} />}
            {owner && !p.done && <MarkDone id={inv.id} n={i} onDone={() => reload?.()} />}
          </View>
        ))}
      {owner ? (
        <Text style={{ color: t.muted, fontSize: 14 }}>Send this to your client. Mark each part done as you finish — they&apos;ll get a nudge to pay it.</Text>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <ShieldCheck color={t.muted} size={18} style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, color: t.muted, fontSize: 14 }}>
            Your money is held safely. It reaches them only when you OK the work — or automatically {days} days after you pay if you don&apos;t reply.
          </Text>
        </View>
      )}
      <ErrorText>{self && !inv ? "This is your own invoice — send the link to your client." : error}</ErrorText>
      <Footer>
        <Status>{busy && status}</Status>
        {owner ? (
          <Button title="Send invoice" onPress={() => setSending(true)} />
        ) : me ? (
          <Button title={held.length ? "Hold the rest" : `Pay ${formatMoney(total)}`} onPress={pay} busy={busy} disabled={self} />
        ) : (
          <Button title="Join Kin to pay" onPress={() => router.push("/onboard")} />
        )}
        {owner && <SendSheet inv={inv} open={sending} onClose={() => setSending(false)} />}
      </Footer>
    </Screen>
  );
}
