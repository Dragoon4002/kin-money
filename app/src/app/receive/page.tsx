"use client";
import Link from "next/link";
import { useState } from "react";
import { PayQr } from "@/components/core/PayQr";
import { share } from "@/components/core/share";
import { Kinko } from "@/components/kinko/Kinko";
import { Button, Card, Field, Screen, inputClass } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { formatMoney, fromLocal } from "@/lib/money";
import { useCurrencySymbol } from "@/lib/useCurrencySymbol";
import { payLink } from "@/lib/payLink";

export default function Receive() {
  const { profile } = useRequireAccount();
  const handle = profile?.name;
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);
  const symbol = useCurrencySymbol();
  const units = /^\d{1,9}(\.\d{0,2})?$/.test(amount) && Number(amount) > 0 ? fromLocal(amount) : 0n;
  // Amount is optional: with it, the payer's screen opens pre-filled with this exact amount.
  const url = handle && typeof location !== "undefined" ? payLink(handle, units) : "";

  async function doShare() {
    if (!url) return;
    const text = units ? `Pay me ${formatMoney(units)} on Kin: @${handle}` : `Pay me on Kin: @${handle}`;
    if ((await share(text, url)) === "copied") setCopied(true);
  }

  return (
    <Screen title="My QR" back="/home">
      {profile && !handle ? (
        <Card className="flex flex-col gap-3 text-center">
          <p>Pick a Kin name first so family can find you.</p>
          <Link href="/" className="font-semibold text-brand">Pick my name</Link>
        </Card>
      ) : (
        <>
          <section className="relative mt-8 flex flex-col items-center rounded-[32px] border border-line bg-surface px-6 pb-6 pt-14 text-center">
            <div className="absolute -top-10"><Kinko size={80} mood="happy" /></div>
            <p className="font-display text-4xl">@{handle}</p>
            <p className="mt-1 text-sm text-muted">{units ? `Scan to pay ${formatMoney(units)}` : "Scan with any phone camera to pay me"}</p>
            <div className="mt-5 w-full max-w-72 overflow-hidden rounded-3xl p-1">
              {url ? <PayQr text={url} label={`QR code to pay @${handle}`} /> : <div className="aspect-square w-full animate-pulse rounded-3xl bg-surface-2" />}
            </div>
          </section>
          <Field label="Ask for an amount (optional)">
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-4 grid place-items-center font-semibold text-muted">{symbol}</span>
              <input className={`${inputClass} pl-10 tabular`} inputMode="decimal" placeholder="0.00" value={amount}
                onChange={(e) => /^\d{0,9}(\.\d{0,2})?$/.test(e.target.value) && (setAmount(e.target.value), setCopied(false))} />
            </div>
          </Field>
          <div className="mt-auto">
            <Button onClick={doShare} disabled={!url}>{copied ? "Link copied ✓" : "Share my pay link"}</Button>
          </div>
        </>
      )}
    </Screen>
  );
}
