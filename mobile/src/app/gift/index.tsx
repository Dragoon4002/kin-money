import { useState } from "react";
import { Empty, Loading, useLoad, useMe } from "@/components/programs/kit";
import { GiftCard, GiftLinkCard } from "@/components/gift/cards";
import { NewGift } from "@/components/gift/NewGift";
import { Opened } from "@/components/gift/Opened";
import { Band, Button, ErrorText, Footer, Screen } from "@/components/ui";
import { listGiftLinks } from "@/lib/giftLinks";
import { formatMoney } from "@/lib/money";
import { listEscrows, same } from "@/lib/programs";

// Port of app/src/app/gift/page.tsx. "$500 when you graduate": money that opens on a date, optionally once a guardian OKs it.

export default function GiftPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  const [opened, setOpened] = useState<{ amount: bigint } | null>(null);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "gift").then((r) => r.escrows), me);
  const links = useLoad(() => listGiftLinks(me!), me);
  const reloadAll = () => (reload(), links.reload());

  if (creating) return <NewGift me={me} onClose={() => (setCreating(false), reloadAll())} />;
  if (opened) return <Opened amount={opened.amount} money={formatMoney(opened.amount)} subtitle="It's in your balance now." onClose={() => setOpened(null)} />;

  const forMe = data?.filter((e) => same(e.to, me)) ?? [];
  const rest = data?.filter((e) => !same(e.to, me)) ?? [];
  const linksForMe = links.data?.filter((g) => same(g.recipient, me)) ?? [];
  const linksSent = links.data?.filter((g) => !same(g.recipient, me)) ?? [];
  const none = !!data && !!links.data && !data.length && !links.data.length;
  const sent = rest.length + linksSent.length > 0;

  return (
    <Screen title="Gifts" back scroll>
      <ErrorText>{error ?? links.error}</ErrorText>
      {(!data || !links.data) && !error && !links.error && <Loading />}
      {none && <Empty icon="gift" title="No gifts yet" sub="Send money that opens on their birthday, or when they graduate." />}
      {linksForMe.map((g) => <GiftLinkCard key={`l${g.id}`} g={g} me={me} onOpened={() => (setOpened(g), links.reload())} onDone={links.reload} />)}
      {forMe.map((e) => <GiftCard key={String(e.id)} e={e} me={me} onOpened={() => (setOpened(e), reload())} onDone={reload} />)}
      {sent && <Band>Sent or looked after by you</Band>}
      {linksSent.map((g) => <GiftLinkCard key={`l${g.id}`} g={g} me={me} onOpened={links.reload} onDone={links.reload} />)}
      {rest.map((e) => <GiftCard key={String(e.id)} e={e} me={me} onOpened={reload} onDone={reload} />)}
      <Footer>
        <Button title="Send a gift" onPress={() => setCreating(true)} />
      </Footer>
    </Screen>
  );
}
