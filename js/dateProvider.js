// dateProvider.js — the ONLY source of "what time is it now" in the app (§2).
//
// All plan logic runs on America/Argentina/Buenos_Aires civil dates. This module
// is the single I/O boundary that reads the real clock and projects it into that
// civil calendar; every logic module receives plain "YYYY-MM-DD" strings instead
// of touching Date.now(), which is what makes them deterministically testable.
//
// Injectability: pass { fixedNow } (an ISO instant or Date) to freeze time in
// tests or previews. With no argument, it uses the real clock.

const BA_TZ = 'America/Argentina/Buenos_Aires';

// Intl formatter → civil date parts in the BA timezone, independent of the host's
// local timezone. "en-CA" yields YYYY-MM-DD directly.
const dateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: BA_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const timeFmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: BA_TZ,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function createDateProvider({ fixedNow } = {}) {
  const nowInstant = () => (fixedNow != null ? new Date(fixedNow) : new Date());

  return {
    timezone: BA_TZ,
    /** Current instant as a Date (the raw clock, or the frozen one). */
    now() {
      return nowInstant();
    },
    /** Today's civil date in BA time, "YYYY-MM-DD". */
    today() {
      return dateFmt.format(nowInstant());
    },
    /** The BA civil date ("YYYY-MM-DD") of any instant (ISO string or Date), or
     *  null if the value isn't a parseable instant (e.g. from a hand-edited backup). */
    dateOf(instant) {
      const d = new Date(instant);
      return Number.isNaN(d.getTime()) ? null : dateFmt.format(d);
    },
    /** Current wall-clock "HH:mm" in BA time. */
    clock() {
      return timeFmt.format(nowInstant());
    },
    /** ISO instant string — used for stamps like loggedAt / exportedAt. */
    isoNow() {
      return nowInstant().toISOString();
    },
  };
}

// Default shared instance for the running app (tests build their own frozen one).
export const dateProvider = createDateProvider();
