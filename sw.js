/* BA Marathon v2 — offline service worker.
   Strategy (proven in v1, adapted for multi-file):
   - Navigations are NETWORK-FIRST: online you always get the freshly deployed
     index.html; offline it falls back to the cached copy.
   - Static assets are CACHE-FIRST. Asset URLs are version-stamped (?v=N) and
     pre-cached, so a fresh index.html can never pair with a stale app.js:
     new stamps miss the old cache and fall through to the network.
   DEPLOY RITUAL: bump CACHE here + APP_VERSION in data.js + ?v= stamps in index.html. */
const CACHE = "bam2-v15";
const SHELL = [
  "./",
  "index.html",
  "styles.css?v=15",
  "data.js?v=15",
  "engine.js?v=15",
  "app.js?v=15",
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
          // only cache a good page — never let a transient 404/500/redirect poison the shell
          if (res && res.ok && !res.redirected) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("index.html", copy));
          }
          return res;
        })
        .catch(() => caches.match("index.html").then((h) => h || caches.match("./")))
    );
    return;
  }

  // Cache-first for static assets. NO ignoreSearch — the ?v= stamp IS the cache key,
  // which is what makes stale-HTML/fresh-JS pairings impossible.
  e.respondWith(
    caches.match(req).then((hit) => {
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
