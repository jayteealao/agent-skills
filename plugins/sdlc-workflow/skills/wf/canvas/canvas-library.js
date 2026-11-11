// The Library and Tokens views of the design canvas. The Library lists the components of the
// design system, and shows one at a time: its controls (one per dimension of its spec, one for
// the state, one for the theme), a live preview of the one case that the controls name, and the
// grid of all its cases. The Tokens view is a table per kind of token, with the value of each
// theme, the chain of aliases, and what uses each token.
//
// The file has two parts, like canvas.js. `WF_LIBRARY_LOGIC` holds the rules that need no
// browser: which specimen cell shows a case, the matrix of the cells of a spec, the rows of the
// token table, and the address of a view. The second part draws, and returns at once where there
// is no document. A component page is a same-origin frame: the views read and style its
// document directly, and never write the page.
var WF_LIBRARY_LOGIC = (() => {
  'use strict';
  const L = typeof WF_CANVAS_LOGIC === 'undefined' ? null : WF_CANVAS_LOGIC;

  // ---- the cells of a component page

  /** `tone=solid size=sm` as `{ tone: 'solid', size: 'sm' }`, as the spec reader of the server reads it. */
  const parsePairs = (text) => Object.fromEntries(String(text ?? '').trim().split(/\s+/).filter((w) => w.includes('=')).map((w) => w.split('=').map((x) => x.trim())));
  /** The case of a specimen cell: its variant and its state (`default` when it names none). */
  function cellCase(text) {
    const { state = 'default', ...variant } = parsePairs(text);
    return { variant, state };
  }
  /**
   * How well a cell shows a case `{ variant, state }`: -1 when it shows another state or another
   * value of a dimension, else the count of the values of the case that it names.
   */
  function cellScore(text, chosen) {
    const c = cellCase(text);
    if (c.state !== (chosen?.state || 'default')) return -1;
    const want = chosen?.variant || {};
    let score = 0;
    for (const [d, v] of Object.entries(c.variant)) {
      if (!(d in want)) continue;
      if (want[d] !== v) return -1;
      score += 1;
    }
    return score;
  }
  /**
   * The cell that shows a case: `{ index, exact }`. The cell with the most values of the case wins,
   * the first of a tie; `exact` when it names every value of the case and no other dimension.
   * `{ index: -1 }` when no cell shows the case.
   */
  function pickCell(texts, chosen) {
    let best = -1;
    let bestScore = -1;
    (texts || []).forEach((t, i) => {
      const s = cellScore(t, chosen);
      if (s > bestScore) { best = i; bestScore = s; }
    });
    if (best < 0) return { index: -1, exact: false };
    const want = Object.keys(chosen?.variant || {});
    const named = Object.keys(cellCase(texts[best]).variant);
    return { index: best, exact: bestScore === want.length && named.every((d) => want.includes(d)) };
  }
  /** The first value of each dimension and the first state: the case that the controls start on. */
  function firstCase(spec) {
    const variant = Object.fromEntries(Object.entries(spec?.variants || {}).filter(([, v]) => v.length).map(([d, v]) => [d, v[0]]));
    const states = spec?.states || [];
    return { variant, state: states.includes('default') ? 'default' : states[0] || 'default' };
  }
  /**
   * The problems of a spec that a case shows: a value of the case that no cell shows, or its state
   * with its first value.
   */
  function caseGaps(problems, chosen) {
    const pairs = Object.entries(chosen?.variant || {}).map(([d, v]) => `${d}=${v}`);
    const state = chosen?.state || 'default';
    return (problems || []).filter((p) => {
      const cause = String(p?.cause ?? '');
      if (cause.startsWith('variant:')) return pairs.includes(cause.slice(8));
      if (cause.startsWith('state:')) {
        const [, st, pair] = cause.split(':');
        return st === state && (!pair || pairs.includes(pair));
      }
      return false;
    });
  }
  /**
   * The matrix of the cells of a spec with one or two dimensions: one row for each value of its
   * dimensions that a cell shows (in the order the spec declares them), one column for each state.
   * `{ rows: [{ key, label }], cols: [state], place: [{ row, col }] }`, a place for each cell in the
   * order of `texts`. A value or a state that the spec does not declare comes after the declared
   * ones. Null with more than two dimensions: the page then shows as it is.
   */
  function matrixOf(spec, texts) {
    const dims = Object.entries(spec?.variants || {});
    if (dims.length > 2) return null;
    const cases = (texts || []).map(cellCase);
    const cols = [...(spec?.states?.length ? spec.states : ['default'])];
    for (const c of cases) if (!cols.includes(c.state)) cols.push(c.state);
    const rank = (d, v) => {
      const declared = dims.find(([x]) => x === d)?.[1] || [];
      const i = declared.indexOf(v);
      return i < 0 ? declared.length + 1 : i + 1;
    };
    // The row of a cell is the values it names of the declared dimensions, then any other it names.
    const order = dims.map(([d]) => d);
    const rowOf = (c) => {
      const names = [...order.filter((d) => d in c.variant), ...Object.keys(c.variant).filter((d) => !order.includes(d)).sort()];
      return { key: names.map((d) => `${d}=${c.variant[d]}`).join(' '), label: names.map((d) => c.variant[d]).join(' · '), sort: names.map((d) => rank(d, c.variant[d])) };
    };
    const rows = new Map();
    for (const c of cases) { const r = rowOf(c); if (!rows.has(r.key)) rows.set(r.key, r); }
    const sorted = [...rows.values()].sort((a, b) => {
      for (let i = 0; i < Math.max(a.sort.length, b.sort.length); i += 1) {
        const d = (a.sort[i] ?? 0) - (b.sort[i] ?? 0);
        if (d) return d;
      }
      return 0;
    });
    const rowIndex = new Map(sorted.map((r, i) => [r.key, i]));
    // Two cells of one case share a place: the second takes a row of its own below the others.
    const taken = new Set();
    const extra = [];
    const place = cases.map((c) => {
      const r = rowOf(c);
      let row = rowIndex.get(r.key);
      const col = cols.indexOf(c.state);
      if (taken.has(`${row}|${col}`)) { row = sorted.length + extra.length; extra.push({ key: `${r.key}#${extra.length + 1}`, label: r.label }); }
      taken.add(`${row}|${col}`);
      return { row, col };
    });
    return { rows: [...sorted.map(({ key, label }) => ({ key, label })), ...extra], cols, place };
  }

  // ---- the components

  /** The kinds of the component list, in order: the page shells first. */
  const COMPONENT_KINDS = [{ kind: 'layout', title: 'Layout' }, { kind: 'component', title: 'Components' }];
  /** The components that a search matches, in groups by kind: `[{ kind, title, list }]`; a group with none does not show. */
  function componentGroups(components, q = '') {
    const want = String(q || '').trim().toLowerCase();
    const hit = (c) => !want || [c.key, c.title, c.name, c.code].some((v) => String(v || '').toLowerCase().includes(want));
    return COMPONENT_KINDS.map(({ kind, title }) => ({ kind, title, list: (components || []).filter((c) => (c.kind === 'layout' ? 'layout' : 'component') === kind && hit(c)) }))
      .filter((g) => g.list.length);
  }

  // ---- the tokens

  /** The names that a value reads: each `var(--x)`. */
  const varsOf = (value) => [...String(value ?? '').matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)].map((m) => m[1]);
  /**
   * The chain of a token whose value is another token: `[{ name, missing }]`, from the token it
   * points to, through each token that points on, to the first with a value of its own. Empty when
   * the value is not a `var()`. A name that is not in the model ends the chain as missing; a loop ends it.
   */
  function aliasChain(t, tokens, theme = null) {
    const byName = new Map((tokens || []).map((x) => [x.name, x]));
    const valueOf = (x) => (theme && x?.values?.[theme] != null ? x.values[theme] : x?.value);
    const out = [];
    const seen = new Set([t?.name]);
    let value = valueOf(t);
    for (let i = 0; i < 8; i += 1) {
      const m = /^\s*var\(\s*(--[A-Za-z0-9_-]+)\s*(?:,[^)]*)?\)\s*$/.exec(String(value ?? ''));
      if (!m) break;
      const name = m[1];
      const next = byName.get(name);
      if (!next) { out.push({ name, missing: true }); break; }
      if (seen.has(name)) { out.push({ name, missing: false, loop: true }); break; }
      out.push({ name, missing: false });
      seen.add(name);
      value = valueOf(next);
    }
    return out;
  }
  /** The kind of a token for the table: its kind, else the kind its name says (a sheet from before the token model). */
  const groupsOf = (tokens) => (L ? L.tokenGroups(tokens) : [{ kind: 'other', tokens: tokens || [] }]);
  /**
   * The token table: `{ themes: [name], groups: [{ kind, rows }] }`. A row: `{ name, kind, usedFor,
   * alias, values: [{ theme, value, same }], chain, screens, components }`. `values` holds one value
   * for each theme of the model (one with theme null when it names none); `same` marks a value that
   * equals the value of the default theme. `screens` counts the screens that use the token,
   * `components` lists the keys of the components that read it. `q` keeps the tokens whose name,
   * role or alias holds it.
   */
  function tokenTable({ tokens = [], themes = [], defaultTheme = null, screens = [], components = [] } = {}, q = '') {
    const names = (themes || []).map((x) => x.name).filter(Boolean);
    const cols = names.length ? names : [null];
    const base = defaultTheme && names.includes(defaultTheme) ? defaultTheme : names[0] ?? null;
    const want = String(q || '').trim().toLowerCase();
    const hit = (t) => !want || [t.name, t.role, t.alias].some((v) => String(v || '').toLowerCase().includes(want));
    const rowOf = (t) => {
      const valueIn = (theme) => (theme && t.values?.[theme] != null ? t.values[theme] : t.value ?? '');
      const def = valueIn(base);
      return {
        name: t.name, kind: t.kind || null, usedFor: t.usedFor || null, alias: t.alias || null,
        values: cols.map((theme) => { const value = String(valueIn(theme)); return { theme, value, same: Boolean(theme && theme !== base && value === String(def)) }; }),
        chain: aliasChain(t, tokens, base),
        screens: (screens || []).filter((s) => (s.tokens || []).includes(t.name)).length,
        components: (components || []).filter((c) => (c.tokens || []).includes(t.name)).map((c) => c.key),
      };
    };
    return {
      themes: cols,
      groups: groupsOf((tokens || []).filter(hit)).map((g) => ({ kind: g.kind, rows: g.tokens.map(rowOf) })),
    };
  }

  // ---- the address of a view

  /** `#component=<key>` opens the library on a component, `#token=<name>` the token table on a token. */
  function parseLibraryHash(hash) {
    const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    if (p.get('component')) return { view: 'library', component: p.get('component') };
    if (p.get('token')) return { view: 'tokens', token: p.get('token') };
    return null;
  }
  const libraryHash = (x) => (x?.component ? `#component=${encodeURIComponent(x.component)}` : x?.token ? `#token=${encodeURIComponent(x.token)}` : '');

  return { parsePairs, cellCase, cellScore, pickCell, firstCase, caseGaps, matrixOf, COMPONENT_KINDS, componentGroups, varsOf, aliasChain, tokenTable, parseLibraryHash, libraryHash };
})();

