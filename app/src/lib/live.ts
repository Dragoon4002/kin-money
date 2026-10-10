"use client";
import { useSyncExternalStore } from "react";
import type { Address } from "viem";
import { api } from "./contacts";
import { formatMoney } from "./money";
import { play } from "./sound";

// Messages + notification center, client side. Realtime over Pusher (`private-user-<address>`),
// falling back to polling when NEXT_PUBLIC_PUSHER_* isn't set or the socket is down.

export type ChatKind = "text" | "request" | "payment";
export type ChatMessage = {
  id: string; from: Address; to: Address; body: string; kind: ChatKind; ref: string; at: number; read?: boolean;
  req?: { amount: string; note: string; status: "open" | "paid" | "declined"; due: number | null } | null;
};
export type Thread = { with: { address: Address; name: string }; last: ChatMessage; unread: number; status: "ok" | "request" | "blocked" };
export type Notice = { id: string; title: string; body: string; url: string; at: number; read?: boolean };

export const listThreads = () => api<Thread[]>("/api/messages/threads");
export const listMessages = (withAddr: Address) => api<ChatMessage[]>(`/api/messages?with=${withAddr}`);
export const sendMessage = (to: Address, body: string) => api<ChatMessage>("/api/messages", "POST", { to, body });
export const markThreadRead = (withAddr: Address) => api("/api/messages", "POST", { action: "read", with: withAddr }).then(refreshCounts, () => {});
export const setThread = (action: "block" | "unblock" | "accept", address: Address) => api("/api/messages", "POST", { action, address });
export const listInbox = () => api<{ items: Notice[]; unread: number }>("/api/inbox");
export const markInboxRead = (ids?: string[]) => api("/api/inbox", "POST", ids ? { action: "read", ids } : { action: "read", all: true }).then(refreshCounts, () => {});
/** After a pot/circle/chore is set up: tell the people in it (server re-checks onchain). Fire-and-forget. */
export const notifyAdded = (kind: "pot" | "circle" | "chore", id: bigint, addresses: Address[]) =>
  void api("/api/notify-added", "POST", { kind, id: id.toString(), addresses }).catch(() => {});

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
  useSyncExternalStore((l) => (listeners.add(l), () => listeners.delete(l)), () => counts, () => ZERO);

/** Realtime events (`message` / `notification`). Returns unsubscribe. */
export const onLive = (h: (event: "message" | "notification", data: unknown) => void) => {
  handlers.add(h);
  return () => void handlers.delete(h);
};

let connected = false;
/** True while the realtime socket is connected — screens poll only when it isn't. */
export const isLive = () => connected;

/** Connect for `me`. Returns a stop function. Called once by <Live> in the root layout. */
export function startLive(me: Address): () => void {
  on = true;
  void refreshCounts();
  let stopped = false;
  let disconnect = () => {};
  const fire = (event: "message" | "notification") => (data: unknown) => {
    if (data == null) return;
    if (event === "notification" && /^You got /.test((data as { title?: string }).title ?? "")) play("received");
    handlers.forEach((h) => h(event, data));
    void refreshCounts();
  };
  const key = process.env.NEXT_PUBLIC_PUSHER_KEY, cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
  if (key && cluster) {
    void import("pusher-js").then(({ default: Pusher }) => {
      if (stopped) return;
      const p = new Pusher(key, {
        cluster,
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
      disconnect = () => p.disconnect();
    });
  }
  // Fallback / catch-up: counts every 30s while the app is visible.
  const t = setInterval(() => document.visibilityState === "visible" && !connected && refreshCounts(), 30_000);
  const vis = () => document.visibilityState === "visible" && refreshCounts();
  document.addEventListener("visibilitychange", vis);
  return () => {
    stopped = true;
    on = false;
    connected = false;
    clearInterval(t);
    document.removeEventListener("visibilitychange", vis);
    disconnect();
  };
}

/** "5 min ago", "yesterday". */
export function ago(at: number): string {
  const s = (at - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto", style: "short" });
  for (const [unit, n] of [["day", 86400], ["hour", 3600], ["minute", 60]] as const) if (Math.abs(s) >= n) return rtf.format(Math.round(s / n), unit);
  return "now";
}

/** One-line preview of the last message. */
export function preview(m: ChatMessage, me?: string): string {
  const mine = m.from === me;
  if (m.kind === "payment") return `${mine ? "You paid" : "Paid you"} ${formatMoney(BigInt(m.ref || "0"))}`;
  if (m.kind === "request") return `${mine ? "You asked for money" : "Asked you for money"}${m.body ? ` · ${m.body}` : ""}`;
  return `${mine ? "You: " : ""}${m.body}`;
}
