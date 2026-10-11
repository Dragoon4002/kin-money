"use client";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Loading, MoneyInput, Pad, Sheet, Status, Who, WhoAvatar, dateLabel, localParts, useAction, useLoad, useMe } from "@/components/programs/kit";
import { Band, Button, Card, Chip, ErrorText, Ico, Row, Screen } from "@/components/ui";
import { KinEscrowAbi, KinStreamAbi } from "@/lib/abi";
import { addr } from "@/lib/chain";
import { recordPayment } from "@/lib/contacts";
import { formatMoney, fromLocal } from "@/lib/money";
import { accrued, expiryAfter, getStream, listEscrows, nowSec, same, vestedAt, ZERO, type Escrow, type Stream } from "@/lib/programs";
import { call } from "@/lib/tx";

export default function AllowanceDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const { data, error, reload } = useLoad(async () => {
    const s = await getStream(BigInt(id));
    const { escrows, pinged } = await listEscrows(me!, "reserve");
    const reserve = escrows.find((e) => !e.settled && same(e.from, s.payer) && same(e.to, s.payee));
    return { s, reserve, asked: reserve ? (pinged.get(reserve.id) ?? 0) > 0 : false };
  }, me && `${id}:${me}`);

  // Parent's screen notices an emergency ask without a refresh.
  useEffect(() => {
    const i = setInterval(() => document.visibilityState === "visible" && reload(), 8000); // live stream ticks client-side
    return () => clearInterval(i);
  }, [reload]);

  if (!data) return <Screen title="Allowance" back="/allowance">{error ? <ErrorText>{error}</ErrorText> : <Loading />}</Screen>;
  const { s, reserve, asked } = data;
  if (s.payer === ZERO || !(same(s.payer, me) || same(s.payee, me))) return <Screen title="Allowance" back="/allowance"><ErrorText>We couldn&apos;t find this allowance.</ErrorText></Screen>;
  const isPayer = same(s.payer, me);

  const other = isPayer ? s.payee : s.payer;

  return (
    <Screen title="Live allowance" back="/allowance" wide>
      <Ticker s={s} isPayer={isPayer} />
      <section>
        <Band>Details</Band>
        <Row icon={<WhoAvatar a={other} size={40} />} title={<Who a={other} me={me} />} sub={isPayer ? "Gets this allowance" : "Sends you this allowance"} />
        <Row title="Total" trail={<span className="font-display text-2xl tabular">{formatMoney(s.amount)}</span>} />
        <Row title={nowSec() < s.end ? "Grows until" : "Ended"} trail={<span className="text-muted">{dateLabel(s.end)}</span>} />
      </section>
      <Pad className="flex flex-1 flex-col gap-4">
        <Emergency s={s} me={me} reserve={reserve} asked={asked} isPayer={isPayer} onDone={reload} />
        <Actions s={s} isPayer={isPayer} onDone={reload} />
      </Pad>
    </Screen>
  );
}

/** Balance that visibly grows: requestAnimationFrame, text updated in place (no re-render per frame). */
function Ticker({ s, isPayer }: { s: Stream; isPayer: boolean }) {
  const main = useRef<HTMLSpanElement>(null);
  const tail = useRef<HTMLSpanElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let raf = 0;
    const frame = () => {
      const t = Date.now() / 1000;
      const vested = vestedAt(s, t);
      const p = localParts(Math.max(0, vested - Number(s.withdrawn)));
      if (main.current) main.current.textContent = p.main;
      if (tail.current) tail.current.textContent = t < s.end ? p.tail : "";
      if (bar.current) bar.current.style.width = `${(vested / Number(s.amount)) * 100}%`;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [s]);
  const live = nowSec() < s.end;

  return (
    <div className="flex flex-col items-center gap-4 px-5 pb-4 pt-2 text-center">
      <Chip tone={live ? "good" : "muted"}>
        {live && <span className="size-1.5 animate-pulse rounded-full bg-good" />}
        {isPayer ? "Ready for them to collect" : "Ready for you to collect"}
      </Chip>
      <p className="font-display text-7xl tabular leading-none tracking-tight" aria-live="off">
        <span ref={main} />
        <span ref={tail} className="ml-1 align-top font-sans text-base font-medium text-muted" />
      </p>
      <div className="h-1.5 w-full max-w-72 overflow-hidden rounded-full bg-surface-2">
        <div ref={bar} className="h-full rounded-full bg-good" />
      </div>
      <p className="text-sm text-muted">{live ? "Grows every second" : "All paid out"}</p>
    </div>
  );
}

