// foods.js — a small, calibratable food database + meal macro math (Fuel §6). PURE.
//
// nutrition_plan.json carries only per-meal macro TARGETS (e.g. breakfast = 90 g carb).
// To show what a meal actually DELIVERS, the athlete builds each meal from foods +
// amounts; this module resolves those to macros and compares them to the target.
//
// Seed values are reasonable starting points, NOT gospel — food data varies by brand
// and database. They are editable in-app (stored as overrides) so the athlete can
// calibrate any food to match their own tracker.

// Each food carries macros for `ref` of its `unit`; a meal entry's `amount` is in `unit`.
//   unit 'g' / 'ml' → ref 100 (macros per 100 g / 100 ml)
//   unit is the food itself (egg, banana, slice, tbsp, …) → ref 1 (macros per piece)
// Values are USDA-aligned generic references (researched Jul 2026) — good starting
// points. Brand/product entries vary, so calibrate any food in Settings → Foods to
// match the athlete's own tracker for an exact match.
export const SEED_FOODS = [
  { id: 'oats', name: 'Rolled oats (dry)', unit: 'g', ref: 100, carb: 68, protein: 13, fat: 7 },
  { id: 'milk', name: 'Milk (semi-skim)', unit: 'ml', ref: 100, carb: 4.8, protein: 3.4, fat: 2 },
  { id: 'egg', name: 'Egg', unit: 'egg', ref: 1, carb: 0.6, protein: 6.3, fat: 4.8 },
  { id: 'banana', name: 'Banana', unit: 'banana', ref: 1, carb: 27, protein: 1.3, fat: 0.4 },
  { id: 'white_bread', name: 'White bread', unit: 'slice', ref: 1, carb: 14, protein: 2.5, fat: 0.9 },
  { id: 'jam', name: 'Jam', unit: 'tbsp', ref: 1, carb: 14, protein: 0.1, fat: 0 },
  { id: 'honey', name: 'Honey', unit: 'tbsp', ref: 1, carb: 17, protein: 0.1, fat: 0 },
  { id: 'dulce_leche', name: 'Dulce de leche', unit: 'tbsp', ref: 1, carb: 10.5, protein: 1.3, fat: 1.4 },
  { id: 'rice_cooked', name: 'White rice (cooked)', unit: 'g', ref: 100, carb: 28, protein: 2.7, fat: 0.3 },
  { id: 'pasta_cooked', name: 'Pasta (cooked)', unit: 'g', ref: 100, carb: 31, protein: 5.8, fat: 0.9 },
  { id: 'gnocchi_cooked', name: 'Gnocchi / ñoquis (cooked)', unit: 'g', ref: 100, carb: 30, protein: 3, fat: 1 },
  { id: 'potato_boiled', name: 'Potatoes (boiled)', unit: 'g', ref: 100, carb: 20, protein: 1.9, fat: 0.1 },
  { id: 'beef', name: 'Beef (cooked, lean)', unit: 'g', ref: 100, carb: 0, protein: 26, fat: 8 },
  { id: 'milanesa', name: 'Milanesa (breaded beef)', unit: 'g', ref: 100, carb: 14, protein: 20, fat: 13 },
  { id: 'chicken', name: 'Chicken breast (cooked)', unit: 'g', ref: 100, carb: 0, protein: 31, fat: 3.6 },
  { id: 'veg', name: 'Mixed vegetables', unit: 'g', ref: 100, carb: 7, protein: 2.6, fat: 0.3 },
  { id: 'yogurt', name: 'Greek yogurt (plain)', unit: 'g', ref: 100, carb: 4, protein: 10, fat: 2 },
  { id: 'quark', name: 'Quark (low-fat)', unit: 'g', ref: 100, carb: 4, protein: 12, fat: 0.2 },
  { id: 'whey', name: 'Whey protein', unit: 'scoop', ref: 1, carb: 3, protein: 24, fat: 1.5 },
  { id: 'nuts', name: 'Mixed nuts', unit: 'g', ref: 100, carb: 21, protein: 20, fat: 54 },
  { id: 'apple', name: 'Apple', unit: 'apple', ref: 1, carb: 25, protein: 0.5, fat: 0.3 },
  { id: 'ham', name: 'Ham', unit: 'slice', ref: 1, carb: 0.6, protein: 7, fat: 1.4 },
  { id: 'cheese', name: 'Cheese', unit: 'slice', ref: 1, carb: 0.8, protein: 7, fat: 9 },
  { id: 'orange_juice', name: 'Orange juice', unit: 'ml', ref: 100, carb: 10, protein: 0.7, fat: 0.2 },
  { id: 'sports_drink', name: 'Sports drink', unit: 'ml', ref: 100, carb: 6, protein: 0, fat: 0 },
  { id: 'soup', name: 'Vegetable soup', unit: 'ml', ref: 100, carb: 5, protein: 1.5, fat: 1 },
  { id: 'medialuna', name: 'Medialuna', unit: 'piece', ref: 1, carb: 20, protein: 3, fat: 7 },
];

