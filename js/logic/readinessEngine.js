// readinessEngine.js — morning readiness verdict (§5.6). PURE.
//
// evaluate(date, checkins) -> { status, reasons }
//   status ∈ "normal" | "flagged" | "unknown"
// Rules (§5.6):
//   • rhr >= 58                                        → flagged ("RHR ≥ 58 (baseline 50 + 8)")
//   • hrvMs < 0.75 × median(prior-28-day hrv) AND
//     sleepHours < 6                                   → flagged ("HRV crash + short sleep")
//   • rhr missing (or no check-in)                     → unknown
// Never blocks anything — the verdict only drives a suggestion in the UI.

import { diffDays } from './dateUtil.js';

const RHR_FLAG = 58; // baseline 50 + 8
const HRV_DROP = 0.75;
const SHORT_SLEEP_H = 6;
const LOOKBACK_DAYS = 28;

/** Median of hrvMs across check-ins in the 28 days *before* `date` (today excluded). */
function medianPriorHrv(date, checkins) {
  const vals = [];
  for (const [d, c] of Object.entries(checkins)) {
    if (!c || c.hrvMs == null) continue;
    const delta = diffDays(date, d);
    if (delta >= 1 && delta <= LOOKBACK_DAYS) vals.push(c.hrvMs);
  }
  if (!vals.length) return null;
  vals.sort((a, b) => a - b);
  const mid = Math.floor(vals.length / 2);
  return vals.length % 2 ? vals[mid] : (vals[mid - 1] + vals[mid]) / 2;
}

/**
 * @param {string} date ISO civil date
 * @param {Object<string, {rhr?, sleepHours?, hrvMs?}>} checkins
 * @returns {{status: 'normal'|'flagged'|'unknown', reasons: string[]}}
 */
export function evaluate(date, checkins) {
  const c = checkins && checkins[date];
  if (!c || c.rhr == null) return { status: 'unknown', reasons: [] };

  const reasons = [];
  if (c.rhr >= RHR_FLAG) reasons.push('RHR ≥ 58 (baseline 50 + 8)');

  if (c.hrvMs != null && c.sleepHours != null) {
    const median = medianPriorHrv(date, checkins);
    if (median != null && c.hrvMs < HRV_DROP * median && c.sleepHours < SHORT_SLEEP_H) {
      reasons.push('HRV crash + short sleep');
    }
  }

  return { status: reasons.length ? 'flagged' : 'normal', reasons };
}
