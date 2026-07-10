// fuelView.js — the fuel surface (§6, §5.4). Date picker (default today), meal
// timeline, session-fueling card, day macros, hydration guidance and weigh-in.
// In race week (W10) the carb-load checklist + race-day timeline are pinned on top.

import { el, card, badge, h, muted, kv, button } from '../components/ui.js';
import { formatKm, formatKcal, formatGrams, humanizeId, formatFluidRangeL } from '../logic/formatters.js';

// Selected date is view-local; reset to "today" on navigation (like todayView's edit flag).
let fuelDate = null;
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => { fuelDate = null; });
}

function parseNum(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Keep the default date inside the picker's own [start, race] bounds so the widget
// value and the rendered content can never disagree (e.g. before the plan starts).
const clampISO = (d, lo, hi) => (d < lo ? lo : d > hi ? hi : d);

function checkItem(ctx, id, label, sub) {
  const on = !!ctx.checklist()[id];
  const box = el('input', {
    type: 'checkbox', class: 'check', checked: on ? '' : null,
    onChange: (e) => { ctx.toggleChecklist(id, e.target.checked); ctx.refresh(); },
  });
  return el('label', { class: `check-row${on ? ' checked' : ''}` }, [
    box,
    el('div', { class: 'row-body' }, [el('span', { class: 'row-title', text: label }), sub ? muted(sub) : null].filter(Boolean)),
  ]);
}

function formatCaffeine(schedule) {
  return schedule.map((c) => {
    const at = c.at_min < 0 ? `T−${Math.abs(c.at_min)} min` : `${c.at_min} min`;
    return `${c.mg} mg @ ${at}`;
  }).join(' · ');
}

// --- Pinned race-week block (§6) -------------------------------------------
function renderRaceWeek(ctx) {
  const rp = ctx.plans.nutritionPlan.race_plan;
  const wrap = el('div', {});

  // Carb-load + logistics checklist
  const checklist = card([
    el('div', { class: 'card-head' }, [h(3, 'Race-week checklist'), badge('W10', 'badge-danger')]),
    muted('Time-critical items — this is your reminder surface (no notifications).'),
  ], 'banner banner-critical');
  checklist.append(checkItem(ctx, 'bib_pickup', 'Bib pickup', 'Primary: Thu after 15:30 · backup Fri 09:00–11:00'));
  for (const d of rp.carb_load.dates) {
    checklist.append(checkItem(ctx, `carbload_${d}`, `Carb-load ${d}`, `${rp.carb_load.carb_g_per_day} g carbs — low fibre, low fat`));
  }
  checklist.append(muted(rp.carb_load.notes));
  wrap.append(checklist);

  // Race-morning timeline
  const rm = rp.race_morning;
  const morning = card([h(3, 'Race morning')]);
  morning.append(checkItem(ctx, 'race_wake', `Wake ${rm.wake}`));
  morning.append(checkItem(ctx, 'race_breakfast', `${rm.breakfast.time} · Breakfast`, `${rm.breakfast.carb_g} g carbs — ${rm.breakfast.examples.join(', ')}`));
  morning.append(checkItem(ctx, 'race_topup', `${rm.top_up.time} · Top-up`, rm.top_up.item));
  morning.append(checkItem(ctx, 'race_gel', `Pre-start gel (T−${rm.pre_start_gel_min} min)`));
  wrap.append(morning);

  // In-race + post-race
  const ir = rp.in_race;
  wrap.append(card([
    h(3, 'In-race fuelling'),
    kv([
      ['Carbs', `${ir.carb_g_per_h} g/h`],
      ['Fluid', `${ir.fluid_ml_per_h[0]}–${ir.fluid_ml_per_h[1]} ml/h`],
      ['Sodium', `${ir.sodium_mg_per_h[0]}–${ir.sodium_mg_per_h[1]} mg/h`],
    ]),
    muted(`Caffeine: ${ir.caffeine_schedule.map((c) => `${c.mg} mg @ ${c.clock}`).join(' · ')}`),
    el('p', { class: 'note', text: ir.rule }),
    muted(`Post-race (within ${rp.post_race.within_h} h): ${rp.post_race.carb_g_per_kg} g/kg carbs + ${rp.post_race.protein_g} g protein`),
  ], 'sub'));

  return wrap;
}

function renderWeightCard(ctx, date) {
  const existing = ctx.weighins()[date];
  const input = el('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '40', max: '200', class: 'field-input', value: existing != null ? existing : null, placeholder: 'e.g. 90.3' });
  const save = button(existing != null ? 'Update weight' : 'Save weight', () => {
    const kg = parseNum(input.value);
    if (kg == null) return;
    ctx.saveWeighIn(date, kg);
    ctx.refresh();
  });
  return card([
    h(3, 'Weigh-in'),
    muted(existing != null ? `Recorded: ${existing} kg` : 'Not recorded for this day.'),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Weight (kg)' }), input]),
    el('div', { class: 'form-actions' }, [save]),
  ], 'sub');
}

export function render(ctx) {
  const { workoutPlan, nutritionPlan } = ctx.plans;
  const selected = fuelDate || clampISO(ctx.today(), workoutPlan.start_date, workoutPlan.race.date);
  const dp = ctx.dayPlan(selected);
  const wrap = el('div', {});

  // Date picker
  const picker = el('input', {
    type: 'date', class: 'field-input', value: selected,
    min: workoutPlan.start_date, max: workoutPlan.race.date,
    onChange: (e) => { fuelDate = e.target.value || null; ctx.refresh(); },
  });
  wrap.append(card([
    el('div', { class: 'card-head' }, [h(2, 'Fuel'), badge(humanizeId(dp.dayType), '')]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Date' }), picker]),
  ]));

  // Race-week pinned block
  if (dp.isRaceWeek) wrap.append(renderRaceWeek(ctx));

  // Day macro targets
  const m = dp.macros;
  if (m && m.kcal != null) {
    wrap.append(card([
      h(3, 'Day targets'),
      kv([
        ['Energy', formatKcal(m.kcal)],
        ['Carbs', formatGrams(m.carb_g)],
        ['Protein', formatGrams(m.protein_g)],
        ['Fat', formatGrams(m.fat_g)],
      ]),
      m.notes ? muted(m.notes) : null,
    ].filter(Boolean)));
  } else if (dp.dayType === 'race') {
    wrap.append(card([h(3, 'Day targets'), muted('Race day — governed by the race plan above, not daily macros.')]));
  }

  // Meal timeline
  if (dp.meals.length) {
    const meals = card([h(3, `Meals · ${dp.mealTemplateId ? humanizeId(dp.mealTemplateId) : '—'}`)]);
    for (const meal of dp.meals) {
      meals.append(el('div', { class: 'row' }, [
        el('div', { class: 'row-lead' }, [el('span', { class: 'row-window', text: meal.time })]),
        el('div', { class: 'row-body' }, [
          el('span', { class: 'row-title', text: meal.label }),
          muted(`${formatGrams(meal.carb_g)} carbs · ${formatGrams(meal.protein_g)} protein`),
          meal.examples && meal.examples.length ? muted(meal.examples.join(', ')) : null,
          meal.notes ? el('p', { class: 'note', text: meal.notes }) : null,
        ].filter(Boolean)),
      ]));
    }
    wrap.append(meals);
  }

  // Session fuelling (suppressed on race day — the pinned in-race block covers it,
  // avoiding a doubled caffeine readout in two notations).
  if (dp.sessionFueling && dp.dayType !== 'race') {
    const sf = dp.sessionFueling;
    const rows = [
      ['Carbs', `${formatGrams(sf.carb_g_per_h)}/h`],
      ['Fluid', `${sf.fluid_ml_per_h} ml/h`],
      ['Sodium', `${sf.sodium_mg_per_h} mg/h`],
    ];
    const children = [h(3, 'Session fuelling'), muted(`For ${sf.session_id}`), kv(rows)];
    if (sf.caffeine_mg && sf.caffeine_mg.length) children.push(muted(`Caffeine: ${formatCaffeine(sf.caffeine_mg)}`));
    if (sf.notes) children.push(el('p', { class: 'note', text: sf.notes }));
    wrap.append(card(children));
  }

  // Hydration guidance
  const hy = nutritionPlan.hydration;
  wrap.append(card([
    h(3, 'Hydration'),
    muted(`Daily target ${formatFluidRangeL(hy.daily_baseline_ml)} · pre-session ${hy.pre_session_ml[0]}–${hy.pre_session_ml[1]} ml (${hy.pre_session_window_h} h before)`),
    el('ul', { class: 'tips' }, hy.structure.map((s) => el('li', { text: s }))),
  ], 'sub'));

  // Weigh-in for the selected day
  wrap.append(renderWeightCard(ctx, selected));

  return wrap;
}
