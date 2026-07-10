// planView.js — 10 week cards → week detail (§6). Completion % comes from
// logic/compliance.js (weekCompliance); the week detail carries the missed-flow (§5.7).

import { el, card, badge, h, muted, navRow, link, button } from '../components/ui.js';
import { formatKm, formatDuration, humanizeId, formatWindow } from '../logic/formatters.js';
import { dayName, diffDays } from '../logic/dateUtil.js';
import { weekCompliance } from '../logic/compliance.js';

const PHASE_KIND = { build: 'badge-ok', peak: 'badge-warn', race: 'badge-danger' };

const STATUS = {
  completed: { kind: 'badge-ok', label: '✓ done' },
  missed: { kind: 'badge-danger', label: 'missed' },
  converted_easy: { kind: 'badge-warn', label: 'converted' },
  converted_cross: { kind: 'badge-warn', label: 'converted' },
};

export function renderWeeks(ctx) {
  const { workoutPlan } = ctx.plans;
  const wrap = el('div', {});
  wrap.append(card([
    h(2, 'Training plan'),
    muted(`${workoutPlan.race.name} · ${workoutPlan.weeks.length} weeks · target ${workoutPlan.race.target_finish}`),
  ]));

  const today = ctx.today();
  const logs = ctx.sessionLogs();
  for (const wk of workoutPlan.weeks) {
    const c = weekCompliance(wk, logs);
    const isCurrent = today >= wk.start_date && today <= wk.end_date;
    const lead = el('div', { class: 'row-body' }, [
      el('span', { class: 'row-title', text: `Week ${wk.index}${isCurrent ? ' · now' : ''}` }),
      muted(`${wk.start_date} → ${wk.end_date} · ${formatKm(wk.target_run_km)} target`),
    ]);
    const meta = el('div', { class: 'row-lead' }, [
      badge(humanizeId(wk.phase), PHASE_KIND[wk.phase] || ''),
      el('span', { class: 'row-window', text: `${c.completedCount}/${c.plannedCount} · ${c.pct}%` }),
    ]);
    wrap.append(navRow([lead, meta, el('span', { class: 'row-chev', text: '›' })], `#/plan/week/${wk.index}`, isCurrent ? 'row-current' : ''));
  }
  return wrap;
}

export function renderWeek(ctx, index) {
  const { workoutPlan } = ctx.plans;
  const wk = workoutPlan.weeks.find((w) => w.index === index);
  if (!wk) return card([h(2, 'Week not found'), link('← Back to plan', '#/plan')], 'diagnostic');

  const wrap = el('div', {});
  wrap.append(card([
    link('← Plan', '#/plan', 'back-link'),
    el('div', { class: 'card-head' }, [h(2, `Week ${wk.index}`), badge(humanizeId(wk.phase), PHASE_KIND[wk.phase] || '')]),
    muted(`${wk.start_date} → ${wk.end_date} · ${formatKm(wk.target_run_km)} planned`),
  ]));

  const today = ctx.today();
  const logs = ctx.sessionLogs();
  const list = card([h(3, 'Sessions')]);
  for (const s of wk.sessions) {
    const log = logs[s.id];
    const meta = log ? STATUS[log.status] : null;
    // Unlogged = a past session with no log by the end of the next day (§5.7).
    const overdue = !log && diffDays(today, s.date) >= 2;

    const lead = el('div', { class: 'row-lead' }, [
      el('span', { class: 'row-window', text: `${dayName(s.date)} · ${formatWindow(s.window)}` }),
    ]);
    const body = el('div', { class: 'row-body' }, [
      el('span', { class: 'row-title', text: s.title }),
      muted(`${formatKm(s.distance_km)} · ${formatDuration(s.duration_min)}`),
    ]);
    const info = el('a', { class: 'row-link', href: `#/session/${s.id}` }, [lead, body]);

    let tail;
    if (meta) {
      tail = badge(meta.label, meta.kind);
    } else if (overdue) {
      tail = el('div', { class: 'row-tail' }, [
        badge('unlogged', 'badge-warn'),
        button('Missed', () => { ctx.markMissed(s.id); ctx.refresh(); }, 'btn-ghost btn-sm'),
      ]);
    } else {
      tail = el('span', { class: 'row-window', text: 'planned' });
    }
    list.append(el('div', { class: 'row' }, [info, tail]));
  }
  wrap.append(list);
  return wrap;
}
