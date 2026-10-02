"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Onboard } from "@/components/core/Onboard";
import { Kinko } from "@/components/kinko/Kinko";
import { PotFor, WhoAvatar } from "@/components/programs/kit";
import { Button, Card, ErrorText, IconTile, Screen } from "@/components/ui";
import { getAccount, useAccount } from "@/lib/account";
import { registerMe } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { nameOf } from "@/lib/names";
import { inviteKeyOf, joinPot, parsePotLink } from "@/lib/potLinks";
import { getPot, same, type Pot } from "@/lib/programs";
import { privateKeyToAccount } from "viem/accounts";

// The link key lives in the URL fragment (#id.inviter.key), which browsers never send to a server.
const onHash = (cb: () => void) => (addEventListener("hashchange", cb), () => removeEventListener("hashchange", cb));
const MAX = 20;

export default function JoinPot() {
  const hash = useSyncExternalStore(onHash, () => location.hash, () => null);
  const link = hash ? parsePotLink(hash) : null;
  const id = link?.id.toString();
  const { profile, unlocked } = useAccount();
  const me = profile?.address;
  const [info, setInfo] = useState<{ pot: Pot; inviter: string; live: boolean } | null>(null);
  const [phase, setPhase] = useState<"view" | "signup" | "joining" | "joined">("view");
  const [err, setErr] = useState("");
  const tried = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (!link) return;
    Promise.all([getPot(link.id), inviteKeyOf(link.id, link.inviter), nameOf(link.inviter).catch(() => "")])
      .then(([pot, key, inviter]) => setInfo({ pot, inviter, live: same(key, privateKeyToAccount(link.key).address) }))
      .catch((e) => setErr(humanError(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `id` identifies the link
  }, [id]);

  const pot = info?.pot;
  const member = !!pot && pot.members.some((m) => same(m, me));
  const blocked = !pot || !pot.target ? "missing" : pot.closed ? "closed" : !info?.live ? "off" : pot.members.length >= MAX ? "full" : "";

  // Already in → straight to the pot.
  useEffect(() => {
    if (member && phase === "view" && pot) router.replace(`/pot/${pot.id}`);
  }, [member, phase, pot, router]);

  async function join() {
    if (!link) return;
    tried.current = true;
    setErr("");
    setPhase("joining");
    try {
      const mine = (await getAccount()).address;
      const p = await getPot(link.id);
      if (!p.members.some((m) => same(m, mine))) await joinPot(link.id, link.inviter, link.key, mine);
      void registerMe();
      setPhase("joined");
    } catch (e) {
      setErr(humanError(e));
      setPhase("view");
      // The pot may have filled up or the link was turned off a moment ago; show the real state.
      getPot(link.id).then((p) => setInfo((i) => (i ? { ...i, pot: p } : i))).catch(() => {});
    }
  }

  // Signed in and unlocked → join straight away, no extra tap.
  const canJoin = !!info && !blocked && !member && !!me;
  useEffect(() => {
    if (canJoin && unlocked && phase === "view" && !tried.current) {
      tried.current = true;
      void Promise.resolve().then(join);
    }
  });

  if (hash === null) return <Screen title="Kin">{null}</Screen>;

  if (!link) {
    return (
      <Screen title="Kin">
        <Card>This invite link looks incomplete. Ask for it to be shared again.</Card>
        <Link href="/" className="mt-auto grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      </Screen>
    );
  }

  if (phase === "signup") {
    return (
      <Screen title="Join the family pot">
        <Onboard onDone={join} />
      </Screen>
    );
  }

  const from = info?.inviter ? `@${info.inviter}` : "Your family";

  let body: ReactNode;
  if (!info || !pot) {
    body = err ? <ErrorText>{err}</ErrorText> : <div className="h-40 w-full animate-pulse rounded-[28px] bg-surface-2" />;
  } else if (phase === "joined") {
    body = (
      <>
        <div className="animate-bounce"><Kinko size={120} mood="celebrate" /></div>
        <h2 className="font-display text-4xl leading-tight">You&apos;re in! 🎉</h2>
        <p className="text-muted">You can chip in to the pot for <PotFor p={pot} me={me} /> now.</p>
      </>
    );
  } else {
    body = (
      <>
        <span className="grid size-28 place-items-center rounded-full bg-brand-soft"><IconTile name="pot" size={72} tone="brand" /></span>
        <p className="text-lg">{from} invited you to a family pot</p>
        <h2 className="font-display text-3xl leading-snug">For <PotFor p={pot} me={me} /></h2>
        <p className="text-muted">Goal {formatMoney(pot.target)} · it pays out by itself when full{pot.beneficiaries.length > 1 ? `, split between ${pot.beneficiaries.length} people` : ""}.</p>
        <div className="flex flex-wrap justify-center gap-1" aria-label={`${pot.members.length} in the pot`}>
          {pot.members.slice(0, 10).map((m) => <WhoAvatar key={m} a={m} size={40} />)}
        </div>
        <p className="text-sm text-muted">{pot.members.length} {pot.members.length === 1 ? "person" : "people"} chipping in</p>
        {blocked && (
          <p className="text-muted">
            {blocked === "missing" ? "We couldn't find this pot."
              : blocked === "closed" ? "This pot is closed."
              : blocked === "full" ? "This pot is full — it already has 20 people."
              : "This invite link was turned off. Ask for a new one."}
          </p>
        )}
      </>
    );
  }

  return (
    <Screen title="Kin">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">{body}</div>
      <div className="flex flex-col gap-3">
        {info && <ErrorText>{err}</ErrorText>}
        {phase === "joining" && <p className="text-center text-sm text-muted" aria-live="polite">Adding you to the pot…</p>}
        {phase === "joined" && pot && <Button onClick={() => router.push(`/pot/${pot.id}`)}>Go to the pot</Button>}
        {phase !== "joined" && canJoin && <Button busy={phase === "joining"} onClick={join}>Join pot</Button>}
        {phase !== "joined" && info && !blocked && !profile && (
          <>
            <Button onClick={() => setPhase("signup")}>Create free account to join</Button>
            <p className="text-center text-xs text-muted">Takes 20 seconds. Just your name and Face ID.</p>
          </>
        )}
        {info && blocked && (
          <Link href={profile ? "/home" : "/"} className="grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
        )}
      </div>
    </Screen>
  );
}
