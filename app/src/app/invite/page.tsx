"use client";
import { useEffect, useState } from "react";
import { Kinko } from "@/components/kinko/Kinko";
import { Avatar, Button, Card, Ico, Row, Screen } from "@/components/ui";
import { useRequireAccount } from "@/lib/account";
import { ago } from "@/lib/activity";
import { listInvites, type Invites } from "@/lib/contacts";
import { noteInvite, useKinko } from "@/lib/kinko";

export default function Invite() {
  const { profile, canRead } = useRequireAccount();
  const { look } = useKinko(profile?.address);
  const [copied, setCopied] = useState(false);
  const [invites, setInvites] = useState<Invites | null>(null);

  useEffect(() => {
    if (canRead) listInvites().then(setInvites, () => {});
  }, [canRead]);

  const handle = profile?.name;
  const link = typeof window === "undefined" || !handle ? "" : `${location.origin}/?ref=${encodeURIComponent(handle)}`;
  const text = `Join me on Kin, money for family and friends. We both get a party hat for our Kinko 🎉 ${link}`;

  async function share() {
    noteInvite();
    try {
      if (navigator.share) return await navigator.share({ text, url: link });
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // share sheet dismissed
    }
  }

  return (
    <Screen title="Invite & earn" back="/me">
      <div className="flex flex-col items-center rounded-[32px] bg-fun-5/15 px-5 py-8 text-center">
        <div className="flex items-end -space-x-6">
          <Kinko look={{ ...look, accessories: ["party"] }} mood="celebrate" size={140} />
          <Kinko look={{ skin: "mint", expression: "grin", accessories: ["party"] }} size={110} />
        </div>
        <h2 className="mt-4 font-display text-4xl leading-tight">You both get a party hat</h2>
        <p className="mt-2 max-w-72 text-muted">Share your link with a friend.<br />You both unlock a party hat for Kinko.</p>
      </div>

      {invites?.invitedBy && (
        <p className="flex items-center justify-center gap-2 text-center text-sm text-muted">
          <Avatar name={invites.invitedBy} size={24} /> You joined with @{invites.invitedBy}&apos;s invite
        </p>
      )}

      {profile && !handle && <p className="text-center text-sm text-muted">Pick your @name first to get your link.</p>}

      {link && (
        <Card className="flex items-center gap-3 py-3">
          <span className="min-w-0 flex-1 truncate text-sm text-muted">{link.replace(/^https?:\/\//, "")}</span>
          <button
            onClick={() => navigator.clipboard.writeText(link).then(() => (noteInvite(), setCopied(true), setTimeout(() => setCopied(false), 2000)))}
            className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-surface-2 px-4 text-sm font-semibold active:scale-95"
          >
            <Ico name={copied ? "check" : "copy"} size={16} /> {copied ? "Copied" : "Copy"}
          </button>
        </Card>
      )}

      {invites && (
        <section>
          <h3 className="mb-2 px-1 text-sm font-semibold text-muted">People who joined with your link</h3>
          <div className="overflow-hidden rounded-[28px] border border-line bg-surface">
            {invites.invited.length ? (
              invites.invited.map((p) => (
                <Row key={p.name} icon={<Avatar name={p.name} />} title={`@${p.name}`} trail={<span className="shrink-0 text-sm text-muted">{ago(p.at)}</span>} />
              ))
            ) : (
              <p className="px-5 py-4 text-sm text-muted">No one yet. Friends who join with your link show up here.</p>
            )}
          </div>
        </section>
      )}

      <div className="mt-auto flex flex-col gap-3">
        <a
          href={link ? `https://wa.me/?text=${encodeURIComponent(text)}` : undefined}
          target="_blank"
          rel="noopener noreferrer"
          onClick={noteInvite}
          aria-disabled={!link}
          className={`grid h-14 w-full place-items-center rounded-full bg-fun-1 text-base font-semibold text-fun-ink transition active:scale-[0.98] ${link ? "" : "pointer-events-none opacity-40"}`}
        >
          Invite on WhatsApp
        </a>
        <Button variant="ghost" disabled={!link} onClick={share}>
          <span className="inline-flex items-center gap-2"><Ico name={copied ? "check" : "share"} /> {copied ? "Copied" : "More ways to share"}</span>
        </Button>
      </div>
    </Screen>
  );
}