function Actions({ s, isPayer, onDone }: { s: Stream; isPayer: boolean; onDone: () => void }) {
  const { busy, status, error, run } = useAction();
  const [confirm, setConfirm] = useState(false);
  const [done, setDone] = useState("");
  const [split, setSplit] = useState({ keep: 0n, back: 0n });
  const open = s.withdrawn < s.amount;

  async function collect() {
    const amt = accrued(s);
    const ok = await run(async (say) => {
      await call(addr.stream, KinStreamAbi, "withdraw", [s.id]);
      say("Moving it to your balance…");
      return true;
    });
    if (ok) {
      setDone(`${formatMoney(amt)} added to your balance ✓✓`);
      onDone();
    }
  }

  async function stop() {
    const ok = await run(async () => {
      await call(addr.stream, KinStreamAbi, "cancel", [s.id]);
      return true;
    });
    setConfirm(false);
    if (ok) {
      void recordPayment(s.payee, split.keep);
      setDone(`Stopped. ${formatMoney(split.back)} is back in your balance ✓✓`);
      onDone();
    }
  }

  function askStop() {
    const t = nowSec();
    const keep = accrued(s, t);
    const vested = s.withdrawn + keep;
    setSplit({ keep, back: s.amount - vested });
    setConfirm(true);
  }

  return (
    <div className="mt-auto flex flex-col gap-2 pt-4">
      {done && <p className="rounded-2xl bg-good/10 px-4 py-3 text-center text-sm font-medium text-good">{done}</p>}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {!isPayer && open && <Button onClick={collect} busy={busy}>Collect</Button>}
      {isPayer && open && nowSec() < s.end && (
        <Button variant="ghost" onClick={askStop} disabled={busy}>Stop allowance</Button>
      )}
      <Sheet open={confirm} onClose={() => !busy && setConfirm(false)}>
        <h2 className="text-xl font-bold">Stop this allowance?</h2>
        <p className="text-muted">
          They keep {formatMoney(split.keep)} they&apos;ve already got. You get {formatMoney(split.back)} back, right away.
        </p>
        <Status>{busy && status}</Status>
        <Button onClick={stop} busy={busy}>Stop and get {formatMoney(split.back)} back</Button>
        <Button variant="ghost" onClick={() => setConfirm(false)} disabled={busy}>Keep it going</Button>
      </Sheet>
    </div>
  );
}

/** Emergency reserve: parent sets money aside; kid asks; parent sends with one Face ID. */
function Emergency({ s, me, reserve, asked, isPayer, onDone }: { s: Stream; me?: `0x${string}`; reserve?: Escrow; asked: boolean; isPayer: boolean; onDone: () => void }) {
  const { busy, status, error, run } = useAction();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  async function setAside() {
    const value = fromLocal(amount);
    if (!value) return;
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, "create", [s.payee, ZERO, me, 0, expiryAfter(nowSec()), 0], { fund: value });
      say("Setting it aside…");
      return true;
    });
    if (ok) {
      setAmount("");
      onDone();
    }
  }

  async function ask() {
    const ok = await run(async () => {
      await call(addr.escrow, KinEscrowAbi, "ping", [reserve!.id]);
      return true;
    });
    if (ok) {
      setNote("asked");
      onDone();
    }
  }

  async function sendNow() {
    const ok = await run(async (say) => {
      await call(addr.escrow, KinEscrowAbi, "approve", [reserve!.id]);
      say("Sending…");
      return true;
    });
    if (ok) {
      void recordPayment(s.payee, reserve!.amount);
      setNote("sent");
      onDone();
    }
  }

  if (note === "sent") {
    return <p className="rounded-2xl bg-good/10 px-4 py-3 text-center font-medium text-good">Emergency money delivered ✓✓</p>;
  }

  if (isPayer && !reserve) {
    return (
      <Card className="flex flex-col gap-3">
        <div>
          <p className="flex items-center gap-2 font-semibold"><Ico name="emergency" /> Emergency fund</p>
          <p className="text-sm text-muted">
            Put some aside that <Who a={s.payee} me={me} /> can ask for in a pinch. You send it with one Identity check. Unused, it comes back to you in 30 days.
          </p>
        </div>
        <MoneyInput label="Amount" value={amount} onChange={setAmount} />
        <ErrorText>{error}</ErrorText>
        <Status>{busy && status}</Status>
        <Button variant="soft" onClick={setAside} busy={busy} disabled={!Number(amount)}>Set aside</Button>
      </Card>
    );
  }

  if (!reserve) return null;

  if (isPayer) {
    return (
      <Card className={`flex flex-col gap-3 ${asked ? "border-brand bg-brand-soft" : ""}`}>
        {asked ? (
          <>
            <p className="flex items-center gap-2 text-lg font-bold"><Ico name="emergency" /> <span><Who a={s.payee} me={me} /> needs help</span></p>
            <p className="text-sm text-muted">They asked for the emergency fund.</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-2 font-semibold"><Ico name="emergency" /> Emergency fund</p>
            <p className="text-sm text-muted">
              {formatMoney(reserve.amount)} held safely. <Who a={s.payee} me={me} /> can ask for it any time.
            </p>
          </>
        )}
        <ErrorText>{error}</ErrorText>
        <Status>{busy && status}</Status>
        <Button variant={asked ? "primary" : "soft"} onClick={sendNow} busy={busy}>Send {formatMoney(reserve.amount)} now</Button>
      </Card>
    );
  }

  const waiting = asked || note === "asked";
  return (
    <Card className="flex flex-col gap-3">
      <p className="flex items-center gap-2 font-semibold"><Ico name="emergency" /> {formatMoney(reserve.amount)} emergency fund</p>
      {waiting ? (
        <p className="rounded-2xl bg-warn/10 px-4 py-3 text-sm font-medium text-warn">
          <Who a={s.payer} me={me} /> has been asked. It arrives the moment they tap send.
        </p>
      ) : (
        <p className="text-sm text-muted">Only for real emergencies. <Who a={s.payer} me={me} /> gets a nudge and sends it with one tap.</p>
      )}
      <ErrorText>{error}</ErrorText>
      <Status>{busy && status}</Status>
      {!waiting && (
        <Button onClick={ask} busy={busy}>I need it now</Button>
      )}
    </Card>
  );
}
