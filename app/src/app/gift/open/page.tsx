"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Onboard } from "@/components/core/Onboard";
import { Celebrate } from "@/components/kinko/Celebrate";
import { Kinko } from "@/components/kinko/Kinko";
import { dateLabel, timeLeft, useNow } from "@/components/programs/kit";
import { Amount, Button, Card, Chip, Countdown, ErrorText, IconTile, Screen } from "@/components/ui";
import { getAccount, useAccount } from "@/lib/account";
import { addContact, registerMe } from "@/lib/contacts";
import { bindGift, isBound, openGift, parseGiftLink, readGiftLink, type GiftLink } from "@/lib/giftLinks";
import { humanError } from "@/lib/errors";
import { formatMoney } from "@/lib/money";
import { nameOf } from "@/lib/names";
import { same } from "@/lib/programs";

// The link key lives in the URL fragment (#id.key&m=…), which browsers never send to a server.
const onHash = (cb: () => void) => (addEventListener("hashchange", cb), () => removeEventListener("hashchange", cb));

export default function OpenGiftLink() {
  const hash = useSyncExternalStore(onHash, () => location.hash, () => null);
  const link = hash ? parseGiftLink(hash) : null;
  const id = link?.id.toString();
  const { profile, unlocked } = useAccount();
  const me = profile?.address;
  const now = useNow();
  const [info, setInfo] = useState<(GiftLink & { sender: string }) | null>(null);
  const [phase, setPhase] = useState<"view" | "signup" | "binding" | "opening" | "opened">("view");
  const [justBound, setJustBound] = useState(false);
  const [err, setErr] = useState("");
  const tried = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (!id) return;
    readGiftLink(BigInt(id))
      .then(async (g) => setInfo({ ...g, sender: await nameOf(g.from).catch(() => "") }))
      .catch((e) => setErr(humanError(e)));
  }, [id]);

  async function accept() {
    if (!link || !info) return;
    tried.current = true;
    setErr("");
    setPhase("binding");
    try {
      const mine = (await getAccount()).address;
      await bindGift(link.id, link.key, mine);
      void registerMe();
      if (info.sender) void addContact({ address: info.from, name: info.sender }).catch(() => {});
      setInfo({ ...info, recipient: mine });
      setJustBound(true);
    } catch (e) {
      setErr(humanError(e));
      // Someone may have accepted it a moment earlier; show the real state.
      readGiftLink(link.id).then((g) => setInfo((i) => (i ? { ...i, ...g } : i))).catch(() => {});
    }
    setPhase("view");
  }

  async function open() {
    if (!info) return;
    setErr("");
    setPhase("opening");
    try {
      await openGift(info.id);
      setInfo({ ...info, settled: true });
      setPhase("opened");
    } catch (e) {
      setErr(humanError(e));
      setPhase("view");
    }
  }

  // Signed in and unlocked → accept straight away, no extra tap.
  const canAccept = !!info && !info.settled && !isBound(info) && !!me && !same(info.from, me);
  useEffect(() => {
    if (canAccept && unlocked && phase === "view" && !tried.current) {
      tried.current = true;
      void Promise.resolve().then(accept);
    }
  });

  if (hash === null) return <Screen title="Kin">{null}</Screen>;

  if (!link) {
    return (
      <Screen title="Kin">
        <Card>This gift link looks incomplete. Ask the sender to share it again.</Card>
        <Link href="/" className="mt-auto grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
      </Screen>
    );
  }

  const from = info?.sender ? `@${info.sender}` : "Someone";
  const money = info ? formatMoney(info.amount) : "";

  if (phase === "signup") {
    return (
      <Screen title="Your gift is waiting">
        <Onboard onDone={accept} />
      </Screen>
    );
  }

  if (phase === "opened" && info) {
    return (
      <Celebrate open title="Your gift is open!" amount={money} subtitle={`From ${from}. It's in your balance now.`}
        shareText="I just opened a gift on Kin 🎁" onClose={() => router.push("/home")} />
    );
  }

  const mine = !!info && isBound(info) && same(info.recipient, me);
  const locked = !!info && now < info.unlockAt;

  let body: ReactNode;
  if (!info) {
    body = err ? <ErrorText>{err}</ErrorText> : <div className="h-40 w-full animate-pulse rounded-[28px] bg-surface-2" />;
  } else if (mine) {
    body = (
      <>
        <div className={locked ? "" : "animate-bounce"}><Kinko size={120} mood="celebrate" /></div>
        <h2 className="font-display text-4xl leading-tight">
          {info.settled ? "Opened ✓" : justBound ? `This gift is now yours${profile?.name ? `, @${profile.name}` : ""}` : `Your gift from ${from}`}
        </h2>
        {link.message && <p className="text-lg">&ldquo;{link.message}&rdquo;</p>}
        <Amount value={money} />
        {info.settled ? (
          <p className="text-muted">It&apos;s in your balance.</p>
        ) : locked ? (
          <>
            <Chip tone="brand">Opens in {timeLeft(info.unlockAt - now)}</Chip>
            <Countdown seconds={info.unlockAt - now} />
            <p className="text-sm text-muted">Held safely until {dateLabel(info.unlockAt)}. It opens by itself that day.</p>
          </>
        ) : (
          <p className="text-muted">It&apos;s ready to open!</p>
        )}
      </>
    );
  } else {
    body = (
      <>
        <span className="grid size-28 place-items-center rounded-full bg-brand-soft"><IconTile name="gift" size={72} tone="brand" /></span>
        <p className="text-lg">A gift from {from}</p>
        {link.message && <p className="font-display text-2xl leading-snug">&ldquo;{link.message}&rdquo;</p>}
        <Amount value={money} />
        <p className="text-muted">
          {info.settled ? "This gift is no longer available."
            : isBound(info) ? "This gift was already accepted."
            : same(info.from, me) ? "Share this link with the person it's for."
            : `Opens on ${dateLabel(info.unlockAt)}. Accept it now so it's yours.`}
        </p>
      </>
    );
  }

  return (
    <Screen title="Kin">
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">{body}</div>
      <div className="flex flex-col gap-3">
        {info && <ErrorText>{err}</ErrorText>}
        {phase === "binding" && <p className="text-center text-sm text-muted" aria-live="polite">Accepting your gift…</p>}
        {phase === "opening" && <p className="text-center text-sm text-muted" aria-live="polite">Opening your gift…</p>}
        {canAccept && <Button busy={phase === "binding"} onClick={accept}>Accept gift</Button>}
        {info && !info.settled && !isBound(info) && !profile && (
          <>
            <Button onClick={() => setPhase("signup")}>Create free account to accept</Button>
            <p className="text-center text-xs text-muted">Takes 20 seconds. Just your name and Face ID.</p>
          </>
        )}
        {mine && !info.settled && !locked && <Button busy={phase === "opening"} onClick={open}>Open gift</Button>}
        {info && (info.settled || isBound(info) || same(info.from, me)) && (
          <Link href={profile ? "/home" : "/"} className="grid h-14 place-items-center rounded-full border border-line font-semibold active:bg-surface-2">Open Kin</Link>
        )}
      </div>
    </Screen>
  );
}