(() => {
  'use strict';
  if (typeof document === 'undefined') return;
  const LL = WF_LIBRARY_LOGIC;
  const VIEWS = ['library', 'tokens'];
  const api = () => window.WF_CANVAS;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const plural = (n, w) => api().L.plural(n, w);
  const root = () => $('#library');
  // What the views show: the component, its case and theme, the searches, the token, and on a
  // phone whether the detail is open over the list.
  const lib = { comp: null, chosen: null, chosenFor: null, theme: null, q: '', tq: '', token: null, open: false, on: false, drawn: null, data: null };

  /** The themes a component page has panels for, else the themes of the tokens. */
  function themesOf(c) {
    const d = api().data();
    const named = (d.themes || []).map((x) => x.name);
    const list = c?.spec?.themes?.length ? c.spec.themes : named;
    return [...new Set(list.filter(Boolean))];
  }
  /** The mode of the bar (canvas-inspect.js): one theme on every frame, or '' for the system's. */
  const boardMode = () => $('#mode')?.value || null;
  /** The theme the frames show: the one the person picked here, else the mode of the bar, else the default theme. */
  function themeFor(c) {
    const list = themesOf(c);
    const d = api().data();
    for (const t of [lib.theme, boardMode(), d.defaultTheme]) if (t && list.includes(t)) return t;
    return list[0] || null;
  }
  // A new mode in the bar shows in the frames of the library too, over a theme picked here.
  document.addEventListener('change', (e) => {
    if (e.target?.id !== 'mode' || !lib.on) return;
    lib.theme = null;
    lib.drawn = null;
    if (api().ui.view === 'library') drawLibrary(true);
  });
  /** Keep the address at what the view shows, unless the address names a screen that is open. */
  function syncHash() {
    if (api().SNAP) return;
    const was = location.hash;
    if (was && !LL.parseLibraryHash(was)) return;
    const want = !lib.on ? '' : api().ui.view === 'library' ? LL.libraryHash({ component: lib.comp }) : LL.libraryHash({ token: lib.token });
    if (want === was) return;
    try { history.replaceState(history.state, '', want || location.pathname + location.search); } catch { /* no history */ }
  }

  // ------------------------------------------------------------ the frames

  const STYLE_ID = 'wf-library-style';
  /** The rules the views add to a component page: the cells left out, and the grid of the cases. */
  const FRAME_CSS = `[data-wf-off], [hidden] { display: none !important; }
[data-wf-grid]:not([hidden]) { display: grid !important; grid-auto-flow: row; align-items: center; justify-items: start; gap: 16px 24px; }
[data-wf-grid]::before { grid-column: 1 / -1; }
[data-wf-label] { font: 600 11px/1.3 ui-sans-serif, system-ui, sans-serif; opacity: .7; letter-spacing: .02em; white-space: nowrap; }
html, body { overflow: hidden; }`;
  /** The document of a frame, when the page has loaded and shares the origin. */
  function docOf(frame) {
    try { return frame.contentDocument?.body ? frame.contentDocument : null; } catch { return null; }
  }
  function ensureStyle(doc) {
    if (doc.getElementById(STYLE_ID)) return;
    const s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = FRAME_CSS;
    doc.head.append(s);
  }
  /** Show one theme panel of a page, as `?theme=` does; a page with no panel of that theme shows all. */
  function showTheme(doc, theme) {
    const panels = [...doc.querySelectorAll('section[data-theme-source], section[data-theme-copy]')];
    const has = theme && panels.some((p) => p.dataset.theme === theme);
    for (const p of panels) p.hidden = Boolean(has && p.dataset.theme !== theme);
  }
  /** The specimen cells of the source panel of a page, else of the whole page. */
  function sourceCells(doc) {
    const source = doc.querySelector('[data-theme-source]') || doc.body;
    return [...source.querySelectorAll('[data-spec]')];
  }
  /** The frame takes the height of its page and at least the width of its room, at 1:1. */
  function fitFrame(frame) {
    const doc = docOf(frame);
    if (!doc) return;
    // The page measures its content in a frame of no height: a taller frame would be its own floor.
    frame.style.width = '100%';
    frame.style.height = '0px';
    const room = frame.parentElement?.clientWidth || frame.clientWidth;
    const w = Math.max(room, doc.documentElement.scrollWidth);
    frame.style.width = `${w}px`;
    frame.style.height = `${Math.max(48, doc.documentElement.scrollHeight)}px`;
  }
  /** The live preview: only the cell of the chosen case shows. Returns the pick, or null before the page loads. */
  function showCase(frame, c) {
    const doc = docOf(frame);
    if (!doc) return null;
    ensureStyle(doc);
    showTheme(doc, themeFor(c));
    const texts = sourceCells(doc).map((el) => el.getAttribute('data-spec'));
    const pick = LL.pickCell(texts, lib.chosen);
    const want = pick.index >= 0 ? texts[pick.index] : null;
    // The copies of the source panel hold the same cells: in each panel, the first cell of the chosen text shows.
    const done = new Set();
    for (const el of doc.querySelectorAll('[data-spec]')) {
      const panel = el.closest('section') || doc.body;
      const show = want !== null && !done.has(panel) && el.getAttribute('data-spec') === want;
      if (show) done.add(panel);
      el.toggleAttribute('data-wf-off', !show);
    }
    fitFrame(frame);
    return pick;
  }
  /** The variant grid: every cell, placed in a matrix of its values and states, with their labels. */
  function showGrid(frame, c) {
    const doc = docOf(frame);
    if (!doc) return;
    ensureStyle(doc);
    showTheme(doc, themeFor(c));
    for (const el of doc.querySelectorAll('[data-wf-label]')) el.remove();
    const panels = [...doc.querySelectorAll('section[data-theme-source], section[data-theme-copy]')];
    const texts = sourceCells(doc).map((el) => el.getAttribute('data-spec'));
    const m = c.spec?.declared ? LL.matrixOf(c.spec, texts) : null;
    if (!m || !panels.length) { fitFrame(frame); return; }
    const labelled = m.rows.some((r) => r.label);
    const off = labelled ? 2 : 1;
    for (const p of panels) {
      p.setAttribute('data-wf-grid', '');
      p.style.gridTemplateColumns = `${labelled ? 'max-content ' : ''}repeat(${m.cols.length}, max-content)`;
      // The theme name of a panel takes the first row; the labels of the states the next.
      const label = (text, row, col) => {
        const el = doc.createElement('div');
        el.setAttribute('data-wf-label', '');
        el.textContent = text;
        el.style.gridRow = String(row);
        el.style.gridColumn = String(col);
        p.append(el);
      };
      m.cols.forEach((st, j) => label(st, 2, j + off));
      if (labelled) m.rows.forEach((r, i) => label(r.label, i + 3, 1));
      [...p.querySelectorAll('[data-spec]')].forEach((el, i) => {
        const at = m.place[i];
        if (!at) return;
        el.style.gridRow = String(at.row + 3);
        el.style.gridColumn = String(at.col + off);
      });
    }
    fitFrame(frame);
  }
  /** A frame of a component page that runs `apply` each time its page loads. */
  function componentFrame(c, title, apply) {
    const frame = api().h('iframe', { class: 'lib-frame', title, sandbox: 'allow-scripts allow-same-origin', src: api().componentSrc(c.key, themeFor(c)) });
    // Fonts and pictures of the page can change its size after the load: the frame fits again.
    frame.addEventListener('load', () => { apply(frame); for (const ms of [200, 800]) setTimeout(() => fitFrame(frame), ms); });
    return frame;
  }

  // ------------------------------------------------------------ the library

  /** One segmented control of the case: a button for each value. */
  function segment(label, values, value, on) {
    const { h } = api();
    return h('div', { class: 'lib-control' }, h('span', { class: 'lib-control-name' }, label),
      h('div', { class: 'seg', role: 'group', 'aria-label': label }, ...values.map((v) => h('button', {
        type: 'button', 'aria-pressed': String(v === value), class: v === value ? 'on' : null,
        onclick: () => on(v),
      }, v))));
  }
  function listItem(c) {
    const { h } = api();
    const gaps = api().L.specMark(c);
    const sel = c.key === lib.comp;
    return h('li', {}, h('button', { type: 'button', class: `lib-item${sel ? ' on' : ''}`, 'aria-current': sel ? 'true' : null, 'data-key': c.key, onclick: () => select(c.key, true) },
      h('span', { class: 'lib-item-name' }, h('b', {}, c.title || c.key), h('small', {}, c.screens?.length ? `Used by ${plural(c.screens.length, 'screen')}` : 'No screen uses it')),
      h('span', { class: 'marks' },
        gaps ? h('span', { class: 'mark issue', title: (c.problems || []).map((x) => x.message).join('. ') }, gaps) : null,
        h('span', { class: `mark ${c.code ? 'ok' : 'draft'}` }, c.code ? 'In code' : 'To build'))));
  }
  function drawList(box) {
    const { h } = api();
    const d = api().data();
    const groups = LL.componentGroups(d.components, lib.q);
    box.replaceChildren(...(groups.length ? groups.map((g) => h('section', { class: 'lib-group' },
      h('h3', {}, g.title, h('span', { class: 'count' }, String(g.list.length))),
      h('ul', {}, ...g.list.map(listItem))))
      : [h('p', { class: 'none' }, d.components.length ? 'No component matches the search.' : d.noComponents ? `No components: ${d.noComponents}` : 'No components yet. The design stage adds them.')]));
  }
  function select(key, fromList = false) {
    lib.comp = key;
    lib.open = true;
    syncHash();
    drawLibrary(true);
    if (fromList && api().phone()) { window.scrollTo(0, 0); $('.lib-detail h2', root())?.focus({ preventScroll: true }); }
  }
  /** The detail of one component: its header, its controls and preview, its grid, and what its spec lacks. */
  function drawDetail(box, c) {
    const { h, SNAP } = api();
    const d = api().data();
    if (!c) { box.replaceChildren(h('p', { class: 'none' }, 'Pick a component from the list.')); return; }
    if (lib.chosenFor !== c.key) { lib.chosen = LL.firstCase(c.spec); lib.chosenFor = c.key; }
    const spec = c.spec;
    const declared = Boolean(spec?.declared);
    const themes = themesOf(c);
    const theme = themeFor(c);
    const byName = new Map(d.tokens.map((t) => [t.name, t]));
    const back = h('button', { type: 'button', class: 'btn quiet lib-back', onclick: () => { lib.open = false; drawLibrary(true); $(`.lib-item[data-key="${CSS.escape(c.key)}"]`, root())?.focus(); } }, '← All components');
    const head = h('header', { class: 'lib-head' }, back,
      h('h2', { tabindex: '-1' }, c.title || c.key, ' ', api().componentMarks(c)),
      h('p', { class: 'sub' }, h('code', {}, c.key), c.kind === 'layout' ? ' · a page shell' : null),
      c.code ? h('p', {}, h('code', {}, c.name || c.key), ' in ', h('code', {}, c.code)) : h('p', { class: 'sub' }, 'Not in the code yet: the build makes it.'),
      h('div', { class: 'lib-facts' },
        h('div', {}, h('h4', {}, 'Used by ', h('span', { class: 'count' }, String(c.screens?.length || 0))),
          c.screens?.length ? h('div', { class: 'chips' }, ...c.screens.map((k) => h('button', { type: 'button', onclick: () => api().openScreen(k) }, api().titleOf(d.screens.find((x) => x.key === k) || { key: k }))))
            : h('p', { class: 'none' }, 'No screen uses it yet.')),
        h('div', {}, h('h4', {}, 'Tokens it uses ', h('span', { class: 'count' }, String(c.tokens?.length || 0))),
          c.tokens?.length ? h('div', { class: 'chips' }, ...c.tokens.map((name) => h('a', { href: LL.libraryHash({ token: name }), title: byName.get(name)?.value ?? 'Not in the token model' }, name)))
            : h('p', { class: 'none' }, 'The component sheet gives it no token.'))));
    const parts = [head];
    if (SNAP) {
      parts.push(h('p', { class: 'none' }, 'The component pages show on the design server only.'));
    } else if (!declared) {
      parts.push(h('div', { class: 'lib-banner' }, h('b', {}, 'No spec'),
        h('p', {}, 'The page declares no variants and states, so the library shows it as it is. Declare them, as design/system-migrate.md says:'),
        h('pre', {}, h('code', {}, `wf.mjs design component spec . ${c.key} --variants "dim=a|b" --states "default hover pressed focus disabled"`))));
      parts.push(h('div', { class: 'lib-stage' }, componentFrame(c, `${c.title || c.key}, as the page shows it`, (f) => { const doc = docOf(f); if (doc) { ensureStyle(doc); showTheme(doc, themeFor(c)); fitFrame(f); } })));
    } else {
      const dims = Object.entries(spec.variants || {}).filter(([, v]) => v.length);
      const states = spec.states?.length ? spec.states : ['default'];
      const note = h('div', { class: 'lib-note', role: 'status' });
      const preview = componentFrame(c, `${c.title || c.key}, the chosen case`, (f) => showCaseNote(f, c, note));
      const grid = componentFrame(c, `${c.title || c.key}, every case`, (f) => showGrid(f, c));
      const redraw = () => { drawControls(); showCaseNote(preview, c, note); };
      const controls = h('div', { class: 'lib-controls', 'aria-label': 'The case to preview', role: 'group' });
      const drawControls = () => controls.replaceChildren(
        ...dims.map(([dim, values]) => segment(dim, values, lib.chosen.variant[dim], (v) => { lib.chosen = { ...lib.chosen, variant: { ...lib.chosen.variant, [dim]: v } }; redraw(); })),
        segment('state', states, lib.chosen.state, (v) => { lib.chosen = { ...lib.chosen, state: v }; redraw(); }),
        themes.length > 1 ? segment('theme', themes, themeFor(c), (v) => { lib.theme = v; drawControls(); showCaseNote(preview, c, note); showGrid(grid, c); }) : null);
      drawControls();
      parts.push(h('section', { class: 'lib-section' }, h('h3', {}, 'Preview'), controls, note, h('div', { class: 'lib-stage' }, preview)));
      parts.push(h('section', { class: 'lib-section' }, h('h3', {}, 'Every case', h('small', { class: 'sub' }, dims.length > 2 ? ' as the page lays them out' : dims.length ? ` ${dims[0][0]}${dims[1] ? ` and ${dims[1][0]}` : ''} by state` : ' by state')),
        h('div', { class: 'lib-stage' }, grid)));
    }
    parts.push(h('section', { class: 'lib-section' }, h('h3', {}, 'What the spec lacks ', (c.problems || []).length ? h('span', { class: 'count' }, String(c.problems.length)) : null),
      (c.problems || []).length ? h('ul', { class: 'lib-gaps' }, ...c.problems.map((x) => h('li', {}, x.message))) : h('p', { class: 'none' }, 'Nothing: each case has its cell, in each theme.')));
    box.replaceChildren(...parts);
  }
  /** Show the chosen case in the preview, and say when no cell shows it, or only a close one. */
  function showCaseNote(frame, c, note) {
    const pick = showCase(frame, c);
    if (!pick) return;
    const { h } = api();
    const words = [...Object.entries(lib.chosen.variant).map(([d, v]) => `${d}=${v}`), `state=${lib.chosen.state}`].join(' ');
    frame.hidden = pick.index < 0;
    if (pick.index < 0) {
      const gaps = LL.caseGaps(c.problems, lib.chosen);
      note.replaceChildren(h('b', {}, 'No specimen for this case'), h('p', {}, words),
        gaps.length ? h('ul', { class: 'lib-gaps' }, ...gaps.map((x) => h('li', {}, x.message))) : h('p', { class: 'sub' }, 'The page has no cell for it: add one with these values.'));
      note.className = 'lib-note gap';
    } else if (!pick.exact) {
      note.replaceChildren(h('p', { class: 'sub' }, `The closest cell: ${docOf(frame) ? sourceCells(docOf(frame))[pick.index]?.getAttribute('data-spec') : ''}`));
      note.className = 'lib-note';
    } else { note.replaceChildren(); note.className = 'lib-note'; }
  }
  function drawLibrary(force = false) {
    const { h } = api();
    const d = api().data();
    const box = root();
    let shell = $(':scope > .lib', box);
    if (!shell || shell.dataset.view !== 'library') {
      const search = h('input', { type: 'search', placeholder: 'Search components', value: lib.q, 'aria-label': 'Search components',
        oninput: (e) => { lib.q = e.target.value; drawList($('.lib-list-body', box)); } });
      shell = h('div', { class: 'lib', 'data-view': 'library' },
        h('nav', { class: 'lib-list', 'aria-label': 'Components' }, h('label', { class: 'search' }, search), h('div', { class: 'lib-list-body' })),
        h('div', { class: 'lib-detail' }));
      box.replaceChildren(shell);
      lib.drawn = null;
    }
    if (!d.components.some((c) => c.key === lib.comp)) lib.comp = api().phone() ? null : LL.componentGroups(d.components)[0]?.list[0]?.key ?? null;
    if (!lib.comp) lib.open = false;
    shell.classList.toggle('open', Boolean(lib.open && lib.comp));
    drawList($('.lib-list-body', shell));
    // The detail keeps its frames while the state and the component are the same.
    const sig = `${lib.comp}|${api().phone()}`;
    if (force || lib.drawn !== sig || lib.data !== d) {
      lib.drawn = sig;
      lib.data = d;
      drawDetail($('.lib-detail', shell), d.components.find((c) => c.key === lib.comp) || null);
    }
    syncHash();
  }

  // ------------------------------------------------------------ the tokens

  /** A value of a theme in the table: a swatch for a colour, and the value as it is written. */
  function valueCell(t, kind, x) {
    const { h } = api();
    let swatch = null;
    if (kind === 'color') {
      const v = api().tokenValue(x.value, x.theme);
      swatch = h('span', { class: `swatch${v && window.CSS?.supports?.('color', v) ? '' : ' alias'}`, 'aria-hidden': 'true' });
      if (v && window.CSS?.supports?.('color', v)) swatch.style.background = v;
    }
    return h('td', { class: `tv${x.same ? ' same' : ''}`, title: x.same ? 'The same as in the default theme' : null }, swatch, h('code', {}, x.value));
  }
  function drawTokens() {
    const { h, TOKEN_KIND_WORDS, cap } = api();
    const d = api().data();
    const box = root();
    let shell = $(':scope > .lib', box);
    if (!shell || shell.dataset.view !== 'tokens') {
      const search = h('input', { type: 'search', placeholder: 'Search tokens', value: lib.tq, 'aria-label': 'Search tokens',
        oninput: (e) => { lib.tq = e.target.value; drawTable($('.tok-body', box)); } });
      shell = h('div', { class: 'lib tokens', 'data-view': 'tokens' },
        h('div', { class: 'tok-top' }, h('h2', { tabindex: '-1' }, 'Tokens'), h('label', { class: 'search' }, search),
          h('p', { class: 'sub' }, d.tokensLegacy ? 'From the token sheet. DESIGN.md has no token table yet.' : 'From DESIGN.md. Change them there.')),
        h('div', { class: 'tok-body' }));
      box.replaceChildren(shell);
    } else {
      const input = $('.tok-top input', shell);
      if (input && input.value !== lib.tq) input.value = lib.tq;
    }
    const drawTable = (body) => {
      const table = LL.tokenTable(d, lib.tq);
      const byName = new Map(d.tokens.map((t) => [t.name, t]));
      const themeHead = () => table.themes.map((t) => h('th', { scope: 'col' }, t ? `${t}${t === d.defaultTheme ? ' (default)' : ''}` : 'Value'));
      body.replaceChildren(...(table.groups.length ? table.groups.map((g) => h('section', { class: 'tok-group' },
        h('h3', {}, TOKEN_KIND_WORDS[g.kind] || cap(g.kind), h('span', { class: 'count' }, String(g.rows.length))),
        h('div', { class: 'tok-scroll' }, h('table', { class: 'tok-table' },
          h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Token'), h('th', { scope: 'col' }, 'Sample'), ...themeHead(),
            h('th', { scope: 'col' }, 'Alias'), h('th', { scope: 'col' }, 'Used for'), h('th', { scope: 'col' }, 'Used by'))),
          h('tbody', {}, ...g.rows.map((r) => {
            const t = byName.get(r.name);
            const n = r.screens + r.components.length;
            return h('tr', { id: `token-${r.name.replace(/^--/, '')}`, class: r.name === lib.token ? 'on' : null },
              h('th', { scope: 'row' }, h('code', {}, r.name)),
              h('td', { class: 'sample' }, api().tokenSpecimen(t, g.kind)),
              ...r.values.map((x) => valueCell(t, g.kind, x)),
              h('td', { class: 'chain' }, r.alias ? h('div', {}, 'also ', h('code', {}, r.alias)) : null,
                r.chain.length ? h('div', {}, '→ ', ...r.chain.flatMap((x, i) => [i ? ' → ' : null, x.missing ? h('code', { class: 'missing', title: 'Not in the token model' }, x.name)
                  : h('a', { href: LL.libraryHash({ token: x.name }) }, h('code', {}, x.name))])) : null),
              h('td', { class: 'for' }, r.usedFor || ''),
              h('td', { class: 'by' }, n ? h('button', { type: 'button', class: 'linkish', title: r.components.length ? `Components: ${r.components.join(', ')}` : null,
                onclick: () => { api().setView('grid'); api().traceFrom({ kind: 'token', key: r.name }); } },
              [r.screens ? plural(r.screens, 'screen') : null, r.components.length ? plural(r.components.length, 'component') : null].filter(Boolean).join(' · ')) : h('span', { class: 'none' }, 'Nothing')));
          }))))))
        : [h('p', { class: 'none' }, d.tokens.length ? 'No token matches the search.' : 'No tokens yet. DESIGN.md gives them.')]));
      const row = lib.token && $(`#token-${CSS.escape(lib.token.replace(/^--/, ''))}`, body);
      if (row && lib.scrollTo) { lib.scrollTo = false; row.scrollIntoView({ block: 'center' }); }
    };
    drawTable($('.tok-body', shell));
    syncHash();
  }

  // ------------------------------------------------------------ the hooks of canvas.js

  window.WF_CANVAS_LIBRARY = {
    views: VIEWS,
    /** Draw the view that shows, or let go of its frames when another view shows. */
    draw(on) {
      const box = root();
      if (!box) return;
      if (!on) {
        if (lib.on) {
          lib.on = false;
          box.hidden = true;
          box.replaceChildren();
          lib.drawn = null;
          syncHash();
        }
        return;
      }
      const opening = !lib.on;
      lib.on = true;
      box.hidden = false;
      if (opening && api().ui.panel) api().closePanel();
      if (api().ui.view === 'library') drawLibrary(); else drawTokens();
    },
    /** Open the view that the address names. True when it names one. */
    fromHash() {
      const want = LL.parseLibraryHash(location.hash);
      if (!want) return false;
      const d = api().data();
      if (want.component) {
        if (!d.components.some((c) => c.key === want.component)) { api().say(`No component ${want.component} in the library`); }
        else { lib.comp = want.component; lib.open = true; }
      } else {
        lib.token = want.token;
        lib.tq = want.token;
        lib.scrollTo = true;
        if (!d.tokens.some((t) => t.name === want.token)) api().say(`No token ${want.token} in the model`);
      }
      lib.drawn = null;
      if (api().ui.view !== want.view) api().setView(want.view); else api().render();
      return true;
    },
  };
  // A snapshot draws the board before this file runs: the address may name a view already.
  if (window.WF_CANVAS?.data?.() && LL.parseLibraryHash(location.hash)) window.WF_CANVAS_LIBRARY.fromHash();
})();
