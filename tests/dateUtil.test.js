// dateUtil.test.js — locks the pure civil-date helpers (my §3 addition).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidISODate, addDays, diffDays, dayName, isMonday, isWithin, compare } from '../js/logic/dateUtil.js';

test('isValidISODate rejects overflow and junk', () => {
  assert.equal(isValidISODate('2026-07-13'), true);
  assert.equal(isValidISODate('2026-02-30'), false);
  assert.equal(isValidISODate('2026-13-01'), false);
  assert.equal(isValidISODate('2026-7-13'), false);
  assert.equal(isValidISODate('noon'), false);
  assert.equal(isValidISODate(null), false);
});

test('day-of-week anchors', () => {
  assert.equal(dayName('2026-07-13'), 'Mon');
  assert.equal(isMonday('2026-07-13'), true);
  assert.equal(dayName('2026-09-20'), 'Sun'); // race day
});

test('addDays / diffDays', () => {
  assert.equal(addDays('2026-07-13', 6), '2026-07-19');
  assert.equal(addDays('2026-07-31', 1), '2026-08-01');
  assert.equal(diffDays('2026-09-14', '2026-07-13'), 63); // week 10 start → schedule B
  assert.equal(diffDays('2026-07-13', '2026-07-20'), -7);
});

test('compare / isWithin', () => {
  assert.equal(compare('2026-07-13', '2026-07-14'), -1);
  assert.equal(compare('2026-07-14', '2026-07-14'), 0);
  assert.equal(isWithin('2026-09-18', '2026-09-14', '2026-09-20'), true);
  assert.equal(isWithin('2026-09-21', '2026-09-14', '2026-09-20'), false);
});
