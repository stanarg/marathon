// sessionDetail.js — full prescription + pre-filled log form (§6, §5.7).
// The form pre-fills PLANNED distance/duration; Stan overwrites with actuals from
// his watch, adds HR/RPE/pain, and saves → completed. "Mark missed" is also here.

import { el, card, badge, h, muted, kv, link, button, field, parseNum } from '../components/ui.js';
import { formatKm, formatDuration, humanizeId, formatWindow, formatGrams } from '../logic/formatters.js';
import { dayName } from '../logic/dateUtil.js';
import { strengthDetail } from '../logic/strengthProgram.js';
import { formatZone, allZones } from '../logic/hrZones.js';

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

// Shared parseNum returns null; the log payload wants undefined so that empty fields
// are DROPPED by JSON.stringify instead of stored as nulls.
const numOrUndef = (v) => parseNum(v) ?? undefined;

function findSession(workoutPlan, id) {
  for (const wk of workoutPlan.weeks) {
    const s = wk.sessions.find((x) => x.id === id);
    if (s) return { session: s, week: wk };
  }
  return null;
}

function numberField(label, value, attrs = {}) {
  const input = el('input', { type: 'number', inputmode: 'decimal', class: 'field-input', value: value != null ? value : null, ...attrs });
  return { input, node: field(label, input) };
}

function selectField(label, options, value) {
  const select = el('select', { class: 'field-input' },
    options.map((o) => el('option', { value: o.value, selected: o.value === (value || '') ? '' : null }, [o.label])));
  return { input: select, node: field(label, select) };
}

function renderLogForm(ctx, session, existing) {
  const log = existing || {};
  const isStrength = session.type === 'strength';
  const hasDistance = session.distance_km != null; // runs + race carry km; cross/strength don't
  const showHR = !isStrength; // runs + cross are HR-driven; strength isn't

  // Build only the fields that make sense for this session type.
  const fields = {};
  const nodes = [];
  if (hasDistance) {
    fields.dist = numberField('Distance (km)', log.actualDistanceKm != null ? log.actualDistanceKm : session.distance_km, { step: '0.1', min: '0' });
    nodes.push(fields.dist.node);
  }
  fields.dur = numberField('Duration (min)', log.actualDurationMin != null ? log.actualDurationMin : session.duration_min, { step: '1', min: '0' });
  nodes.push(fields.dur.node);
  if (showHR) {
    fields.avg = numberField('Avg HR (bpm)', log.avgHR, { min: '0', max: '250' });
    fields.max = numberField('Max HR (bpm)', log.maxHR, { min: '0', max: '250' });
    nodes.push(fields.avg.node, fields.max.node);
  }
  fields.rpe = numberField('RPE (1–10)', log.rpe, { min: '1', max: '10' });
  fields.pain = numberField('Pain (0–10)', log.painScore != null ? log.painScore : 0, { min: '0', max: '10' });
  fields.site = selectField('Pain site', PAIN_SITES, log.painSite);
  nodes.push(fields.rpe.node, fields.pain.node, fields.site.node);
  const notesInput = el('textarea', { class: 'field-input', rows: '2', placeholder: isStrength ? 'e.g. loads used, how it felt' : 'optional' }, [log.notes || '']);
  nodes.push(field('Notes', notesInput));

  const save = button('Save as completed', () => {
    ctx.saveSessionLog(session.id, {
      status: 'completed',
      actualDistanceKm: fields.dist ? numOrUndef(fields.dist.input.value) : undefined,
      actualDurationMin: numOrUndef(fields.dur.input.value),
      avgHR: fields.avg ? numOrUndef(fields.avg.input.value) : undefined,
      maxHR: fields.max ? numOrUndef(fields.max.input.value) : undefined,
      rpe: numOrUndef(fields.rpe.input.value),
      painScore: parseNum(fields.pain.input.value) ?? 0,
      painSite: fields.site.input.value || undefined,
      notes: notesInput.value.trim() || undefined,
    });
    ctx.refresh();
  });
  const miss = button('Mark missed', () => { ctx.markMissed(session.id); ctx.refresh(); }, 'btn-ghost');

  return card([
    el('div', { class: 'card-head' }, [h(3, existing && existing.status === 'completed' ? 'Edit log' : 'Log this session')]),
    muted(isStrength ? 'Log how it went — put sets and loads in the notes.' : 'Pre-filled with planned values — overwrite with your watch actuals.'),
    el('div', { class: 'field-grid' }, nodes),
    el('div', { class: 'form-actions' }, [save, miss]),
  ]);
}

// Strength workout card (§7 regimen) — what to actually do in the gym.
function renderStrengthWorkout(session) {
  const d = strengthDetail(session);
  if (!d) return null;
  const list = el('div', { class: 'ex-list' });
  for (const ex of d.exercises) {
    list.append(el('div', { class: 'ex-row' }, [
      el('span', { class: 'ex-name', text: ex.name }),
      el('span', { class: 'ex-scheme', text: ex.scheme }),
    ]));
  }
  return card([
    el('div', { class: 'card-head' }, [h(3, 'Strength workout'), badge(d.program, '')]),
    muted(d.purpose),
    list,
    el('p', { class: 'note', text: d.note }),
  ]);
}

// "Your HR zones" reference — all five of Stan's zones with bpm, shown on run/cardio
// session detail so he can see the whole ladder, not just today's target.
function renderZonesReference(hrModel) {
  const zones = allZones(hrModel);
  if (!zones.length) return null;
  return card([
    el('div', { class: 'card-head' }, [h(3, 'Your HR zones'), badge(`HRmax ${hrModel.hr_max} · rest ${hrModel.hr_rest}`, '')]),
    kv(zones.map((z) => [`${z.id} · ${z.name}`, `${z.minBpm}–${z.maxBpm} bpm`])),
    muted('Computed from your HRmax and resting HR (Karvonen). Same numbers your watch zones use.'),
  ], 'sub');
}

export function render(ctx, id) {
  const { workoutPlan } = ctx.plans;
  const hrModel = workoutPlan.hr_model;
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

  // Prescription (Distance is hidden for non-distance sessions like strength/cross)
  wrap.append(card([
    h(3, 'Prescription'),
    kv([
      ['Distance', s.distance_km != null ? formatKm(s.distance_km) : null],
      ['Duration', formatDuration(s.duration_min)],
      ['Zone', formatZone(s.zone, hrModel) || s.zone],
      ['HR cap', s.hr_cap_bpm != null ? `${s.hr_cap_bpm} bpm` : null],
      ['Run/walk', s.run_walk],
    ]),
    s.structure ? muted(s.structure) : null,
    s.notes ? el('p', { class: 'note', text: s.notes }) : null,
  ].filter(Boolean)));

  // HR-zone reference — only for sessions that train to a zone (runs, cross, race).
  if (s.zone) {
    const zonesRef = renderZonesReference(hrModel);
    if (zonesRef) wrap.append(zonesRef);
  }

  // Strength workout (only for strength sessions) — the actual gym regimen (§7).
  const strengthCard = renderStrengthWorkout(s);
  if (strengthCard) wrap.append(strengthCard);

  // Log form (pre-filled, tailored to the session type)
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
