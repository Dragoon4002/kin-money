"use client";
// Send a gift: the note IS the form (who, amount, message on the paper; date below) → Send gift → it folds, drops
// into the box, the lid goes on → the box HOLDS closed until `send` resolves (the gift is held onchain) → lifts and
// flies off → "The gift will reach @x" + countdown. `send` throws → the note opens again with the error.
// Used by app/gift/page.tsx and /demo/e-gift. "Someone to OK it" (guardian) hidden for now (user, Oct 13).
//
// Truth (contracts): Kin name = KinEscrow.create(..., expiresAt = guard ? unlock + 30 days : 0). No guard →
// expiresAt 0 → refund() always reverts: it's theirs. Gift link = KinGiftLink, expiresAt = unlock + 60 days
// (lib/giftLinks.ts); refund only if nobody accepted it. Never automatic: "Take it back" in Gifts.
import { useEffect, useState } from "react";
import { dateLabel, useNow } from "@/components/programs/kit";
import { share } from "@/components/core/share";
import { Avatar, Button, Countdown, ErrorText, Ico, Screen, Tabs, inputClass } from "@/components/ui";
import { humanError } from "@/lib/errors";
import { Bow, Note, Ribbon, noteMoney, reducedMotion, type GiftDraft, type GiftMode } from "./GiftNote";

