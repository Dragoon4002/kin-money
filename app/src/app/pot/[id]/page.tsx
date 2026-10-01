"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Loading, MoneyInput, Pad, Sheet, Status, Who, WhoAvatar, useAction, useLoad, useMe } from "@/components/programs/kit";
import { Celebrate } from "@/components/kinko/Celebrate";
import { Amount, Band, Button, Chip, ErrorText, Ring, Row, Screen } from "@/components/ui";
import { KinPotAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { getPot, potPayouts, same, txEvents, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";

export default function PotDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { data, error, reload } = useLoad(async () => {
    const [pot, payouts] = await Promise.all([getPot(BigInt(id)), potPayouts(BigInt(id))]);
    return { pot, payouts };
  }, id);
  const [amount, setAmount] = useState("");
  const [sheet, setSheet] = useState<"" | "chip" | "close">("");
  const [party, setParty] = useState(0n);
  const { busy, status, error: actionError, run } = useAction();

  if (!data) return <Screen title="Family pot" back="/pot">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { pot, payouts } = data;
  if (pot.beneficiary === ZERO) return <Screen title="Family pot" back="/pot"><ErrorText>We couldn&apos;t find this pot.</ErrorText></Screen>;
  const iMember = pot.members.some((m) => same(m, me));
  const iGet = same(pot.beneficiary, me);
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
      if (payout) void recordPayment(pot.beneficiary, payout);
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
          <WhoAvatar a={pot.beneficiary} size={28} /> For <Who a={pot.beneficiary} me={me} you="you" />
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
          <p className="text-sm text-muted">{formatMoney(left)} to go — then it pays out by itself.</p>
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
        {!pot.closed && iGet && pot.balance > 0n && (
          <Button variant={iMember ? "ghost" : "primary"} onClick={() => setSheet("close")}>Take what&apos;s there now</Button>
        )}
      </Pad>

      <Sheet open={sheet === "chip"} onClose={() => !busy && setSheet("")}>
        <h2 className="font-display text-3xl">Chip in</h2>
        <MoneyInput label="Amount" value={amount} onChange={setAmount} hint={`${formatMoney(left)} fills the pot.`} />
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy && status}</Status>
        <Button onClick={chipIn} busy={busy} disabled={!Number(amount)}>Add to pot</Button>
      </Sheet>
      <Sheet open={sheet === "close"} onClose={() => !busy && setSheet("")}>
        <h2 className="font-display text-3xl">Take {formatMoney(pot.balance)} now?</h2>
        <p className="text-muted">The pot closes after this. Family can start a new one any time.</p>
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy && status}</Status>
        <Button onClick={closePot} busy={busy}>Take it and close</Button>
      </Sheet>
    </Screen>
  );
}
