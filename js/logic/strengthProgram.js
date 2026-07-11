// strengthProgram.js — the Wednesday strength regimen (Artifact 1 §7). PURE.
//
// The immutable workout_plan.json names strength sessions ("Strength A/B") but does
// not carry the exercises. This module supplies the actual program VERBATIM from the
// athlete's regimen doc §7, keyed off the session title, so SessionDetail can show
// what to do. Content is sourced, not invented.

const PURPOSE =
  'Running durability — tendon stiffness, calf/soleus capacity, single-leg control. RPE 7 cap, no grinding.';

const SESSION_A = [
  { name: 'Goblet or back squat', scheme: '3×8' },
  { name: 'Romanian deadlift', scheme: '3×8' },
  { name: 'Step-ups', scheme: '3×8 / side' },
  { name: 'Straight-knee calf raise', scheme: '4×12 · slow eccentric' },
  { name: 'Seated bent-knee (soleus) raise', scheme: '3×15' },
  { name: 'Side plank', scheme: '3×30″ / side' },
];

const SESSION_B = [
  { name: 'Trap-bar or DB deadlift', scheme: '3×6' },
  { name: 'Bulgarian split squat', scheme: '3×8 / side' },
  { name: 'Single-leg hip thrust', scheme: '3×10 / side' },
  { name: 'Single-leg calf raise', scheme: '3×12 / side' },
  { name: 'Copenhagen plank', scheme: '3×8 / side' },
  { name: 'Dead bug', scheme: '3×10' },
];

// Taper week (W9) is "bodyweight only" per §7 — same durability patterns, no load.
// The doc gives no per-exercise scheme here, so we list the movements without
// fabricating sets/reps.
const BODYWEIGHT = [
  { name: 'Bodyweight squat', scheme: 'light' },
  { name: 'Reverse lunge / split squat', scheme: 'light' },
  { name: 'Single-leg calf raise', scheme: 'light' },
  { name: 'Side plank', scheme: 'hold' },
  { name: 'Dead bug', scheme: 'controlled' },
];

/**
 * @param {object} session a workout_plan session
 * @returns {null | {program, purpose, note, exercises: {name, scheme}[], loadNote?}}
 */
export function strengthDetail(session) {
  if (!session || session.type !== 'strength') return null;
  const title = session.title || '';

  if (/bodyweight/i.test(title)) {
    return {
      program: 'Bodyweight circuit',
      purpose: PURPOSE,
      note: 'Taper week — bodyweight only, no external load. Light circuit of the same durability patterns, ~25 min.',
      exercises: BODYWEIGHT,
    };
  }

  const isA = /strength\s*a/i.test(title);
  const isB = /strength\s*b/i.test(title);
  const program = isA ? 'Session A' : isB ? 'Session B' : 'Strength';
  const exercises = isA ? SESSION_A : isB ? SESSION_B : [];

  let note = 'RPE 7 cap — no grinding. Sessions A and B alternate weekly.';
  if (/reintroduction|rpe\s*6/i.test(title)) note = 'Reintroduction week — keep every lift at RPE 6.';
  else if (/last loaded/i.test(title)) note = 'Last loaded strength session of the block — it deloads to bodyweight after this.';

  return { program, purpose: PURPOSE, note, exercises };
}
