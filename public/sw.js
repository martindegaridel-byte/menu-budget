/* Service worker de Popote : l'appli reste utilisable hors connexion.
 * - Pages : réseau d'abord, sinon la dernière version en cache. Une page n'est gardée
 *   qu'avec ses fichiers (scripts, styles), sinon elle s'afficherait sans pouvoir réagir.
 * - Page jamais ouverte, hors connexion : page « Pas de connexion » (/offline.html).
 * - Recettes du menu en cours : préparées d'avance (message « warm » envoyé par l'appli).
 * - Fichiers statiques (/_next/static, icônes, photos des plats) : cache d'abord.
 * - API : jamais mises en cache (prix et calculs toujours à jour).
 */
const VERSION = "mb-v5";
const OFFLINE = "/offline.html";

/** Fichiers statiques référencés par une page (scripts, styles, polices). */
const assetsOf = (html) => [...new Set([...html.matchAll(/["'(](\/_next\/static\/[^"'()\s]+)/g)].map((m) => m[1]))];

/** Met une page en cache avec tous ses fichiers ; sans eux elle ne serait pas utilisable hors connexion. */
async function cachePage(url) {
  const cache = await caches.open(VERSION);
  const res = await fetch(url, { credentials: "same-origin" });
  if (!res.ok || !(res.headers.get("content-type") || "").includes("text/html")) return;
  const html = await res.clone().text();
  const missing = [];
  for (const a of assetsOf(html)) if (!(await cache.match(a))) missing.push(a);
  await Promise.all(missing.map((a) => fetch(a).then((r) => (r.ok ? cache.put(a, r) : undefined)).catch(() => undefined)));
  await cache.put(url, res);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((c) => c.add(OFFLINE))
      .then(() => cachePage("/"))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

/* L'appli demande de préparer des pages (recettes du menu en cours) pour le hors connexion. */
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "warm" || !Array.isArray(data.urls)) return;
  const urls = data.urls.filter((u) => typeof u === "string" && u.startsWith("/") && !u.startsWith("/api/")).slice(0, 30);
  event.waitUntil(
    caches.open(VERSION).then(async (cache) => {
      for (const u of urls) if (!(await cache.match(u))) await cachePage(u).catch(() => undefined);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/") || url.pathname.startsWith("/photos/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(VERSION).then((c) => c.put(req, copy));
            }
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
          // Page vue en ligne : ses fichiers sont chargés juste après et mis en cache par la règle ci-dessus.
          if (res.ok) {
            const copy = res.clone();
            const forAssets = res.clone();
            caches.open(VERSION).then(async (c) => {
              await c.put(req, copy);
              // Ses fichiers aussi (ceux déjà servis par le cache du navigateur n'y passeraient pas sinon).
              const html = await forAssets.text();
              for (const a of assetsOf(html)) if (!(await c.match(a))) await fetch(a).then((r) => (r.ok ? c.put(a, r) : undefined)).catch(() => undefined);
            });
          }
          return res;
        })
        .catch(async () => {
          // Même page (même adresse), sinon même page avec d'autres paramètres (recette pour 2 au lieu de 4…),
          // sinon la page « Pas de connexion » : jamais une autre page à la place, jamais une page sans ses fichiers.
          return (await caches.match(req)) || (await caches.match(req, { ignoreSearch: true })) || (await caches.match(OFFLINE));
        }),
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

