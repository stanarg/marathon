// dataLoader.js — loads the three immutable plan JSONs at boot (§3, §5).
//
// The JSONs in /data are the read-only database for everything planned (§4); we
// never copy them into storage. URLs are relative so the app works unchanged at
// username.github.io/ba42/, and the service worker precaches them for offline use.
//
// This is an I/O module (it calls fetch); logic modules receive the parsed
// objects and never fetch anything themselves.

const FILES = {
  workoutPlan: 'data/workout_plan.json',
  nutritionPlan: 'data/nutrition_plan.json',
  athleteProfile: 'data/athlete_profile.json',
};

async function loadOne(url, fetchImpl) {
  let res;
  try {
    res = await fetchImpl(url, { cache: 'no-cache' });
  } catch (e) {
    throw new Error(`network error loading ${url}: ${e.message}`);
  }
  if (!res.ok) throw new Error(`failed to load ${url} (HTTP ${res.status})`);
  try {
    return await res.json();
  } catch (e) {
    throw new Error(`invalid JSON in ${url}: ${e.message}`);
  }
}

/**
 * Load and parse all three plan files.
 * @param {(url:string, init?:object)=>Promise<Response>} [fetchImpl] injectable for tests.
 * @returns {Promise<{workoutPlan, nutritionPlan, athleteProfile}>}
 */
export async function loadPlans(fetchImpl = fetch) {
  const [workoutPlan, nutritionPlan, athleteProfile] = await Promise.all([
    loadOne(FILES.workoutPlan, fetchImpl),
    loadOne(FILES.nutritionPlan, fetchImpl),
    loadOne(FILES.athleteProfile, fetchImpl),
  ]);
  return { workoutPlan, nutritionPlan, athleteProfile };
}

