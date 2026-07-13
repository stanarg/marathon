// hrZones.js — resolve a session's heart-rate zone to Stan's actual bpm range. PURE.
//
// workout_plan.json → hr_model already carries his personalized zones (Karvonen from
// HRmax 190 / HRrest 50), each with a real bpm min/max. Sessions only name the zone
// ("Z2", or a range "Z1-Z2"); this module turns that into the bpm numbers so the UI
// can show "Z2 · easy · 134–148 bpm" instead of a bare "Z2". Display only — it never
// recomputes or edits the (immutable) plan data.

const EN_DASH = '–';

/** Zone display name from the plan (underscores → spaces, kept lowercase to match "easy"). */
function nameOf(zone) {
  return String(zone.name || zone.id || '').replace(/_/g, ' ');
}

/**
 * Resolve a session `zone` string to a bpm range using hr_model.zones.
 * Handles a single zone ("Z2") and a hyphenated range ("Z1-Z2").
 * @param {string} zoneStr e.g. "Z2" or "Z1-Z2"
 * @param {object} hrModel workout_plan.hr_model ({ zones: [{ id, name, min_bpm, max_bpm }] })
 * @returns {null | { ids: string[], idLabel: string, name: string, minBpm: number, maxBpm: number }}
 */
export function zoneBpm(zoneStr, hrModel) {
  if (!zoneStr || typeof zoneStr !== 'string') return null;
  if (!hrModel || !Array.isArray(hrModel.zones)) return null;

  const ids = zoneStr.split('-').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return null;

  const resolved = ids.map((id) => hrModel.zones.find((z) => z.id === id));
  if (resolved.some((z) => !z)) return null; // any unknown zone id → null

  const minBpm = Math.min(...resolved.map((z) => z.min_bpm));
  const maxBpm = Math.max(...resolved.map((z) => z.max_bpm));
  return {
    ids,
    idLabel: ids.join(EN_DASH),
    name: resolved.map(nameOf).join(EN_DASH),
    minBpm,
    maxBpm,
  };
}

/** Long form for the session detail row, e.g. "Z2 · easy · 134–148 bpm". null if unresolved. */
export function formatZone(zoneStr, hrModel) {
  const b = zoneBpm(zoneStr, hrModel);
  if (!b) return null;
  return `${b.idLabel} · ${b.name} · ${b.minBpm}${EN_DASH}${b.maxBpm} bpm`;
}

/** Compact form for the Today card, e.g. "Z2 · 134–148 bpm". null if unresolved. */
export function formatZoneBpm(zoneStr, hrModel) {
  const b = zoneBpm(zoneStr, hrModel);
  if (!b) return null;
  return `${b.idLabel} · ${b.minBpm}${EN_DASH}${b.maxBpm} bpm`;
}

/** The full zone table for a reference card: [{ id, name, minBpm, maxBpm }]. Empty if no model. */
export function allZones(hrModel) {
  if (!hrModel || !Array.isArray(hrModel.zones)) return [];
  return hrModel.zones.map((z) => ({ id: z.id, name: nameOf(z), minBpm: z.min_bpm, maxBpm: z.max_bpm }));
}
