// dayTypeResolver.js — (date, plans) → day-type id (§5.3). PURE.
//
// Order (per nutrition_plan.day_type_assignment):
//   1. date_overrides win outright.
//   2. otherwise rules by ascending priority against that date's sessions; first match wins.
//   3. a day with no sessions → rest.

/** All workout sessions scheduled on `date`. */
function sessionsOn(date, workoutPlan) {
  const out = [];
  for (const wk of workoutPlan.weeks || []) {
    for (const s of wk.sessions || []) {
      if (s.date === date) out.push(s);
    }
  }
  return out;
}

/** True iff `rule` matches the given day's sessions. */
function ruleMatches(rule, sessions) {
  const types = (rule.match && rule.match.session_types) || [];
  const minKm = rule.match && rule.match.min_distance_km;
  if (types.length === 0) {
    // The empty-types rule (rest) applies only to a day with no sessions.
    return sessions.length === 0;
  }
  return sessions.some((s) => {
    if (!types.includes(s.type)) return false;
    if (minKm == null) return true;
    return s.distance_km != null && s.distance_km >= minKm;
  });
}

/**
 * @returns {string} day-type id (e.g. "easy", "long_high", "carb_load", "race", "rest").
 */
export function dayType(date, workoutPlan, nutritionPlan) {
  const assignment = nutritionPlan.day_type_assignment || {};

  // 1. date overrides
  const override = (assignment.date_overrides || []).find((o) => o.date === date);
  if (override) return override.day_type;

  // 2. rules by ascending priority
  const sessions = sessionsOn(date, workoutPlan);
  const rules = [...(assignment.rules || [])].sort((a, b) => a.priority - b.priority);
  for (const rule of rules) {
    if (ruleMatches(rule, sessions)) return rule.day_type;
  }

  // 3. fallback
  return 'rest';
}

export { sessionsOn };
