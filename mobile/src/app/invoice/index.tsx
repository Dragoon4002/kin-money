import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import type { Address } from "viem";
import { Compose } from "@/components/invoice/Compose";
import { Empty, Loading, Who, WhoAvatar, useLoad, useMe } from "@/components/programs/kit";
import { Band, Button, ErrorText, Footer, Row, Screen, Serif, Text } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { listEscrows, same, type Escrow } from "@/lib/programs";
import { useTheme } from "@/theme";

// Port of app/src/app/invoice/page.tsx. Freelancer invoices: compose a pay link; the client holds each part
// safely until they OK the work (or it pays itself after N quiet days).

export default function InvoicePage() {
  const t = useTheme();
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "invoice").then((r) => r.escrows), me);
  // Back from an invoice: parts may have been paid.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- reload is a fresh closure each render
  useFocusEffect(useCallback(() => reload(), []));

  if (creating) return <Compose me={me} onClose={() => setCreating(false)} />;

  // One row per client/freelancer pair.
  const groups = new Map<string, Escrow[]>();
  for (const e of [...(data ?? [])].reverse()) {
    const k = `${e.from}-${e.to}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  }

  return (
    <Screen title="Invoices" back scroll>
      <Text style={{ color: t.muted }}>Get paid for your work. Your client&apos;s money is held safely until they OK each part.</Text>
      <ErrorText>{error}</ErrorText>
      {!data && !error && <Loading />}
      {data && !data.length && <Empty icon="invoice" title="No invoices yet" sub="Send a client a pay link. If they go quiet, you still get paid." />}
      {groups.size > 0 && <Band>Your invoices</Band>}
      {[...groups.values()].map((list) => {
        const e = list[0];
        const iWork = same(e.to, me);
        const other: Address = iWork ? e.from : e.to;
        const left = list.filter((x) => !x.settled).length;
        const total = list.reduce((a, x) => a + x.amount, 0n);
        return (
          <Row
            key={`${e.from}-${e.to}`}
            onPress={() => router.push({ pathname: "/invoice/[id]", params: { id: list.map((x) => x.id).join("-") } })}
            icon={<WhoAvatar a={other} size={44} />}
            title={<>{iWork ? "From" : "To"} <Who a={other} me={me} /></>}
            sub={left ? <Text style={{ color: t.warn }}>{left} part{left > 1 ? "s" : ""} waiting</Text> : <Text style={{ color: t.good }}>All paid ✓✓</Text>}
            trail={<Serif size={24}>{formatMoney(total)}</Serif>}
          />
        );
      })}
      <Footer>
        <Button title="New invoice" onPress={() => setCreating(true)} />
      </Footer>
    </Screen>
  );
}
