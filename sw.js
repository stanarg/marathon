// sw.js — service worker (§7). Cache-first app shell so BA42 works fully offline
// after the first load (mid-run in a park with no signal). Bump CACHE every deploy.
//
// All URLs are relative to the sw scope so it works at username.github.io/ba42/.

const CACHE = 'ba42-v3';

const ASSETS = [
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  // entry + I/O
  'js/main.js',
  'js/router.js',
  'js/dataLoader.js',
  'js/store.js',
  'js/dateProvider.js',
  // pure logic
  'js/logic/validator.js',
  'js/logic/dateUtil.js',
  'js/logic/shiftCalendar.js',
  'js/logic/dayTypeResolver.js',
  'js/logic/fuelingService.js',
  'js/logic/formatters.js',
  'js/logic/readinessEngine.js',
  'js/logic/safetyRules.js',
  'js/logic/checkpointEvaluator.js',
  'js/logic/compliance.js',
  'js/logic/strengthProgram.js',
  // views
  'js/views/todayView.js',
  'js/views/planView.js',
  'js/views/sessionDetail.js',
  'js/views/fuelView.js',
  'js/views/trendsView.js',
  'js/views/settingsView.js',
  // components
  'js/components/ui.js',
  'js/components/chart.js',
  // data (the read-only database)
  'data/workout_plan.json',
  'data/nutrition_plan.json',
  'data/athlete_profile.json',
  // icons
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'icons/favicon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).catch(() => {
        // Offline and uncached: fall back to the app shell for navigations.
        if (req.mode === 'navigate') return caches.match('index.html');
        return Response.error();
      });
    })
  );
});
