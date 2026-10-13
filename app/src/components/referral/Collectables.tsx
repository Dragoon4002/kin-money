"use client";
import { useState } from "react";
import { Kinko } from "@/components/kinko/Kinko";
import { MyKinko, PersonKinko } from "@/components/kinko/PersonKinko";
import { Sheet } from "@/components/programs/kit";
import { Button, Ico } from "@/components/ui";
import type { Invites } from "@/lib/contacts";
import { COLLECTABLES } from "@/lib/referralPerks";

type C = (typeof COLLECTABLES)[number];

/** Two Kinkos leaning in, hands meeting in the middle. */
function Handshake({ friend, size }: { friend?: string; size: number }) {
  const lean = (deg: number) => ({ transform: `rotate(${deg}deg)`, transformOrigin: "50% 100%" });
  return (
    <div className="relative" style={{ width: size * 1.66, height: size }}>
      <div className="absolute left-0 top-0" style={lean(6)}><MyKinko size={size} mood="calm" /></div>
      <div className="absolute top-0" style={{ left: size * 0.66, ...lean(-6) }}>
        <div style={{ transform: "scaleX(-1)" }}><PersonKinko name={friend} size={size} mood="calm" /></div>
      </div>
      <svg width={size * 0.3} height={size * 0.2} viewBox="0 0 60 40" className="absolute" style={{ left: size * 0.83, top: size * 0.66, transform: "translate(-50%,-50%)", animation: "kin-shake 1.2s ease-in-out infinite" }}>
        <ellipse cx={24} cy={20} rx={20} ry={13} fill="var(--fun-2)" stroke="var(--fun-ink)" strokeWidth={3} />
        <ellipse cx={36} cy={20} rx={20} ry={13} fill="var(--fun-1)" stroke="var(--fun-ink)" strokeWidth={3} />
      </svg>
    </div>
  );
}

/** Me in front and centre, friends lined up behind. */
function Crew({ friends, size }: { friends: string[]; size: number }) {
  const w = size * (1 + friends.length * 0.45), small = size * 0.78;
  return (
    <div className="relative" style={{ width: w, height: size * 1.1 }}>
      {friends.map((f, i) => (
        <div key={f} className="absolute top-0" style={{ left: ((i + 0.5) / friends.length) * w - small / 2, opacity: 0.95 }}>
          <PersonKinko name={f} size={small} />
        </div>
      ))}
      <div className="absolute bottom-0" style={{ left: w / 2 - size / 2 }}><MyKinko size={size} mood="celebrate" /></div>
    </div>
  );
}

function Scene({ c, friends, size }: { c: C; friends: string[]; size: number }) {
  return c.crew === 1 ? <Handshake friend={friends[0]} size={size} /> : <Crew friends={friends} size={size} />;
}

/** Collectable scenes unlocked by friends who joined and made a payment. Tap one to see it big and share it. */
export function Collectables({ invites, onShare }: { invites: Invites; onShare: (text: string) => void }) {
  const [open, setOpen] = useState<C | null>(null);
  const active = invites.invited.filter((p) => p.active).map((p) => p.name).reverse(); // earliest friends first
  const friendsOf = (c: C) => (c.crew === 1 ? [active[0] ?? invites.invitedBy ?? ""] : active.slice(0, c.crew));
  const have = (c: C) => (c.crew === 1 ? active.length >= 1 || !!invites.invitedBy : active.length >= c.at);

  return (
    <section>
      <h3 className="mb-2 px-1 text-sm font-semibold text-muted">Collectables</h3>
      <div className="grid grid-cols-2 gap-3">
        {COLLECTABLES.map((c) => {
          const got = have(c);
          return (
            <button key={c.id} disabled={!got} onClick={() => setOpen(c)} className="flex flex-col items-center gap-2 rounded-[28px] border border-line bg-surface p-3 text-center active:scale-[0.98] disabled:active:scale-100">
              <div className="grid h-24 w-full place-items-center overflow-hidden">
                {got ? <Scene c={c} friends={friendsOf(c)} size={c.crew === 1 ? 56 : 44} /> : <div className="opacity-30 grayscale"><Kinko size={64} mood="calm" /></div>}
              </div>
              <p className="text-sm font-semibold">{got ? c.title : "???"}</p>
              <p className="flex items-center gap-1 text-xs text-muted">{got ? "Tap to share" : <><Ico name="lock" size={12} /> {c.at} friend{c.at > 1 ? "s" : ""} making a payment</>}</p>
            </button>
          );
        })}
      </div>
      <p className="mt-3 px-1 text-center text-sm text-muted">🎁 Rewards for your crew are dropping soon.</p>

      <Sheet open={!!open} onClose={() => setOpen(null)} label="Collectable">
        {open && (
          <>
            <div className="grid place-items-center overflow-hidden rounded-[28px] bg-fun-5/15 py-6"><Scene c={open} friends={friendsOf(open)} size={open.crew === 1 ? 130 : 96} /></div>
            <h2 className="text-center font-display text-3xl leading-tight">{open.title}</h2>
            <p className="text-center text-muted">{open.sub}</p>
            <Button onClick={() => onShare(`${open.title}! Our Kinkos on Kin 🎉`)}>Share with a friend</Button>
          </>
        )}
      </Sheet>
    </section>
  );
}
