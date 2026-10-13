"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isAddress } from "viem";
import { SendThis, timeLeft, useAddStatus, useSecondsLeft } from "@/components/core/PayIn";
import { Card, Delivered, Screen } from "@/components/ui";
import { formatMoney } from "@/lib/money";
import { nameOf } from "@/lib/names";

// Public pay page for a shared Add money request: /add/pay?d=<deposit code>. No sign-in. Everything shown (amount,
// coin, who it's for) comes from Aurora's record for that code, never from the link, so a made-up link shows nothing.

const never = () => () => {};

export default function PayRequest() {
  const d = useSyncExternalStore(never, () => new URLSearchParams(location.search).get("d"), () => undefined); // undefined = server render
  const live = useAddStatus(d ?? null);
  const q = live?.quote?.source ? live.quote : null;
  const status = live?.status;
  const waiting = status === "PENDING_DEPOSIT";
  const left = useSecondsLeft(q?.deadline, waiting);
  const [name, setName] = useState("");

  useEffect(() => {
    if (q?.recipient && isAddress(q.recipient)) nameOf(q.recipient).then(setName, () => {});
  }, [q?.recipient]);

  const who = name ? `@${name}` : "your friend";
  const Who = name ? who : "Your friend"; // sentence start
  const asked = q ? formatMoney(BigInt(q.amountOut)) : "";

  let body;
  if (d === undefined) body = null;
  else if (!d || live?.missing || (live && !q)) body = <Note title="This link isn't valid" text="Ask for a new payment link." />;
  else if (!live) body = <p className="text-center text-muted">Getting the details…</p>;
  else if (status === "SUCCESS")
    body = <Delivered title="Paid" subtitle={`${Who} got ${formatMoney(BigInt(live.amountOut ?? q!.amountOut))}. Thank you!`} />;
  else if (status === "REFUNDED" || status === "FAILED")
    body = <Note title="This one didn't go through" text={`If you sent money, it's held safely for ${who}. Ask ${who} to get it back to you.`} />;
  else if (waiting && left === 0) body = <Note title="This link expired" text={`Don't send to it. Ask ${who} for a new one.`} />;
  else if (status === "INCOMPLETE_DEPOSIT")
    body = <Note title="Amount didn't match" text={`Send the rest within ${timeLeft(left)}, or the money is held for ${who} to get back to you.`} />;
  else if (!waiting) body = <Note title="Received — on its way" text={`${Who} gets ${asked} in a moment. You can close this page.`} />;
  else
    body = (
      <>
        <p className="text-center text-lg">
          <span className="font-semibold">{Who}</span> asked you for <span className="tabular font-semibold">{asked}</span>
        </p>
        <SendThis q={q!} left={left}>
          <p className="mt-2 text-xs text-muted">If something goes wrong, the money is held safely for {who}, who can send it back.</p>
        </SendThis>
      </>
    );

  return <Screen title="Payment request">{body}</Screen>;
}

function Note({ title, text }: { title: string; text: string }) {
  return (
    <Card className="flex flex-col gap-2 text-center" aria-live="polite">
      <p className="font-display text-2xl">{title}</p>
      <p className="text-sm text-muted">{text}</p>
    </Card>
  );
}
