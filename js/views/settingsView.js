// settingsView.js — backup export/import, reset, storage status, install, about (§6).

import { el, card, badge, h, muted, kv, button, link } from '../components/ui.js';

// View-local UI state, reset on navigation.
let resetArmed = false;
let pendingImport = null; // { text, exportedAt }
let importError = null;
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => { resetArmed = false; pendingImport = null; importError = null; });
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
    el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Import a backup file' }),
      el('input', {
        type: 'file', accept: 'application/json,.json', class: 'field-input',
        onChange: (e) => { if (e.target.files && e.target.files[0]) handleFile(ctx, e.target.files[0]); },
      }),
    ]),
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
