/* SportsPulse web push service worker (FR-3.10.2, FR-3.21.2).
 * Shows each push the API sends (payload: { title, body, url, tag,
 * notificationId }) and opens its link on click. Open pages also get a
 * "push" message so they can refresh their inbox. No caching, no fetch
 * handler: this worker only handles push. */

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "SportsPulse", body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "SportsPulse";
  const options = {
    body: data.body || "",
    tag: data.notificationId || data.tag || undefined,
    data: { url: data.url || "/notifications", notificationId: data.notificationId || null }
  };
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
        for (const c of list) c.postMessage({ type: "push", title, body: options.body, notificationId: options.data.notificationId });
      })
    ])
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/notifications";
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url === target && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
