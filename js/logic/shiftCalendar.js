// shiftCalendar.js — A/B schedule, work intervals, free windows, meal-template id
// (§5.2). PURE: a factory closes over startDate + workSchedule (both injected from
// already-loaded plan data); every method takes an ISO civil date string.

import { diffDays, dayName } from './dateUtil.js';

// Meal-template ids are a naming convention shared with nutrition_plan.json (§5.2).
const TEMPLATE = {
  SUNDAY_LONG: 'sunday_long',
  SATURDAY_REST: 'saturday_rest',
  EARLY_PM: 'early_shift_pm_train', // early shift (07:30 start) → train in the pm
  LATE_AM: 'late_shift_am_train', // late shift (11:30 start) → train in the am
};

// Assumed waking day for free-window computation. No §9 test pins this; the spec
// gives no bounds, so we use a sensible 06:00–22:00 window (meals span 06:30–21:30).
const DAY_START = '06:00';
const DAY_END = '22:00';

const DOW_KEY = { Mon: 'mon', Tue: 'tue', Wed: 'wed', Thu: 'thu', Fri: 'fri', Sat: 'sat', Sun: 'sun' };

function parseInterval(str) {
  if (!str || str === 'OFF') return null;
  const [start, end] = str.split('-');
  return { start, end };
}

const toMin = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function createShiftCalendar({ startDate, workSchedule }) {
  /** Which two-week rotation the date falls in: week 1 (from startDate) = A, alternating.
   *  Uses the 0-based block offset with a sign-safe modulo so dates *before* the block
   *  start (negative offset) still alternate correctly. */
  function schedule(date) {
    const block = Math.floor(diffDays(date, startDate) / 7); // 0 = week 1
    return ((block % 2) + 2) % 2 === 0 ? 'A' : 'B'; // even offset → A, odd → B
  }

  /** Work hours for the date, or null on a day off (Sunday). */
  function workInterval(date) {
    const table = workSchedule[schedule(date)];
    if (!table) return null;
    return parseInterval(table[DOW_KEY[dayName(date)]]);
  }

  /** Waking-day windows not occupied by work. Sunday (no work) → the whole day. */
  function freeWindows(date) {
    const w = workInterval(date);
    if (!w) return [{ start: DAY_START, end: DAY_END }];
    const windows = [];
    if (toMin(w.start) > toMin(DAY_START)) windows.push({ start: DAY_START, end: w.start });
    if (toMin(w.end) < toMin(DAY_END)) windows.push({ start: w.end, end: DAY_END });
    return windows;
  }

  /** The nutrition meal-template id that applies to this date (§5.2). */
  function mealTemplateId(date) {
    const dow = dayName(date);
    if (dow === 'Sun') return TEMPLATE.SUNDAY_LONG;
    if (dow === 'Sat') return TEMPLATE.SATURDAY_REST;
    const w = workInterval(date);
    if (w && w.start === '07:30') return TEMPLATE.EARLY_PM; // early shift → pm training
    if (w && w.start === '11:30') return TEMPLATE.LATE_AM; // late shift → am training
    return null; // no matching template (does not occur with the real schedule)
  }

  return { schedule, workInterval, freeWindows, mealTemplateId };
}

export { TEMPLATE };
