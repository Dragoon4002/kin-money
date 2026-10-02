"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Loading, MoneyInput, Pad, PotFor, Sheet, Status, Who, WhoAvatar, useAction, useLoad, useMe } from "@/components/programs/kit";
import { share } from "@/components/core/share";
import { Celebrate } from "@/components/kinko/Celebrate";
import { Amount, Band, Button, Chip, ErrorText, Ico, Ring, Row, Screen } from "@/components/ui";
import { KinPotAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { createPotInvite, disablePotInvite, inviteKeyOf, savedLink } from "@/lib/potLinks";
import { getPot, potPayouts, same, txEvents, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";

export default function PotDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { data, error, reload } = useLoad(async () => {
    const [pot, payouts, myKey] = await Promise.all([getPot(BigInt(id)), potPayouts(BigInt(id)), me ? inviteKeyOf(BigInt(id), me) : ZERO]);
    return { pot, payouts, myKey };
  }, me && id);
  const [amount, setAmount] = useState("");
  const [sheet, setSheet] = useState<"" | "chip" | "close" | "invite">("");
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);
  const [party, setParty] = useState(0n);
  const { busy, status, error: actionError, run } = useAction();

  if (!data) return <Screen title="Family pot" back="/pot">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { pot, payouts, myKey } = data;
  if (!pot.target) return <Screen title="Family pot" back="/pot"><ErrorText>We couldn&apos;t find this pot.</ErrorText></Screen>;
  const iMember = pot.members.some((m) => same(m, me));
  const iGet = pot.beneficiaries.some((b) => same(b, me));
  const split = pot.beneficiaries.length;
  const pct = Number(pot.balance) / Number(pot.target);
  const left = pot.target - pot.balance;

  async function chipIn() {
    const value = fromLocal(amount);
    if (!value) return;
    const ok = await run(async (say) => {
      const hash = await call(addr.pot, KinPotAbi, "contribute", [pot.id], { fund: value });
      say("Adding it to the pot…");
      const paid = (await txEvents(hash, KinPotAbi)).find((l) => l.eventName === "PotPaid");
      const payout = paid ? (paid.args as { amount: bigint }).amount : 0n;
      if (payout && split === 1) void recordPayment(pot.beneficiaries[0], payout);
      return { payout };
    });
    if (ok) {
      setSheet("");
      setAmount("");
      setParty(ok.payout);
      reload();
    }
  }

  async function closePot() {
    const ok = await run(async () => (await call(addr.pot, KinPotAbi, "close", [pot.id]), true));
    if (ok) {
      setSheet("");
      reload();
    }
  }

  async function openInvite() {
    setCopied(false);
    setSheet("invite");
    const saved = savedLink(pot.id, me!, myKey);
    if (saved) return setLink(saved);
    setLink("");
    const url = await run(async (say) => (say("Making your link…"), createPotInvite(pot.id, me!)));
    if (url) {
      setLink(url);
      reload();
    }
  }

  async function turnOff() {
    const ok = await run(async () => (await disablePotInvite(pot.id, me!), true));
    if (ok) {
      setLink("");
      setSheet("");
      reload();
    }
  }

  const inviteText = "Join our family pot on Kin — we chip in together and it pays out by itself. Tap to join:";

  if (party) {
    return (
      <Celebrate
        open
        title="The pot is full!"
        amount={formatMoney(party)}
        subtitle="It's on its way to them. Everyone chipped in."
        shareText="Our family pot just filled up on Kin 🎉"
        onClose={() => setParty(0n)}
      />
    );
  }

  return (
    <Screen title="Family pot" back="/pot" wide>
      <Pad className="flex flex-col items-center gap-4 text-center">
        <span className="flex items-center gap-2 text-sm text-muted">
          {!pot.toAll && <WhoAvatar a={pot.beneficiaries[0]} size={28} />} For <PotFor p={pot} me={me} />
        </span>
        <Ring value={pot.closed ? 0 : pct} size={220} stroke={16}>
          <span className="flex flex-col items-center">
            <span className="font-display text-5xl tabular leading-none">{Math.floor((pot.closed ? 0 : pct) * 100)}%</span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted">Filled</span>
          </span>
        </Ring>
        <p>
          <Amount value={formatMoney(pot.balance)} size="md" />
          <span className="font-display text-2xl text-muted"> / {formatMoney(pot.target)}</span>
        </p>
        {pot.closed ? (
          <Chip>This pot is closed</Chip>
        ) : (
          <p className="text-sm text-muted">
            {formatMoney(left)} to go — then it pays out by itself{split > 1 ? `, split between ${split} people` : ""}.
          </p>
        )}
        {payouts.length > 0 && (
          <Chip tone="good">Paid out {payouts.length}× · {formatMoney(payouts.reduce((a, p) => a + p.amount, 0n))} ✓✓</Chip>
        )}
      </Pad>

      <section>
        <Band>This round</Band>
        {pot.members.map((m) => {
          const put = pot.mine.get(m) ?? 0n;
          return (
            <Row
              key={m}
              icon={<WhoAvatar a={m} size={40} />}
              title={<Who a={m} me={me} />}
              trail={put ? <span className="font-display text-2xl tabular text-good">+{formatMoney(put)}</span> : <Chip>Not yet</Chip>}
            />
          );
        })}
      </section>

      <Pad className="mt-auto flex flex-col gap-2 pt-4">
        <ErrorText>{!sheet && actionError}</ErrorText>
        {!pot.closed && iMember && <Button onClick={() => { setAmount(""); setSheet("chip"); }}>Chip in</Button>}
        {!pot.closed && iMember && pot.members.length < 20 && (
          <Button variant="soft" onClick={openInvite}><Ico name="share" /> Invite family</Button>
        )}
        {!pot.closed && iGet && pot.balance > 0n && (
          <Button variant={iMember ? "ghost" : "primary"} onClick={() => setSheet("close")}>{split > 1 ? "Pay out what's there now" : "Take what's there now"}</Button>
        )}
      </Pad>

      <Sheet open={sheet === "chip"} onClose={() => !busy && setSheet("")}>
        <h2 className="font-display text-3xl">Chip in</h2>
        <MoneyInput label="Amount" value={amount} onChange={setAmount} hint={`${formatMoney(left)} fills the pot.`} />
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy && status}</Status>
        <Button onClick={chipIn} busy={busy} disabled={!Number(amount)}>Add to pot</Button>
      </Sheet>
      <Sheet open={sheet === "invite"} onClose={() => !busy && setSheet("")}>
        <h2 className="font-display text-3xl">Invite family</h2>
        <p className="text-muted">Anyone with your link can join the pot and chip in, up to 20 people. You can turn your link off any time.</p>
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy && status}</Status>
        {link && (
          <>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${inviteText} ${link}`)}`} target="_blank" rel="noreferrer"
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-good font-semibold text-fun-ink active:scale-[0.98]">
              <Ico name="share" /> Send on WhatsApp
            </a>
            <Button variant="soft" onClick={async () => (await share(inviteText, link)) === "copied" && setCopied(true)}>
              {copied ? "Link copied ✓" : "Share another way"}
            </Button>
          </>
        )}
        {(link || myKey !== ZERO) && <Button variant="ghost" onClick={turnOff} busy={busy}>Turn off my link</Button>}
      </Sheet>
      <Sheet open={sheet === "close"} onClose={() => !busy && setSheet("")}>
        <h2 className="font-display text-3xl">{split > 1 ? "Pay out" : "Take"} {formatMoney(pot.balance)} now?</h2>
        <p className="text-muted">
          {split > 1 ? `It's split between ${split} people and the pot closes.` : "The pot closes after this."} Family can start a new one any time.
        </p>
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy && status}</Status>
        <Button onClick={closePot} busy={busy}>{split > 1 ? "Pay out and close" : "Take it and close"}</Button>
      </Sheet>
    </Screen>
  );
}
