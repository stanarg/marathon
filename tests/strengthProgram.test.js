// strengthProgram.test.js — verifies the §7 strength regimen mapping against the
// real workout plan's strength sessions.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strengthDetail } from '../js/logic/strengthProgram.js';
import { loadFixtures } from './fixtures.js';

const { workoutPlan } = loadFixtures();
const byId = (id) => workoutPlan.weeks.flatMap((w) => w.sessions).find((s) => s.id === id);

test('non-strength sessions return null', () => {
  assert.equal(strengthDetail(byId('w01s02')), null); // an easy run
  assert.equal(strengthDetail(byId('w01s01')), null); // cross
  assert.equal(strengthDetail(null), null);
});

test('Strength A → Session A exercises', () => {
  const d = strengthDetail(byId('w01s03')); // "Strength A (reintroduction, RPE 6)"
  assert.equal(d.program, 'Session A');
  assert.equal(d.exercises[0].name, 'Goblet or back squat');
  assert.equal(d.exercises.length, 6);
  assert.match(d.note, /RPE 6/); // reintroduction note
});

test('Strength B → Session B exercises', () => {
  const d = strengthDetail(byId('w02s03')); // "Strength B (RPE 7)"
  assert.equal(d.program, 'Session B');
  assert.equal(d.exercises[0].name, 'Trap-bar or DB deadlift');
  assert.ok(d.exercises.some((e) => e.name === 'Copenhagen plank'));
});

test('last-loaded session B carries the deload note', () => {
  const d = strengthDetail(byId('w08s03')); // "Strength B - last loaded session"
  assert.equal(d.program, 'Session B');
  assert.match(d.note, /last loaded/i);
});

test('W9 bodyweight circuit is recognised and load-free', () => {
  const d = strengthDetail(byId('w09s03')); // "Bodyweight circuit 25 min only"
  assert.equal(d.program, 'Bodyweight circuit');
  assert.match(d.note, /bodyweight only/i);
  assert.ok(d.exercises.length > 0);
});

test('every strength session in the plan resolves to a program with exercises', () => {
  const strengthSessions = workoutPlan.weeks.flatMap((w) => w.sessions).filter((s) => s.type === 'strength');
  assert.ok(strengthSessions.length >= 8);
  for (const s of strengthSessions) {
    const d = strengthDetail(s);
    assert.ok(d, `no detail for ${s.id}`);
    assert.ok(d.exercises.length > 0, `no exercises for ${s.id} (${s.title})`);
  }
});
