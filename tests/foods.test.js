// foods.test.js — food database resolution + meal macro math.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_FOODS, foodMap, foodList, scaleFood, mealTotals, targetStatus, kcalOf } from '../js/logic/foods.js';

test('scaleFood scales macros by amount / ref', () => {
  const oats = SEED_FOODS.find((f) => f.id === 'oats'); // per 100 g: 60C 13P 7F
  assert.deepEqual(scaleFood(oats, 100), { carb: 60, protein: 13, fat: 7, kcal: kcalOf(60, 13, 7) });
  const half = scaleFood(oats, 50);
  assert.equal(half.carb, 30);
  assert.equal(half.protein, 6.5);
  // per-piece food scales by count
  const egg = SEED_FOODS.find((f) => f.id === 'egg'); // per egg
  assert.equal(scaleFood(egg, 3).protein, Math.round(egg.protein * 3 * 10) / 10);
});

test('mealTotals sums a structured meal and ignores unknown foods', () => {
  const byId = foodMap({});
  // Stan's breakfast: 100 g oats, 3 eggs, 1 banana, 300 ml milk
  const entries = [
    { foodId: 'oats', amount: 100 },
    { foodId: 'egg', amount: 3 },
    { foodId: 'banana', amount: 1 },
    { foodId: 'milk', amount: 300 },
    { foodId: 'does_not_exist', amount: 999 }, // contributes nothing
  ];
  const t = mealTotals(entries, byId);
  // 60 + 1.2 + 27 + 14.4 = 102.6 C
  assert.equal(t.carb, 102.6);
  assert.ok(t.protein > 40 && t.protein < 46, `protein ~44, got ${t.protein}`);
  assert.equal(t.kcal, Math.round(kcalOf(t.carb, t.protein, t.fat)));
});

test('mealTotals is empty for no entries', () => {
  assert.deepEqual(mealTotals([], foodMap({})), { carb: 0, protein: 0, fat: 0, kcal: 0 });
  assert.deepEqual(mealTotals(null, foodMap({})), { carb: 0, protein: 0, fat: 0, kcal: 0 });
});

test('foodMap applies overrides (calibration) and adds custom foods', () => {
  const map = foodMap({
    oats: { carb: 55 }, // calibrated down to match a tracker
    my_shake: { name: 'Protein shake', unit: 'scoop', ref: 1, carb: 3, protein: 25, fat: 1.5 },
  });
  assert.equal(map.oats.carb, 55);
  assert.equal(map.oats.protein, 13, 'un-patched fields are preserved');
  assert.equal(map.my_shake.name, 'Protein shake');
  assert.equal(map.my_shake.id, 'my_shake');
  // foodList includes the custom food, sorted by name
  assert.ok(foodList({ my_shake: { name: 'Protein shake', unit: 'scoop', ref: 1, carb: 3, protein: 25, fat: 1.5 } }).some((f) => f.id === 'my_shake'));
});

test('targetStatus flags short / on / over within an 8%-or-5g tolerance', () => {
  assert.equal(targetStatus(78, 90).status, 'short'); // 12 under, tol = 7
  assert.equal(targetStatus(88, 90).status, 'on'); // 2 under, within tol
  assert.equal(targetStatus(90, 90).status, 'on');
  assert.equal(targetStatus(100, 90).status, 'over'); // 10 over
  assert.equal(targetStatus(50, null).status, 'on'); // no target → never flags
  assert.equal(targetStatus(78, 90).delta, -12);
});
