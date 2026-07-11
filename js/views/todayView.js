// todayView.js — the daily operating surface (§6). Through Milestone 3: morning
// check-in card / readiness card, day summary, today's session(s), and the fuel
// card (next meal by clock). Session logging (M4) and hydration (M5) attach later.

import { el, card, badge, h, muted, kv, navRow, button } from '../components/ui.js';
import { formatKm, formatDuration, formatKcal, formatGrams, humanizeId, formatWindow, formatFluidRangeL } from '../logic/formatters.js';
import { dayName, compare } from '../logic/dateUtil.js';

const DAYTYPE_KIND = {
  race: 'badge-danger', carb_load: 'badge-warn', quality: 'badge-warn',
  long_high: 'badge-warn', long_std: 'badge-ok', easy: 'badge-ok', rest: '',
};
const RUN_TYPES = ['run_easy', 'run_strides', 'run_quality', 'long_run'];

// View-local UI state: whether the check-in form is force-shown for editing.
// Reset on real navigation (a hashchange) so a half-open edit form never persists
// across routes — but NOT on ctx.refresh() (a same-route re-render), which is a
// direct render() call and fires no hashchange, so the edit stays open while editing.
let editingCheckin = false;
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => { editingCheckin = false; });
}

function parseNum(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function field(labelText, input, hint) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: labelText }),
    input,
    hint ? el('span', { class: 'field-hint', text: hint }) : null,
  ].filter(Boolean));
}

export function sessionRow(session) {
  const left = el('div', { class: 'row-lead' }, [
    el('span', { class: 'row-window', text: `${formatWindow(session.window)} ${session.start_time}` }),
  ]);
  const parts = [];
  if (session.distance_km != null) parts.push(formatKm(session.distance_km));
  parts.push(formatDuration(session.duration_min));
  if (session.zone) parts.push(session.zone);
  const body = el('div', { class: 'row-body' }, [
    el('span', { class: 'row-title', text: session.title }),
    muted(parts.join(' · ')),
  ]);
  return navRow([left, body, el('span', { class: 'row-chev', text: '›' })], `#/session/${session.id}`);
}

function nextMeal(meals, clock) {
  if (!meals || !meals.length) return null;
  return meals.find((m) => m.time >= clock) || meals[meals.length - 1];
}

// --- Advisory banners (§5.8) -----------------------------------------------
const ADVISORY_TITLE = {
  weekly_downshift: 'Downshift suggested',
  bone_stress: 'Bone-stress signal',
  bone_stress_recurrence: 'Medical review',
  missed_repeat_week: 'Missed sessions',
};
const SEVERITY_KIND = { critical: 'badge-danger', warning: 'badge-warn', info: '' };

function renderAdvisory(ctx, adv) {
  const children = [
    el('div', { class: 'card-head' }, [h(3, ADVISORY_TITLE[adv.id] || 'Advisory'), badge(adv.severity, SEVERITY_KIND[adv.severity] || '')]),
    el('p', { text: adv.text }),
  ];
  const action = adv.suggestedAction;
  if (action && action.kind === 'convert_session') {
    children.push(el('div', { class: 'form-actions' }, [
      button(action.label || 'Apply', () => { ctx.convertSession(action.sessionId, action.to); ctx.refresh(); }),
    ]));
  }
  return card(children, `banner banner-${adv.severity}`);
}

