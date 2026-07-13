// foods.test.js — food database resolution + meal macro math.
// Exact-number checks use hand-built foods so they stay valid no matter how the seed
// values are later calibrated; seed foods are only checked for "resolves + sane".

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { foodMap, foodList, scaleFood, mealTotals, targetStatus, kcalOf } from '../js/logic/foods.js';

test('scaleFood scales macros by amount / ref', () => {
  const oats = { unit: 'g', ref: 100, carb: 60, protein: 13, fat: 7 }; // per 100 g
  assert.deepEqual(scaleFood(oats, 100), { carb: 60, protein: 13, fat: 7, kcal: kcalOf(60, 13, 7) });
  assert.equal(scaleFood(oats, 50).carb, 30);
  assert.equal(scaleFood(oats, 50).protein, 6.5);
  const egg = { unit: 'egg', ref: 1, carb: 0.5, protein: 6, fat: 5 }; // per piece
  assert.equal(scaleFood(egg, 3).protein, 18);
});

test('mealTotals sums a structured meal (exact, with a hand-built food map)', () => {
  const byId = {
    oats: { id: 'oats', unit: 'g', ref: 100, carb: 60, protein: 13, fat: 7 },
    egg: { id: 'egg', unit: 'egg', ref: 1, carb: 0.5, protein: 6, fat: 5 },
  };
  const t = mealTotals([
    { foodId: 'oats', amount: 100 },
    { foodId: 'egg', amount: 2 },
    { foodId: 'does_not_exist', amount: 999 }, // contributes nothing
  ], byId);
  assert.equal(t.carb, 61); // 60 + 1
  assert.equal(t.protein, 25); // 13 + 12
  assert.equal(t.fat, 17); // 7 + 10
  assert.equal(t.kcal, Math.round(kcalOf(61, 25, 17)));
});

test('mealTotals is empty for no entries', () => {
  assert.deepEqual(mealTotals([], foodMap({})), { carb: 0, protein: 0, fat: 0, kcal: 0 });
  assert.deepEqual(mealTotals(null, foodMap({})), { carb: 0, protein: 0, fat: 0, kcal: 0 });
});

test('mealTotals resolves real seed foods to sane positive macros', () => {
  const t = mealTotals([{ foodId: 'oats', amount: 100 }, { foodId: 'banana', amount: 1 }], foodMap({}));
  assert.ok(t.carb > 0 && t.protein > 0 && t.kcal > 0, `expected positive macros, got ${JSON.stringify(t)}`);
});

test('foodMap applies overrides (calibration) and adds custom foods', () => {
  const map = foodMap({
    oats: { carb: 55 }, // calibrated to a tracker
    my_shake: { name: 'Protein shake', unit: 'scoop', ref: 1, carb: 3, protein: 25, fat: 1.5 },
  });
  assert.equal(map.oats.carb, 55);
  assert.equal(map.oats.protein, 13, 'un-patched fields are preserved from the seed');
  assert.equal(map.my_shake.name, 'Protein shake');
  assert.equal(map.my_shake.id, 'my_shake');
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
