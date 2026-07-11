// ui.js — DOM building blocks (§3). createElement-based only: dynamic/user content
// always goes through textContent, never innerHTML, so injected strings can't become
// markup. Views compose these instead of writing HTML strings.

/** Create an element. attrs: class|text|dataset|aria-*|href|on<Event>|any attribute. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v; // safe: text, not markup
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v === true ? '' : String(v));
  }
  appendChildren(node, children);
  return node;
}

function appendChildren(node, children) {
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export const card = (children, cls = '') => el('div', { class: `card ${cls}`.trim() }, children);
export const badge = (text, kind = '') => el('span', { class: `badge ${kind}`.trim(), text });
export const h = (level, text, cls = '') => el(`h${level}`, { class: cls || null, text });
export const muted = (text) => el('p', { class: 'muted', text });

/** A key/value definition list from [[key, value], …]. */
export function kv(pairs) {
  const dl = el('dl', { class: 'kv' });
  for (const [k, v] of pairs) {
    if (v == null) continue;
    dl.append(el('dt', { text: k }), el('dd', { text: String(v) }));
  }
  return dl;
}

export function button(label, onClick, cls = '') {
  return el('button', { class: `btn ${cls}`.trim(), type: 'button', onClick }, [label]);
}

export function link(label, href, cls = '') {
  return el('a', { class: cls || null, href }, [label]);
}

/** A tappable row that navigates to `href` (used for session/week lists). */
export function navRow(children, href, cls = '') {
  return el('a', { class: `row ${cls}`.trim(), href }, children);
}

/** A labelled form field: label text above the input, optional hint below. */
export function field(labelText, input, hint) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'field-label', text: labelText }),
    input,
    hint ? el('span', { class: 'field-hint', text: hint }) : null,
  ]);
}

/** Parse a form value to a finite number, or null for empty/junk input. */
export function parseNum(v) {
  if (v == null || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
