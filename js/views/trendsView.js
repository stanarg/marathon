// trendsView.js — SVG charts + checkpoint panel (§6, §5.9).
//   • weekly planned-vs-done km (bars)
//   • RHR + HRV 28-day lines, weight line
//   • checkpoint panel: criteria checklist → outcome → record decision

import { el, card, badge, h, muted, link, button } from '../components/ui.js';
import { barChart, lineChart } from '../components/chart.js';
import { allWeeksCompliance } from '../logic/compliance.js';
import { diffDays, addDays } from '../logic/dateUtil.js';

const cssVar = (name) => (typeof getComputedStyle !== 'undefined'
  ? getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  : '') || '#4CC2FF';

function legend(items) {
  return el('div', { class: 'legend' }, items.map(([label, color]) =>
    el('span', { class: 'legend-item' }, [el('span', { class: 'legend-swatch', style: `background:${color}` }), label])));
}

// Build {x: dayOffset, y} points from a date-keyed map, optionally within a window.
function pointsFrom(map, valueKey, startDate, sinceDate) {
  return Object.entries(map)
    .filter(([d]) => !sinceDate || d >= sinceDate)
    .map(([d, v]) => ({ x: diffDays(d, startDate), y: valueKey ? v[valueKey] : v }))
    .filter((p) => p.y != null)
    .sort((a, b) => a.x - b.x);
}

function lineCard(title, series) {
  return card([h(3, title), lineChart({ series })]);
}

// --- Checkpoint panel (§5.9) -----------------------------------------------
const OUTCOME = {
  pass: { kind: 'badge-ok', text: 'PASS' },
  fail: { kind: 'badge-danger', text: 'FAIL' },
  exceed: { kind: 'badge-ok', text: 'EXCEED' },
  insufficient_data: { kind: '', text: 'Incomplete' },
};
const MANUAL_KEY = { drift_final5k: 'driftFinal5kOk', next_day_soreness: 'sorenessOk' };
const DECISIONS = [['4:45', 'Confirm 4:45'], ['4:35', 'Revise to 4:35'], ['5:00', 'Drop to 5:00'], ['pivot_half', 'Pivot to half']];

function renderCheckpointPanel(ctx) {
  const cp = ctx.plans.workoutPlan.checkpoint;
  const r = ctx.checkpointResult();

  if (!r.triggered) {
    return card([
      el('div', { class: 'card-head' }, [h(3, 'Checkpoint'), badge('locked', '')]),
      muted(`Unlocks after you log the Week 7 long run (${cp.session_id}) on ${cp.date}.`),
      link('Go to the checkpoint session →', `#/session/${cp.session_id}`, 'back-link'),
    ]);
  }

  const statusBadge = r.userDecision ? badge('decided', 'badge-ok') : badge('decision pending', 'badge-warn');
  const children = [el('div', { class: 'card-head' }, [h(3, 'Checkpoint'), statusBadge])];

  const list = el('div', { class: 'criteria' });
  for (const c of r.criteria) {
    if (MANUAL_KEY[c.id]) {
      const on = c.passed === true;
      const box = el('input', {
        type: 'checkbox', class: 'check', checked: on ? '' : null,
        onChange: (e) => { ctx.setCheckpointManual({ [MANUAL_KEY[c.id]]: e.target.checked }); ctx.refresh(); },
      });
      list.append(el('label', { class: `check-row${on ? ' checked' : ''}` }, [box, el('div', { class: 'row-body' }, [el('span', { class: 'row-title', text: c.detail })])]));
    } else {
      const icon = c.passed === true ? '✓' : c.passed === false ? '✕' : '…';
      const cls = c.passed === true ? 'crit-pass' : c.passed === false ? 'crit-fail' : 'crit-pending';
      list.append(el('div', { class: `crit ${cls}` }, [el('span', { class: 'crit-icon', text: icon }), el('span', { text: c.detail })]));
    }
  }
  // Margin tick — shown only once every criterion is satisfied. Ticking it promotes a clean
  // pass to EXCEED (revise to 4:35); same manual-tick UX as the criteria above.
  if (r.outcome === 'pass' || r.outcome === 'exceed') {
    const on = r.outcome === 'exceed';
    const box = el('input', {
      type: 'checkbox', class: 'check', checked: on ? '' : null,
      onChange: (e) => { ctx.setCheckpointManual({ marginOk: e.target.checked }); ctx.refresh(); },
    });
    list.append(el('label', { class: `check-row${on ? ' checked' : ''}` }, [
      box,
      el('div', { class: 'row-body' }, [el('span', { class: 'row-title', text: 'Beat the targets comfortably — gas left in the tank?' })]),
    ]));
  }
  children.push(list);

  const o = OUTCOME[r.outcome];
  children.push(el('div', { class: 'card-head cp-outcome' }, [h(3, 'Outcome'), badge(o.text, o.kind)]));
  if (r.outcomeText) children.push(muted(r.outcomeText));

  if (r.outcome !== 'insufficient_data') {
    children.push(muted('Record your race-plan decision:'));
    children.push(el('div', { class: 'form-actions' }, DECISIONS.map(([val, label]) =>
      button(label, () => { ctx.setCheckpointDecision(val); ctx.refresh(); }, r.userDecision === val ? '' : 'btn-ghost'))));
    if (r.userDecision) children.push(el('p', { class: 'note', text: `Decision recorded: ${r.userDecision}` }));
  }

  return card(children, r.userDecision ? '' : 'banner banner-warning');
}

export function render(ctx) {
  const { workoutPlan } = ctx.plans;
  const start = workoutPlan.start_date;
  const today = ctx.today();
  const since28 = addDays(today, -27); // 28-day inclusive window (today − 27 … today)

  const accent = cssVar('--accent');
  const warn = cssVar('--warn');
  const ok = cssVar('--ok');
  const mutedColor = cssVar('--muted');

  const wrap = el('div', {});
  wrap.append(card([h(2, 'Trends'), muted('Weekly volume, readiness, weight, and the Week-7 checkpoint.')]));

  // Weekly planned-vs-done km
  const comp = allWeeksCompliance(workoutPlan, ctx.sessionLogs());
  const groups = comp.map((c) => ({ label: `W${c.index}`, values: { planned: c.plannedKm, done: c.completedKm } }));
  wrap.append(card([
    el('div', { class: 'card-head' }, [h(3, 'Weekly km'), legend([['Planned', mutedColor], ['Done', accent]])]),
    barChart({ groups, keys: ['planned', 'done'], colors: [mutedColor, accent] }),
  ]));

  // RHR + HRV (28-day) and weight
  const checkins = ctx.checkins();
  wrap.append(lineCard('Resting HR — 28 days', [{ color: accent, points: pointsFrom(checkins, 'rhr', start, since28) }]));
  wrap.append(lineCard('HRV — 28 days', [{ color: warn, points: pointsFrom(checkins, 'hrvMs', start, since28) }]));
  wrap.append(lineCard('Weight', [{ color: ok, points: pointsFrom(ctx.weighins(), null, start) }]));

  // Checkpoint
  wrap.append(renderCheckpointPanel(ctx));
  return wrap;
}
