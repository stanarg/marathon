// chart.js — inline-SVG bar + line renderer (§2, §3). Zero dependencies; builds
// SVG via createElementNS. Theme colours are passed in (from CSS variables) so the
// charts follow the app palette.

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, children = []) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) node.setAttribute(k, String(v));
  for (const c of [].concat(children)) if (c != null && c !== false) node.append(c.nodeType ? c : String(c));
  return node;
}

/**
 * Grouped bar chart.
 * @param groups [{label, values: {<key>: number}}]
 * @param keys   ordered value keys (e.g. ['planned','done'])
 * @param colors array of fill colours aligned to keys
 */
export function barChart({ groups, keys, colors, width = 340, height = 170, pad = 26 }) {
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img', 'aria-label': 'Bar chart' });
  const plotW = width - pad * 2;
  const plotH = height - pad * 2;
  const max = Math.max(1, ...groups.flatMap((g) => keys.map((k) => g.values[k] || 0)));
  const groupW = plotW / Math.max(1, groups.length);
  const barW = groupW / (keys.length + 1);

  root.append(svg('line', { x1: pad, y1: height - pad, x2: width - pad, y2: height - pad, class: 'axis' }));

  groups.forEach((g, gi) => {
    keys.forEach((k, ki) => {
      const val = g.values[k] || 0;
      const bh = (val / max) * plotH;
      const x = pad + gi * groupW + barW * (ki + 0.5);
      const y = height - pad - bh;
      root.append(svg('rect', { x: x.toFixed(1), y: y.toFixed(1), width: barW.toFixed(1), height: bh.toFixed(1), rx: 2, fill: colors[ki] }));
    });
    root.append(svg('text', { x: (pad + gi * groupW + groupW / 2).toFixed(1), y: height - pad + 13, class: 'chart-label', 'text-anchor': 'middle' }, [g.label]));
  });
  return root;
}

/**
 * Multi-series line chart over a shared x domain.
 * @param series [{color, points: [{x:number, y:number}]}]
 */
export function lineChart({ series, xDomain, yDomain, width = 340, height = 150, pad = 30 }) {
  const root = svg('svg', { viewBox: `0 0 ${width} ${height}`, class: 'chart', role: 'img', 'aria-label': 'Line chart' });
  const pts = series.flatMap((s) => s.points);
  if (!pts.length) {
    root.append(svg('text', { x: width / 2, y: height / 2, class: 'chart-label', 'text-anchor': 'middle' }, ['No data yet']));
    return root;
  }
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const xMin = (xDomain && xDomain[0]) ?? Math.min(...xs);
  const xMax = (xDomain && xDomain[1]) ?? Math.max(...xs);
  let yMin = (yDomain && yDomain[0]) ?? Math.min(...ys);
  let yMax = (yDomain && yDomain[1]) ?? Math.max(...ys);
  if (yMin === yMax) { yMin -= 1; yMax += 1; } // avoid divide-by-zero on flat data

  const plotW = width - pad * 2;
  const plotH = height - pad * 2;
  const sx = (x) => pad + (xMax === xMin ? 0.5 : (x - xMin) / (xMax - xMin)) * plotW;
  const sy = (y) => height - pad - ((y - yMin) / (yMax - yMin)) * plotH;

  root.append(svg('line', { x1: pad, y1: height - pad, x2: width - pad, y2: height - pad, class: 'axis' }));
  root.append(svg('text', { x: 3, y: pad + 4, class: 'chart-label' }, [String(Math.round(yMax * 10) / 10)]));
  root.append(svg('text', { x: 3, y: height - pad, class: 'chart-label' }, [String(Math.round(yMin * 10) / 10)]));

  for (const s of series) {
    if (!s.points.length) continue;
    const sorted = [...s.points].sort((a, b) => a.x - b.x);
    const d = sorted.map((p, i) => `${i ? 'L' : 'M'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    root.append(svg('path', { d, fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
    for (const p of sorted) root.append(svg('circle', { cx: sx(p.x).toFixed(1), cy: sy(p.y).toFixed(1), r: 2.6, fill: s.color }));
  }
  return root;
}
