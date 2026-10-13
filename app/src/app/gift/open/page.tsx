"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Onboard } from "@/components/core/Onboard";
import { GiftLinkSlip } from "@/components/gift/GiftLinkSlip";
import { GiftReveal } from "@/components/gift/GiftReveal";
import { useNow } from "@/components/programs/kit";
import { Screen } from "@/components/ui";
import { getAccount, useAccount } from "@/lib/account";
import { addContact, registerMe } from "@/lib/contacts";
import { bindGift, isBound, openGift, parseGiftLink, readGiftLink, type GiftLink } from "@/lib/giftLinks";
import { humanError } from "@/lib/errors";
import { nameOf } from "@/lib/names";
import { same, ZERO } from "@/lib/programs";

// A gift link (approved /demo E1, Oct 13). Ready to open → GiftReveal: the box drops in, tap it → accept + open
// behind the pop → the note unfolds → drag it away. Anything else (not open yet, taken, gone, the sender's own
// link) → GiftLinkSlip, printed with a stamp. No auto-accept: the person taps.
// The link key lives in the URL fragment (#id.key&m=…), which browsers never send to a server.
const onHash = (cb: () => void) => (addEventListener("hashchange", cb), () => removeEventListener("hashchange", cb));

export default function OpenGiftLink() {
  const hash = useSyncExternalStore(onHash, () => location.hash, () => null);
  const link = hash ? parseGiftLink(hash) : null;
  const id = link?.id.toString();
  const { profile } = useAccount();
  const me = profile?.address;
  const now = useNow();
  const router = useRouter();
  const [info, setInfo] = useState<(GiftLink & { sender: string }) | null>(null);
  const [phase, setPhase] = useState<"view" | "signup" | "binding" | "opening">("view");
  const [justBound, setJustBound] = useState(false);
  const [resume, setResume] = useState(false); // back from sign-up on the box: run accept + open straight away
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!id) return;
    readGiftLink(BigInt(id))
      .then(async (g) => {
        // No such gift: the contract returns an empty record (from = 0, amount 0).
        if (same(g.from, ZERO)) return setErr("This gift link isn't valid. Ask the sender to share it again.");
        setInfo({ ...g, sender: await nameOf(g.from).catch(() => "") });
      })
      .catch((e) => setErr(humanError(e)));
  }, [id]);

  /** Bind the gift to me. Returns my address. */
  async function bind(i: GiftLink & { sender: string }) {
    if (!link) throw new Error("link incomplete"); // not link!.id: React Compiler would read it at render
    const mine = (await getAccount()).address;
    await bindGift(link.id, link.key, mine);
    void registerMe();
    if (i.sender) void addContact({ address: i.from, name: i.sender }).catch(() => {});
    return mine;
  }

  async function accept() {
    if (!link || !info) return;
    setErr("");
    setPhase("binding");
    try {
      setInfo({ ...info, recipient: await bind(info) });
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
    } catch (e) {
      setErr(humanError(e));
    }
    setPhase("view");
  }

  // Ready = open date passed, not settled, and either unclaimed (and not mine to send) or already mine.
  // info isn't updated by the reveal's own accept/open, so the reveal stays put until they leave.
  const mine = !!info && isBound(info) && same(info.recipient, me);
  const ready = !!info && !info.settled && now >= info.unlockAt && (mine || (!isBound(info) && !same(info.from, me)));

  if (hash === null) return <Screen title="Kin">{null}</Screen>;
  if (phase === "signup") return <Screen title="Your gift is waiting"><Onboard onDone={() => { setPhase("view"); if (ready) setResume(true); else void accept(); }} /></Screen>;

  if (ready && link && info) {
    return (
      <GiftReveal amount={info.amount} sender={info.sender} msg={link.message} signedIn={!!profile} resume={resume}
        onSignup={() => setPhase("signup")} onLeave={() => router.replace(profile ? "/home" : "/")}
        onOpen={async (say) => {
          if (!mine) { say("Accepting your gift…"); await bind(info); }
          say("Opening your gift…");
          await openGift(info.id);
        }} />
    );
  }

  return <GiftLinkSlip link={link} info={info} err={err} phase={phase} justBound={justBound} me={me} profile={profile}
    onAccept={accept} onSignup={() => setPhase("signup")} onOpen={open} />;
}
