"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { zeroHash } from "viem";
import { Onboard } from "@/components/core/Onboard";
import { Kinko } from "@/components/kinko/Kinko";
import { Amount, Button, Card, Chip, ErrorText, Screen } from "@/components/ui";
import { KinCircleAbi } from "@/lib/abi";
import { getAccount, useAccount } from "@/lib/account";
import { addr } from "@/lib/chain";
import { claimSeat, parseCircleLink } from "@/lib/circleLinks";
import { addContact, registerMe } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { nameOf } from "@/lib/names";
import { circlePhase, getCircle, same, type Circle } from "@/lib/programs";
import { call } from "@/lib/tx";

// Link key lives in the URL fragment (#id.inviter.key), which browsers never send to a server.
const onHash = (cb: () => void) => (addEventListener("hashchange", cb), () => removeEventListener("hashchange", cb));

const every = (s: number) =>
  s === 7 * 86_400 ? "every week" : s === 30 * 86_400 ? "every month" : s % 86_400 === 0 ? `every ${s / 86_400} days` : `every ${Math.round(s / 60)} min`;

export default function JoinCircleLink() {
  const hash = useSyncExternalStore(onHash, () => location.hash, () => null);
  const link = hash ? parseCircleLink(hash) : null;
  const key = link ? `${link.id}.${link.inviter}` : undefined;
  const { profile, unlocked } = useAccount();
  const me = profile?.address;
  const router = useRouter();
  const [c, setC] = useState<Circle | null>(null);
  const [inviter, setInviter] = useState("");
  const [phase, setPhase] = useState<"view" | "signup" | "claiming" | "joining">("view");
  const [err, setErr] = useState("");
  const autoClaim = useRef(false);

  const load = (id: bigint) => getCircle(id).then(setC, (e) => setErr(humanError(e)));
  useEffect(() => {
    if (!link) return;
    void load(link.id);
    nameOf(link.inviter).then(setInviter, () => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the link
  }, [key]);

  async function take() {
    if (!link) return;
    setErr("");
    setPhase("claiming");
    try {
      const mine = (await getAccount()).address;
      await claimSeat(link.id, link.inviter, link.key, mine);
      void registerMe();
      if (inviter) void addContact({ address: link.inviter, name: inviter }).catch(() => {});
    } catch (e) {
      setErr(humanError(e));
    }
    await load(link.id); // show the real state either way (someone may have taken the last spot)
    setPhase("view");
  }

  async function join(deposit: bigint) {
    if (!c) return;
    setErr("");
    setPhase("joining");
    try {
      await (deposit
        ? call(addr.circle, KinCircleAbi, "join", [c.id], { fund: deposit })
        : call(addr.circle, KinCircleAbi, "join", [c.id, 0n, 0n, 0n, zeroHash, "0x"]));
      router.push(`/circle/${c.id}`);
      return;
    } catch (e) {
      setErr(humanError(e));
    }
    setPhase("view");
  }

  // Just made an account from this link → take the spot straight away.
  useEffect(() => {
    if (autoClaim.current && me && unlocked && phase === "view") {
      autoClaim.current = false;
      void Promise.resolve().then(take);
    }
  });

  if (hash === null) return <Screen title="Kin">{null}</Screen>;

  if (!link) {
    return (
      <Screen title="Kin">
        <Card>This invite link looks incomplete. Ask your friend to share it again.</Card>
        <Link href="/" className="mt-auto grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      </Screen>
    );
  }

  if (phase === "signup") {
    return (
      <Screen title="Join the savings circle">
        <Onboard onDone={() => ((autoClaim.current = true), setPhase("view"))} />
      </Screen>
    );
  }

  const from = inviter ? `@${inviter}` : "A friend";
  const mine = c?.members.find((m) => same(m.address, me));
  const slot = mine ? c!.members.indexOf(mine) : (c?.members.length ?? 0);
  const deposit = mine ? mine.depositFor : c ? BigInt(c.seats - 1 - slot) * c.contribution : 0n;
  const status = c ? circlePhase(c) : null;
  const open = c ? c.seats - c.members.length : 0;
  const canTake = !!c && !mine && status === "gathering" && open > 0;

  let body: ReactNode;
  let action: ReactNode = null;
  if (!c) {
    body = err ? <ErrorText>{err}</ErrorText> : <div className="h-40 w-full animate-pulse rounded-[28px] bg-surface-2" />;
  } else if (!c.seats) {
    body = <p className="text-muted">We couldn&apos;t find this circle.</p>;
  } else {
    const pot = c.contribution * BigInt(c.seats);
    body = (
      <>
        <Kinko size={110} mood={mine?.joined ? "celebrate" : "happy"} />
        <p className="text-lg">{mine ? "You're in the circle" : `${from} invited you to a savings circle`}</p>
        <Amount value={formatMoney(c.contribution)} />
        <p className="text-muted">{every(c.roundLength)} · each round one person takes home {formatMoney(pot)}</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Chip>{c.members.length} of {c.seats} spots filled</Chip>
          {(mine || canTake) && <Chip tone="brand">Your turn: {slot + 1} of {c.seats}</Chip>}
        </div>
      </>
    );
    if (mine?.joined || (mine && status !== "gathering")) {
      action = <Link href={`/circle/${c.id}`} className="grid h-14 place-items-center rounded-full bg-brand font-semibold text-brand-ink">Go to circle</Link>;
    } else if (mine) {
      action = (
        <>
          <Card className="text-sm text-muted">
            {deposit
              ? <>A <b className="text-ink">{formatMoney(deposit)}</b> safety deposit keeps everyone honest. It&apos;s returned at the end — or right away if the circle never starts.</>
              : <>You&apos;re last in line, so there&apos;s no safety deposit for you.</>}
          </Card>
          <Button busy={phase === "joining"} onClick={() => join(deposit)}>
            {deposit ? `Put down ${formatMoney(deposit)} and join` : "Join the circle"}
          </Button>
        </>
      );
    } else if (status === "running" || status === "done") {
      body = <>{body}<p className="text-muted">This circle has already started.</p></>;
    } else if (status === "stalled") {
      body = <>{body}<p className="text-muted">This circle didn&apos;t start in time.</p></>;
    } else if (!open) {
      body = <>{body}<p className="text-muted">This circle is full. Ask {from} to start a new one.</p></>;
    } else if (!profile) {
      action = (
        <>
          <Button onClick={() => setPhase("signup")}>Create free account to join</Button>
          <p className="text-center text-xs text-muted">Takes 20 seconds. Just your name and Face ID.</p>
        </>
      );
    } else {
      action = <Button busy={phase === "claiming"} onClick={take}>Take turn {slot + 1}</Button>;
    }
  }

  return (
    <Screen title="Savings circle">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">{body}</div>
      <div className="flex flex-col gap-3">
        {c && <ErrorText>{err}</ErrorText>}
        {phase === "claiming" && <p className="text-center text-sm text-muted" aria-live="polite">Saving your spot…</p>}
        {phase === "joining" && <p className="text-center text-sm text-muted" aria-live="polite">Joining the circle…</p>}
        {action}
        {c && !action && <Link href={profile ? "/home" : "/"} className="grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>}
      </div>
    </Screen>
  );
}
