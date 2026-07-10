// safetyRules.js — pure port of Artifact 1 §8 safety logic (§5.8).
//
// advisories(logs, date, workoutPlan) -> [Advisory{ id, severity, text, suggestedAction?, meta? }]
// Advisories are SUGGESTIONS only; plan data is never mutated. PURE.
//
// Rules:
//   1. weekly downshift  — >= 2 logs with painScore >= 3 in the current training week.
//   2. bone stress       — painSite ∈ {shin, foot_top, groin} & painScore >= 3 →
//                          48 h zero-impact window; a later event after a prior event's
//                          window → recurrence → medical review + half-marathon pivot.
//   3. missed streak     — >= 4 consecutive fully-missed sessions → repeat previous week.

import { diffDays, addDays } from './dateUtil.js';

const BONE_SITES = ['shin', 'foot_top', 'groin'];
const PAIN_FLAG = 3;
const WINDOW_DAYS = 2; // 48 h
const MISSED_RUN = 4;

function indexSessions(workoutPlan) {
  const map = {};
  for (const wk of workoutPlan.weeks || []) {
    for (const s of wk.sessions || []) map[s.id] = { session: s, week: wk };
  }
  return map;
}

export function advisories(logs, date, workoutPlan) {
  const out = [];
  const index = indexSessions(workoutPlan);
  const entries = Object.values(logs || {})
    .map((log) => ({ log, ...(index[log.sessionId] || {}) }))
    .filter((e) => e.session);

  // --- Rule 1: weekly downshift -------------------------------------------
  const currentWeek = (workoutPlan.weeks || []).find((w) => date >= w.start_date && date <= w.end_date);
  if (currentWeek) {
    const painFlags = entries.filter(
      (e) => e.week && e.week.index === currentWeek.index && e.log.status === 'completed' && (e.log.painScore ?? 0) >= PAIN_FLAG
    );
    if (painFlags.length >= 2) {
      const nextQuality = currentWeek.sessions
        .filter((s) => s.type === 'run_quality' && s.date >= date)
        .sort((a, b) => a.date.localeCompare(b.date))[0];
      out.push({
        id: 'weekly_downshift',
        severity: 'warning',
        text: `${painFlags.length} pain flags this week — make the next quality session easy and hold long-run distance.`,
        suggestedAction: nextQuality
          ? { kind: 'convert_session', sessionId: nextQuality.id, to: 'converted_easy', label: 'Make next quality easy' }
          : undefined,
      });
    }
  }

  // --- Rule 2: bone stress -------------------------------------------------
  const boneEvents = entries
    .filter((e) => e.log.status === 'completed' && BONE_SITES.includes(e.log.painSite) && (e.log.painScore ?? 0) >= PAIN_FLAG)
    .map((e) => ({ date: e.session.date, site: e.log.painSite }))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (boneEvents.length) {
    const latest = boneEvents[boneEvents.length - 1];
    const daysSince = diffDays(date, latest.date);
    if (daysSince >= 0 && daysSince <= WINDOW_DAYS) {
      const until = addDays(latest.date, WINDOW_DAYS);
      out.push({
        id: 'bone_stress',
        severity: 'critical',
        text: `Bone-stress signal (${latest.site}): 48 h zero-impact. Rest until ${until}.`,
        meta: { site: latest.site, zeroImpactUntil: until },
      });
    }
    // Recurrence OR persistence: any bone-stress event more than the 48 h window
    // after the episode's first event. Catches both gap-then-return AND continuous
    // daily pain (whose adjacent gaps are each ≤ 2 days but which spans past 48 h) —
    // the developing-stress-fracture pattern the plan escalates to medical review.
    const recurrence = boneEvents.length >= 2 && diffDays(latest.date, boneEvents[0].date) > WINDOW_DAYS;
    if (recurrence) {
      out.push({
        id: 'bone_stress_recurrence',
        severity: 'critical',
        text: 'Recurring bone-stress signal after the rest window — book a medical review and decide on the half-marathon pivot.',
      });
    }
  }

  // --- Rule 3: consecutive missed sessions --------------------------------
  const pastSessions = [];
  for (const wk of workoutPlan.weeks || []) {
    for (const s of wk.sessions || []) {
      if (s.date <= date) pastSessions.push(s);
    }
  }
  pastSessions.sort((a, b) => a.date.localeCompare(b.date));
  let run = 0;
  let maxRun = 0;
  for (const s of pastSessions) {
    const status = logs[s.id] && logs[s.id].status;
    if (status === 'missed') {
      run += 1;
      maxRun = Math.max(maxRun, run);
    } else {
      run = 0;
    }
  }
  if (maxRun >= MISSED_RUN) {
    out.push({
      id: 'missed_repeat_week',
      severity: 'warning',
      text: `${maxRun} sessions missed in a row — consider repeating the previous week's volumes.`,
    });
  }

  return out;
}
