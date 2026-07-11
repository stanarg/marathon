// checkpointEvaluator.js — Week-7 checkpoint evaluation (§5.9). PURE.
//
// evaluate(logs, checkins, workoutPlan, manual) -> { criteria, outcome, outcomeText, triggered }
// Triggered conceptually when w07s06's log is saved. Auto criteria come from the log
// and pain flags; two criteria are MANUAL ticks (no HR series without HealthKit):
//   • drift < 8% + final-5k ≤ 6:20/km @ ≤160 bpm
//   • next-day soreness ≤ 2/10 (the following Monday)
// evaluatedAt / userDecision are attached by the persistence layer, not here (purity).

const KM_MIN = 22;
const Z2_HR_MAX = 150;
const PAIN_FLAG = 3;

function boolOrNull(v) {
  return v == null ? null : !!v;
}

export function evaluate(logs, checkins, workoutPlan, manual = {}) {
  const cp = (workoutPlan && workoutPlan.checkpoint) || {};
  const store = logs || {};
  const log = store[cp.session_id];
  // Only a COMPLETED log triggers the checkpoint. A missed/converted log carries no
  // actuals, so it would lock the panel into insufficient_data forever (dot never
  // clears, decision unreachable) and fire the soreness prompt for a run that never
  // happened. The athlete can still complete the run later and log it.
  const completed = log && log.status === 'completed' ? log : null;

  const km = completed ? completed.actualDistanceKm : undefined;
  const hr = completed ? completed.avgHR : undefined;
  const painFlags = Object.values(store).filter((l) => l.status === 'completed' && (l.painScore ?? 0) >= PAIN_FLAG).length;

  const criteria = [
    {
      id: 'completed_km',
      passed: km != null ? km >= KM_MIN : null,
      detail: km != null ? `${km} km logged (need ≥ ${KM_MIN})` : 'Log the checkpoint run to evaluate',
    },
    {
      id: 'z2_avg_hr',
      passed: hr != null ? hr <= Z2_HR_MAX : null,
      detail: hr != null ? `avg HR ${hr} (need ≤ ${Z2_HR_MAX})` : 'Add avg HR to the log',
    },
    {
      id: 'drift_final5k',
      passed: boolOrNull(manual.driftFinal5kOk),
      detail: 'Manual: drift < 8% and final 5 km ≤ 6:20/km at ≤ 160 bpm',
    },
    {
      id: 'pain_flags',
      passed: painFlags === 0,
      detail: `${painFlags} pain flag${painFlags === 1 ? '' : 's'} (need 0)`,
    },
    {
      id: 'next_day_soreness',
      passed: boolOrNull(manual.sorenessOk),
      detail: 'Manual: Monday soreness ≤ 2/10',
    },
  ];

  let outcome;
  if (criteria.some((c) => c.passed === false)) outcome = 'fail';
  else if (criteria.some((c) => c.passed === null)) outcome = 'insufficient_data';
  else outcome = 'pass';

  // "Exceed" (all criteria comfortably → revise to 4:35) is promoted from a clean pass
  // only when the athlete confirms they beat the targets with margin to spare. marginOk
  // is a MANUAL flag, not a criterion, so it never blocks a pass or forces insufficient_data.
  if (outcome === 'pass' && manual.marginOk === true) outcome = 'exceed';

  const outcomes = cp.outcomes || {};
  const outcomeText = outcome === 'insufficient_data' ? null : outcomes[outcome] || null;

  return { criteria, outcome, outcomeText, triggered: !!completed };
}
