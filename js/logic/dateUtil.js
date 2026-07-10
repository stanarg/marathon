// dateUtil.js — pure civil-date arithmetic (no I/O, no Date.now()).
//
// Not in the §3 file list, but every logic module needs civil-date math and the
// spec provides no shared home for it. Kept strictly PURE per §2: all functions
// take explicit ISO date strings ("YYYY-MM-DD") and are deterministic. We anchor
// every Date at UTC midnight so day-of-week and day-diffs are timezone-stable —
// the actual America/Argentina/Buenos_Aires conversion happens only in the
// injectable dateProvider (I/O boundary), never here.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86400000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** True iff `s` is a strictly-valid "YYYY-MM-DD" civil date (round-trips). */
export function isValidISODate(s) {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const [, y, mo, d] = m;
  const dt = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return false;
  // Reject overflow like 2026-02-30 (Date would roll it forward).
  return (
    dt.getUTCFullYear() === Number(y) &&
    dt.getUTCMonth() + 1 === Number(mo) &&
    dt.getUTCDate() === Number(d)
  );
}

/** Parse "YYYY-MM-DD" to a Date at UTC midnight. Throws on invalid input. */
export function parse(iso) {
  if (!isValidISODate(iso)) throw new Error(`invalid ISO date: ${JSON.stringify(iso)}`);
  return new Date(`${iso}T00:00:00Z`);
}

/** Format a UTC-midnight Date back to "YYYY-MM-DD". */
export function toISO(date) {
  return date.toISOString().slice(0, 10);
}

/** `iso` shifted by `n` whole days (may be negative). Returns an ISO string. */
export function addDays(iso, n) {
  return toISO(new Date(parse(iso).getTime() + n * DAY_MS));
}

/** Whole-day difference a − b (positive when `a` is later). */
export function diffDays(a, b) {
  return Math.round((parse(a).getTime() - parse(b).getTime()) / DAY_MS);
}

/** Day of week as 0=Sun … 6=Sat. */
export function dayIndex(iso) {
  return parse(iso).getUTCDay();
}

/** Day of week as "Mon" … "Sun". */
export function dayName(iso) {
  return DAY_NAMES[dayIndex(iso)];
}

/** True iff `iso` is a Monday. */
export function isMonday(iso) {
  return dayIndex(iso) === 1;
}

/** −1 / 0 / 1 ordering of two ISO dates. */
export function compare(a, b) {
  const da = parse(a).getTime();
  const db = parse(b).getTime();
  return da < db ? -1 : da > db ? 1 : 0;
}

/** True iff a ≤ x ≤ b (all ISO dates, inclusive). */
export function isWithin(x, a, b) {
  return compare(x, a) >= 0 && compare(x, b) <= 0;
}