const MACRO_KEYS = ['carb', 'protein', 'fat'];

/** Merge the seed foods with the athlete's overrides/custom foods into an id→food map.
 *  An override may tweak an existing food's macros or add a wholly new food. */
export function foodMap(overrides) {
  const map = {};
  for (const f of SEED_FOODS) map[f.id] = { ...f };
  for (const [id, patch] of Object.entries(overrides || {})) {
    map[id] = { ...(map[id] || { id, name: id, unit: 'g', ref: 100, carb: 0, protein: 0, fat: 0 }), ...patch, id };
  }
  return map;
}

/** Sorted list of all foods (seed + custom) — for pickers and the Foods editor. */
export function foodList(overrides) {
  return Object.values(foodMap(overrides)).sort((a, b) => a.name.localeCompare(b.name));
}

/** kcal from macros (Atwater: 4/4/9). */
export function kcalOf(carb, protein, fat) {
  return carb * 4 + protein * 4 + fat * 9;
}

/** Scale a food to `amount` of its unit → { carb, protein, fat, kcal }, rounded for display. */
export function scaleFood(food, amount) {
  const a = Number(amount);
  const factor = food && food.ref ? (Number.isFinite(a) ? a : 0) / food.ref : 0;
  const carb = (food.carb || 0) * factor;
  const protein = (food.protein || 0) * factor;
  const fat = (food.fat || 0) * factor;
  return round4({ carb, protein, fat, kcal: kcalOf(carb, protein, fat) });
}

/** Total macros for a structured meal (entries of { foodId, amount }) given a food map.
 *  Unknown foodIds contribute nothing. Returns rounded { carb, protein, fat, kcal }. */
export function mealTotals(entries, byId) {
  const sum = { carb: 0, protein: 0, fat: 0 };
  for (const e of entries || []) {
    const food = byId && byId[e.foodId];
    if (!food) continue;
    const factor = food.ref ? (Number(e.amount) || 0) / food.ref : 0;
    for (const k of MACRO_KEYS) sum[k] += (food[k] || 0) * factor;
  }
  return round4({ ...sum, kcal: kcalOf(sum.carb, sum.protein, sum.fat) });
}

/** Compare a computed value to a target → { delta, status } where status is
 *  'short' | 'on' | 'over'. On-target tolerance is the larger of 5 g or 8%. */
export function targetStatus(computed, target) {
  if (target == null) return { delta: null, status: 'on' };
  const delta = Math.round(computed - target);
  const tol = Math.max(5, Math.round(target * 0.08));
  if (delta < -tol) return { delta, status: 'short' };
  if (delta > tol) return { delta, status: 'over' };
  return { delta, status: 'on' };
}

function round4(m) {
  return {
    carb: Math.round(m.carb * 10) / 10,
    protein: Math.round(m.protein * 10) / 10,
    fat: Math.round(m.fat * 10) / 10,
    kcal: Math.round(m.kcal),
  };
}
