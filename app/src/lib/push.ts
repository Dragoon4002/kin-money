"use client";
import { api } from "./contacts";

// Web push for this browser (service worker in public/sw.js, server in lib/server/push.ts).

export type PushState = "unsupported" | "denied" | "off" | "on";
const KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(KEY);
const current = async () => (await navigator.serviceWorker.getRegistration())?.pushManager.getSubscription() ?? null;
/** base64url → bytes (applicationServerKey). */
const bytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

/** iPhone/iPad outside the home-screen app: push only works once Kin is added to the home screen. */
export const iosNeedsInstall = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) &&
  !(matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone);

export async function pushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return Notification.permission === "granted" && (await current()) ? "on" : "off";
}

/** Ask permission, subscribe, and register this device with the server. */
export async function enablePush(): Promise<PushState> {
  if (!supported()) return "unsupported";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  await navigator.serviceWorker.register("/sw.js");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: bytes(KEY) }));
  await api("/api/push/subscribe", "POST", { kind: "web", subscription: sub.toJSON() });
  return "on";
}

export async function disablePush(): Promise<void> {
  const sub = await current();
  if (!sub) return;
  await api("/api/push/subscribe", "DELETE", { kind: "web", subscription: sub.toJSON() }).catch(() => {});
  await sub.unsubscribe();
}
