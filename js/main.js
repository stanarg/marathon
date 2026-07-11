// main.js — boot + app wiring (§3, §5). Loads and validates plan data, builds the
// app context, and starts the hash router. The service worker registers in M7.

import { loadPlans } from './dataLoader.js';
import { validate } from './logic/validator.js';
import { createStore } from './store.js';
import { createDateProvider, dateProvider as realClock } from './dateProvider.js';
import { createShiftCalendar } from './logic/shiftCalendar.js';
import { dayPlan } from './logic/fuelingService.js';
import { dayType } from './logic/dayTypeResolver.js';
import { evaluate as evaluateReadiness } from './logic/readinessEngine.js';
import { advisories as computeAdvisories } from './logic/safetyRules.js';
import { evaluate as evaluateCheckpoint } from './logic/checkpointEvaluator.js';
import { createRouter } from './router.js';
import { el, card, clear, h, muted, link } from './components/ui.js';
import { isValidISODate, diffDays } from './logic/dateUtil.js';

import * as todayView from './views/todayView.js';
import * as planView from './views/planView.js';
import * as sessionDetail from './views/sessionDetail.js';
import * as fuelView from './views/fuelView.js';
import * as trendsView from './views/trendsView.js';
import * as settingsView from './views/settingsView.js';

const view = () => document.getElementById('view');

function renderLoading() {
  clear(view());
  view().append(card([muted('Loading plan…')]));
}

function renderDiagnostic(errors) {
  document.body.classList.add('boot-error');
  clear(view());
  const list = el('ul', { class: 'error-list' });
  for (const e of errors) list.append(el('li', { text: e }));
  view().append(card([
    h(2, '⚠︎ Plan validation failed'),
    muted('The app will not run until the data files are consistent (§5.1). Fix the plan pipeline and reload.'),
    list,
  ], 'diagnostic'));
}

// A preview override for verifying any civil date: ?date=YYYY-MM-DD pins "now" to
// BA noon on that date. With no param the real clock is used.
function resolveDateProvider() {
  try {
    const q = new URLSearchParams(location.search).get('date');
    if (q && isValidISODate(q)) return createDateProvider({ fixedNow: `${q}T12:00:00-03:00` });
  } catch {
    /* ignore */
  }
  return realClock;
}