const MODES = [["name", "To a Kin name"], ["link", "As a gift link"]] as const;
const PHASES = ["note", "fold", "box", "closed", "lift", "fly", "done"] as const;
export type WrapPhase = (typeof PHASES)[number];
/** ms in each phase before the next; "closed" also waits for the gift to be held. */
const HOLD: Partial<Record<WrapPhase, number>> = { fold: 760, box: 620, closed: 700, lift: 240, fly: 560 };
const SLOW_MS = 2500;
const at9 = (t: number) => new Date(t * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
const day = (t: number) => { const d = new Date(t * 1000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

type Props = {
  from: string;
  /** Kin names starting with `prefix` (autocomplete). */
  suggest: (prefix: string) => string[];
  /** Before folding: error copy (e.g. "No one on Kin with that name yet.") or null. */
  check?: (d: GiftDraft) => Promise<string | null>;
  /** Hold the gift onchain; resolves with the share URL for a gift link. Throws → note opens again. */
  send: (d: GiftDraft, opensAt: number) => Promise<string | void>;
  onClose: () => void;
  initial?: Partial<GiftDraft>;
  /** Pre-picked open time (unix s). */
  opensOn?: number;
  /** /demo only: start in a phase (no send runs), the slow text, a copied link. */
  at?: WrapPhase; slow?: boolean; err?: string; copied?: boolean; link?: string;
};

export function GiftWrap({ from, suggest, check, send, onClose, initial, opensOn, at, slow: slow0, err: err0 = "", copied, link: link0 = "" }: Props) {
  const now = useNow();
  const [phase, setPhase] = useState<WrapPhase>(at ?? "note");
  const [d, setD] = useState<GiftDraft>({ mode: "name", to: "", amount: "", msg: "", from, ...initial });
  const set = (p: Partial<GiftDraft>) => setD((x) => ({ ...x, ...p }));
  const [when, setWhen] = useState<"date" | "soon">("date");
  const [date, setDate] = useState(opensOn ? day(opensOn) : "");
  const [toFocus, setToFocus] = useState(false);
  const [err, setErr] = useState(err0);
  const [checking, setChecking] = useState(false);
  const [held, setHeld] = useState(!!at); // demo poses count as held
  const [slow, setSlow] = useState(!!slow0);
  const [opensAt, setOpensAt] = useState(0); // fixed at the tap, so "in 2 min" counts from then
  const [link, setLink] = useState(link0);

  useEffect(() => {
    const ms = !at && HOLD[phase];
    if (!ms || (phase === "closed" && !held)) return;
    const t = setTimeout(() => setPhase(PHASES[PHASES.indexOf(phase) + 1]), ms);
    return () => clearTimeout(t);
  }, [phase, held, at]);
  useEffect(() => {
    if (phase !== "closed" || held || at) return;
    const t = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(t);
  }, [phase, held, at]);

  const editing = phase === "note";
  const name = d.mode === "name";
  const hits = name && toFocus && d.to ? suggest(d.to).filter((p) => p !== d.to && p !== from).slice(0, 4) : [];
  const opens = when === "soon" ? now + 120 : date ? Math.floor(new Date(`${date}T09:00`).getTime() / 1000) : 0;
  const ok = Number(d.amount) > 0 && (!name || d.to.length >= 3) && opens > now;

  async function go() {
    setErr("");
    if (check) {
      setChecking(true);
      const e = await check(d).catch((x) => humanError(x));
      setChecking(false);
      if (e) return setErr(e);
    }
    const still = reducedMotion();
    setOpensAt(opens);
    setHeld(false);
    setSlow(false);
    setPhase(still ? "closed" : "fold");
    try {
      setLink((await send(d, opens)) || "");
      setHeld(true);
      if (still) setPhase("done");
    } catch (e) {
      setErr(humanError(e));
      setPhase("note");
    }
  }

  if (phase === "done") return <OnItsWay mode={d.mode} to={d.to} msg={d.msg} opens={opensAt || opens} link={link} copied={copied} onDone={onClose} />;
  return (
    <Screen title="Send a gift" action={editing ? <button onClick={onClose} className="grid h-11 place-items-center px-2 text-muted">Cancel</button> : undefined}>
      <div className={editing ? "" : "invisible"}><Tabs value={d.mode} options={MODES} onChange={(mode: GiftMode) => set({ mode })} /></div>
      <div className="kt-printer kd-gift" data-phase={phase}>
        <div className="kd-gift-fly">
          <span aria-hidden className="kd-box-back" />
          <Note d={d} set={editing ? set : undefined} onTo={setToFocus} label={`Gift note: ${noteMoney(d.amount)} for ${name ? `@${d.to}` : "whoever accepts it"}`} />
          <span aria-hidden className="kd-box-front"><Ribbon /></span>
          <span aria-hidden className="kd-lid"><Ribbon /><Bow /></span>
        </div>
        {hits.length > 0 && (
          // Floats over the note; never resizes it.
          <ul role="listbox" aria-label="Suggestions" className="absolute inset-x-4 top-[100px] z-20 overflow-hidden rounded-3xl border border-line bg-surface shadow-lg">
            {hits.map((p) => (
              <li key={p} role="option" aria-selected={false}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { set({ to: p }); setToFocus(false); }}
                  className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left font-semibold active:bg-surface-2">
                  <Avatar name={p} size={32} /> @{p}
                </button>
              </li>
            ))}
          </ul>
        )}
        {editing && (
          // Sits where the box lands later (hidden until then).
          <div className="absolute inset-x-0 top-[346px] z-10 flex gap-2">
            {when === "date"
              ? <input type="date" aria-label="Opens on" className={`${inputClass} h-12 flex-1`} min={day(now + 86_400)} value={date} onChange={(e) => setDate(e.target.value)} />
              : <span className="grid h-12 flex-1 place-items-center rounded-full bg-surface-2 text-sm font-semibold">Opens in 2 min</span>}
            <button type="button" onClick={() => setWhen(when === "date" ? "soon" : "date")} className="h-12 shrink-0 rounded-full border border-line px-4 text-sm font-semibold active:bg-surface-2">
              {when === "date" ? "In 2 min" : "Pick a date"}
            </button>
          </div>
        )}
      </div>
      <div className="mt-auto flex min-h-14 flex-col justify-end gap-2 pt-2">
        {editing ? (
          <>
            <ErrorText>{err}</ErrorText>
            <Button disabled={!ok} busy={checking} onClick={go}>Send gift</Button>
          </>
        ) : (
          <p className="text-center text-sm text-muted" role="status">{slow ? "Almost there…" : phase === "fold" ? "Folding your note…" : "Wrapping your gift…"}</p>
        )}
      </div>
    </Screen>
  );
}

/** After the box flies off: who it reaches, a countdown to the day, and exactly what happens if it isn't opened. */
function OnItsWay({ mode, to, msg, opens, link, copied, onDone }: { mode: GiftMode; to: string; msg: string; opens: number; link: string; copied?: boolean; onDone: () => void }) {
  const now = useNow();
  const [didCopy, setCopied] = useState(copied);
  const back = dateLabel(opens + 60 * 86_400);
  const text = `I wrapped a gift for you on Kin 🎁${msg.trim() ? ` "${msg.trim()}"` : ""} It opens on ${dateLabel(opens)}. Tap to accept it:`;
  return (
    <Screen>
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <span className="kin-pop grid size-20 place-items-center rounded-full bg-brand-soft text-brand"><Ico name="gift" size={36} /></span>
        <h2 className="kin-rise font-display text-4xl leading-tight [animation-delay:120ms]">
          {mode === "link" ? "The gift will reach whoever you send it to" : `The gift will reach @${to}`}
        </h2>
        <div className="kin-rise flex flex-col items-center gap-2 [animation-delay:220ms]">
          <span className="text-sm text-muted">Opens in</span>
          <Countdown seconds={opens - now} />
        </div>
        <p className="kin-rise text-muted [animation-delay:320ms]">
          {mode === "link" ? `The first person to accept the link keeps it. It opens on ${dateLabel(opens)} at ${at9(opens)}.`
            : `It opens by itself on ${dateLabel(opens)} at ${at9(opens)}.`}
        </p>
        <p className="kin-rise rounded-[28px] bg-surface-2 px-5 py-3 text-sm [animation-delay:400ms]">
          {mode === "name" ? `It's @${to}'s now, so it can't come back to you.` : `If nobody accepts it by ${back}, you can take the money back in Gifts.`}
        </p>
      </div>
      <div className="kin-rise flex flex-col gap-2 pt-2 [animation-delay:500ms]">
        {mode === "link" ? (
          <>
            <a href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`} target="_blank" rel="noreferrer"
              className="flex h-14 items-center justify-center gap-2 rounded-full bg-good font-semibold text-fun-ink active:scale-[0.98]">
              <Ico name="share" /> Send on WhatsApp
            </a>
            <Button variant="soft" onClick={async () => (await share(text, link)) === "copied" && setCopied(true)}>{didCopy ? "Link copied ✓" : "Share another way"}</Button>
            <button onClick={onDone} className="grid h-14 place-items-center font-semibold text-muted">Done</button>
          </>
        ) : (
          <Button onClick={onDone}>Done</Button>
        )}
      </div>
    </Screen>
  );
}
