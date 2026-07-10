// shiftCalendar.test.js — §9 shiftCalendar cases against the real profile.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createShiftCalendar } from '../js/logic/shiftCalendar.js';
import { loadFixtures } from './fixtures.js';

const { workoutPlan, athleteProfile } = loadFixtures();
const cal = createShiftCalendar({
  startDate: workoutPlan.start_date,
  workSchedule: athleteProfile.work_schedule,
});

test('A/B rotation', () => {
  assert.equal(cal.schedule('2026-07-13'), 'A'); // week 1
  assert.equal(cal.schedule('2026-07-20'), 'B'); // week 2
  assert.equal(cal.schedule('2026-09-14'), 'B'); // week 10
});

test('A/B rotation stays correct before the block start (sign-safe modulo)', () => {
  assert.equal(cal.schedule('2026-07-06'), 'B'); // week 0 (07-06 → 07-12)
  assert.equal(cal.schedule('2026-07-05'), 'A'); // week -1 (06-29 → 07-05)
  assert.equal(cal.schedule('2026-06-29'), 'A'); // week -1 Monday
  assert.equal(cal.schedule('2026-06-28'), 'B'); // week -2
});

test('work intervals', () => {
  assert.equal(cal.workInterval('2026-07-19'), null); // Sunday → off
  assert.deepEqual(cal.workInterval('2026-07-18'), { start: '08:30', end: '19:30' }); // Saturday
});

test('meal-template ids follow the shift', () => {
  // Tue 2026-07-14 is week 1 (A) → A.tue = 11:30-20:30 (late) → am training.
  assert.equal(cal.mealTemplateId('2026-07-14'), 'late_shift_am_train');
  // Tue 2026-07-21 is week 2 (B) → B.tue = 07:30-15:30 (early) → pm training.
  assert.equal(cal.mealTemplateId('2026-07-21'), 'early_shift_pm_train');
  // Weekends
  assert.equal(cal.mealTemplateId('2026-07-18'), 'saturday_rest'); // Sat
  assert.equal(cal.mealTemplateId('2026-07-19'), 'sunday_long'); // Sun
});

test('free windows bracket the work interval', () => {
  const fw = cal.freeWindows('2026-07-14'); // late shift 11:30-20:30
  assert.deepEqual(fw, [
    { start: '06:00', end: '11:30' },
    { start: '20:30', end: '22:00' },
  ]);
  assert.deepEqual(cal.freeWindows('2026-07-19'), [{ start: '06:00', end: '22:00' }]); // Sunday, no work
});
