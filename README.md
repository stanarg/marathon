# BA42 — Stan's marathon companion

A zero-dependency, installable Progressive Web App for the Buenos Aires Marathon
2026 training block. No backend, no accounts, no tracking — everything lives in the
browser on your phone. Runs fully offline after the first load.

- **Stack:** vanilla HTML/CSS/JS (ES2022 modules). No framework, no build step, no dependencies.
- **Data:** three immutable JSON plan files in [`data/`](data/) are the read-only database.
- **Storage:** `localStorage` (versioned keys), with one-tap JSON backup/restore.
- **Spec:** built to `03_app_design.md` v2.0 WEB (the normative design).

## Install on iPhone

1. Open the site in **Safari**.
2. Tap the **Share** button → **Add to Home Screen**.
3. Launch **BA42** from the home-screen icon — it runs full-screen and works offline.

## Deploy to GitHub Pages

This folder (`ba42/`) is the repository root.

1. Create a repo and push this folder's contents to the `main` branch.
2. Repo → **Settings → Pages** → **Deploy from a branch** → `main` / **root** (`/`).
3. The app is served at `https://<username>.github.io/ba42/`.

All URLs are **relative**, so it works unchanged at that sub-path. After each deploy
that changes app files, bump `CACHE` in [`sw.js`](sw.js) (e.g. `ba42-v1` → `ba42-v2`)
so the service worker refreshes the cached shell on the next open.

> The `tests/` folder is harmless if served — it is dev-only and never loaded by the app.

## Develop & test

The app needs no tooling to run — open `index.html` from any static server. The pure
logic modules (`js/logic/`) are DOM-free and covered by Node's built-in test runner:

```sh
node --test tests/*.test.js
```

All logic in `js/logic/` is pure (no DOM, `localStorage`, `fetch`, or `Date.now()`);
I/O only enters through `store.js`, `dataLoader.js`, and `dateProvider.js`. All plan
logic runs on `America/Argentina/Buenos_Aires` civil dates.

Tip: append `?date=YYYY-MM-DD` to preview any day (pins "now" to that BA date).

## Manual acceptance checklist

Run these on the target device (iPhone/Safari) after deploying:

- [ ] Installs to the home screen and opens **standalone** (full-screen, no Safari chrome).
- [ ] **Airplane-mode relaunch** works fully (offline: shell, data, all screens).
- [ ] **Today** shows the correct session + window for the device date; rest days say so.
- [ ] Morning **check-in** → a readiness verdict (Ready / Caution / Unknown); a flagged
      day offers one-tap convert.
- [ ] **Log a session** (actuals + HR/RPE/pain) → Plan shows it ✓; an unlogged past
      session shows "unlogged" with one-tap **Missed**.
- [ ] **Fuel** on **2026-09-19** shows the carb-load checklist; race day shows the
      race-morning/in-race timeline; hydration `+250 ml` taps accumulate.
- [ ] **Trends** shows weekly planned-vs-done km, RHR/HRV/weight lines; after logging
      `w07s06` the **checkpoint panel** evaluates and lets you record a decision.
- [ ] **Backup**: Export downloads a JSON file; Import restores it (Settings).
- [ ] **No network requests** after first load (verify in Safari Web Inspector →
      Network while offline).

## Data & privacy

The three files in `data/` are generated artifacts and are **immutable** — never edit
them. User data (session logs, check-ins, hydration, weigh-ins, checkpoint, checklist)
stays in this browser only. Because browser storage can be evicted, the app requests
persistent storage on install, nags for a backup each Sunday, and offers export/import
in Settings — keep a recent backup file.
