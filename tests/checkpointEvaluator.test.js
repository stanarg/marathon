// checkpointEvaluator.test.js — §9 checkpoint cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate } from '../js/logic/checkpointEvaluator.js';
import { loadFixtures } from './fixtures.js';

const { workoutPlan } = loadFixtures();
const manualAllOk = { driftFinal5kOk: true, sorenessOk: true };

test('passing log → pass / "confirm 4:45"', () => {
  const logs = { w07s06: { sessionId: 'w07s06', status: 'completed', actualDistanceKm: 23, avgHR: 148, painScore: 0 } };
  const r = evaluate(logs, {}, workoutPlan, manualAllOk);
  assert.equal(r.outcome, 'pass');
  assert.equal(r.outcomeText, 'confirm 4:45');
  assert.equal(r.triggered, true);
});

test('20 km → fail', () => {
  const logs = { w07s06: { sessionId: 'w07s06', status: 'completed', actualDistanceKm: 20, avgHR: 148 } };
  const r = evaluate(logs, {}, workoutPlan, manualAllOk);
  assert.equal(r.outcome, 'fail');
  assert.match(r.outcomeText, /5:00|half/);
});

test('manual criteria nil → insufficient_data until ticked', () => {
  const logs = { w07s06: { sessionId: 'w07s06', status: 'completed', actualDistanceKm: 23, avgHR: 148 } };
  const before = evaluate(logs, {}, workoutPlan, {}); // no manual ticks
  assert.equal(before.outcome, 'insufficient_data');
  assert.equal(before.outcomeText, null);

  const after = evaluate(logs, {}, workoutPlan, manualAllOk);
  assert.equal(after.outcome, 'pass');
});

test('a pain flag anywhere fails the pain_flags criterion', () => {
  const logs = {
    w07s06: { sessionId: 'w07s06', status: 'completed', actualDistanceKm: 23, avgHR: 148 },
    w06s06: { sessionId: 'w06s06', status: 'completed', painScore: 4, painSite: 'calf' },
  };
  const r = evaluate(logs, {}, workoutPlan, manualAllOk);
  assert.equal(r.outcome, 'fail');
  const pf = r.criteria.find((c) => c.id === 'pain_flags');
  assert.equal(pf.passed, false);
});

test('not triggered before the checkpoint run is logged', () => {
  const r = evaluate({}, {}, workoutPlan, {});
  assert.equal(r.triggered, false);
  assert.equal(r.outcome, 'insufficient_data');
});

test('a missed or converted checkpoint log does NOT trigger the checkpoint', () => {
  // A non-completed log has no actuals — triggering would dead-end the panel in
  // insufficient_data (decision unreachable, drawer dot stuck) and fire the
  // soreness prompt for a run that never happened.
  for (const status of ['missed', 'converted_cross', 'converted_easy']) {
    const r = evaluate({ w07s06: { sessionId: 'w07s06', status } }, {}, workoutPlan, {});
    assert.equal(r.triggered, false, `status=${status} must not trigger`);
  }
  // Re-logging it as completed afterwards triggers normally.
  const done = evaluate(
    { w07s06: { sessionId: 'w07s06', status: 'completed', actualDistanceKm: 23, avgHR: 148, painScore: 0 } },
    {}, workoutPlan, manualAllOk
  );
  assert.equal(done.triggered, true);
  assert.equal(done.outcome, 'pass');
});

test('clean pass + margin tick → exceed / "revise to 4:35"', () => {
  const logs = { w07s06: { sessionId: 'w07s06', status: 'completed', actualDistanceKm: 23, avgHR: 148, painScore: 0 } };
  const r = evaluate(logs, {}, workoutPlan, { ...manualAllOk, marginOk: true });
  assert.equal(r.outcome, 'exceed');
  assert.match(r.outcomeText, /4:35/);
});

test('margin tick only promotes a clean pass — never a fail or a partial', () => {
  // a failing criterion stays fail even with marginOk
  const failLogs = { w07s06: { sessionId: 'w07s06', status: 'completed', actualDistanceKm: 20, avgHR: 148 } };
  assert.equal(evaluate(failLogs, {}, workoutPlan, { ...manualAllOk, marginOk: true }).outcome, 'fail');
  // a clean pass without marginOk stays pass
  const passLogs = { w07s06: { sessionId: 'w07s06', status: 'completed', actualDistanceKm: 23, avgHR: 148, painScore: 0 } };
  assert.equal(evaluate(passLogs, {}, workoutPlan, manualAllOk).outcome, 'pass');
});
