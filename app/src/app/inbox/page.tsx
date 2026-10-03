"use client";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SkeletonRows, useSignedIn } from "@/components/social/bits";
import { Button, Card, ErrorText, IconTile, Screen } from "@/components/ui";
import { unlock, useAccount } from "@/lib/account";
import { humanError } from "@/lib/errors";
import { ago, listInbox, markInboxRead, onLive, type Notice } from "@/lib/live";

/** Notification center: everything Kin told you, newest first. */
export default function InboxPage() {
  useSignedIn();
  const router = useRouter();
  const { canRead } = useAccount();
  const [items, setItems] = useState<Notice[] | null>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!canRead) return;
    const load = () => listInbox().then((r) => setItems(r.items), (e) => setErr(humanError(e)));
    load();
    return onLive((event) => event === "notification" && load());
  }, [canRead]);

  function open(n: Notice) {
    if (!n.read) void markInboxRead([n.id]);
    router.push(n.url || "/home");
  }

  function readAll() {
    setItems((xs) => xs && xs.map((n) => ({ ...n, read: true })));
    void markInboxRead();
  }

  const unread = items?.filter((n) => !n.read).length ?? 0;

  return (
    <Screen
      wide
      title="Notifications"
      back="/home"
      action={unread > 0 && (
        <button onClick={readAll} className="h-11 rounded-full px-3 text-sm font-semibold text-brand active:bg-brand-soft">
          Mark all read
        </button>
      )}
    >
      {!canRead && (
        <Card className="mx-5 flex flex-col items-center gap-3 text-center">
          <p className="font-semibold">Your notifications are private</p>
          <Button onClick={() => unlock().catch((e) => setErr(humanError(e)))}>Confirm with Identity check</Button>
        </Card>
      )}
      {err && <div className="px-5"><ErrorText>{err}</ErrorText></div>}
      {canRead && !items && !err && <div className="px-5"><SkeletonRows n={5} /></div>}

      {items && !items.length && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 text-center">
          <IconTile name="bell" size={64} />
          <p className="font-semibold">All quiet</p>
          <p className="text-sm text-muted">Payments, requests and invites show up here.</p>
        </div>
      )}

      {!!items?.length && (
        <ul className="flex flex-col">
          {items.map((n) => (
            <li key={n.id}>
              <button onClick={() => open(n)} className="flex min-h-16 w-full items-start gap-3 px-5 py-3 text-left active:bg-surface-2">
                <span className={`mt-2 size-2 shrink-0 rounded-full ${n.read ? "bg-transparent" : "bg-brand"}`} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className={`block ${n.read ? "font-medium text-muted" : "font-semibold"}`}>{n.title}</span>
                  {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                </span>
                <span className="shrink-0 pt-0.5 text-xs text-muted">{ago(n.at)}</span>
                {!n.read && <span className="sr-only">New</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  );
}
