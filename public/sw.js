/* Service worker de Popote : l'appli reste utilisable hors connexion.
 * - Pages : réseau d'abord, sinon la dernière version en cache (le menu et la liste
 *   de courses sont gardés dans le navigateur, donc consultables au magasin).
 * - Fichiers statiques (/_next/static, icônes) : cache d'abord.
 * - API : jamais mises en cache (prix et calculs toujours à jour).
 */
const VERSION = "mb-v3";
const PAGES = ["/", "/batch", "/placard", "/historique"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(PAGES).catch(() => undefined)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(VERSION).then((c) => c.put(req, copy));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("/"))),
    );
  }
});

/* Rappels : affichage des notifications envoyées par le serveur. */
self.addEventListener("push", (event) => {
  let data = { title: "Popote", body: "", url: "/" };
  try {
    data = { ...data, ...event.data.json() };
  } catch {
    /* notification sans contenu */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/favicon-32.png",
      data: { url: data.url },
      tag: "menu-budget-rappel",
      renotify: true,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const win = wins.find((w) => w.url.startsWith(self.location.origin));
      if (win) return win.focus().then(() => win.navigate(url));
      return self.clients.openWindow(url);
    }),
  );
});

