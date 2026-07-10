// validator.test.js — §9 validator cases against the real /data files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../js/logic/validator.js';
import { loadFixtures, clone } from './fixtures.js';

test('real files pass validation', () => {
  const { workoutPlan, nutritionPlan, athleteProfile } = loadFixtures();
  const res = validate(workoutPlan, nutritionPlan, athleteProfile);
  assert.deepEqual(res, { ok: true }, `expected ok, got ${JSON.stringify(res)}`);
});

test('schema_version "2.0" fails', () => {
  const { workoutPlan, nutritionPlan, athleteProfile } = loadFixtures();
  const wp = clone(workoutPlan);
  wp.schema_version = '2.0';
  const res = validate(wp, nutritionPlan, athleteProfile);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /schema_version/.test(e)), res.errors.join('\n'));
});

test('fueling ref w99s01 fails', () => {
  const { workoutPlan, nutritionPlan, athleteProfile } = loadFixtures();
  const np = clone(nutritionPlan);
  np.session_fueling[0].session_id = 'w99s01';
  const res = validate(workoutPlan, np, athleteProfile);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /w99s01/.test(e)), res.errors.join('\n'));
});

test('window "noon" fails', () => {
  const { workoutPlan, nutritionPlan, athleteProfile } = loadFixtures();
  const wp = clone(workoutPlan);
  wp.weeks[0].sessions[0].window = 'noon';
  const res = validate(wp, nutritionPlan, athleteProfile);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /window/.test(e)), res.errors.join('\n'));
});

test('anchor mismatch (patched weight) fails', () => {
  const { workoutPlan, nutritionPlan, athleteProfile } = loadFixtures();
  const ap = clone(athleteProfile);
  ap.athlete.weight_kg = 91.0; // no longer matches nutrition anchors (90.3)
  const res = validate(workoutPlan, nutritionPlan, ap);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /weight/.test(e)), res.errors.join('\n'));
});

test('race-date mismatch fails', () => {
  const { workoutPlan, nutritionPlan, athleteProfile } = loadFixtures();
  const np = clone(nutritionPlan);
  np.anchors.race_date = '2026-09-21'; // no longer matches workout/athlete
  const res = validate(workoutPlan, np, athleteProfile);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /race_date/.test(e)), res.errors.join('\n'));
});

// --- date-coverage hardening (review finding #1) ---------------------------
test('corrupt workout_plan.generated fails ISO check', () => {
  const { workoutPlan, nutritionPlan, athleteProfile } = loadFixtures();
  const wp = clone(workoutPlan);
  wp.generated = 'garbage';
  const res = validate(wp, nutritionPlan, athleteProfile);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /generated/.test(e)), res.errors.join('\n'));
});

test('corrupt athlete dob fails ISO check', () => {
  const { workoutPlan, nutritionPlan, athleteProfile } = loadFixtures();
  const ap = clone(athleteProfile);
  ap.athlete.dob = '1999-13-99';
  const res = validate(workoutPlan, nutritionPlan, ap);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /dob/.test(e)), res.errors.join('\n'));
});

test('carb-load date corruption fails ISO check', () => {
  const { workoutPlan, nutritionPlan, athleteProfile } = loadFixtures();
  const np = clone(nutritionPlan);
  np.race_plan.carb_load.dates[0] = '2026-09-31'; // Sept has 30 days
  const res = validate(workoutPlan, np, athleteProfile);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /carb_load/.test(e)), res.errors.join('\n'));
});

test('intentional YYYY-MM partial (longest_run_date) is NOT flagged', () => {
  // running_history.longest_run_date is "2025-07" by design; must not fail.
  const { workoutPlan, nutritionPlan, athleteProfile } = loadFixtures();
  const res = validate(workoutPlan, nutritionPlan, athleteProfile);
  assert.deepEqual(res, { ok: true });
});
