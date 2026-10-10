import Pusher from "pusher-js/react-native";
import { useEffect, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import type { Address, Hex } from "viem";
import { useAccount } from "./account";
import { PUSHER } from "./config";
import { api } from "./contacts";
import { formatMoney } from "./money";
import { play } from "./sound";

// Messages + notification center (port of app/src/lib/live.ts). Realtime over Pusher
// (`private-user-<address>`), falling back to polling while the socket is down.

export type ChatKind = "text" | "request" | "payment";
export type ChatMessage = {
  id: string; from: Address; to: Address; body: string; kind: ChatKind; ref: string; at: number; read?: boolean;
  req?: { amount: string; note: string; status: "open" | "paid" | "declined"; due: number | null } | null;
};
export type Thread = { with: { address: Address; name: string }; last: ChatMessage; unread: number; status: "ok" | "request" | "blocked" };
export type Notice = { id: string; title: string; body: string; url: string; at: number; read?: boolean };

export const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export const listThreads = () => api<Thread[]>("/api/messages/threads");
export const listMessages = (withAddr: Address) => api<ChatMessage[]>(`/api/messages?with=${withAddr}`);
export const sendMessage = (to: Address, body: string) => api<ChatMessage>("/api/messages", "POST", { to, body });
export const markThreadRead = (withAddr: Address) => api("/api/messages", "POST", { action: "read", with: withAddr }).then(refreshCounts, () => {});
export const setThread = (action: "block" | "unblock" | "accept", address: Address) => api("/api/messages", "POST", { action, address });
export const listInbox = () => api<{ items: Notice[]; unread: number }>("/api/inbox");
export const markInboxRead = (ids?: string[]) => api("/api/inbox", "POST", ids ? { action: "read", ids } : { action: "read", all: true }).then(refreshCounts, () => {});
/** Tell people they were added to a pot/circle/chore (push + inbox). Fire-and-forget. */
export const notifyAdded = (kind: "pot" | "circle" | "chore", id: bigint, addresses: Address[]) =>
  void api("/api/notify-added", "POST", { kind, id: id.toString(), addresses }).catch(() => {});
/** Payer settles a money request (server re-checks the payment for "paid"). */
export const settleRequest = (id: string, status: "paid" | "declined", hash?: Hex) => api<{ ok: true }>("/api/requests", "PATCH", { id, status, hash });

// ---------- unread counts (bell + Messages badges) ----------

type Counts = { inbox: number; messages: number };
const ZERO: Counts = { inbox: 0, messages: 0 };
let counts = ZERO;
let on = false; // only fetch while signed requests won't pop Face ID
const listeners = new Set<() => void>();
const handlers = new Set<(event: "message" | "notification", data: unknown) => void>();

export async function refreshCounts(): Promise<void> {
  if (!on) return;
  const [inbox, threads] = await Promise.all([listInbox().catch(() => null), listThreads().catch(() => null)]);
  if (!inbox && !threads) return;
  counts = {
    inbox: inbox?.unread ?? counts.inbox,
    messages: threads ? threads.filter((t) => t.status !== "blocked").reduce((n, t) => n + t.unread, 0) : counts.messages,
  };
  listeners.forEach((l) => l());
}

export const useUnread = () =>
  useSyncExternalStore((l) => (listeners.add(l), () => void listeners.delete(l)), () => counts);

/** Realtime events (`message` / `notification`). Returns unsubscribe. */
export const onLive = (h: (event: "message" | "notification", data: unknown) => void) => {
  handlers.add(h);
  return () => void handlers.delete(h);
};

let connected = false;
/** True while the realtime socket is connected — screens poll only when it isn't. */
export const isLive = () => connected;
export const isActive = () => AppState.currentState === "active";

function startLive(me: Address): () => void {
  on = true;
  void refreshCounts();
  const fire = (event: "message" | "notification") => (data: unknown) => {
    if (data == null) return;
    if (event === "notification" && /^You got /.test((data as { title?: string }).title ?? "")) play("received");
    handlers.forEach((h) => h(event, data));
    void refreshCounts();
  };
  let p: Pusher | null = null;
  try {
    p = new Pusher(PUSHER.key, {
      cluster: PUSHER.cluster,
      channelAuthorization: {
        customHandler: ({ socketId, channelName }, cb) =>
          api<{ auth: string }>("/api/pusher/auth", "POST", { socket_id: socketId, channel_name: channelName }).then((r) => cb(null, r), (e) => cb(e as Error, null)),
      },
    });
    const ch = p.subscribe(`private-user-${me.toLowerCase()}`);
    ch.bind("message", fire("message"));
    ch.bind("notification", fire("notification"));
    ch.bind("pusher:subscription_succeeded", () => (connected = true));
    p.connection.bind("state_change", ({ current }: { current: string }) => (connected = current === "connected" && connected));
  } catch {} // ponytail: no socket = polling below
  // Fallback / catch-up: counts every 30s while foregrounded and offline; on return to the app.
  const t = setInterval(() => isActive() && !connected && refreshCounts(), 30_000);
  const sub = AppState.addEventListener("change", (s) => s === "active" && refreshCounts());
  return () => {
    on = false;
    connected = false;
    clearInterval(t);
    sub.remove();
    p?.disconnect();
  };
}

/** One realtime connection for the whole app (root layout). Only when loading won't pop Face ID. */
export function useLive() {
  const { profile, canRead } = useAccount();
  const me = canRead ? profile?.address : undefined;
  useEffect(() => (me ? startLive(me) : undefined), [me]);
}

/** "now", "5 min ago", "3 h ago", "yesterday", "4 days ago". ponytail: hand-rolled, Hermes lacks Intl.RelativeTimeFormat. */
export function ago(at: number): string {
  const m = Math.round((Date.now() - at) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m} min ago`;
  if (m < 1440) return `${Math.round(m / 60)} h ago`;
  const d = Math.round(m / 1440);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** One-line preview of the last message. */
export function preview(m: ChatMessage, me?: string): string {
  const mine = same(m.from, me);
  if (m.kind === "payment") return `${mine ? "You paid" : "Paid you"} ${formatMoney(BigInt(m.ref || "0"))}`;
  if (m.kind === "request") return `${mine ? "You asked for money" : "Asked you for money"}${m.body ? ` · ${m.body}` : ""}`;
  return `${mine ? "You: " : ""}${m.body}`;
}
