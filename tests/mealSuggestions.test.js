// mealSuggestions.test.js — meal keying + the empty-state example hint.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealKey, exampleHint } from '../js/logic/mealSuggestions.js';

test('mealKey slugifies labels and collapses repeats to one key', () => {
  assert.equal(mealKey('Breakfast'), 'breakfast');
  assert.equal(mealKey('Lunch (work)'), 'lunch_work');
  assert.equal(mealKey('Pre-long breakfast (2h prior)'), 'pre_long_breakfast_2h_prior');
  // Same label on different shift days → identical key ("same every day").
  assert.equal(mealKey('Lunch (work)'), mealKey('Lunch (work)'));
  // Defensive: junk/empty never yields an empty key.
  assert.equal(mealKey(''), 'meal');
  assert.equal(mealKey(null), 'meal');
  assert.equal(mealKey('   '), 'meal');
});

test('exampleHint joins the plan examples, or returns empty', () => {
  assert.equal(exampleHint({ examples: ['toast + jam', 'banana'] }), 'toast + jam, banana');
  assert.equal(exampleHint({ examples: [] }), '');
  assert.equal(exampleHint({}), '');
  assert.equal(exampleHint(null), '');
});
