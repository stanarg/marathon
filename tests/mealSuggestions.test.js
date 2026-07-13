// mealSuggestions.test.js — meal keying + suggestion resolution.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealKey, suggestionFor } from '../js/logic/mealSuggestions.js';

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

test('suggestionFor prefers a saved suggestion over the plan example', () => {
  const meal = { label: 'Breakfast', examples: ['oats + milk + banana + 3 eggs'] };
  const saved = { breakfast: '100 g oats, 3 eggs, 1 banana, 300 ml milk' };
  const s = suggestionFor(meal, saved);
  assert.equal(s.key, 'breakfast');
  assert.equal(s.text, '100 g oats, 3 eggs, 1 banana, 300 ml milk');
  assert.equal(s.custom, true);
});

test('suggestionFor falls back to the joined plan examples when nothing is saved', () => {
  const meal = { label: 'Pre-run snack', examples: ['toast + jam', 'banana'] };
  const s = suggestionFor(meal, {});
  assert.equal(s.key, 'pre_run_snack');
  assert.equal(s.text, 'toast + jam, banana');
  assert.equal(s.custom, false);
});

test('suggestionFor yields empty text (not custom) when there is no example and no save', () => {
  const s = suggestionFor({ label: 'Dinner', examples: [] }, {});
  assert.equal(s.key, 'dinner');
  assert.equal(s.text, '');
  assert.equal(s.custom, false);
});

test('a blank/whitespace saved value does not count as custom', () => {
  const meal = { label: 'Dinner', examples: ['soup + bread'] };
  const s = suggestionFor(meal, { dinner: '   ' });
  assert.equal(s.text, 'soup + bread', 'falls back to the example');
  assert.equal(s.custom, false);
});
