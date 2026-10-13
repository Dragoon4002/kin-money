import { useState } from "react";
import type { Address } from "viem";
import { Empty, Loading, useLoad, useMe } from "@/components/programs/kit";
import { GiftCard, GiftLinkCard } from "@/components/gift/cards";
import { GiftReveal } from "@/components/gift/GiftReveal";
import { NewGift } from "@/components/gift/NewGift";
import { Band, Button, ErrorText, Footer, Screen } from "@/components/ui";
import { KinEscrowAbi } from "@/lib/abi";
import { addr } from "@/lib/config";
import { api } from "@/lib/contacts";
import { listGiftLinks, openGift } from "@/lib/giftLinks";
import { nameOf } from "@/lib/names";
import { listEscrows, same } from "@/lib/programs";
import { call } from "@/lib/tx";

// Port of app/src/app/gift/page.tsx. "$500 when you graduate": money that opens on a date. Send = GiftWrap, open =
// GiftReveal (components/gift). "Someone to OK it" hidden for now (user, Oct 13); guardian gifts made before still
// show and can be OK'd here.

export default function GiftPage() {
  const me = useMe();
  const [creating, setCreating] = useState(false);
  // Ready gift for me → the box arrival (tap → it opens → note unfolds). msg: Kin-name gifts' note from /api/gift-notes.
  const [opening, setOpening] = useState<{ amount: bigint; from: Address; msg: string; open: () => Promise<unknown> } | null>(null);
  const sender = useLoad(() => nameOf(opening!.from).catch(() => ""), opening?.from);
  const { data, error, reload } = useLoad(() => listEscrows(me!, "gift").then((r) => r.escrows), me);
  const links = useLoad(() => listGiftLinks(me!), me);
  const reloadAll = () => (reload(), links.reload());

  if (creating) return <NewGift me={me} onClose={() => (setCreating(false), reloadAll())} />;
  if (opening) {
    return (
      <GiftReveal amount={opening.amount} sender={sender.data ?? ""} msg={opening.msg} signedIn
        onOpen={async (say) => { say("Opening your gift…"); await opening.open(); }}
        onLeave={() => (setOpening(null), reloadAll())} />
    );
  }

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
      {linksForMe.map((g) => <GiftLinkCard key={`l${g.id}`} g={g} me={me} onOpen={() => setOpening({ amount: g.amount, from: g.from, msg: "", open: () => openGift(g.id) })} onDone={links.reload} />)}
      {forMe.map((e) => <GiftCard key={String(e.id)} e={e} me={me} onOpen={async () => {
        const msg = await api<{ body: string | null }>(`/api/gift-notes?id=${e.id}`).then((n) => n.body ?? "", () => "");
        setOpening({ amount: e.amount, from: e.from, msg, open: () => call(addr.escrow, KinEscrowAbi, "release", [e.id]) });
      }} onDone={reload} />)}
      {sent && <Band>Sent or looked after by you</Band>}
      {linksSent.map((g) => <GiftLinkCard key={`l${g.id}`} g={g} me={me} onDone={links.reload} />)}
      {rest.map((e) => <GiftCard key={String(e.id)} e={e} me={me} onDone={reload} />)}
      <Footer>
        <Button title="Send a gift" onPress={() => setCreating(true)} />
      </Footer>
    </Screen>
  );
}
