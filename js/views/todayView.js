// todayView.js — the daily operating surface (§6). Through Milestone 3: morning
// check-in card / readiness card, day summary, today's session(s), and the fuel
// card (next meal by clock). Session logging (M4) and hydration (M5) attach later.

import { el, card, badge, h, muted, kv, navRow, button, field, parseNum } from '../components/ui.js';
import { formatKm, formatDuration, formatKcal, formatGrams, humanizeId, formatWindow, formatFluidRangeL } from '../logic/formatters.js';
import { dayName, compare, diffDays } from '../logic/dateUtil.js';

const DAYTYPE_KIND = {
  race: 'badge-danger', carb_load: 'badge-warn', quality: 'badge-warn',
  long_high: 'badge-warn', long_std: 'badge-ok', easy: 'badge-ok', rest: '',
};
const RUN_TYPES = ['run_easy', 'run_strides', 'run_quality', 'long_run'];

// View-local UI state: whether the check-in form is force-shown for editing, and a
// draft of whatever is typed into it. The draft survives ctx.refresh() (a same-route
// re-render — e.g. tapping +250 ml mid-entry would otherwise wipe the form) and is
// cleared on save/skip/cancel and on real navigation (a hashchange).
let editingCheckin = false;
let checkinDraft = null;
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => { editingCheckin = false; checkinDraft = null; });
}

const STATUS_BADGE = {
  completed: { kind: 'badge-ok', label: '✓ done' },
  missed: { kind: 'badge-danger', label: 'missed' },
  converted_easy: { kind: 'badge-warn', label: 'converted' },
  converted_cross: { kind: 'badge-warn', label: 'converted' },
};