// --- Morning check-in form (§5.5) ------------------------------------------
function renderCheckInForm(ctx, existing) {
  const date = ctx.today();
  const isEdit = !!existing; // editing an already-saved check-in vs the first entry today
  const rhr = el('input', { type: 'number', inputmode: 'numeric', min: '30', max: '120', class: 'field-input', placeholder: 'e.g. 51', value: existing && existing.rhr != null ? existing.rhr : null });
  const sleep = el('input', { type: 'number', inputmode: 'decimal', step: '0.5', min: '0', max: '16', class: 'field-input', placeholder: 'e.g. 7.5', value: existing && existing.sleepHours != null ? existing.sleepHours : null });
  const hrv = el('input', { type: 'number', inputmode: 'numeric', min: '0', max: '300', class: 'field-input', placeholder: 'optional', value: existing && existing.hrvMs != null ? existing.hrvMs : null });
  const err = el('p', { class: 'field-error', hidden: true });

  const save = button('Save check-in', () => {
    const r = parseNum(rhr.value);
    if (r == null) {
      err.textContent = 'Enter your resting HR (bpm) — it drives the readiness verdict.';
      err.hidden = false;
      return;
    }
    ctx.saveCheckin({ date, rhr: r, sleepHours: parseNum(sleep.value), hrvMs: parseNum(hrv.value) });
    editingCheckin = false;
    ctx.refresh();
  });
  // First entry today → "Skip today" (records an unknown check-in so it stops nagging).
  // Editing an existing entry → "Cancel" (non-destructive; never wipes saved metrics).
  const secondary = isEdit
    ? button('Cancel', () => { editingCheckin = false; ctx.refresh(); }, 'btn-ghost')
    : button('Skip today', () => { ctx.saveCheckin({ date }); editingCheckin = false; ctx.refresh(); }, 'btn-ghost');

  return card([
    el('div', { class: 'card-head' }, [h(3, isEdit ? 'Edit check-in' : 'Morning check-in'), badge('today', '')]),
    muted('Read these off your watch / Health app in a few seconds.'),
    el('div', { class: 'field-grid' }, [
      field('Resting HR (bpm)', rhr, 'required'),
      field('Sleep (hours)', sleep, 'optional'),
      field('HRV (ms)', hrv, 'optional'),
    ]),
    err,
    el('div', { class: 'form-actions' }, [save, secondary]),
  ]);
}

// --- Readiness card (§5.6) -------------------------------------------------
function readinessConversion(ctx, dp) {
  const runs = dp.sessions.filter((s) => RUN_TYPES.includes(s.type));
  if (!runs.length) return muted('No run scheduled today to convert.');

  const logs = ctx.sessionLogs();
  const pending = runs.filter((s) => !logs[s.id]); // not yet logged/converted/missed
  if (!pending.length) {
    return el('p', { class: 'note', text: "Today's run is already logged — see it in Plan." });
  }

  const convertPending = (status) => {
    pending.forEach((s) => ctx.convertSession(s.id, status));
    ctx.refresh();
  };
  return el('div', { class: 'form-actions' }, [
    button('Convert to Z1 cross', () => convertPending('converted_cross')),
    button('Make it an easy run', () => convertPending('converted_easy'), 'btn-ghost'),
  ]);
}

function renderReadinessCard(ctx, dp) {
  const date = ctx.today();
  const v = ctx.readiness(date);
  const checkin = ctx.checkins()[date] || {};

  const KIND = {
    normal: { badge: 'badge-ok', label: 'Ready' },
    flagged: { badge: 'badge-warn', label: 'Caution' },
    unknown: { badge: '', label: 'Unknown' },
  }[v.status];

  const children = [el('div', { class: 'card-head' }, [h(3, 'Readiness'), badge(KIND.label, KIND.badge)])];

  if (v.status === 'unknown') {
    children.push(muted('Add your resting HR for a readiness verdict.'));
    children.push(el('div', { class: 'form-actions' }, [
      button('Add check-in', () => { editingCheckin = true; ctx.refresh(); }),
    ]));
    return card(children);
  }

  // Recorded metrics
  children.push(kv([
    ['RHR', checkin.rhr != null ? `${checkin.rhr} bpm` : '—'],
    ['Sleep', checkin.sleepHours != null ? `${checkin.sleepHours} h` : '—'],
    ['HRV', checkin.hrvMs != null ? `${checkin.hrvMs} ms` : '—'],
  ]));

  if (v.status === 'flagged') {
    const list = el('ul', { class: 'reason-list' });
    for (const r of v.reasons) list.append(el('li', { text: r }));
    children.push(list);
    children.push(muted('Suggestion: convert today to Z1 cross or an easy run. This never blocks you.'));
    children.push(readinessConversion(ctx, dp));
  } else {
    children.push(muted('Good to train as planned.'));
  }

  children.push(el('button', { class: 'link-btn', type: 'button', onClick: () => { editingCheckin = true; ctx.refresh(); }, text: 'Edit check-in' }));
  return card(children, v.status === 'flagged' ? 'readiness-flagged' : '');
}

