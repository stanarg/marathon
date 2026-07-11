// validator.js — plan validation, run at every boot (§5.1). A failure renders a
// full-screen diagnostic; this is Stan's own pipeline debugging aid, so messages
// are specific and human-readable. PURE: no I/O, deterministic, never throws
// (any internal error is captured and reported as a validation error).
//
// The numbered rules below are §5.1 verbatim. The two cross-checks at the end are
// the §8.3 checks ("cardio_metrics.hr_max/hr_rest cross-check vs plan"; goal
// target), added because §8.3 frames them as validation errors and §11 lists them
// as consistency anchors. All pass on the real /data files.

import { isValidISODate, isMonday, addDays } from './dateUtil.js';

const SESSION_TYPES = [
  'cross',
  'run_easy',
  'run_strides',
  'run_quality',
  'long_run',
  'strength',
  'race',
];
const SESSION_WINDOWS = ['am', 'pm'];
const ID_RE = /^w\d{2}s\d{2}$/;

/**
 * @returns {{ok:true} | {ok:false, errors:string[]}}
 */
export function validate(workoutPlan, nutritionPlan, athleteProfile) {
  const errors = [];
  const add = (msg) => errors.push(msg);
  const req = (cond, msg) => {
    if (!cond) add(msg);
    return cond;
  };

  try {
    const wp = workoutPlan || {};
    const np = nutritionPlan || {};
    const ap = athleteProfile || {};

    // --- R1: schema_version === "1.0" on all three ---------------------------
    req(wp.schema_version === '1.0', `workout_plan schema_version must be "1.0" (got ${JSON.stringify(wp.schema_version)})`);
    req(np.schema_version === '1.0', `nutrition_plan schema_version must be "1.0" (got ${JSON.stringify(np.schema_version)})`);
    req(ap.schema_version === '1.0', `athlete_profile schema_version must be "1.0" (got ${JSON.stringify(ap.schema_version)})`);

    // Collect sessions once for reuse.
    const weeks = Array.isArray(wp.weeks) ? wp.weeks : [];
    const sessions = [];
    for (const wk of weeks) {
      if (wk && Array.isArray(wk.sessions)) sessions.push(...wk.sessions);
    }
    const sessionIds = new Set();

    // --- R2 (dates ISO-parse) + R3 (window/type enums) + R4 (id format/unique)
    const checkDate = (val, label) => {
      if (val == null) {
        add(`${label} is missing`);
      } else if (!isValidISODate(val)) {
        add(`${label} is not an ISO date: ${JSON.stringify(val)}`);
      }
    };

    checkDate(wp.start_date, 'workout_plan.start_date');
    checkDate(wp.race && wp.race.date, 'workout_plan.race.date');
    checkDate(wp.checkpoint && wp.checkpoint.date, 'workout_plan.checkpoint.date');
    checkDate(wp.generated, 'workout_plan.generated');

    // Nutrition + athlete full-ISO date fields (§8.2/§8.3). We validate only true
    // YYYY-MM-DD fields; athlete running_history.longest_run_date is an intentional
    // YYYY-MM partial and is deliberately left unchecked.
    checkDate(np.generated, 'nutrition_plan.generated');
    checkDate(np.anchors && np.anchors.start_date, 'nutrition_plan.anchors.start_date');
    checkDate(np.anchors && np.anchors.race_date, 'nutrition_plan.anchors.race_date');
    const carbLoadDates = (np.race_plan && np.race_plan.carb_load && Array.isArray(np.race_plan.carb_load.dates)) ? np.race_plan.carb_load.dates : [];
    carbLoadDates.forEach((d, i) => checkDate(d, `nutrition_plan.race_plan.carb_load.dates[${i}]`));
    checkDate(ap.athlete && ap.athlete.dob, 'athlete_profile.athlete.dob');
    checkDate(ap.timeline && ap.timeline.start_date, 'athlete_profile.timeline.start_date');
    checkDate(ap.goal && ap.goal.race_date, 'athlete_profile.goal.race_date');

    for (const wk of weeks) {
      const wl = `week ${wk && wk.index}`;
      checkDate(wk && wk.start_date, `${wl}.start_date`);
      checkDate(wk && wk.end_date, `${wl}.end_date`);
    }

    for (const s of sessions) {
      const sl = `session ${s && s.id}`;
      checkDate(s && s.date, `${sl}.date`);

      // R3: window + type enums
      req(SESSION_WINDOWS.includes(s && s.window), `${sl}.window must be am|pm (got ${JSON.stringify(s && s.window)})`);
      req(SESSION_TYPES.includes(s && s.type), `${sl}.type "${s && s.type}" not in session-type enum`);

      // R4: id format + uniqueness
      if (!ID_RE.test(s && s.id)) {
        add(`session id ${JSON.stringify(s && s.id)} is not wXXsYY format`);
      } else if (sessionIds.has(s.id)) {
        add(`duplicate session id: ${s.id}`);
      } else {
        sessionIds.add(s.id);
      }
    }

    // --- R5: referential integrity into the workout plan ---------------------
    const fueling = Array.isArray(np.session_fueling) ? np.session_fueling : [];
    for (const f of fueling) {
      req(sessionIds.has(f && f.session_id), `session_fueling references unknown session_id: ${JSON.stringify(f && f.session_id)}`);
    }
    const sweatTests = (np.hydration && Array.isArray(np.hydration.sweat_rate_tests)) ? np.hydration.sweat_rate_tests : [];
    for (const id of sweatTests) {
      req(sessionIds.has(id), `hydration.sweat_rate_tests references unknown session_id: ${JSON.stringify(id)}`);
    }
    req(sessionIds.has(wp.checkpoint && wp.checkpoint.session_id), `checkpoint.session_id references unknown session_id: ${JSON.stringify(wp.checkpoint && wp.checkpoint.session_id)}`);

    // --- R6: day-type rule session_types ⊆ enum ------------------------------
    const dta = np.day_type_assignment || {};
    const rules = Array.isArray(dta.rules) ? dta.rules : [];
    const overrides = Array.isArray(dta.date_overrides) ? dta.date_overrides : [];
    const dayTypeIds = new Set((Array.isArray(np.day_types) ? np.day_types : []).map((d) => d && d.id));

    for (const r of rules) {
      const types = (r && r.match && Array.isArray(r.match.session_types)) ? r.match.session_types : [];
      for (const t of types) {
        req(SESSION_TYPES.includes(t), `day_type rule (priority ${r && r.priority}) references unknown session type: ${JSON.stringify(t)}`);
      }
    }

    // --- R7: every rule/override day_type exists in day_types -----------------
    for (const r of rules) {
      req(dayTypeIds.has(r && r.day_type), `day_type rule (priority ${r && r.priority}) references unknown day_type: ${JSON.stringify(r && r.day_type)}`);
    }
    for (const o of overrides) {
      req(dayTypeIds.has(o && o.day_type), `date_override ${o && o.date} references unknown day_type: ${JSON.stringify(o && o.day_type)}`);
      checkDate(o && o.date, `date_override.date`);
    }

    // --- R8: weeks contiguous, Monday-start ----------------------------------
    const ordered = [...weeks].sort((a, b) => (a && a.index) - (b && b.index));
    if (ordered.length > 0) {
      req(ordered[0].start_date === wp.start_date, `first week.start_date (${ordered[0].start_date}) must equal plan start_date (${wp.start_date})`);
    }
    ordered.forEach((wk, i) => {
      if (!wk) return;
      req((wk.index) === i + 1, `weeks not contiguous: expected index ${i + 1}, got ${wk.index}`);
      if (isValidISODate(wk.start_date)) {
        req(isMonday(wk.start_date), `week ${wk.index}.start_date ${wk.start_date} is not a Monday`);
        if (isValidISODate(wk.end_date)) {
          req(addDays(wk.start_date, 6) === wk.end_date, `week ${wk.index}.end_date ${wk.end_date} must be start_date + 6 days`);
        }
      }
      if (i > 0) {
        const prev = ordered[i - 1];
        if (prev && isValidISODate(prev.end_date) && isValidISODate(wk.start_date)) {
          req(addDays(prev.end_date, 1) === wk.start_date, `week ${wk.index} does not start the day after week ${prev.index} ends`);
        }
      }
    });

    // --- R9: race session date === race.date ---------------------------------
    const raceSessions = sessions.filter((s) => s && s.type === 'race');
    req(raceSessions.length === 1, `expected exactly one race session, found ${raceSessions.length}`);
    if (raceSessions.length === 1) {
      req(raceSessions[0].date === (wp.race && wp.race.date), `race session date (${raceSessions[0].date}) must equal race.date (${wp.race && wp.race.date})`);
    }

    // --- R10: anchors identical across the three files -----------------------
    const startDates = [wp.start_date, np.anchors && np.anchors.start_date, ap.timeline && ap.timeline.start_date];
    req(allEqual(startDates), `start_date must match across all three files (got ${JSON.stringify(startDates)})`);

    const raceDates = [wp.race && wp.race.date, np.anchors && np.anchors.race_date, ap.goal && ap.goal.race_date];
    req(allEqual(raceDates), `race_date must match across all three files (got ${JSON.stringify(raceDates)})`);

    const weights = [np.anchors && np.anchors.weight_kg, ap.athlete && ap.athlete.weight_kg];
    req(allEqual(weights), `weight_kg must match between nutrition and athlete files (got ${JSON.stringify(weights)})`);

    // --- R11 (§8.3): HR max/rest cross-check vs plan --------------------------
    const cm = ap.cardio_metrics || {};
    const hm = wp.hr_model || {};
    req(hm.hr_max === cm.hr_max_observed, `hr_max mismatch: plan ${hm.hr_max} vs athlete ${cm.hr_max_observed}`);
    req(hm.hr_rest === cm.hr_rest, `hr_rest mismatch: plan ${hm.hr_rest} vs athlete ${cm.hr_rest}`);

    // --- R12 (§8.3/§11): race target vs athlete agreed target ----------------
    req((wp.race && wp.race.target_finish) === (ap.goal && ap.goal.agreed_target), `race target mismatch: plan ${wp.race && wp.race.target_finish} vs athlete agreed ${ap.goal && ap.goal.agreed_target}`);
  } catch (e) {
    errors.push(`unexpected validation error: ${e && e.message ? e.message : e}`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function allEqual(arr) {
  if (arr.some((v) => v == null)) return false;
  return arr.every((v) => v === arr[0]);
}
