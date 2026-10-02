// Kin service worker: push notifications only (no offline caching).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let m = {};
  try {
    m = e.data ? e.data.json() : {};
  } catch {
    m = { body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(m.title || "Kin", {
      body: m.body || "",
      icon: "/maskable-192.png",
      badge: "/icon-192.png",
      tag: m.tag,
      data: { url: m.url || "/home" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/home", self.location.origin).href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const w = list.find((c) => c.url.startsWith(self.location.origin));
      if (!w) return self.clients.openWindow(url);
      return w.focus().then((c) => (c.navigate ? c.navigate(url) : c)).catch(() => self.clients.openWindow(url));
    }),
  );
});
