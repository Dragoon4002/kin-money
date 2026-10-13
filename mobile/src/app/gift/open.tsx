import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { GiftLinkSlip } from "@/components/gift/GiftLinkSlip";
import { GiftReveal } from "@/components/gift/GiftReveal";
import { useNow } from "@/components/programs/kit";
import { getAccount, useAccount } from "@/lib/account";
import { API_BASE } from "@/lib/config";
import { addContact, registerMe } from "@/lib/contacts";
import { humanError } from "@/lib/errors";
import { bindGift, isBound, openGift, parseGiftLink, readGiftLink, type GiftLink } from "@/lib/giftLinks";
import { nameOf } from "@/lib/names";
import { same } from "@/lib/programs";

// Port of app/src/app/gift/open/page.tsx. Ready to open → GiftReveal: the box drops in, tap it → accept + open behind
// the pop → the note unfolds → drag it away. Anything else (not open yet, taken, gone, the sender's own link) →
// GiftLinkSlip, printed with a stamp. No auto-accept: the person taps. The link key rides in the #fragment; openKin
// passes it as `hash`.

export default function OpenGiftLink() {
  const { hash = "" } = useLocalSearchParams<{ hash?: string }>();
  const [link] = useState(() => parseGiftLink(hash));
  const id = link?.id.toString();
  const { profile } = useAccount();
  const me = profile?.address;
  const now = useNow();
  const [info, setInfo] = useState<(GiftLink & { sender: string }) | null>(null);
  const [phase, setPhase] = useState<"view" | "binding" | "opening">("view");
  const [justBound, setJustBound] = useState(false);
  const [resume, setResume] = useState(false); // back from sign-up on the box: run accept + open straight away
  const [err, setErr] = useState("");
  const signingUp = useRef(false);

  useEffect(() => {
    if (!id) return;
    readGiftLink(BigInt(id))
      .then(async (g) => setInfo({ ...g, sender: await nameOf(g.from).catch(() => "") }))
      .catch((e) => setErr(humanError(e)));
  }, [id]);

  /** Bind the gift to me. Returns my address. */
  async function bind(i: GiftLink & { sender: string }) {
    const mine = (await getAccount()).address;
    await bindGift(link!.id, link!.key, mine);
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

  // Sign-up is its own screen (/onboard ends on Home). Back here with an account → carry on, like web's onDone.
  useFocusEffect(useCallback(() => {
    if (!signingUp.current || !profile) return;
    signingUp.current = false;
    if (ready) setResume(true);
    else void accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on focus with the latest state
  }, [profile, ready]));
  const signup = () => ((signingUp.current = true), router.push("/onboard"));
  const leave = () => router.replace(profile ? "/tabs" : "/");

  if (ready && link && info) {
    return (
      <GiftReveal amount={info.amount} sender={info.sender} msg={link.message} signedIn={!!profile} resume={resume} onSignup={signup} onLeave={leave}
        onOpen={async (say) => {
          if (!mine) { say("Accepting your gift…"); await bind(info); }
          say("Opening your gift…");
          await openGift(info.id);
        }} />
    );
  }

  return <GiftLinkSlip link={link} info={info} err={err} phase={phase} justBound={justBound} me={me} profile={profile} url={`${API_BASE}/gift/open#${hash}`}
    onAccept={accept} onSignup={signup} onOpen={open} />;
}