// --- Hydration card (§6) ---------------------------------------------------
function renderHydrationCard(ctx, dp) {
  const date = ctx.today();
  const cur = ctx.hydration(date);
  const t = dp.hydrationTargetMl;
  const range = t ? t.range : [3000, 3500];
  const max = t ? t.max : 3500;
  const pct = Math.min(100, Math.round((cur / max) * 100));
  const met = t && cur >= t.min;

  const bar = el('div', { class: 'meter' }, [
    el('div', { class: `meter-fill${met ? ' meter-fill-ok' : ''}`, style: `width:${pct}%` }),
  ]);
  const addBtn = (ml, cls) => button(`+${ml} ml`, () => { ctx.addHydration(date, ml); ctx.refresh(); }, cls);

  return card([
    el('div', { class: 'card-head' }, [h(3, 'Hydration'), badge(`${(cur / 1000).toFixed(2)} L`, met ? 'badge-ok' : '')]),
    muted(`Target ${formatFluidRangeL(range)} today`),
    bar,
    el('div', { class: 'form-actions' }, [
      addBtn(250), addBtn(500),
      button('−250 ml', () => { ctx.addHydration(date, -250); ctx.refresh(); }, 'btn-ghost'),
    ]),
  ]);
}

// --- First-boot install intro (§6) -----------------------------------------
function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}

function renderInstallIntro(ctx) {
  if (isStandalone() || ctx.installIntroDismissed()) return null;
  return card([
    el('div', { class: 'card-head' }, [h(3, 'Add BA42 to your home screen'), badge('tip', '')]),
    muted('In Safari: tap Share → “Add to Home Screen”, then launch from the icon for full-screen, offline use.'),
    el('div', { class: 'form-actions' }, [button('Got it', () => { ctx.dismissInstallIntro(); ctx.refresh(); }, 'btn-ghost')]),
  ]);
}

// --- Next-day soreness prompt (§5.9) ---------------------------------------
function renderSorenessPrompt(ctx) {
  const cp = ctx.plans.workoutPlan.checkpoint;
  const r = ctx.checkpointResult();
  // Only after the checkpoint run is logged, from the day after it, until answered.
  if (!r.triggered || (r.manual && r.manual.sorenessOk != null) || compare(ctx.today(), cp.date) <= 0) return null;
  return card([
    el('div', { class: 'card-head' }, [h(3, 'Checkpoint soreness check'), badge('checkpoint', 'badge-warn')]),
    muted('How sore are you from the checkpoint long run today? The plan wants ≤ 2/10.'),
    el('div', { class: 'form-actions' }, [
      button('≤ 2/10 — fine', () => { ctx.setCheckpointManual({ sorenessOk: true }); ctx.refresh(); }),
      button('Worse than 2/10', () => { ctx.setCheckpointManual({ sorenessOk: false }); ctx.refresh(); }, 'btn-ghost'),
    ]),
  ], 'banner banner-warning');
}

// --- Sunday backup nag (§6) ------------------------------------------------
function renderBackupNag(ctx) {
  const date = ctx.today();
  if (dayName(date) !== 'Sun' || !ctx.backupNagDue(date)) return null;
  return card([
    el('div', { class: 'card-head' }, [h(3, 'Back up your data'), badge('reminder', 'badge-warn')]),
    muted("It's been over a week since your last backup (or you haven't made one). Browser storage can be evicted — export a backup to be safe."),
    navRow([el('span', { class: 'row-title', text: 'Settings → Export backup' }), el('span', { class: 'row-chev', text: '›' })], '#/settings'),
  ], 'banner banner-warning');
}

