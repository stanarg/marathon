// router.js — hash router; renders the active view into #view (§3).
//
// Routes are [{ pattern: RegExp, handler(params) -> Node }]. Named capture groups
// become `params`. GitHub Pages serves static files only, so hash routing avoids
// any 404 handling (§2). The default route is #/today.

export function createRouter({ mount, routes, fallback }) {
  function resolve(hash) {
    const path = (hash || '').replace(/^#/, '') || '/today';
    for (const r of routes) {
      const m = r.pattern.exec(path);
      if (m) return { handler: r.handler, params: m.groups || {} };
    }
    return { handler: fallback, params: { path } };
  }

  // In-place render (used by ctx.refresh after a mutation) — preserves scroll so
  // ticking a checklist item or tapping +250 ml doesn't jump the page to the top.
  function render() {
    const { handler, params } = resolve(location.hash);
    let node;
    try {
      node = handler(params);
    } catch (e) {
      // A view crashed (not a bad URL). Preserve the stack and hand the error to
      // the fallback so it can render a real diagnostic rather than a fake 404.
      console.error('[router] view render failed:', e);
      node = fallback ? fallback({ error: e }) : document.createTextNode(String(e));
    }
    mount.replaceChildren(node);
  }

  // Navigation render — scroll to top (a new screen).
  function navigate() {
    render();
    mount.scrollTop = 0;
    if (typeof window.scrollTo === 'function') window.scrollTo(0, 0);
  }

  function start() {
    window.addEventListener('hashchange', navigate);
    if (!location.hash) location.replace('#/today');
    navigate();
  }

  return { start, render, navigate, resolve };
}
