"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PersonPicker } from "@/components/PersonPicker";
import { SkeletonRows, useSignedIn } from "@/components/social/bits";
import { Avatar, Button, Card, Chip, ErrorText, IconTile, Screen, Tabs } from "@/components/ui";
import { unlock, useAccount } from "@/lib/account";
import { humanError } from "@/lib/errors";
import { ago, listThreads, onLive, preview, type Thread } from "@/lib/live";

/** Chats + a Requests folder for people you haven't talked to yet. */
export default function MessagesPage() {
  const profile = useSignedIn();
  const router = useRouter();
  const { canRead } = useAccount();
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [tab, setTab] = useState<"chats" | "requests">("chats");
  const [err, setErr] = useState("");
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!canRead) return;
    const load = () => listThreads().then(setThreads, (e) => setErr(humanError(e)));
    load();
    return onLive((event) => event === "message" && load());
  }, [canRead]);

  const chats = threads?.filter((t) => t.status === "ok") ?? [];
  const requests = threads?.filter((t) => t.status !== "ok") ?? [];
  const waiting = requests.filter((t) => t.status === "request").length;
  const shown = tab === "chats" ? chats : requests;

  return (
    <Screen
      wide
      title="Messages"
      back="/contacts"
      action={!picking && (
        <button onClick={() => setPicking(true)} className="h-11 rounded-full bg-brand-soft px-4 text-sm font-semibold text-brand active:scale-95">
          + New
        </button>
      )}
    >
      {picking && (
        <Card className="mx-5 flex flex-col gap-4">
          <PersonPicker label="Message who?" onPick={(p) => p && router.push(`/messages/${p.address}`)} />
          <Button variant="ghost" onClick={() => setPicking(false)}>Cancel</Button>
        </Card>
      )}

      {!canRead && (
        <Card className="mx-5 flex flex-col items-center gap-3 text-center">
          <p className="font-semibold">Your messages are private</p>
          <Button onClick={() => unlock().catch((e) => setErr(humanError(e)))}>Confirm with Face ID</Button>
        </Card>
      )}

      <div className="px-5">
        <Tabs value={tab} onChange={setTab} options={[["chats", "Chats"], ["requests", waiting ? `Requests · ${waiting}` : "Requests"]]} />
      </div>
      {err && <div className="px-5"><ErrorText>{err}</ErrorText></div>}
      {canRead && !threads && !err && <div className="px-5"><SkeletonRows n={4} /></div>}

      {threads && !shown.length && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
          <IconTile name="chat" size={64} />
          <p className="font-semibold">{tab === "chats" ? "No chats yet" : "No requests"}</p>
          <p className="text-sm text-muted">
            {tab === "chats" ? "Say hi to someone you send money to." : "Messages from people you don't know yet wait here."}
          </p>
        </div>
      )}

      <ul className="flex flex-col">
        {shown.map((t) => (
          <li key={t.with.address}>
            <button
              onClick={() => router.push(`/messages/${t.with.address}`)}
              className="flex min-h-16 w-full items-center gap-3 px-5 py-3 text-left active:bg-surface-2"
            >
              <Avatar name={t.with.name} size={48} />
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className={`truncate ${t.unread ? "font-bold" : "font-semibold"}`}>@{t.with.name || "someone"}</span>
                  {t.status === "blocked" && <Chip tone="bad">Blocked</Chip>}
                </span>
                <span className={`block truncate text-sm ${t.unread ? "text-ink" : "text-muted"}`}>{preview(t.last, profile?.address)}</span>
              </span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-xs text-muted">{ago(t.last.at)}</span>
                {t.unread > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brand px-1 text-[11px] font-bold text-brand-ink">{t.unread}</span>
                )}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Screen>
  );
}
