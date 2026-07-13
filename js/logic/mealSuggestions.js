// mealSuggestions.js — meal identity + the plan's short example (Fuel §6). PURE.
//
// A meal's detailed content is now STRUCTURED (foods + amounts, see foods.js) and
// keyed by mealKey so a repeated meal (e.g. "Lunch (work)" on every shift day) shares
// one saved meal — "the same every day". The plan's short `examples` string is used
// only as an empty-state hint when no meal has been built yet.

/** Stable key for a meal, derived from its label. Purely a function of the label,
 *  which is stable because the plan JSON is immutable. */
export function mealKey(label) {
  return (
    String(label == null ? '' : label)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'meal'
  );
}

/** The plan's short example text for a meal (joined), or '' — an empty-state hint. */
export function exampleHint(meal) {
  return (meal && Array.isArray(meal.examples) ? meal.examples : []).join(', ');
}