function sessionRow(session, log) {
  const left = el('div', { class: 'row-lead' }, [
    el('span', { class: 'row-window', text: `${formatWindow(session.window)} ${session.start_time}` }),
  ]);
  const parts = [];
  if (session.distance_km != null) parts.push(formatKm(session.distance_km));
  parts.push(formatDuration(session.duration_min));
  if (session.zone) parts.push(session.zone);
  const status = log && STATUS_BADGE[log.status];
  const body = el('div', { class: 'row-body' }, [
    el('span', { class: 'row-title', text: session.title }),
    muted(parts.join(' · ')),
  ]);
  return navRow([
    left, body,
    status ? badge(status.label, status.kind) : null,
    el('span', { class: 'row-chev', text: '›' }),
  ], `#/session/${session.id}`);
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
  const existingWeight = ctx.weighins()[date];

  // Prefill order: in-progress draft (survives same-route re-renders) → saved value.
  const draft = checkinDraft || {};
  const pre = (draftVal, savedVal) => (draftVal !== undefined ? draftVal : (savedVal != null ? savedVal : null));
  const track = (key) => (e) => { checkinDraft = { ...(checkinDraft || {}), [key]: e.target.value }; };

  const rhr = el('input', { type: 'number', inputmode: 'numeric', min: '30', max: '120', class: 'field-input', placeholder: 'e.g. 51', value: pre(draft.rhr, existing && existing.rhr), onInput: track('rhr') });
  const sleep = el('input', { type: 'number', inputmode: 'decimal', step: '0.5', min: '0', max: '16', class: 'field-input', placeholder: 'e.g. 7.5', value: pre(draft.sleep, existing && existing.sleepHours), onInput: track('sleep') });
  const hrv = el('input', { type: 'number', inputmode: 'numeric', min: '0', max: '300', class: 'field-input', placeholder: 'optional', value: pre(draft.hrv, existing && existing.hrvMs), onInput: track('hrv') });
  const weight = el('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '40', max: '200', class: 'field-input', placeholder: 'e.g. 90.3', value: pre(draft.weight, existingWeight), onInput: track('weight') });
  const err = el('p', { class: 'field-error', hidden: true });

  // Weight persists independently of the check-in: typed → saved; cleared while a
  // weigh-in exists → removed (the only way to delete a mistyped weight).
  const persistWeight = () => {
    const w = parseNum(weight.value);
    if (w != null) ctx.saveWeighIn(date, w);
    else if (existingWeight != null && String(weight.value).trim() === '') ctx.saveWeighIn(date, null);
  };

  const save = button('Save check-in', () => {
    const r = parseNum(rhr.value);
    if (r == null) {
      err.textContent = 'Enter your resting HR (bpm) — it drives the readiness verdict.';
      err.hidden = false;
      return;
    }
    ctx.saveCheckin({ date, rhr: r, sleepHours: parseNum(sleep.value), hrvMs: parseNum(hrv.value) });
    persistWeight();
    editingCheckin = false;
    checkinDraft = null;
    ctx.refresh();
  });
  // First entry today → "Skip today" (records an unknown check-in so it stops nagging;
  // still persists a typed weight so it isn't silently discarded).
  // Editing an existing entry → "Cancel" (non-destructive; never wipes saved metrics).
  const secondary = isEdit
    ? button('Cancel', () => { editingCheckin = false; checkinDraft = null; ctx.refresh(); }, 'btn-ghost')
    : button('Skip today', () => { ctx.saveCheckin({ date }); persistWeight(); editingCheckin = false; checkinDraft = null; ctx.refresh(); }, 'btn-ghost');

  return card([
    el('div', { class: 'card-head' }, [h(3, isEdit ? 'Edit check-in' : 'Morning check-in'), badge('today', '')]),
    muted('Read these off your watch / Health app in a few seconds.'),
    el('div', { class: 'field-grid' }, [
      field('Resting HR (bpm)', rhr, 'required'),
      field('Sleep (hours)', sleep, 'optional'),
      field('HRV (ms)', hrv, 'optional'),
      field('Weight (kg)', weight, 'optional — plan weighs Sundays, pre-long-run'),
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
  const weight = ctx.weighins()[date];
  children.push(kv([
    ['RHR', checkin.rhr != null ? `${checkin.rhr} bpm` : '—'],
    ['Sleep', checkin.sleepHours != null ? `${checkin.sleepHours} h` : '—'],
    ['HRV', checkin.hrvMs != null ? `${checkin.hrvMs} ms` : '—'],
    ['Weight', weight != null ? `${weight} kg` : '—'],
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

// --- Headlines for states outside a normal training day (§1) ---------------
// The app is live before the block starts, on race day, and after the race — each
// gets a headline card so Today never reads as a meaningless rest day.
function nextSessionAfter(workoutPlan, date) {
  let best = null;
  for (const wk of workoutPlan.weeks) {
    for (const s of wk.sessions) {
      if (s.date > date && (!best || s.date < best.date)) best = s;
    }
  }
  return best;
}

function renderPrePlanCard(date, workoutPlan) {
  const start = workoutPlan.start_date;
  const days = diffDays(start, date);
  return card([
    el('div', { class: 'card-head' }, [h(3, 'Plan starts soon'), badge(days > 0 ? `in ${days}d` : 'today', '')]),
    muted(`Your 10-week block starts ${dayName(start)} ${start}. Race day is ${dayName(workoutPlan.race.date)} ${workoutPlan.race.date}. You can log check-ins and weight now — the plan below fills in once it starts.`),
    navRow([el('span', { class: 'row-title', text: 'Preview the training plan' }), el('span', { class: 'row-chev', text: '›' })], '#/plan'),
  ]);
}

function renderPostRaceCard(workoutPlan) {
  return card([
    el('div', { class: 'card-head' }, [h(3, 'Race complete'), badge('done', 'badge-ok')]),
    muted(`You finished the ${workoutPlan.race.name} — nice work. Recovery now: easy movement, refuel, and rest. No sessions are scheduled after race day.`),
    navRow([el('span', { class: 'row-title', text: 'Review your trends' }), el('span', { class: 'row-chev', text: '›' })], '#/trends'),
  ]);
}

function renderRaceDayCard(dp, workoutPlan) {
  const rm = (dp.raceTimeline && dp.raceTimeline.race_morning) || {};
  return card([
    el('div', { class: 'card-head' }, [h(3, workoutPlan.race.name), badge('RACE DAY', 'badge-danger')]),
    muted(`Today's the day. Wake ${rm.wake || ''} · breakfast ${rm.breakfast ? rm.breakfast.time : ''}. Trust the taper, run your plan, fuel every walk break.`),
    navRow([el('span', { class: 'row-title', text: 'Open the race-day timeline' }), el('span', { class: 'row-chev', text: '›' })], '#/fuel'),
  ], 'banner banner-critical');
}

export function render(ctx) {
  const { workoutPlan } = ctx.plans;
  const date = ctx.today();
  const clock = ctx.clock();
  const dp = ctx.dayPlan(date);
  const checkin = ctx.checkins()[date];
  const isRaceDay = !!dp.raceTimeline;
  const beforePlan = compare(date, workoutPlan.start_date) < 0;
  const afterRace = compare(date, workoutPlan.race.date) > 0;
  const wrap = el('div', {});

  // First-boot install intro (§6), shown until installed/dismissed.
  const intro = renderInstallIntro(ctx);
  if (intro) wrap.append(intro);

  // Headline for the out-of-block states (§1).
  if (beforePlan) wrap.append(renderPrePlanCard(date, workoutPlan));
  else if (afterRace) wrap.append(renderPostRaceCard(workoutPlan));
  else if (isRaceDay) wrap.append(renderRaceDayCard(dp, workoutPlan));

  // Check-in card until completed for today; then the readiness card.
  if (!checkin || editingCheckin) wrap.append(renderCheckInForm(ctx, checkin));
  else wrap.append(renderReadinessCard(ctx, dp));

  // --- Advisory banners (§5.8) + checkpoint soreness prompt (§5.9) --------
  for (const adv of ctx.advisories(date)) wrap.append(renderAdvisory(ctx, adv));
  const soreness = renderSorenessPrompt(ctx);
  if (soreness) wrap.append(soreness);

  // --- Sunday backup nag (§6) — but never on race morning ----------------
  if (!isRaceDay) {
    const backupNag = renderBackupNag(ctx);
    if (backupNag) wrap.append(backupNag);
  }

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
    const logs = ctx.sessionLogs();
    const sc = card([h(3, dp.sessions.length > 1 ? "Today's sessions" : "Today's session")]);
    for (const s of dp.sessions) sc.append(sessionRow(s, logs[s.id]));
    wrap.append(sc);
  } else {
    const restCard = card([h(3, "Today's session"), muted('Rest day — no session scheduled.')], 'sub');
    const next = nextSessionAfter(workoutPlan, date);
    if (next) {
      restCard.append(navRow([
        el('div', { class: 'row-body' }, [
          el('span', { class: 'row-window', text: `Next · ${dayName(next.date)} ${next.date}` }),
          el('span', { class: 'row-title', text: next.title }),
        ]),
        el('span', { class: 'row-chev', text: '›' }),
      ], `#/session/${next.id}`));
    }
    wrap.append(restCard);
  }

  // --- Fuel (next meal by clock) -----------------------------------------
  // On race day the headline card at the top already carries wake/breakfast and the
  // Fuel link — a second race card here was a duplicate, so it is skipped entirely.
  if (!dp.raceTimeline) {
    const nm = nextMeal(dp.meals, clock);
    const fuel = card([el('div', { class: 'card-head' }, [h(3, 'Fuel'), badge(dp.mealTemplateId ? humanizeId(dp.mealTemplateId) : 'No template', '')])]);
    if (nm) {
      const isPast = nm.time < clock; // fallback case: the day's last meal already happened
      fuel.append(el('div', { class: 'next-meal' }, [
        muted(isPast ? 'Last meal today (done)' : 'Next meal'),
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
