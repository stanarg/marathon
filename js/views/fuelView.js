// fuelView.js — the fuel surface (§6, §5.4). Date picker (default today), meal
// timeline, session-fueling card, day macros, hydration guidance and weigh-in.
// In race week (W10) the carb-load checklist + race-day timeline are pinned on top.

import { el, card, badge, h, muted, kv, button, field, parseNum } from '../components/ui.js';
import { formatKcal, formatGrams, humanizeId, formatFluidRangeL } from '../logic/formatters.js';
import { mealKey, exampleHint } from '../logic/mealSuggestions.js';
import { mealTotals, targetStatus } from '../logic/foods.js';

// View-local UI state. Like todayView's edit flag, these survive ctx.refresh()
// (a same-route re-render) but reset on real navigation (a hashchange):
//   fuelDate     — the picked date
//   expandedMeal — the meal key whose meal is open (accordion: one at a time)
//   editingMeal  — the meal key currently in edit mode (or null)
//   mealDraft    — in-progress list of { foodId, amount } rows, so a re-render can't wipe it
let fuelDate = null;
let expandedMeal = null;
let editingMeal = null;
let mealDraft = null;
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    fuelDate = null; expandedMeal = null; editingMeal = null; mealDraft = null;
  });
}

const STATUS_KIND = { short: 'badge-warn', on: 'badge-ok', over: '' };

// "100 g · Rolled oats" for weighed foods, "3 × Egg" for counted ones.
function formatEntry(food, amount) {
  if (!food) return `${amount} × (unknown food)`;
  return food.unit === 'g' || food.unit === 'ml'
    ? `${amount} ${food.unit} · ${food.name}`
    : `${amount} × ${food.name}`;
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

// One meal in the timeline: a tappable header (time · label · target) that expands to
// the athlete's go-to meal built from foods, its computed macros vs the target, editable.
function renderMeal(ctx, meal) {
  const key = mealKey(meal.label);
  const open = expandedMeal === key;

  const head = el('button', {
    class: 'meal-head', type: 'button', 'aria-expanded': open ? 'true' : 'false',
    onClick: () => {
      expandedMeal = expandedMeal === key ? null : key;
      editingMeal = null; mealDraft = null;
      ctx.refresh();
    },
  }, [
    el('div', { class: 'row-lead' }, [el('span', { class: 'row-window', text: meal.time })]),
    el('div', { class: 'row-body' }, [
      el('span', { class: 'row-title', text: meal.label }),
      muted(`target ${formatGrams(meal.carb_g)} carbs · ${formatGrams(meal.protein_g)} protein`),
    ]),
    el('span', { class: 'meal-chev', text: '›', 'aria-hidden': 'true' }),
  ]);

  const parts = [head];
  if (open) parts.push(editingMeal === key ? renderMealEditor(ctx, meal, key) : renderMealView(ctx, meal, key));
  return el('div', { class: 'meal' }, parts);
}

// --- View mode: the built meal + its macros vs the target -------------------
function renderMealView(ctx, meal, key) {
  const detail = el('div', { class: 'meal-detail' });
  const entries = ctx.mealSuggestions()[key] || [];
  const byId = ctx.foodMap();

  if (entries.length) {
    const list = el('ul', { class: 'meal-items' });
    for (const e of entries) list.append(el('li', { text: formatEntry(byId[e.foodId], e.amount) }));
    detail.append(list);
    detail.append(mealTotalLine(entries, byId, meal));
  } else {
    const hint = exampleHint(meal);
    detail.append(muted(hint ? `Plan suggests: ${hint}` : 'No meal built yet.'));
  }
  if (meal.notes) detail.append(el('p', { class: 'note', text: meal.notes }));
  detail.append(el('button', {
    class: 'link-btn', type: 'button',
    text: entries.length ? 'Edit meal' : 'Build this meal',
    onClick: () => { editingMeal = key; mealDraft = entries.map((e) => ({ ...e })); ctx.refresh(); },
  }));
  return detail;
}

// The computed total + target comparison (carbs is the athlete's focus).
function mealTotalLine(entries, byId, meal) {
  const t = mealTotals(entries, byId);
  const box = el('div', { class: 'meal-total' });
  box.append(el('p', { class: 'meal-total-macros', text:
    `${Math.round(t.carb)} g carbs · ${Math.round(t.protein)} g protein · ${Math.round(t.fat)} g fat · ${t.kcal} kcal` }));
  const cs = targetStatus(t.carb, meal.carb_g);
  const label = cs.status === 'on' ? 'on target'
    : cs.status === 'short' ? `${Math.abs(cs.delta)} g short`
      : `${Math.abs(cs.delta)} g over`;
  box.append(el('div', { class: 'meal-target-row' }, [
    muted(`vs target ${formatGrams(meal.carb_g)} carbs`),
    badge(label, STATUS_KIND[cs.status]),
  ]));
  return box;
}

// --- Edit mode: food + amount rows with a live running total ----------------
function renderMealEditor(ctx, meal, key) {
  const detail = el('div', { class: 'meal-detail' });
  const foods = ctx.foods();
  const byId = ctx.foodMap();
  if (!mealDraft) mealDraft = [];

  const totalBox = el('div', { class: 'meal-total' });
  const paint = () => { totalBox.replaceChildren(mealTotalLine(mealDraft.filter((e) => e.foodId && parseNum(e.amount) > 0), byId, meal)); };

  const rows = el('div', { class: 'meal-rows' });
  mealDraft.forEach((entry, i) => {
    const sel = el('select', { class: 'field-input meal-food', onChange: (e) => { mealDraft[i].foodId = e.target.value; unitLabel.textContent = unitOf(e.target.value); paint(); } }, [
      el('option', { value: '', selected: entry.foodId ? null : '' }, ['— choose food —']),
      ...foods.map((f) => el('option', { value: f.id, selected: f.id === entry.foodId ? '' : null }, [f.name])),
    ]);
    const amt = el('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', class: 'field-input meal-amt-input', value: entry.amount != null ? entry.amount : null, placeholder: '0',
      onInput: (e) => { mealDraft[i].amount = e.target.value; paint(); } });
    const unitOf = (id) => { const f = byId[id]; return f ? f.unit : ''; };
    const unitLabel = el('span', { class: 'meal-unit', text: unitOf(entry.foodId) });
    const del = el('button', { class: 'meal-del', type: 'button', 'aria-label': 'Remove food', text: '✕',
      onClick: () => { mealDraft.splice(i, 1); ctx.refresh(); } });
    rows.append(el('div', { class: 'meal-edit-row' }, [sel, el('div', { class: 'meal-amt' }, [amt, unitLabel]), del]));
  });

  detail.append(
    rows,
    el('button', { class: 'link-btn', type: 'button', text: '+ Add food', onClick: () => { mealDraft.push({ foodId: '', amount: '' }); ctx.refresh(); } }),
    totalBox,
    el('div', { class: 'form-actions' }, [
      button('Save', () => {
        const clean = mealDraft.filter((e) => e.foodId && parseNum(e.amount) > 0).map((e) => ({ foodId: e.foodId, amount: parseNum(e.amount) }));
        ctx.saveMeal(key, clean);
        editingMeal = null; mealDraft = null;
        ctx.refresh();
      }, 'btn-sm'),
      button('Cancel', () => { editingMeal = null; mealDraft = null; ctx.refresh(); }, 'btn-ghost btn-sm'),
    ]),
    muted('Foods off vs your tracker? Calibrate them in Settings → Foods.'),
  );
  paint();
  return detail;
}

