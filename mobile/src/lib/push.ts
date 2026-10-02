import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { router, type Href } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { api } from "./contacts";
import { API_BASE } from "./config";

// Push: Expo push token → signed POST /api/push/subscribe. Android delivery needs FCM V1 creds on EAS (see PUSH_SETUP.md).
// Every step degrades silently: no permission / no token / server down = no pushes, never a crash.

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

const channel = Platform.OS === "android"
  ? Notifications.setNotificationChannelAsync("payments", { name: "Payments", importance: Notifications.AndroidImportance.HIGH }).catch(() => null)
  : Promise.resolve(null);

let registered = false;

/** Token → server. Only call when unlocked (signing would otherwise prompt Face ID). */
async function register() {
  if (registered) return;
  try {
    await channel;
    const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    await api("/api/push/subscribe", "POST", { kind: "expo", token });
    registered = true;
  } catch {} // ponytail: retried next app start; no FCM creds / Expo Go just means no pushes
}

/** "ask" = show the explain card first; "granted" registers silently; "no" = denied for good. */
export function usePush(unlocked: boolean) {
  const [state, setState] = useState<"ask" | "granted" | "no" | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    let live = true;
    channel
      .then(() => Notifications.getPermissionsAsync())
      .then((p) => {
        if (!live) return;
        setState(p.granted ? "granted" : p.canAskAgain ? "ask" : "no");
        if (p.granted) void register();
      })
      .catch(() => live && setState("no"));
    return () => {
      live = false;
    };
  }, [unlocked]);

  async function allow() {
    const p = await Notifications.requestPermissionsAsync().catch(() => null);
    setState(p?.granted ? "granted" : "no");
    if (p?.granted) void register();
  }
  return { ask: state === "ask", allow, dismiss: () => setState("no") };
}

const NATIVE = ["/activity", "/home", "/send"];

/** Open a notification's `data.url`: native screen if we have one, else the web app in a Custom Tab. */
function open(url: unknown) {
  if (typeof url !== "string" || !url) return;
  // ponytail: string parse, RN's URL polyfill is partial. Only our own pages; anything else is ignored.
  const path = url.startsWith(API_BASE + "/") ? url.slice(API_BASE.length) : url.startsWith("/") && !url.startsWith("//") ? url : null;
  if (!path) return;
  if (NATIVE.includes(path.split("?")[0])) router.push(path as Href);
  else void WebBrowser.openBrowserAsync(API_BASE + path);
}

const seen = new Set<string>();
function handle(r: Notifications.NotificationResponse | null | undefined) {
  if (!r || seen.has(r.notification.request.identifier)) return;
  seen.add(r.notification.request.identifier);
  open(r.notification.request.content.data?.url);
}

/** Route notification taps (incl. the one that cold-started the app). Mount once on a screen inside the navigator. */
export function useNotificationTaps() {
  useEffect(() => {
    handle(Notifications.getLastNotificationResponse());
    const sub = Notifications.addNotificationResponseReceivedListener(handle);
    return () => sub.remove();
  }, []);
}
