// sessionDetail.js — full prescription + pre-filled log form (§6, §5.7).
// The form pre-fills PLANNED distance/duration; Stan overwrites with actuals from
// his watch, adds HR/RPE/pain, and saves → completed. "Mark missed" is also here.

import { el, card, badge, h, muted, kv, link, button } from '../components/ui.js';
import { formatKm, formatDuration, humanizeId, formatWindow, formatGrams } from '../logic/formatters.js';
import { dayName } from '../logic/dateUtil.js';

const PAIN_SITES = [
  { value: '', label: 'None' },
  { value: 'shin', label: 'Shin' },
  { value: 'foot_top', label: 'Foot (top)' },
  { value: 'groin', label: 'Groin' },
  { value: 'knee', label: 'Knee' },
  { value: 'calf', label: 'Calf' },
  { value: 'achilles', label: 'Achilles' },
  { value: 'other', label: 'Other' },
];

const STATUS_BADGE = {
  completed: { kind: 'badge-ok', label: '✓ Completed' },
  missed: { kind: 'badge-danger', label: 'Missed' },
  converted_easy: { kind: 'badge-warn', label: 'Converted → easy' },
  converted_cross: { kind: 'badge-warn', label: 'Converted → Z1 cross' },
};

function parseNum(v) {
  if (v == null || String(v).trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function findSession(workoutPlan, id) {
  for (const wk of workoutPlan.weeks) {
    const s = wk.sessions.find((x) => x.id === id);
    if (s) return { session: s, week: wk };
  }
  return null;
}

function numberField(label, value, attrs = {}) {
  const input = el('input', { type: 'number', inputmode: 'decimal', class: 'field-input', value: value != null ? value : null, ...attrs });
  return { input, node: el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), input]) };
}

function selectField(label, options, value) {
  const select = el('select', { class: 'field-input' },
    options.map((o) => el('option', { value: o.value, selected: o.value === (value || '') ? '' : null }, [o.label])));
  return { input: select, node: el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), select]) };
}

function renderLogForm(ctx, session, existing) {
  const log = existing || {};
  const dist = numberField('Distance (km)', log.actualDistanceKm != null ? log.actualDistanceKm : session.distance_km, { step: '0.1', min: '0' });
  const dur = numberField('Duration (min)', log.actualDurationMin != null ? log.actualDurationMin : session.duration_min, { step: '1', min: '0' });
  const avg = numberField('Avg HR (bpm)', log.avgHR, { min: '0', max: '250' });
  const max = numberField('Max HR (bpm)', log.maxHR, { min: '0', max: '250' });
  const rpe = numberField('RPE (1–10)', log.rpe, { min: '1', max: '10' });
  const pain = numberField('Pain (0–10)', log.painScore != null ? log.painScore : 0, { min: '0', max: '10' });
  const site = selectField('Pain site', PAIN_SITES, log.painSite);
  const notesInput = el('textarea', { class: 'field-input', rows: '2', placeholder: 'optional' }, [log.notes || '']);

  const save = button('Save as completed', () => {
    ctx.saveSessionLog(session.id, {
      status: 'completed',
      actualDistanceKm: parseNum(dist.input.value),
      actualDurationMin: parseNum(dur.input.value),
      avgHR: parseNum(avg.input.value),
      maxHR: parseNum(max.input.value),
      rpe: parseNum(rpe.input.value),
      painScore: parseNum(pain.input.value) ?? 0,
      painSite: site.input.value || undefined,
      notes: notesInput.value.trim() || undefined,
    });
    ctx.refresh();
  });
  const miss = button('Mark missed', () => { ctx.markMissed(session.id); ctx.refresh(); }, 'btn-ghost');

  return card([
    el('div', { class: 'card-head' }, [h(3, existing && existing.status === 'completed' ? 'Edit log' : 'Log this session')]),
    muted('Pre-filled with planned values — overwrite with your watch actuals.'),
    el('div', { class: 'field-grid' }, [
      dist.node, dur.node, avg.node, max.node, rpe.node, pain.node, site.node,
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Notes' }), notesInput]),
    ]),
    el('div', { class: 'form-actions' }, [save, miss]),
  ]);
}

export function render(ctx, id) {
  const { workoutPlan } = ctx.plans;
  const found = findSession(workoutPlan, id);
  if (!found) return card([h(2, 'Session not found'), link('← Back to plan', '#/plan')], 'diagnostic');

  const { session: s, week } = found;
  const dp = ctx.dayPlan(s.date);
  const log = ctx.sessionLogs()[id];
  const sb = log && STATUS_BADGE[log.status];
  const wrap = el('div', {});

  wrap.append(card([
    link(`← Week ${week.index}`, `#/plan/week/${week.index}`, 'back-link'),
    el('div', { class: 'card-head' }, [h(2, s.title), sb ? badge(sb.label, sb.kind) : badge(humanizeId(s.type), '')]),
    muted(`${dayName(s.date)} ${s.date} · ${formatWindow(s.window)} ${s.start_time}`),
  ]));

  // Prescription
  wrap.append(card([
    h(3, 'Prescription'),
    kv([
      ['Distance', formatKm(s.distance_km)],
      ['Duration', formatDuration(s.duration_min)],
      ['Zone', s.zone],
      ['HR cap', s.hr_cap_bpm != null ? `${s.hr_cap_bpm} bpm` : null],
      ['Run/walk', s.run_walk],
    ]),
    s.structure ? muted(s.structure) : null,
    s.notes ? el('p', { class: 'note', text: s.notes }) : null,
  ].filter(Boolean)));

  // Log form (pre-filled)
  wrap.append(renderLogForm(ctx, s, log));

  // Fuel context for the day
  const fuelChildren = [h(3, 'Fuel for this day'), muted(`${humanizeId(dp.dayType)} · target ${dp.macros && dp.macros.kcal != null ? dp.macros.kcal + ' kcal' : '—'}`)];
  if (dp.sessionFueling) {
    const sf = dp.sessionFueling;
    fuelChildren.push(kv([
      ['Carbs', `${formatGrams(sf.carb_g_per_h)}/h`],
      ['Fluid', `${sf.fluid_ml_per_h} ml/h`],
      ['Sodium', `${sf.sodium_mg_per_h} mg/h`],
    ]));
    if (sf.notes) fuelChildren.push(muted(sf.notes));
  }
  wrap.append(card(fuelChildren, 'sub'));

  return wrap;
}
