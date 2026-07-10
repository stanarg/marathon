// dayTypeResolver.test.js — §9 dayType cases + the full 70-day sweep totals.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayType } from '../js/logic/dayTypeResolver.js';
import { addDays } from '../js/logic/dateUtil.js';
import { loadFixtures } from './fixtures.js';

const { workoutPlan, nutritionPlan } = loadFixtures();
const dt = (date) => dayType(date, workoutPlan, nutritionPlan);

test('spot dates', () => {
  assert.equal(dt('2026-07-18'), 'rest'); // Sat, no session
  assert.equal(dt('2026-07-19'), 'long_std'); // long_run 9 km (<17)
  assert.equal(dt('2026-08-16'), 'long_high'); // long_run 17 km (>=17)
  assert.equal(dt('2026-08-13'), 'quality'); // run_quality
  assert.equal(dt('2026-07-13'), 'easy'); // cross
  assert.equal(dt('2026-09-18'), 'carb_load'); // override beats easy (shakeout)
  assert.equal(dt('2026-09-20'), 'race'); // race
});

test('70-day sweep totals', () => {
  const tally = {};
  let date = workoutPlan.start_date; // 2026-07-13
  for (let i = 0; i < 70; i++) {
    const id = dt(date);
    tally[id] = (tally[id] || 0) + 1;
    date = addDays(date, 1);
  }
  assert.deepEqual(tally, {
    easy: 41,
    rest: 11,
    quality: 6,
    long_std: 5,
    long_high: 4,
    carb_load: 2,
    race: 1,
  });
});
