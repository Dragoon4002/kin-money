"use client";
import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Onboard } from "@/components/core/Onboard";
import { Amount, Avatar, Button, Card, Delivered, ErrorText, Screen } from "@/components/ui";
import { getAccount, useAccount } from "@/lib/account";
import { registerMe } from "@/lib/contacts";
import { collectLink, parseLink, readLink, type LinkInfo } from "@/lib/claimLink";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { nameOf } from "@/lib/names";

// The link key lives in the URL fragment (#id.key), which browsers never send to a server.
const onHash = (cb: () => void) => (addEventListener("hashchange", cb), () => removeEventListener("hashchange", cb));

export default function Claim() {
  const hash = useSyncExternalStore(onHash, () => location.hash, () => null);
  const link = hash ? parseLink(hash) : null;
  const id = link?.id.toString();
  const { profile } = useAccount();
  const [info, setInfo] = useState<(LinkInfo & { sender: string }) | null>(null);
  const [phase, setPhase] = useState<"view" | "signup" | "collecting" | "done">("view");
  const [secs, setSecs] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!id) return;
    readLink(BigInt(id))
      .then(async (i) => setInfo({ ...i, sender: await nameOf(i.from).catch(() => "") }))
      .catch((e) => setErr(humanError(e)));
  }, [id]);

  async function collect() {
    if (!link) return;
    setErr("");
    setPhase("collecting");
    try {
      const me = (await getAccount()).address;
      const t0 = performance.now();
      await collectLink(link.id, link.key, me);
      void registerMe();
      setSecs(((performance.now() - t0) / 1000).toFixed(1));
      setPhase("done");
    } catch (e) {
      setErr(humanError(e));
      setPhase("view");
    }
  }

  if (hash === null) return <Screen title="Kin">{null}</Screen>;

  if (!link) {
    return (
      <Screen title="Kin">
        <Card>This link looks incomplete. Ask the sender to share it again.</Card>
        <Link href="/" className="mt-auto grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      </Screen>
    );
  }

  const from = info?.sender ? `@${info.sender}` : "Someone";
  const money = info ? formatMoney(info.amount) : "";

  if (phase === "signup") {
    return (
      <Screen title={`Collect ${money}`}>
        <Onboard onDone={collect} />
      </Screen>
    );
  }

  if (phase === "done") {
    return (
      <Screen>
        <Delivered title={`${money} is yours`} subtitle={`From ${from} · Delivered in ${secs}s ✓✓`}>
          <Link href="/home" className="grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink active:scale-[0.98]">See my balance</Link>
        </Delivered>
      </Screen>
    );
  }

  return (
    <Screen title="Kin">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        {!info ? (
          err ? <ErrorText>{err}</ErrorText> : <div className="h-40 w-full animate-pulse rounded-[28px] bg-surface-2" />
        ) : (
          <>
            <span className="grid size-24 place-items-center rounded-full bg-brand-soft"><Avatar name={info.sender || "?"} size={72} /></span>
            <p className="text-lg">{from} sent you</p>
            <Amount value={money} />
            <p className="text-muted">
              {info.settled ? "This money has already been collected." : "Held safely until you collect it."}
            </p>
          </>
        )}
      </div>
      {info && !info.settled && (
        <div className="flex flex-col gap-3">
          <ErrorText>{err}</ErrorText>
          {phase === "collecting" ? (
            <p className="text-center text-sm text-muted" aria-live="polite">Moving it to your balance…</p>
          ) : null}
          {profile ? (
            <Button busy={phase === "collecting"} onClick={collect}>Collect {money}</Button>
          ) : (
            <>
              <Button onClick={() => setPhase("signup")}>Create free account to collect</Button>
              <p className="text-center text-xs text-muted">Takes 20 seconds. Just your name and Face ID.</p>
            </>
          )}
        </div>
      )}
      {info?.settled && (
        <Link href={profile ? "/home" : "/"} className="grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      )}
    </Screen>
  );
}
