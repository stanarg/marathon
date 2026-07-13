// mealSuggestions.js — the athlete's go-to meal for each named meal (Fuel §6). PURE.
//
// nutrition_plan.json is immutable and carries only a short `examples` string per
// meal (e.g. "oats + milk + banana + 3 eggs") with no portions. The athlete authors
// the detailed, portioned version in-app; it is persisted per meal key and surfaced
// here — the same "content that isn't in the JSON" pattern as strengthProgram.js.

/** Stable key for a meal, derived from its label. Repeated meals (e.g. "Lunch
 *  (work)" on every shift day) collapse to one key, so a single saved suggestion
 *  shows on every day — "the same every day". Purely a function of the label, which
 *  is stable because the plan JSON is immutable. */
export function mealKey(label) {
  return (
    String(label == null ? '' : label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'meal'
  );
}

/** Resolve what to show for a meal:
 *   { key, text, custom } where
 *   - text   = the athlete's saved suggestion if set, else the plan's short
 *              `examples` joined as a starting default (may be '')
 *   - custom = true when the text is the athlete's own saved value. */
export function suggestionFor(meal, saved) {
  const key = mealKey(meal && meal.label);
  const savedText = saved && saved[key];
  if (savedText != null && String(savedText).trim() !== '') {
    return { key, text: String(savedText), custom: true };
  }
  const fallback = (meal && Array.isArray(meal.examples) ? meal.examples : []).join(', ');
  return { key, text: fallback, custom: false };
}
