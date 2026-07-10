// compliance.js — weekly planned-vs-done aggregation for Trends (§5). PURE.

function round1(x) {
  return Math.round(x * 10) / 10;
}

/**
 * @returns {{index, plannedCount, completedCount, pct, plannedKm, completedKm}}
 */
export function weekCompliance(week, logs) {
  const sessions = week.sessions || [];
  const store = logs || {};
  let completedCount = 0;
  let plannedKm = 0;
  let completedKm = 0;

  for (const s of sessions) {
    if (s.distance_km != null) plannedKm += s.distance_km;
    const log = store[s.id];
    if (log && log.status === 'completed') {
      completedCount += 1;
      completedKm += log.actualDistanceKm != null ? log.actualDistanceKm : s.distance_km || 0;
    }
  }

  const plannedCount = sessions.length;
  const pct = plannedCount ? Math.round((completedCount / plannedCount) * 100) : 0;
  return {
    index: week.index,
    plannedCount,
    completedCount,
    pct,
    plannedKm: round1(plannedKm),
    completedKm: round1(completedKm),
  };
}

/** Per-week compliance across the whole plan (drives the Trends bar chart). */
export function allWeeksCompliance(workoutPlan, logs) {
  return (workoutPlan.weeks || []).map((w) => weekCompliance(w, logs));
}