// --- Sunday weigh-in nudge (§1) --------------------------------------------
function renderWeighInNudge(ctx) {
  const date = ctx.today();
  if (dayName(date) !== 'Sun' || ctx.weighins()[date] != null) return null;
  const input = el('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '40', max: '200', class: 'field-input', placeholder: 'e.g. 90.3' });
  const save = button('Save weigh-in', () => {
    const kg = parseNum(input.value);
    if (kg == null) return;
    ctx.saveWeighIn(date, kg);
    ctx.refresh();
  });
  return card([
    el('div', { class: 'card-head' }, [h(3, 'Sunday weigh-in'), badge('today', '')]),
    muted('Pre-long-run weight (kg).'),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Weight (kg)' }), input]),
    el('div', { class: 'form-actions' }, [save]),
  ]);
}

export function render(ctx) {
  const date = ctx.today();
  const clock = ctx.clock();
  const dp = ctx.dayPlan(date);
  const checkin = ctx.checkins()[date];
  const wrap = el('div', {});

  // First-boot install intro (§6), shown until installed/dismissed.
  const intro = renderInstallIntro(ctx);
  if (intro) wrap.append(intro);

  // Check-in card until completed for today; then the readiness card.
  if (!checkin || editingCheckin) wrap.append(renderCheckInForm(ctx, checkin));
  else wrap.append(renderReadinessCard(ctx, dp));

  // --- Advisory banners (§5.8) + checkpoint soreness prompt (§5.9) --------
  for (const adv of ctx.advisories(date)) wrap.append(renderAdvisory(ctx, adv));
  const soreness = renderSorenessPrompt(ctx);
  if (soreness) wrap.append(soreness);

  // --- Sunday backup nag (§6) + weigh-in nudge (§1) ----------------------
  const backupNag = renderBackupNag(ctx);
  if (backupNag) wrap.append(backupNag);
  const weighNudge = renderWeighInNudge(ctx);
  if (weighNudge) wrap.append(weighNudge);

  // --- Day summary --------------------------------------------------------
  wrap.append(card([
    el('div', { class: 'card-head' }, [
      h(2, `${dayName(date)} ${date}`),
      badge(humanizeId(dp.dayType), DAYTYPE_KIND[dp.dayType] || ''),
    ]),
    kv([
      ['Shift', dp.shift.work ? `${dp.shift.schedule} · ${dp.shift.work.start}–${dp.shift.work.end}` : `${dp.shift.schedule} · day off`],
      dp.macros && dp.macros.kcal != null ? ['Fuel target', `${formatKcal(dp.macros.kcal)} · ${formatGrams(dp.macros.carb_g)} C`] : null,
    ].filter(Boolean)),
  ]));

  // --- Session(s) ---------------------------------------------------------
  if (dp.sessions.length) {
    const sc = card([h(3, dp.sessions.length > 1 ? "Today's sessions" : "Today's session")]);
    for (const s of dp.sessions) sc.append(sessionRow(s));
    wrap.append(sc);
  } else {
    wrap.append(card([h(3, "Today's session"), muted('Rest day — no session scheduled.')], 'sub'));
  }

  // --- Fuel (next meal by clock) -----------------------------------------
  if (dp.raceTimeline) {
    const rm = dp.raceTimeline.race_morning || {};
    wrap.append(card([
      el('div', { class: 'card-head' }, [h(3, 'Race day'), badge('RACE', 'badge-danger')]),
      muted(`Wake ${rm.wake} · breakfast ${rm.breakfast ? rm.breakfast.time : ''} · see Fuel for the full timeline.`),
      navRow([el('span', { class: 'row-title', text: 'Open race-day timeline' }), el('span', { class: 'row-chev', text: '›' })], '#/fuel'),
    ]));
  } else {
    const nm = nextMeal(dp.meals, clock);
    const fuel = card([el('div', { class: 'card-head' }, [h(3, 'Fuel'), badge(dp.mealTemplateId ? humanizeId(dp.mealTemplateId) : 'No template', '')])]);
    if (nm) {
      fuel.append(el('div', { class: 'next-meal' }, [
        muted('Next meal'),
        el('div', { class: 'row-body' }, [
          el('span', { class: 'row-title', text: `${nm.time} · ${nm.label}` }),
          muted(`${formatGrams(nm.carb_g)} carbs · ${formatGrams(nm.protein_g)} protein`),
        ]),
      ]));
    }
    if (dp.sessionFueling) {
      const sf = dp.sessionFueling;
      fuel.append(muted(`During session: ${formatGrams(sf.carb_g_per_h)}/h carbs · ${sf.fluid_ml_per_h} ml/h fluid`));
    }
    fuel.append(navRow([el('span', { class: 'row-title', text: 'See full day of fuel' }), el('span', { class: 'row-chev', text: '›' })], '#/fuel'));
    wrap.append(fuel);
  }

  // --- Hydration (§6) ----------------------------------------------------
  wrap.append(renderHydrationCard(ctx, dp));

  return wrap;
}
