"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Loading, MoneyInput, Pad, Sheet, Status, jarMeta, useAction, useLoad, useMe } from "@/components/programs/kit";
import { Celebrate } from "@/components/kinko/Celebrate";
import { Amount, Band, Button, Chip, ErrorText, IconTile, Ring, Row, Screen } from "@/components/ui";
import { KinPotAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { savedLook } from "@/lib/kinko";
import { formatMoney, fromLocal } from "@/lib/money";
import { getPot, isJar, potAdds, same, txEvents, ZERO } from "@/lib/programs";
import { call } from "@/lib/tx";

export default function JarDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { data, error, reload } = useLoad(async () => {
    const [pot, adds] = await Promise.all([getPot(BigInt(id)), potAdds(BigInt(id))]);
    return { pot, adds };
  }, id);
  const [amount, setAmount] = useState("");
  const [sheet, setSheet] = useState<"" | "add" | "break">("");
  const [party, setParty] = useState(0n);
  const { busy, status, error: actionError, run } = useAction();

  if (!data) return <Screen title="Savings jar" back="/jars">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { pot, adds } = data;
  if (pot.beneficiary === ZERO || !isJar(pot) || !same(pot.beneficiary, me)) {
    return <Screen title="Savings jar" back="/jars"><ErrorText>We couldn&apos;t find this jar.</ErrorText></Screen>;
  }
  const { name, icon } = jarMeta(pot.id);
  const pct = pot.closed ? 0 : Number(pot.balance) / Number(pot.target);
  const left = pot.target - pot.balance;

  async function add() {
    const value = fromLocal(amount);
    if (!value) return;
    const ok = await run(async (say) => {
      const hash = await call(addr.pot, KinPotAbi, "contribute", [pot.id], { fund: value });
      say("Into the jar…");
      const paid = (await txEvents(hash, KinPotAbi)).find((l) => l.eventName === "PotPaid");
      return { payout: paid ? (paid.args as { amount: bigint }).amount : 0n };
    });
    if (ok) {
      setSheet("");
      setAmount("");
      setParty(ok.payout);
      reload();
    }
  }

  async function breakJar() {
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
        title="You've reached your savings goal!"
        amount={formatMoney(party)}
        subtitle={`Great job sticking with it. Your ${name} money is in your balance.`}
        shareText={`I just saved ${formatMoney(party)} for my ${name} on Kin 🎉`}
        card={{ kind: "goal", amount: party, title: name, look: me && savedLook(me) }}
        onClose={() => setParty(0n)}
      />
    );
  }

  return (
    <Screen title={name} back="/jars" wide>
      <Pad className="flex flex-col items-center gap-4 text-center">
        <Ring value={pct} size={220} stroke={16}>
          <span className="flex flex-col items-center">
            <span className="font-display text-6xl tabular leading-none">{Math.floor(pct * 100)}%</span>
            <span className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted">Saved</span>
          </span>
        </Ring>
        <p>
          <Amount value={formatMoney(pot.balance)} size="md" />
          <span className="font-display text-2xl text-muted"> / {formatMoney(pot.target)}</span>
        </p>
        {pot.closed ? (
          <Chip>This jar is closed</Chip>
        ) : pot.round > 0n ? (
          <Chip tone="good">Goal reached {pot.round > 1n ? `${pot.round}×` : ""} ✓✓ · saving again</Chip>
        ) : (
          <p className="text-sm text-muted">{formatMoney(left)} to go</p>
        )}
      </Pad>

      <section>
        <Band>Added lately</Band>
        {adds.length ? (
          adds.map((a, i) => (
            <Row
              key={i}
              icon={<IconTile name={icon} />}
              title="Added to jar"
              trail={<span className="font-display text-2xl tabular text-good">+{formatMoney(a.amount)}</span>}
            />
          ))
        ) : (
          <Pad className="py-4"><p className="text-sm text-muted">Every bit you add shows up here.</p></Pad>
        )}
      </section>

      <Pad className="mt-auto flex flex-col gap-2 pt-4">
        <ErrorText>{!sheet && actionError}</ErrorText>
        {!pot.closed && <Button onClick={() => { setAmount(""); setSheet("add"); }}>Add money</Button>}
        {!pot.closed && pot.balance > 0n && <Button variant="ghost" onClick={() => setSheet("break")}>Take it out</Button>}
      </Pad>

      <Sheet open={sheet === "add"} onClose={() => !busy && setSheet("")}>
        <h2 className="font-display text-3xl">Add money</h2>
        <MoneyInput label="Amount" value={amount} onChange={setAmount} hint={`${formatMoney(left)} fills the jar.`} />
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy && status}</Status>
        <Button onClick={add} busy={busy} disabled={!Number(amount)}>Add to jar</Button>
      </Sheet>
      <Sheet open={sheet === "break"} onClose={() => !busy && setSheet("")}>
        <h2 className="font-display text-3xl">Take {formatMoney(pot.balance)} out?</h2>
        <p className="text-muted">It goes back to your balance and this jar closes. You can start a new one any time.</p>
        <ErrorText>{actionError}</ErrorText>
        <Status>{busy && status}</Status>
        <Button onClick={breakJar} busy={busy}>Take it out</Button>
        <Button variant="ghost" onClick={() => setSheet("")} disabled={busy}>Keep saving</Button>
      </Sheet>
    </Screen>
  );
}
