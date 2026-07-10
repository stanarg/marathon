// fixtures.js — loads the real /data JSONs from disk for node tests (§3, §9).
// Tests run against ground truth, never a hand-copied fixture, so drift is
// impossible. `clone` gives each test an isolated deep copy to patch.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const dataDir = join(here, '..', 'data');

function load(name) {
  return JSON.parse(readFileSync(join(dataDir, name), 'utf8'));
}

export function loadFixtures() {
  return {
    workoutPlan: load('workout_plan.json'),
    nutritionPlan: load('nutrition_plan.json'),
    athleteProfile: load('athlete_profile.json'),
  };
}

/** Deep clone (structuredClone is available in Node 17+). */
export function clone(obj) {
  return structuredClone(obj);
}
