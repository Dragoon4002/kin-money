"use client";
import { useState } from "react";
import { AmountInput, useSignedIn } from "@/components/social/bits";
import { Button, Card, Chip, Screen } from "@/components/ui";
import { formatMoney } from "@/lib/money";

// #8 Cash-out preview. ponytail: no bank partner yet — nothing moves; wire a real offramp here later.
const BANKS = ["HDFC Bank", "State Bank of India", "BDO Unibank", "BBVA México", "Access Bank", "Emirates NBD"];

export default function CashOut() {
  useSignedIn();
  const [bank, setBank] = useState("");
  const [amount, setAmount] = useState("");
  const [tried, setTried] = useState(false);

  return (
    <Screen title="Cash out to bank" back="/money">
      <Card className="flex items-center gap-3">
        <Chip tone="warn">Coming soon</Chip>
        <p className="text-sm text-muted">Cash out is coming soon. Nothing moves yet.</p>
      </Card>

      <AmountInput label="How much?" value={amount} onChange={setAmount} />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted">To which bank?</legend>
        {BANKS.map((b) => (
          <label key={b} className={`flex min-h-14 items-center gap-3 rounded-[20px] border px-4 ${bank === b ? "border-brand bg-brand-soft" : "border-line bg-surface"}`}>
            <input type="radio" name="bank" className="size-5 accent-brand" checked={bank === b} onChange={() => (setBank(b), setTried(false))} />
            <span className="flex-1 font-medium">{b}</span>
          </label>
        ))}
      </fieldset>

      <p className="text-center text-sm text-muted">Arrives in 1–2 days · fee {formatMoney(0n)}</p>

      <div className="mt-auto flex flex-col gap-3 pt-2">
        {tried && (
          <p aria-live="polite" className="text-center text-sm font-medium">
            {"We'll let you know when cash out is ready. Your money stays in your balance."}
          </p>
        )}
        <Button onClick={() => setTried(true)} disabled={!bank || !(Number(amount) > 0) || tried}>
          {tried ? "Coming soon" : "Cash out"}
        </Button>
      </div>
    </Screen>
  );
}