function buildContext(plans, store, dp) {
  const shiftCal = createShiftCalendar({
    startDate: plans.workoutPlan.start_date,
    workSchedule: plans.athleteProfile.work_schedule,
  });
  const ctx = {
    plans,
    store,
    dateProvider: dp,
    shiftCal,
    refresh: () => {}, // wired to router.render() in startRouter()
    today: () => dp.today(),
    clock: () => dp.clock(),
    dayType: (date) => dayType(date, plans.workoutPlan, plans.nutritionPlan),
    dayPlan: (date) => dayPlan(date, plans, store),
    checkins: () => store.get('checkins') || {},
    readiness: (date) => evaluateReadiness(date, store.get('checkins') || {}),
    sessionLogs: () => store.get('sessionLogs') || {},
  };

  // Persist a morning check-in and stamp its computed readiness verdict (§5.5/§5.6).
  ctx.saveCheckin = (input) => {
    const date = input.date;
    const entry = {
      date,
      rhr: input.rhr ?? null,
      sleepHours: input.sleepHours ?? null,
      hrvMs: input.hrvMs ?? null,
    };
    const checkins = { ...ctx.checkins(), [date]: entry };
    const verdict = evaluateReadiness(date, checkins);
    entry.status = verdict.status;
    entry.reasons = verdict.reasons;
    checkins[date] = entry;
    store.set('checkins', checkins);
  };

  // --- Checkpoint (§5.9): ba42.checkpoint holds the CheckpointResult + manual ticks.
  const checkpointSessionId = () => (plans.workoutPlan.checkpoint || {}).session_id;
  function persistCheckpoint(next = {}) {
    const state = store.get('checkpoint') || {};
    const manual = { ...(state.manual || {}), ...(next.manual || {}) };
    const core = evaluateCheckpoint(store.get('sessionLogs') || {}, store.get('checkins') || {}, plans.workoutPlan, manual);
    store.set('checkpoint', {
      evaluatedAt: state.evaluatedAt || dp.isoNow(),
      manual,
      criteria: core.criteria,
      outcome: core.outcome,
      userDecision: 'userDecision' in next ? next.userDecision : state.userDecision || null,
    });
  }
  // Live result for the panel (always recomputed from current logs/checkins/manual).
  ctx.checkpointResult = () => {
    const state = store.get('checkpoint') || {};
    const core = evaluateCheckpoint(store.get('sessionLogs') || {}, store.get('checkins') || {}, plans.workoutPlan, state.manual || {});
    return { ...core, manual: state.manual || {}, userDecision: state.userDecision || null, evaluatedAt: state.evaluatedAt || null };
  };
  ctx.setCheckpointManual = (patch) => persistCheckpoint({ manual: patch });
  ctx.setCheckpointDecision = (decision) => persistCheckpoint({ userDecision: decision });

  // Write (or patch) a completed SessionLog (§5.7). `fields` includes status + actuals.
  ctx.saveSessionLog = (sessionId, fields) => {
    const logs = { ...ctx.sessionLogs() };
    logs[sessionId] = { ...(logs[sessionId] || {}), sessionId, ...fields, loggedAt: dp.isoNow() };
    store.set('sessionLogs', logs);
    // Saving the checkpoint run (w07s06) triggers evaluation (§5.9).
    if (sessionId === checkpointSessionId()) persistCheckpoint();
  };
  // Missed (§5.7) and one-tap conversion (§5.6) REPLACE the log wholesale — a session
  // that was not performed (or was swapped) must carry no stale actuals/pain, otherwise
  // safetyRules would count pain flags from a session that never happened.
  ctx.writeStatusLog = (sessionId, status) => {
    const logs = { ...ctx.sessionLogs() };
    logs[sessionId] = { sessionId, status, loggedAt: dp.isoNow() };
    store.set('sessionLogs', logs);
  };
  ctx.convertSession = (sessionId, status) => ctx.writeStatusLog(sessionId, status);
  ctx.markMissed = (sessionId) => ctx.writeStatusLog(sessionId, 'missed');
  // Safety advisories for a date (§5.8).
  ctx.advisories = (date) => computeAdvisories(store.get('sessionLogs') || {}, date, plans.workoutPlan);

  // Hydration (§6): per-day cumulative ml, +250/+500 taps.
  ctx.hydration = (date) => (store.get('hydration') || {})[date] || 0;
  ctx.addHydration = (date, deltaMl) => {
    const all = { ...(store.get('hydration') || {}) };
    all[date] = Math.max(0, (all[date] || 0) + deltaMl);
    store.set('hydration', all);
  };

  // Weigh-ins (§1/§4): Sunday pre-long-run weight. Passing kg=null removes the
  // entry — the only way to delete a mistyped weigh-in.
  ctx.weighins = () => store.get('weighins') || {};
  ctx.saveWeighIn = (date, kg) => {
    const all = { ...ctx.weighins() };
    if (kg == null) delete all[date];
    else all[date] = kg;
    store.set('weighins', all);
  };

  // Race-week checklist ticks (§1/§6): { [itemId]: true }.
  ctx.checklist = () => store.get('checklist') || {};
  ctx.toggleChecklist = (itemId, on) => {
    const all = { ...ctx.checklist() };
    if (on) all[itemId] = true;
    else delete all[itemId];
    store.set('checklist', all);
  };

  // Backup / restore / reset / storage (§6, §7).
  ctx.exportBackup = () => store.exportBlob();
  ctx.markBackedUp = () => store.markBackedUp();
  ctx.importBackup = (json) => store.importBlob(json); // throws on invalid/incompatible
  ctx.storageStatus = () => {
    const meta = store.get('meta') || {};
    return { bytes: store.usageBytes(), lastBackupAt: meta.lastBackupAt || null, installedAt: meta.installedAt || null };
  };
  ctx.resetUserData = () => {
    for (const key of ['sessionLogs', 'checkins', 'hydration', 'weighins', 'decisions', 'checklist']) store.set(key, {});
    store.set('checkpoint', null);
  };
  // First-boot install intro (§6): dismissible, tracked in meta.
  ctx.installIntroDismissed = () => !!(store.get('meta') || {}).installIntroDismissed;
  ctx.dismissInstallIntro = () => {
    const meta = store.get('meta') || {};
    store.set('meta', { ...meta, installIntroDismissed: true });
  };
  // Backup nag (§6): true when never backed up or the last backup is > 7 days old.
  // Compare against the BA civil date of the backup instant (not a UTC slice); an
  // unparseable stamp (e.g. from a hand-edited backup) is treated as "never".
  ctx.backupNagDue = (date) => {
    const meta = store.get('meta') || {};
    const last = meta.lastBackupAt && dp.dateOf(meta.lastBackupAt);
    if (!last) return true;
    return diffDays(date, last) > 7;
  };

  return ctx;
}

