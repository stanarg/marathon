// settingsView.js — backup export/import, reset, storage status, install, about (§6),
// and the Foods editor (calibrate meal-macro values / add custom foods, Fuel §6).

import { el, card, badge, h, muted, kv, button, field, parseNum } from '../components/ui.js';
import { SEED_FOODS } from '../logic/foods.js';

const SEED_IDS = new Set(SEED_FOODS.map((f) => f.id));

// View-local UI state, reset on navigation.
let resetArmed = false;
let pendingImport = null; // { text, exportedAt }
let importError = null;
let expandedFood = null; // food id whose calibration row is open
let addingFood = false;
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    resetArmed = false; pendingImport = null; importError = null; expandedFood = null; addingFood = false;
  });
}

// --- Foods editor (calibrate to match the athlete's tracker; add custom foods) ---
function foodBasis(food) {
  return food.unit === 'g' || food.unit === 'ml' ? `per 100 ${food.unit}` : `per ${food.unit}`;
}

function renderFoodRow(ctx, food) {
  const open = expandedFood === food.id;
  const overridden = !!ctx.foodOverrides()[food.id];
  const custom = !SEED_IDS.has(food.id);
  const head = el('button', {
    class: 'meal-head', type: 'button', 'aria-expanded': open ? 'true' : 'false',
    onClick: () => { expandedFood = open ? null : food.id; ctx.refresh(); },
  }, [
    el('div', { class: 'row-body' }, [
      el('span', { class: 'row-title', text: food.name }),
      muted(`${food.carb} C · ${food.protein} P · ${food.fat} F  (${foodBasis(food)})`),
    ]),
    overridden ? badge(custom ? 'custom' : 'edited', '') : null,
    el('span', { class: 'meal-chev', text: '›', 'aria-hidden': 'true' }),
  ]);
  if (!open) return el('div', { class: 'meal' }, [head]);

  const num = (val) => el('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', class: 'field-input', value: val != null ? val : null });
  const c = num(food.carb); const p = num(food.protein); const f = num(food.fat);
  const detail = el('div', { class: 'meal-detail' }, [
    muted(`Macros ${foodBasis(food)} — set these to match your tracker.`),
    el('div', { class: 'macro-grid' }, [field('Carbs (g)', c), field('Protein (g)', p), field('Fat (g)', f)]),
    el('div', { class: 'form-actions' }, [
      button('Save', () => {
        ctx.saveFood(food.id, { carb: parseNum(c.value) ?? 0, protein: parseNum(p.value) ?? 0, fat: parseNum(f.value) ?? 0 });
        expandedFood = null; ctx.refresh();
      }, 'btn-sm'),
      overridden ? button(custom ? 'Remove food' : 'Reset to default', () => { ctx.removeFood(food.id); expandedFood = null; ctx.refresh(); }, 'btn-ghost btn-sm') : null,
    ].filter(Boolean)),
  ]);
  return el('div', { class: 'meal' }, [head, detail]);
}

function renderAddFood(ctx) {
  if (!addingFood) {
    return el('button', { class: 'link-btn', type: 'button', text: '+ Add a custom food', onClick: () => { addingFood = true; ctx.refresh(); } });
  }
  const name = el('input', { type: 'text', class: 'field-input', placeholder: 'e.g. Protein shake' });
  const unit = el('select', { class: 'field-input' }, [
    el('option', { value: 'g' }, ['per 100 g']),
    el('option', { value: 'ml' }, ['per 100 ml']),
    el('option', { value: 'item' }, ['per item']),
  ]);
  const num = (ph) => el('input', { type: 'number', inputmode: 'decimal', min: '0', step: 'any', class: 'field-input', placeholder: ph });
  const c = num('0'); const p = num('0'); const f = num('0');
  return card([
    field('Name', name),
    field('Measured', unit),
    el('div', { class: 'macro-grid' }, [field('Carbs (g)', c), field('Protein (g)', p), field('Fat (g)', f)]),
    el('div', { class: 'form-actions' }, [
      button('Add food', () => {
        const nm = (name.value || '').trim();
        if (!nm) return;
        const id = 'custom_' + nm.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        const u = unit.value;
        ctx.saveFood(id, { name: nm, unit: u === 'item' ? 'item' : u, ref: u === 'item' ? 1 : 100, carb: parseNum(c.value) ?? 0, protein: parseNum(p.value) ?? 0, fat: parseNum(f.value) ?? 0 });
        addingFood = false; ctx.refresh();
      }, 'btn-sm'),
      button('Cancel', () => { addingFood = false; ctx.refresh(); }, 'btn-ghost btn-sm'),
    ]),
  ], 'sub');
}

function renderFoodsCard(ctx) {
  const c = card([
    h(3, 'Foods'),
    muted('Used to compute your meal macros on the Fuel screen. Tap a food to calibrate it to your tracker; edits apply everywhere that food is used.'),
  ]);
  for (const food of ctx.foods()) c.append(renderFoodRow(ctx, food));
  c.append(renderAddFood(ctx));
  return c;
}

