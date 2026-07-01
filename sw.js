/* BA Marathon — offline service worker.
   Strategy:
   - The HTML page (navigations) is NETWORK-FIRST: when you have signal you always
     get the freshly deployed index.html, so edits show up on next launch. Offline,
     it falls back to the cached copy.
   - Static assets (icons, manifest) are CACHE-FIRST: fast, and they rarely change.
   Bump CACHE to force a full refresh of the cached shell. */
const CACHE = "ba-marathon-v8";
const SHELL = [
  "./",
  "index.html",
  "manifest.json",
  "icon-180.png",
  "icon-192.png",
  "icon-512.png",
  "icon-512-maskable.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // cache individually so one missing/blocked file never fails the whole install
      .then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Network-first for the page itself so deployed updates appear when online.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("index.html", copy));
          return res;
        })
        .catch(() => caches.match("index.html").then((h) => h || caches.match("./")))
    );
    return;
  }

  // Cache-first for static assets.
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      return fetch(req)
        .then((res) => {
          if (res && res.ok && new URL(req.url).origin === self.location.origin) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => undefined);
    })
  );
});