function startRouter(ctx) {
  const routes = [
    { pattern: /^\/today$/, handler: () => todayView.render(ctx) },
    { pattern: /^\/plan$/, handler: () => planView.renderWeeks(ctx) },
    { pattern: /^\/plan\/week\/(?<index>\d+)$/, handler: (p) => planView.renderWeek(ctx, Number(p.index)) },
    { pattern: /^\/session\/(?<id>w\d{2}s\d{2})$/, handler: (p) => sessionDetail.render(ctx, p.id) },
    { pattern: /^\/fuel$/, handler: () => fuelView.render(ctx) },
    { pattern: /^\/trends$/, handler: () => trendsView.render(ctx) },
    { pattern: /^\/settings$/, handler: () => settingsView.render(ctx) },
  ];
  const fallback = (p) =>
    p && p.error
      ? card([h(2, '⚠︎ Something broke'), muted(String((p.error && p.error.message) || p.error))], 'diagnostic')
      : card([h(2, 'Not found'), muted(`No route for ${(p && p.path) || ''}`), link('← Today', '#/today')]);
  const router = createRouter({ mount: view(), routes, fallback });
  // Views call ctx.refresh() to re-render after a mutation; also re-sync the drawer
  // "decision pending" dot so a same-route change (e.g. recording a decision) updates it.
  ctx.refresh = () => { router.render(); updateTrendsDot(); };
  router.start();
}

async function boot() {
  renderLoading();
  const dp = resolveDateProvider();
  // The store always stamps timestamps with the REAL wall clock — never the
  // ?date preview clock — so previewing a future date can't write fictional
  // instants (e.g. a future lastBackupAt) into real storage. Civil dates for
  // display/logic come from dp; instants are converted to BA dates via dp.dateOf.
  const store = createStore({ now: () => realClock.isoNow() });
  store.ensureInitialized();

  let plans;
  try {
    plans = await loadPlans();
  } catch (e) {
    renderDiagnostic([`Failed to load plan data: ${e.message}`]);
    return;
  }

  const result = validate(plans.workoutPlan, plans.nutritionPlan, plans.athleteProfile);
  if (!result.ok) {
    renderDiagnostic(result.errors);
    return;
  }

  const ctx = buildContext(plans, store, dp);
  window.BA42 = ctx; // for manual inspection in DevTools / later milestones
  startRouter(ctx);
  updateTrendsDot();
}

// --- App shell: slide-out navigation drawer ---------------------------------
function initDrawer() {
  const btn = document.getElementById('menu-btn');
  const drawer = document.getElementById('drawer');
  const scrim = document.getElementById('scrim');
  if (!btn || !drawer || !scrim) return;

  let open = false;
  const setOpen = (v) => {
    open = v;
    drawer.classList.toggle('open', v);
    scrim.classList.toggle('show', v);
    btn.classList.toggle('is-open', v);
    btn.setAttribute('aria-expanded', String(v));
    btn.setAttribute('aria-label', v ? 'Close menu' : 'Open menu');
    drawer.setAttribute('aria-hidden', String(!v));
    document.documentElement.style.overflow = v ? 'hidden' : '';
    if (v) {
      const first = drawer.querySelector('a.tab');
      if (first) first.focus();
    } else {
      btn.focus();
    }
  };

  btn.addEventListener('click', () => setOpen(!open));
  scrim.addEventListener('click', () => setOpen(false));
  drawer.addEventListener('click', (e) => {
    if (e.target.closest('a.tab')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) setOpen(false);
  });

  reflectActiveTab();
  window.addEventListener('hashchange', reflectActiveTab);
}

function reflectActiveTab() {
  let seg = location.hash.replace(/^#\//, '').split('/')[0] || 'today';
  if (seg === 'session') seg = 'plan'; // session detail lives under Plan
  for (const a of document.querySelectorAll('.drawer a.tab')) {
    if (a.getAttribute('data-tab') === seg) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  updateTrendsDot();
}

// "Trends badge until decided" (§5.9): a dot on the Trends link while the checkpoint
// has been evaluated but no race-plan decision has been recorded yet.
function updateTrendsDot() {
  const ctx = window.BA42;
  const link = document.querySelector('.drawer a[data-tab="trends"]');
  if (!link || !ctx || typeof ctx.checkpointResult !== 'function') return;
  const r = ctx.checkpointResult();
  link.classList.toggle('has-dot', !!(r.triggered && !r.userDecision));
}

// --- PWA surface (§7): offline service worker + durable storage ------------
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed:', e));
    });
  }
}

async function requestPersistence() {
  try {
    if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
  } catch {
    /* best-effort; storage still works without the durable grant */
  }
}

function startApp() {
  initDrawer();
  registerServiceWorker();
  requestPersistence();
  boot();
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
  } else {
    startApp();
  }
}
