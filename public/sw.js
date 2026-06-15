/* Service worker — installable + offline support.
 * Strategy:
 *   - App code (html/js/css): NETWORK-FIRST, so deploys show up immediately
 *     online; falls back to cache when offline.
 *   - Big rarely-changing assets (athletes.json, icon): CACHE-FIRST for speed.
 * Bump CACHE to force a clean refresh of cached assets. */
const CACHE = "namegame-v3";
const SHELL = [
  "/",
  "/index.html",
  "/css/styles.css",
  "/js/config.js",
  "/js/socket.io.min.js",
  "/js/rules.js",
  "/js/app.js",
  "/js/online.js",
  "/js/daily.js",
  "/js/effects.js",
  "/icon.svg",
  "/manifest.webmanifest",
  "/data/athletes.json",
];
const CACHE_FIRST = ["/data/athletes.json", "/icon.svg", "/manifest.webmanifest"];

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
  if (
    e.request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/socket.io/")
  ) {
    return;
  }

  const put = (res) => {
    if (res && res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
    }
    return res;
  };

  // Cache-first for big, stable assets.
  if (CACHE_FIRST.indexOf(url.pathname) !== -1) {
    e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request).then(put)));
    return;
  }

  // Network-first for everything else (code + navigation).
  e.respondWith(
    fetch(e.request)
      .then(put)
      .catch(() =>
        caches.match(e.request).then((hit) => {
          if (hit) return hit;
          if (e.request.mode === "navigate") return caches.match("/index.html");
        })
      )
  );
});
