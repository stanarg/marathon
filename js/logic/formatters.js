// formatters.js — single source for pace / duration / distance / energy formatting
// (§3, §5). PURE and locale-stable (no Intl locale surprises in tests).

/** Distance in km: 9 → "9 km", 42.195 → "42.2 km", null → "—". */
export function formatKm(km) {
  if (km == null) return '—';
  const rounded = Math.round(km * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} km`;
}

/** Minutes → "40 min" under an hour, "2h 25m" at/over an hour. */
export function formatDuration(min) {
  if (min == null) return '—';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Seconds-per-km → "5:30/km". */
export function formatPace(secPerKm) {
  if (secPerKm == null) return '—';
  const s = Math.round(secPerKm);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, '0')}/km`;
}

/** Energy: 3450 → "3,450 kcal", null → "—". */
export function formatKcal(kcal) {
  if (kcal == null) return '—';
  return `${kcal.toLocaleString('en-US')} kcal`;
}

/** Grams: 470 → "470 g", null → "—". */
export function formatGrams(g) {
  if (g == null) return '—';
  return `${g} g`;
}

/** A hydration range [3000,3500] (ml) → "3.0–3.5 L". */
export function formatFluidRangeL(mlRange) {
  if (!Array.isArray(mlRange) || mlRange.length < 2) return '—';
  const toL = (ml) => (ml / 1000).toFixed(1);
  return `${toL(mlRange[0])}–${toL(mlRange[1])} L`;
}

/** "am" → "AM", "pm" → "PM". */
export function formatWindow(w) {
  return w ? w.toUpperCase() : '';
}

/** Title-case a day-type id: "long_high" → "Long high". */
export function humanizeId(id) {
  if (!id) return '';
  const s = id.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}
