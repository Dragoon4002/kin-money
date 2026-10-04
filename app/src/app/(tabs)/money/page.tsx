"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { MeButton } from "@/components/core/NavBar";
import { Amount, Button, Chip, ErrorText, Ico, IconTile, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { getBalance } from "@/lib/activity";
import { publicClient } from "@/lib/chain";
import { useMode } from "@/lib/mode";
import { humanError } from "@/lib/errors";
import { formatMoney, getCurrency } from "@/lib/money";
import { usePrivate } from "@/lib/privacy";
import { isJar, listPots } from "@/lib/programs";
import type { Address } from "viem";

/** "₹120 saved · 2 jars", or null when there are no open jars. */
async function jarLine(me: Address): Promise<string | null> {
  const jars = (await listPots(me)).filter((p) => !p.closed && isJar(p));
  if (!jars.length) return null;
  return `${formatMoney(jars.reduce((a, p) => a + p.balance, 0n))} saved · ${jars.length} ${jars.length === 1 ? "jar" : "jars"}`;
}

export default function Money() {
  const { profile } = useRequireAccount();
  const me = profile?.address;
  const mode = useMode();
  // Tagged with its mode so a practice balance never shows under "Real money" right after switching.
  const [bal, setBal] = useState<{ mode: string; v: bigint } | null>(null);
  const balance = bal?.mode === mode ? bal.v : null;
  const [jars, setJars] = useState<string | null | undefined>(undefined); // undefined = loading
  const [adding, setAdding] = useState<"idle" | "busy" | "done" | "had">("idle");
  const [err, setErr] = useState("");
  const hide = usePrivate();

  useEffect(() => {
    if (!me) return;
    let on = true;
    const tick = () => getBalance(me).then((v) => on && setBal({ mode, v })).catch(() => {});
    tick();
    jarLine(me).then((j) => on && setJars(j), () => on && setJars(null));
    const t = setInterval(tick, 6000);
    return () => {
      on = false;
      clearInterval(t);
    };
  }, [me, mode]);

  async function addMoney() {
    if (!me) return;
    setAdding("busy");
    setErr("");
    try {
      const res = await fetch("/api/faucet", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: me }) });
      if (res.status === 429) throw new Error("network: slow down");
      const body = (await res.json()) as { hash?: `0x${string}`; skipped?: boolean };
      if (!res.ok) throw new Error("network: faucet");
      if (body.skipped) return setAdding("had");
      if (body.hash) await publicClient.waitForTransactionReceipt({ hash: body.hash });
      setBal({ mode, v: await getBalance(me) });
      setAdding("done");
    } catch (e) {
      setErr(humanError(e));
      setAdding("idle");
    }
  }

  return (
    <>
      <Screen>
        <header className="flex h-12 items-center">
          <h1 className="flex-1 text-xl font-bold">Money</h1>
          <MeButton name={profile?.name} />
        </header>

        <section className="relative overflow-hidden rounded-[32px] border border-line bg-surface p-6">
          <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-brand/15 blur-2xl" />
          <div className="relative flex items-center justify-between">
            <p className="text-sm text-muted">Total balance</p>
            <Chip>{mode === "main" ? "Real money" : "Practice money"}</Chip>
          </div>
          <div className="relative mt-3 min-h-16">
            {balance === null ? (
              <div className="h-14 w-52 animate-pulse rounded-2xl bg-surface-2" />
            ) : (
              <Amount value={formatMoney(balance)} size="xl" secret />
            )}
          </div>
          {balance !== null && !hide && getCurrency() !== "USD" && <p className="tabular relative mt-1 text-sm text-muted">{formatMoney(balance, "USD")}</p>}
          {mode === "test" && <div className="relative mt-6">
            <Button onClick={addMoney} busy={adding === "busy"} disabled={adding === "done" || adding === "had"}>
              {adding === "done" ? "Added ✓" : adding === "had" ? "You already have practice money" : "Add practice money"}
            </Button>
            {adding === "busy" && <p className="mt-3 text-center text-sm text-muted">Adding practice money — a few seconds…</p>}
          </div>}
        </section>
        <ErrorText>{err}</ErrorText>

        <Link href="/cashout" className="flex min-h-16 items-center gap-4 rounded-[24px] border border-line bg-surface p-4 transition active:scale-[0.98]">
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Cash out to UPI</span>
            <span className="block text-sm text-muted">Rupees in minutes · fixed price</span>
          </span>
          <Ico name="chevron" className="text-muted" />
        </Link>

        <Link href="/jars" className="flex min-h-20 items-center gap-4 rounded-[24px] border border-line bg-surface p-4 transition active:scale-[0.98]">
          <IconTile name="jars" />
          <span className="min-w-0 flex-1">
            <span className="block font-semibold">Savings jars</span>
            {jars === undefined ? (
              <span className="mt-1 block h-4 w-32 animate-pulse rounded-full bg-surface-2" />
            ) : (
              <span className={`block truncate text-sm ${jars ? "text-ink" : "text-muted"}`}>{jars ?? "Save toward something big"}</span>
            )}
          </span>
          <Ico name="chevron" className="text-muted" />
        </Link>
      </Screen>
    </>
  );
}
