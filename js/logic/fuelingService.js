// fuelingService.js — (date, plans) → DayPlan (§5.4). PURE.
//
// Assembles everything the Fuel/Today surfaces need for one civil date: the day's
// sessions, its day-type + macros, the meal-template meals, any session-fueling
// prescription, the shift context, the hydration target, and — on race day — the
// race_plan timeline in place of meals.
//
// The §5.4 signature is dayPlan(date, plans, store); every field here is derivable
// from date + plans, so `store` is accepted for signature fidelity but currently
// unused (reserved for folding logged state later). Keeping it store-free preserves
// the §2 purity rule and makes the module trivially testable.

import { createShiftCalendar } from './shiftCalendar.js';
import { dayType as resolveDayType, sessionsOn } from './dayTypeResolver.js';

function weekContaining(date, workoutPlan) {
  return (workoutPlan.weeks || []).find((w) => date >= w.start_date && date <= w.end_date) || null;
}

/**
 * @param {string} date ISO civil date
 * @param {{workoutPlan, nutritionPlan, athleteProfile}} plans
 * @param {object} [store] reserved (§5.4 signature); unused
 * @returns {object} DayPlan
 */
export function dayPlan(date, plans, store) {
  const { workoutPlan, nutritionPlan, athleteProfile } = plans;
  const shiftCal = createShiftCalendar({
    startDate: workoutPlan.start_date,
    workSchedule: athleteProfile.work_schedule,
  });

  const sessions = sessionsOn(date, workoutPlan);
  const dtId = resolveDayType(date, workoutPlan, nutritionPlan);
  const macros = (nutritionPlan.day_types || []).find((d) => d.id === dtId) || null;

  const templateId = shiftCal.mealTemplateId(date);
  const template = (nutritionPlan.meal_templates || []).find((t) => t.id === templateId) || null;

  const isRaceDay = dtId === 'race';
  const week = weekContaining(date, workoutPlan);
  const isRaceWeek = !!(week && week.phase === 'race');

  // Session-fueling prescription for a session happening today (if any).
  const sessionIdsToday = new Set(sessions.map((s) => s.id));
  const sessionFueling =
    (nutritionPlan.session_fueling || []).find((f) => sessionIdsToday.has(f.session_id)) || null;

  const hydro = nutritionPlan.hydration || {};
  const baseline = Array.isArray(hydro.daily_baseline_ml) ? hydro.daily_baseline_ml : [];

  return {
    date,
    sessions,
    dayType: dtId,
    macros,
    // Race day is governed by the race_plan timeline, not daily meals (§5.4).
    meals: isRaceDay ? [] : template ? template.meals : [],
    mealTemplateId: templateId,
    sessionFueling,
    shift: {
      schedule: shiftCal.schedule(date),
      work: shiftCal.workInterval(date),
      freeWindows: shiftCal.freeWindows(date),
    },
    hydrationTargetMl: baseline.length >= 2 ? { min: baseline[0], max: baseline[1], range: baseline } : null,
    isRaceWeek,
    raceTimeline: isRaceDay ? nutritionPlan.race_plan || null : null,
  };
}