function renderWeightCard(ctx, date) {
  const existing = ctx.weighins()[date];
  const input = el('input', { type: 'number', inputmode: 'decimal', step: '0.1', min: '40', max: '200', class: 'field-input', value: existing != null ? existing : null, placeholder: 'e.g. 90.3' });
  const save = button(existing != null ? 'Update weight' : 'Save weight', () => {
    const kg = parseNum(input.value);
    if (kg != null) ctx.saveWeighIn(date, kg);
    else if (existing != null && String(input.value).trim() === '') ctx.saveWeighIn(date, null); // cleared → remove
    else return;
    ctx.refresh();
  });
  return card([
    h(3, 'Weigh-in'),
    muted(existing != null ? `Recorded: ${existing} kg — clear the field and update to remove.` : 'Not recorded for this day.'),
    field('Weight (kg)', input),
    el('div', { class: 'form-actions' }, [save]),
  ], 'sub');
}

export function render(ctx) {
  const { workoutPlan, nutritionPlan } = ctx.plans;
  const selected = fuelDate || clampISO(ctx.today(), workoutPlan.start_date, workoutPlan.race.date);
  const dp = ctx.dayPlan(selected);
  const wrap = el('div', {});

  // Date picker. iOS fires `change` on every wheel tick while its popover is open;
  // re-rendering immediately would destroy the input and dismiss the popover mid-scroll,
  // so while the picker holds focus the refresh is deferred until blur (dismissal).
  const picker = el('input', {
    type: 'date', class: 'field-input', value: selected,
    min: workoutPlan.start_date, max: workoutPlan.race.date,
    onChange: (e) => {
      fuelDate = e.target.value || null;
      if (document.activeElement === e.target) {
        e.target.addEventListener('blur', () => ctx.refresh(), { once: true });
      } else {
        ctx.refresh();
      }
    },
  });
  wrap.append(card([
    el('div', { class: 'card-head' }, [h(2, 'Fuel'), badge(humanizeId(dp.dayType), '')]),
    field('Date', picker),
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

  // Meal timeline — each meal expands to show (and edit) your go-to suggestion.
  if (dp.meals.length) {
    const meals = card([
      h(3, `Meals · ${dp.mealTemplateId ? humanizeId(dp.mealTemplateId) : '—'}`),
      muted('Tap a meal to build it from foods and check its macros against the target.'),
    ]);
    for (const meal of dp.meals) meals.append(renderMeal(ctx, meal));
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
