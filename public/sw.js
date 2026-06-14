/* Service worker — makes the app installable and lets Pass & Play work offline.
 * Bump CACHE when you change static assets. */
const CACHE = "namegame-v1";
const SHELL = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/rules.js",
  "/js/app.js",
  "/js/online.js",
  "/js/effects.js",
  "/icon.svg",
  "/manifest.webmanifest",
  "/data/athletes.json",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // Never touch socket.io / cross-origin / non-GET — those must hit the network.
  if (
    e.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/socket.io/")
  ) {
    return;
  }
  // App shell + data: cache-first, fall back to network and cache the result.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => {
          // Offline navigation falls back to the cached app shell.
          if (e.request.mode === "navigate") return caches.match("/index.html");
        });
    })
  );
});
