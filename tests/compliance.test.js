// compliance.test.js — §9 compliance case.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekCompliance, allWeeksCompliance } from '../js/logic/compliance.js';
import { loadFixtures } from './fixtures.js';

const { workoutPlan } = loadFixtures();
const week1 = workoutPlan.weeks[0];

test('week 1 with 4 of 6 completed → 67%', () => {
  const logs = {
    w01s01: { sessionId: 'w01s01', status: 'completed', actualDistanceKm: null },
    w01s02: { sessionId: 'w01s02', status: 'completed', actualDistanceKm: 5 },
    w01s03: { sessionId: 'w01s03', status: 'completed' },
    w01s04: { sessionId: 'w01s04', status: 'completed', actualDistanceKm: 6 },
    // w01s05, w01s06 not completed
  };
  const c = weekCompliance(week1, logs);
  assert.equal(c.plannedCount, 6);
  assert.equal(c.completedCount, 4);
  assert.equal(c.pct, 67);
});

test('missed/converted logs do not count as completed', () => {
  const logs = {
    w01s02: { sessionId: 'w01s02', status: 'missed' },
    w01s04: { sessionId: 'w01s04', status: 'converted_cross' },
  };
  assert.equal(weekCompliance(week1, logs).completedCount, 0);
});

test('completedKm uses actuals, falling back to planned', () => {
  const logs = {
    w01s02: { sessionId: 'w01s02', status: 'completed', actualDistanceKm: 5.4 }, // planned 5
    w01s06: { sessionId: 'w01s06', status: 'completed' }, // planned 9, no actual → 9
  };
  const c = weekCompliance(week1, logs);
  assert.equal(c.completedKm, 14.4);
});

test('allWeeksCompliance returns one entry per week', () => {
  const all = allWeeksCompliance(workoutPlan, {});
  assert.equal(all.length, 10);
  assert.equal(all[0].index, 1);
});