function downloadBackup(ctx) {
  const text = ctx.exportBackup();
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ba42-backup-${ctx.today()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  ctx.markBackedUp();
  ctx.refresh();
}

function handleFile(ctx, file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const text = String(reader.result);
      const parsed = JSON.parse(text);
      pendingImport = { text, exportedAt: parsed && parsed.exportedAt ? parsed.exportedAt : 'unknown' };
      importError = null;
    } catch {
      importError = 'That file is not valid JSON.';
      pendingImport = null;
    }
    ctx.refresh();
  };
  reader.onerror = () => { importError = 'Could not read that file.'; ctx.refresh(); };
  reader.readAsText(file);
}

function confirmImport(ctx) {
  try {
    ctx.importBackup(pendingImport.text);
    pendingImport = null;
    importError = null;
  } catch (e) {
    importError = e.message;
    pendingImport = null;
  }
  ctx.refresh();
}

function formatBytes(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

export function render(ctx) {
  const { workoutPlan, nutritionPlan, athleteProfile } = ctx.plans;
  const status = ctx.storageStatus();
  const wrap = el('div', {});

  wrap.append(card([h(2, 'Settings'), muted('Backup, restore, and app info.')]));

  // --- Backup / restore ---------------------------------------------------
  const backup = card([
    h(3, 'Backup'),
    muted('Browser storage can be evicted — export a backup regularly and keep the file safe.'),
    el('div', { class: 'form-actions' }, [button('Export backup', () => downloadBackup(ctx))]),
    field('Import a backup file', el('input', {
      type: 'file', accept: 'application/json,.json', class: 'field-input',
      onChange: (e) => { if (e.target.files && e.target.files[0]) handleFile(ctx, e.target.files[0]); },
    })),
  ]);
  if (importError) backup.append(el('p', { class: 'field-error', text: importError }));
  if (pendingImport) {
    backup.append(card([
      muted(`This will REPLACE all current data with the backup exported ${String(pendingImport.exportedAt).slice(0, 19).replace('T', ' ')}.`),
      el('div', { class: 'form-actions' }, [
        button('Confirm import', () => confirmImport(ctx)),
        button('Cancel', () => { pendingImport = null; ctx.refresh(); }, 'btn-ghost'),
      ]),
    ], 'banner banner-warning'));
  }
  backup.append(kv([
    ['Storage used', formatBytes(status.bytes)],
    ['Last backup', ctx.dateProvider.dateOf(status.lastBackupAt) || 'never'],
  ]));
  wrap.append(backup);

  // --- Reset (double-confirm) --------------------------------------------
  const reset = card([
    h(3, 'Reset'),
    muted('Deletes all logged data (sessions, check-ins, hydration, weigh-ins, checkpoint, checklist). The plan itself is untouched.'),
  ]);
  if (!resetArmed) {
    reset.append(el('div', { class: 'form-actions' }, [
      button('Reset all logged data', () => { resetArmed = true; ctx.refresh(); }, 'btn-ghost'),
    ]));
  } else {
    reset.append(el('div', { class: 'form-actions' }, [
      button('Tap again to permanently delete', () => { ctx.resetUserData(); resetArmed = false; ctx.refresh(); }, 'btn-danger'),
      button('Cancel', () => { resetArmed = false; ctx.refresh(); }, 'btn-ghost'),
    ]));
  }
  wrap.append(reset);

  // --- Foods (calibrate meal-macro values / add custom foods) ------------
  wrap.append(renderFoodsCard(ctx));

  // --- Install ------------------------------------------------------------
  wrap.append(card([
    h(3, 'Install to your iPhone'),
    el('ol', { class: 'tips' }, [
      el('li', { text: 'Open this page in Safari.' }),
      el('li', { text: 'Tap the Share button, then “Add to Home Screen”.' }),
      el('li', { text: 'Launch BA42 from the home-screen icon — it runs full-screen and works offline.' }),
    ]),
  ], 'sub'));

  // --- About --------------------------------------------------------------
  wrap.append(card([
    h(3, 'About'),
    kv([
      ['Athlete', athleteProfile.athlete.name],
      ['Race', workoutPlan.race.name],
      ['Race date', workoutPlan.race.date],
      ['Target', `${workoutPlan.race.target_finish} (band ${workoutPlan.race.target_band.join('–')})`],
      ['Block start', workoutPlan.start_date],
      ['HR model', `max ${workoutPlan.hr_model.hr_max} / rest ${workoutPlan.hr_model.hr_rest}`],
      ['Weight anchor', `${nutritionPlan.anchors.weight_kg} kg`],
      ['Timezone', ctx.dateProvider.timezone],
      ['Installed', ctx.dateProvider.dateOf(status.installedAt) || '—'],
    ]),
    muted('BA42 · vanilla PWA · data stays on this device.'),
  ], 'sub'));

  return wrap;
}
