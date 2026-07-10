// safetyRules.test.js — §9 safety cases.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advisories } from '../js/logic/safetyRules.js';
import { loadFixtures } from './fixtures.js';

const { workoutPlan } = loadFixtures();
const ids = (advs) => advs.map((a) => a.id);

test('two pain-3 logs in week 6 → downshift (with convert action)', () => {
  const logs = {
    w06s01: { sessionId: 'w06s01', status: 'completed', painScore: 3 },
    w06s02: { sessionId: 'w06s02', status: 'completed', painScore: 3 },
  };
  const advs = advisories(logs, '2026-08-18', workoutPlan); // in week 6
  const ds = advs.find((a) => a.id === 'weekly_downshift');
  assert.ok(ds, 'expected weekly_downshift');
  assert.equal(ds.suggestedAction.sessionId, 'w06s04'); // next quality this week
  assert.equal(ds.suggestedAction.to, 'converted_easy');
});

test('one pain-3 log → no downshift', () => {
  const logs = { w06s01: { sessionId: 'w06s01', status: 'completed', painScore: 3 } };
  const advs = advisories(logs, '2026-08-18', workoutPlan);
  assert.ok(!ids(advs).includes('weekly_downshift'));
});

test('shin 4/10 → bone-stress 48h window', () => {
  const logs = { w06s02: { sessionId: 'w06s02', status: 'completed', painScore: 4, painSite: 'shin' } };
  const advs = advisories(logs, '2026-08-19', workoutPlan); // 1 day after w06s02 (08-18)
  const bs = advs.find((a) => a.id === 'bone_stress');
  assert.ok(bs, 'expected bone_stress advisory');
  assert.match(bs.text, /48 h/);
  assert.equal(bs.meta.zeroImpactUntil, '2026-08-20');
  assert.ok(!ids(advs).includes('bone_stress_recurrence'));
});

test('bone-stress recurrence after window → medical/pivot', () => {
  const logs = {
    w05s04: { sessionId: 'w05s04', status: 'completed', painScore: 4, painSite: 'shin' }, // 2026-08-13
    w06s02: { sessionId: 'w06s02', status: 'completed', painScore: 4, painSite: 'shin' }, // 2026-08-18 (>2d later)
  };
  const advs = advisories(logs, '2026-08-19', workoutPlan);
  assert.ok(ids(advs).includes('bone_stress_recurrence'), 'expected recurrence advisory');
});

test('bone-stress within window (2 events ≤48h apart) → no recurrence', () => {
  const logs = {
    w06s01: { sessionId: 'w06s01', status: 'completed', painScore: 3, painSite: 'shin' }, // 2026-08-17
    w06s02: { sessionId: 'w06s02', status: 'completed', painScore: 3, painSite: 'shin' }, // 2026-08-18 (1d later)
  };
  const advs = advisories(logs, '2026-08-19', workoutPlan);
  assert.ok(!ids(advs).includes('bone_stress_recurrence'));
  assert.ok(ids(advs).includes('bone_stress'));
});

test('4 consecutive missed → repeat-week; 3 → none', () => {
  const four = {
    w06s01: { sessionId: 'w06s01', status: 'missed' },
    w06s02: { sessionId: 'w06s02', status: 'missed' },
    w06s03: { sessionId: 'w06s03', status: 'missed' },
    w06s04: { sessionId: 'w06s04', status: 'missed' },
  };
  const advs4 = advisories(four, '2026-08-21', workoutPlan);
  assert.ok(ids(advs4).includes('missed_repeat_week'));

  const three = { ...four };
  delete three.w06s04;
  const advs3 = advisories(three, '2026-08-21', workoutPlan);
  assert.ok(!ids(advs3).includes('missed_repeat_week'));
});

test('persistent DAILY bone-stress (gaps ≤48h but span >48h) → recurrence', () => {
  // Review finding: continuous shin pain must escalate, not just gap-then-return.
  const logs = {
    w06s01: { sessionId: 'w06s01', status: 'completed', painScore: 4, painSite: 'shin' }, // 08-17
    w06s02: { sessionId: 'w06s02', status: 'completed', painScore: 4, painSite: 'shin' }, // 08-18
    w06s04: { sessionId: 'w06s04', status: 'completed', painScore: 4, painSite: 'shin' }, // 08-20
  };
  const advs = advisories(logs, '2026-08-21', workoutPlan);
  assert.ok(ids(advs).includes('bone_stress_recurrence'), 'daily persistence past 48h must escalate');
});

test('missed/converted logs never contribute pain flags (status guard)', () => {
  // Even if a log carries stale pain fields, a non-completed status must not fabricate advisories.
  const logs = {
    w06s01: { sessionId: 'w06s01', status: 'missed', painScore: 4, painSite: 'shin' },
    w06s02: { sessionId: 'w06s02', status: 'converted_cross', painScore: 4, painSite: 'shin' },
  };
  const advs = advisories(logs, '2026-08-19', workoutPlan);
  assert.ok(!ids(advs).includes('weekly_downshift'));
  assert.ok(!ids(advs).includes('bone_stress'));
  assert.ok(!ids(advs).includes('bone_stress_recurrence'));
});

test('no logs → no advisories', () => {
  assert.deepEqual(advisories({}, '2026-08-18', workoutPlan), []);
});
