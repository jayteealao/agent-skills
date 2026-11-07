// The design canvas: every screen of one repo on one board.
//
// The design server serves this page at /r/<repo>/ with the data at ./state.json and the screen
// pages at ./s/screens/<key>.html, a saved version at ./versions/<workflow>/<id>/. A published snapshot sets window.WF_STATE and
// window.WF_SNAPSHOT (the page text of each screen), and has no write route.
(() => {
  'use strict';
  const SNAP = window.WF_SNAPSHOT || null;
  const BASE = SNAP ? '' : location.pathname.replace(/[^/]*$/, '');
  const $ = (s, el = document) => el.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const params = new URLSearchParams(location.search);
  const ui = { view: 'grid', viewport: null, state: 'default', q: '', area: '', workflow: params.get('workflow') || '', open: false, failing: false, zoom: 1, x: 24, y: 24, panel: null, fitted: false, version: '', trace: null, hover: null };
  let data = null;
  // The last design audit of the repo (./audit.json): a read-only agent's report, not a check.
  let audit = null;
  const phone = () => matchMedia('(max-width: 720px)').matches;
  // On a phone the card is the width of the page less its gutters (canvas.css).
  const CARD_W = () => (phone() ? window.innerWidth - 32 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-w')) || 300);
  const GAP_X = 64;
  // The lanes of the board around the screens: the sketches and references before them, the
  // components and tokens after them. A lane is narrower than a screen column.
  const LANE_W = () => (phone() ? CARD_W() : 220);
  const LABEL_H = 56;
  const CAPTION_H = 64;
  const cap = (s) => (s ? `${String(s)[0].toUpperCase()}${String(s).slice(1)}` : '');
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const CHECK_NAMES = {
    contrast: 'Contrast', 'target-size': 'Target size', 'viewport-fit': 'Viewport fit', 'worst-case': 'Worst-case content', states: 'Missing states',
    display: 'Display bug', overlap: 'Overlapping text', token: 'Not a token', component: 'Not a component', script: 'Script error', version: 'Not a saved version',
  };
  const DIMENSION_NAMES = { accessibility: 'Accessibility', performance: 'Performance', theming: 'Theming', responsive: 'Responsive', integrity: 'Integrity' };
  /** The audit findings of one screen, when the last audit is done. */
  const auditOf = (key) => (audit?.status === 'done' ? (audit.findings || []).filter((f) => f.screen === key) : []);

  function say(text) {
    const s = $('#status');
    s.textContent = text;
    s.classList.add('show');
    clearTimeout(say.t);
    say.t = setTimeout(() => s.classList.remove('show'), 2200);
  }
  const vp = (name = ui.viewport) => {
    const m = /^(\d+)x(\d+)$/.exec(data.viewports[name] || '1280x800');
    return { width: Number(m[1]), height: Number(m[2]) };
  };
  /** The second line of a screen: its key, its flow and its workflows. */
  const metaOf = (s) => [s.key, s.flow ? `${s.flow} flow` : null, (s.workflows || []).length ? `from ${s.workflows.join(', ')}` : null].filter(Boolean).join(', ');

  // ------------------------------------------------------------ versions

  // A round is a draft on the way to a decision; an approved version is the decision. A ref is
  // `<workflow>/<id>`, and a snapshot has none, because only the server holds the pages.
  function allVersions() {
    if (SNAP) return [];
    const out = [];
    for (const [workflow, list] of Object.entries(data.versions || {})) {
      const last = list.approved.at(-1)?.number ?? 0;
      for (const v of [...list.approved, ...list.rounds]) {
        const draft = v.kind === 'round';
        out.push({ ...v, ref: `${workflow}/${v.id}`, name: draft ? `v${v.number} round ${v.round}` : v.id, draft, pending: draft && v.number > last, open: list.open });
      }
    }
    return out.sort((a, b) => String(b.at).localeCompare(String(a.at)) || b.number - a.number || (b.round ?? 0) - (a.round ?? 0));
  }
  const versionAt = (ref) => (ref ? allVersions().find((v) => v.ref === ref) ?? null : null);
  const longName = (v) => (Object.keys(data.versions || {}).length > 1 ? `${v.workflow} ${v.name}` : v.name);
  const draftName = (v) => (v.draft ? `Draft: ${longName(v)}` : longName(v));
  /** The newest draft that changed a screen after its last approval. */
  const draftOf = (s) => allVersions().find((v) => v.pending && (v.changed || []).includes(s.key)) ?? null;
  /** The screens of the board: as they are now, or as the chosen version holds them. */
  function boardScreens() {
    const v = versionAt(ui.version);
    if (!v) return data.screens;
    return v.screens.map((e) => ({ approvals: [], failures: [], threads: [], captures: [], history: [], links: [], workflows: [v.workflow], ...data.screens.find((x) => x.key === e.key), ...e }));
  }
  function drawVersions() {
    const rows = allVersions().filter((v) => !ui.workflow || v.workflow === ui.workflow);
    $('#version-pick').hidden = !rows.length;
    if (!rows.some((v) => v.ref === ui.version)) ui.version = '';
    fill($('#version'), [['', 'Now'], ...rows.map((v) => [v.ref, draftName(v)])], ui.version);
  }
  /** Put a version back on the surface. The server saves it as a new round, never as an approval. */
  async function restore(v) {
    const r = await fetch(`${BASE}versions/${v.workflow}/restore`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: v.id }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { say(`Not restored: ${j.reason || r.status}`); return; }
    const keep = focusState && { ...focusState, restoring: '', compare: '' };
    await load();
    if (keep) { focusState = keep; drawFocus(); }
    say(j.tokensDiffer ? 'Restored as a new round. The token sheet stays as it is now.' : 'Restored as a new round. It needs a new approval.');
  }
  /** The versions of one screen: the drafts in progress, then each approved version with its rounds. */
  function versionList(s, f) {
    const held = allVersions().filter((v) => v.screens.some((e) => e.key === s.key));
    if (!held.length) return null;
    const row = (v) => h('div', { class: `version${f.compare === v.ref ? ' on' : ''}` },
      h('div', { class: 'cap-row' }, h('span', { class: v.draft ? 'mark draft' : 'mark ok' }, v.draft ? 'Draft' : ''), h('b', {}, longName(v)), h('small', {}, String(v.at).slice(0, 10))),
      v.reason ? h('p', {}, v.reason) : null,
      h('div', { class: 'acts' },
        h('button', { type: 'button', class: 'btn quiet', 'aria-pressed': String(f.compare === v.ref), onclick: () => { f.compare = f.compare === v.ref ? '' : v.ref; drawFocus(); } }, 'Compare'),
        data.writable && v.open ? h('button', { type: 'button', class: 'btn quiet', onclick: () => { if (f.restoring === v.ref) restore(v); else { f.restoring = v.ref; drawFocus(); } } }, f.restoring === v.ref ? 'Confirm restore' : 'Restore') : null));
    const under = (v) => held.filter((r) => r.draft && r.workflow === v.workflow && r.number === v.number);
    const pending = held.filter((v) => v.pending);
    const approved = held.filter((v) => !v.draft);
    return [
      h('h3', {}, 'Versions', approved.length ? h('span', { class: 'count' }, String(approved.length)) : null),
      pending.length ? [h('h4', {}, 'In progress'), ...pending.map(row)] : null,
      ...approved.map((v) => [row(v), under(v).length ? h('details', { class: 'rounds', open: f.rounds.includes(v.ref),
        ontoggle: (e) => { f.rounds = e.target.open ? [...new Set([...f.rounds, v.ref])] : f.rounds.filter((x) => x !== v.ref); } },
      h('summary', {}, plural(under(v).length, 'round')), ...under(v).map(row)) : null]),
    ];
  }

  // ------------------------------------------------------------ data

  // The failures of each screen that the screen view opened: the state holds only their counts.
  const failCache = new Map();
  function failuresFor(s) {
    if (s.failures) return { failures: s.failures, failureGroups: s.failureGroups };
    if (SNAP) return { failures: [], failureGroups: [] };
    const held = failCache.get(s.key);
    if (held) return held === 'loading' ? null : held;
    failCache.set(s.key, 'loading');
    fetch(`${BASE}failures/${s.key}.json`, { cache: 'no-store' }).then((r) => r.json())
      .then((j) => { failCache.set(s.key, j); if (focusState?.key === s.key) drawFocus(); })
      .catch(() => failCache.delete(s.key));
    return null;
  }

  async function load() {
    failCache.clear();
    // The state and the audit load at the same time; the board draws once, when both are here.
    const [state] = await Promise.all([
      window.WF_STATE || fetch(`${BASE}state.json`, { cache: 'no-store' }).then((r) => r.json()),
      SNAP ? null : fetchAudit(),
    ]);
    data = state;
    if (!SNAP) pollAudit();
    $('#repo').textContent = data.repo || 'Design canvas';
    document.title = `${data.repo || 'Design'} canvas`;
    const names = Object.keys(data.viewports);
    ui.viewport = ui.viewport || (phone() && names.includes('phone') ? 'phone' : names.includes('desktop') ? 'desktop' : names[0]);
    // A phone has no room for the size in the dock; the focus sheet shows it.
    fill($('#viewport'), names.map((n) => [n, phone() ? cap(n) : `${cap(n)} ${data.viewports[n].replace('x', '×')}`]), ui.viewport);
    fill($('#area'), [['', 'All areas'], ...data.areas.map((a) => [a, cap(a)])], ui.area);
    fill($('#workflow'), [['', 'All workflows'], ...data.workflows.map((w) => [w, w])], ui.workflow);
    drawVersions();
    drawStates();
    drawHealth();
    filterCount();
    barHeight();
    render();
    if (ui.panel) panel(ui.panel, true);
  }
  function fill(sel, rows, value) {
    sel.replaceChildren(...rows.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
  }
  function drawStates() {
    $('#states').replaceChildren(...data.states.map((s) => h('button', { type: 'button', class: s === ui.state ? 'on' : null, 'aria-pressed': String(s === ui.state), onclick: () => { ui.state = s; drawStates(); render(); } }, cap(s))));
  }
  function filterCount() {
    const n = [ui.area, ui.workflow, ui.open, ui.failing].filter(Boolean).length;
    const c = $('#fcount');
    c.textContent = String(n);
    c.hidden = n === 0;
  }
  function barHeight() {
    document.documentElement.style.setProperty('--bar-h', `${$('.bar').offsetHeight}px`);
  }
  const screenUrl = (key, state, at = null) => (SNAP ? null : at ? `${BASE}${at.includes('/') ? 'versions' : 'at'}/${at}/screens/${key}.html?state=${state}` : `${BASE}s/screens/${key}.html?state=${state}`);
  // A snapshot screen has no query string, so the state is set after the page's own script.
  const snapDoc = (key, state) => (SNAP.screens[key] || '').replace('</head>', `<style>${SNAP.tokens || ''}</style><script>document.documentElement.dataset.state=${JSON.stringify(state)}<\/script></head>`);
  function frameFor(key, state, at = null) {
    // A screen is an artboard, not a window: a scrollbar would take width from the page.
    const f = h('iframe', { title: key, tabindex: '-1', scrolling: 'no', 'data-state': state, sandbox: SNAP ? 'allow-scripts' : 'allow-scripts allow-same-origin' });
    if (SNAP) f.srcdoc = snapDoc(key, state);
    else {
      f.src = screenUrl(key, state, at);
      // The state can change before the page loads; the page then shows the state of the frame.
      f.addEventListener('load', () => { try { f.contentDocument.documentElement.dataset.state = f.dataset.state; } catch { /* no access */ } });
    }
    return f;
  }
  /**
   * Show another state of a page. A page shows the state that its root element names, so a loaded
   * page changes state with no reload. A snapshot page has no origin to reach, so it loads again.
   */
  function setFrameState(f, key, state, at = null) {
    if (f.dataset.state === state) return;
    f.dataset.state = state;
    if (SNAP) { f.srcdoc = snapDoc(key, state); return; }
    try { f.contentDocument.documentElement.dataset.state = state; } catch { f.src = screenUrl(key, state, at); }
  }

  // ------------------------------------------------------------ live frames

  // A live page is a whole document: on a board of 200 screens, 200 documents. So a frame holds its
  // page only while it is near the view, and zoomed far out, a screen whose approval picture still
  // shows its page shows that picture. A frame has `make`, which makes its page, and `pic`.
  const FAR = 0.35;
  let watcher = null;
  let wasFar = false;
  function watch(frame) {
    const root = phone() ? null : $('#stage');
    if (watcher?.root !== root) {
      watcher?.io.disconnect();
      const io = new IntersectionObserver((entries) => { for (const e of entries) { e.target.near = e.isIntersecting; fillFrame(e.target); } }, { root, rootMargin: '50%' });
      watcher = { root, io };
      for (const f of document.querySelectorAll('#board .frame')) if (f.make && f !== frame) io.observe(f);
    }
    watcher.io.observe(frame);
  }
  function unwatch(el) {
    for (const f of el.matches('.frame') ? [el] : el.querySelectorAll('.frame')) watcher?.io.unobserve(f);
  }
  /** Give a frame what its place asks for: nothing away from the view, the picture far out, else the page. */
  function fillFrame(frame) {
    const want = !frame.near ? 'none' : frame.pic && ui.zoom < FAR && !phone() ? 'pic' : 'live';
    if (frame.dataset.fill === want) return;
    frame.dataset.fill = want;
    frame.querySelector(':scope > iframe, :scope > img.pic')?.remove();
    if (want === 'live') frame.append(frame.make());
    else if (want === 'pic') frame.append(h('img', { class: 'pic', src: frame.pic, alt: '' }));
  }
  /** After a zoom across the far line, swap the pages and the pictures. */
  function zoomFill() {
    const far = ui.zoom < FAR;
    if (far === wasFar) return;
    wasFar = far;
    for (const f of document.querySelectorAll('#board .frame')) if (f.pic) fillFrame(f);
  }

  // ------------------------------------------------------------ the board

  function matches(s) {
    const q = ui.q.toLowerCase();
    if (q && ![s.key, s.title, s.area, s.flow].some((v) => String(v || '').toLowerCase().includes(q))) return false;
    if (ui.area && s.area !== ui.area) return false;
    if (ui.workflow && !(s.workflows || []).includes(ui.workflow)) return false;
    if (ui.open && !s.openComments) return false;
    if (ui.failing && !failTotal(s)) return false;
    // A traced token or component leaves only the screens that use it.
    const t = ui.hover || ui.trace;
    if (t && !((t.kind === 'token' ? s.tokens : s.components) || []).includes(t.key)) return false;
    return true;
  }
  const traceId = (t) => (t ? `${t.kind}:${t.key}` : '');
  /** Dim the cards that the search box, the filters and the trace leave out, with no new screen frame. */
  function applyFilter() {
    if (!data) return;
    const byKey = new Map(boardScreens().map((s) => [s.key, s]));
    for (const card of document.querySelectorAll('#board > .card')) {
      const s = byKey.get(card.dataset.key);
      card.classList.toggle('dim', Boolean(s) && !matches(s));
    }
    const on = traceId(ui.hover || ui.trace);
    for (const el of document.querySelectorAll('[data-trace]')) el.classList.toggle('on', el.dataset.trace === on);
  }
  /** Pin a trace, or clear it: the same token or component again clears it. */
  function traceTo(t) {
    ui.trace = t && traceId(t) !== traceId(ui.trace) ? t : null;
    ui.hover = null;
    const chip = $('#trace');
    chip.hidden = !ui.trace;
    if (ui.trace) {
      const name = ui.trace.kind === 'token' ? ui.trace.key : data.components.find((c) => c.key === ui.trace.key)?.title || ui.trace.key;
      const n = boardScreens().filter(matches).length;
      chip.textContent = `${plural(n, 'screen')} use${n === 1 ? 's' : ''} ${name} ×`;
      chip.setAttribute('aria-label', `Show every screen, not only the screens that use ${name}`);
    }
    barHeight();
    applyFilter();
  }
  /** While the pointer is on a token or a component, show the screens that use it. */
  const traceHover = (t) => ({
    onpointerenter: (e) => { if (e.pointerType === 'mouse') { ui.hover = t; applyFilter(); } },
    onpointerleave: () => { if (ui.hover) { ui.hover = null; applyFilter(); } },
  });

  const frameH = () => Math.round(CARD_W() * vp().height / vp().width);

  /** The second line of a slice row: its screens, its approval, its checks and its comments. */
  const sliceSummary = (c, n) => [plural(n, 'screen'),
    c.approval ? 'Approved' : 'Not approved',
    c.checks ? (c.checks.passed ? 'Checks pass' : `${plural(c.checks.failures, 'check')} fail${c.checks.failures === 1 ? 's' : ''}`) : null,
    c.openComments ? plural(c.openComments, 'open comment') : null].filter(Boolean).join(' · ');
  /**
   * The automatic place of each screen: columns by area, rows by flow, or rows by slice, in flow
   * order. `places` holds every card of the board. In the slices layout a screen of two slices
   * shows in both rows, and `pos` holds its first place.
   */
  function autoLayout(list) {
    const w = CARD_W() + GAP_X;
    const cardH = frameH() + CAPTION_H;
    const pos = {};
    const places = [];
    const labels = [];
    if (ui.view === 'slice') {
      const shown = new Set(list.map((s) => s.key));
      let y = 0;
      const row = (text, sub, keys) => {
        labels.push({ text, sub, x: 0, y, slug: true });
        keys.forEach((key, i) => { const p = { x: i * w, y: y + LABEL_H }; places.push({ key, ...p }); pos[key] ??= p; });
        y += cardH + LABEL_H + 48;
      };
      for (const c of data.cards) {
        const keys = c.screens.map((x) => x.key).filter((k) => shown.has(k));
        if (keys.length) row(`${c.workflow}${c.slice && !String(c.slice).startsWith('(') ? `, slice ${c.slice}` : ''}`, sliceSummary(c, keys.length), keys);
      }
      const rest = list.filter((s) => !(s.key in pos)).map((s) => s.key);
      if (rest.length) row('No slice', plural(rest.length, 'screen'), rest);
      return { pos, places, labels };
    }
    const groupKey = ui.view === 'flow' ? (s) => s.flow || 'No flow' : (s) => s.area || 'No area';
    // Areas follow the manifest's list, the order of the product's navigation. A flow follows
    // the area of its first screen. A screen with no area or no flow goes last.
    const areaRank = (a) => { const i = (data.areas || []).indexOf(a); return i < 0 ? (a ? 1e6 : 2e6) : i; };
    const first = (g) => list.filter((s) => groupKey(s) === g).sort((a, b) => (a.order ?? 999) - (b.order ?? 999))[0];
    const rank = (g) => (ui.view === 'flow' ? (g === 'No flow' ? 3e6 : areaRank(first(g).area) * 1000 + (first(g).order ?? 999)) : areaRank(g === 'No area' ? null : g));
    const groups = [...new Set(list.map(groupKey))].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
    groups.forEach((g, gi) => {
      const members = list.filter((s) => groupKey(s) === g).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.key.localeCompare(b.key));
      if (ui.view === 'flow') {
        const y = gi * (cardH + LABEL_H + 48);
        labels.push({ text: g, n: members.length, x: 0, y });
        members.forEach((s, i) => { pos[s.key] = { x: i * w, y: y + LABEL_H }; });
      } else {
        labels.push({ text: g, n: members.length, x: gi * w, y: 0 });
        members.forEach((s, i) => { pos[s.key] = { x: gi * w, y: LABEL_H + i * (cardH + 32) }; });
      }
    });
    for (const s of list) places.push({ key: s.key, ...pos[s.key] });
    return { pos, places, labels };
  }

  /** The number of check failures of a screen in one viewport and state, and in all. */
  const failCount = (s, viewport, state) => (s.failureCounts ? s.failureCounts[`${viewport}|${state}`] ?? 0 : (s.failures || []).filter((f) => f.viewport === viewport && f.state === state).length);
  const failTotal = (s) => s.failureTotal ?? (s.failures || []).length;

  /**
   * Draw the board. A card keeps its element and its page from one draw to the next: a page moves
   * in the document only by a reload, so the draw moves, sizes and relabels the cards in place, and
   * a new viewport or state changes the page with no reload. Only a new version makes new pages.
   */
  function render() {
    // A resize can come before the data does.
    if (!data) return;
    const board = $('#board');
    const edges = $('#edges');
    edges.replaceChildren();
    for (const el of board.querySelectorAll(':scope > .area-label, :scope > .empty')) el.remove();
    const list = boardScreens();
    const past = versionAt(ui.version);
    const { left, right } = laneEls(board, past);
    const laneStep = LANE_W() + GAP_X;
    left.forEach((el, i) => { el.style.left = `${-(left.length - i) * laneStep}px`; });
    if (!list.length) {
      for (const c of board.querySelectorAll(':scope > .card')) { unwatch(c); c.remove(); }
      board.append(h('div', { class: 'empty' }, h('b', {}, 'No screens yet'), 'The design stage draws the screens of this repo here. Run wf.mjs design screen add to add the first one.'));
      right.forEach((el, i) => { if (phone()) el.style.order = String(100000 + i); else el.style.left = `${420 + GAP_X + i * laneStep}px`; });
      if (!ui.fitted && !phone()) { ui.fitted = true; fit(); } else place();
      return;
    }
    const { pos, places, labels } = autoLayout(list);
    const at = (s) => (ui.view === 'grid' && s.position ? s.position : pos[s.key]);
    if (!phone()) for (const l of labels) board.append(h('h2', { class: `area-label${l.slug ? ' slug' : ''}`, style: `left:${l.x}px;top:${l.y}px` }, l.slug ? l.text : cap(l.text), h('small', {}, l.sub ?? plural(l.n, 'screen'))));
    const byKey = new Map(list.map((s) => [s.key, s]));
    const old = new Map([...board.querySelectorAll(':scope > .card')].map((c) => [c.dataset.slot, c]));
    const count = new Map();
    let edge = 0;
    places.forEach((place0, i) => {
      const s = byKey.get(place0.key);
      // A screen of two slices has two cards: the slot tells them apart.
      const n = count.get(s.key) ?? 0;
      count.set(s.key, n + 1);
      const slot = `${s.key}#${n}`;
      const p = ui.view === 'grid' && s.position ? s.position : place0;
      edge = Math.max(edge, p.x + CARD_W());
      let card = old.get(slot);
      old.delete(slot);
      if (card && card.dataset.at !== (ui.version || '')) { unwatch(card); card.remove(); card = null; }
      if (!card) {
        card = newCard(s, slot);
        board.append(card);
      }
      updateCard(card, s, past, p, i);
    });
    for (const c of old.values()) { unwatch(c); c.remove(); }
    right.forEach((el, i) => { if (phone()) el.style.order = String(100000 + i); else el.style.left = `${edge + GAP_X + i * laneStep}px`; });
    if (ui.view === 'flow' && !phone()) drawEdges(list, at);
    // Arrange shows only while a dragged screen is out of its column.
    const moved = list.some((s) => s.position && (s.position.x !== pos[s.key].x || s.position.y !== pos[s.key].y));
    $('#arrange').hidden = !(data.writable && ui.view === 'grid' && !phone() && moved && !past);
    if (!ui.fitted && !phone()) { ui.fitted = true; fit(); } else place();
    applyFilter();
  }
  /** A new card: its frame makes the page of the screen when the frame comes near the view. */
  function newCard(s, slot) {
    const key = s.key;
    const open = () => focus(key);
    const frame = h('div', { class: 'frame', role: 'button', tabindex: '0', 'aria-label': `Open ${s.title}`, onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } });
    const at = ui.version || '';
    frame.make = () => sized(frameFor(key, frame.dataset.state, at || null));
    const card = h('article', { class: 'card', 'data-key': key, 'data-slot': slot, 'data-at': at }, frame, h('header', { class: 'cap' }));
    watch(frame);
    return card;
  }
  /** Size a page to the viewport, and scale it to the width of a card. */
  function sized(f) {
    const v = vp();
    f.style.width = `${v.width}px`;
    f.style.height = `${v.height}px`;
    f.style.transform = `scale(${CARD_W() / v.width})`;
    return f;
  }
  /** Move, size and relabel a card for this draw, and give its page this state. */
  function updateCard(card, s, past, p, i) {
    const frame = card.firstChild;
    const v = vp();
    card.classList.toggle('dim', !matches(s));
    card.style.cssText = phone() ? `order:${i}` : `left:${p.x}px;top:${p.y}px`;
    frame.style.height = `${Math.round(v.height * CARD_W() / v.width)}px`;
    frame.dataset.state = ui.state;
    const live = frame.querySelector(':scope > iframe');
    if (live) setFrameState(sized(live), s.key, ui.state, ui.version || null);
    // An approval picture shows the default state at its viewport, and the page as it is now.
    const pic = !past && s.picture && ui.state === 'default' && ui.viewport === data.pictureViewport ? `${BASE}${s.picture}` : null;
    if (frame.pic !== pic) { frame.pic = pic; delete frame.dataset.fill; frame.querySelector(':scope > img.pic')?.remove(); }
    fillFrame(frame);
    // The comments, the checks and the audit are of the page as it is now, not of a past version.
    const failures = past ? 0 : failCount(s, ui.viewport, ui.state);
    const approved = (s.approvals || []).at(-1);
    const draft = past ? null : draftOf(s);
    const head = h('header', { class: 'cap' },
      h('div', { class: 'cap-row' }, h('b', { title: s.title }, s.title),
        !past && s.openComments ? h('span', { class: 'mark note', title: 'Open comment threads' }, plural(s.openComments, 'comment')) : null,
        failures ? h('span', { class: 'mark issue', title: 'Checks that fail in this viewport and state' }, plural(failures, 'issue')) : null,
        !past && auditOf(s.key).length ? h('span', { class: 'mark audit', title: 'Findings of the last design audit' }, plural(auditOf(s.key).length, 'finding')) : null,
        past ? h('span', { class: past.draft ? 'mark draft' : 'mark ok', title: past.reason }, past.draft ? 'Draft' : past.name)
          : draft ? h('span', { class: 'mark draft', title: `${draft.name}: ${draft.reason}` }, 'Draft')
            : approved ? h('span', { class: 'mark ok', title: `Approved in ${approved.commit.slice(0, 8)}` }, 'Approved') : null),
      h('div', { class: 'meta', title: metaOf(s) }, metaOf(s)));
    card.lastChild.replaceWith(head);
    if (!phone() && data.writable && ui.view === 'grid' && !past) dragCard(head, card, s);
  }

  // ------------------------------------------------------------ the lanes

  /** A page scaled down to the width of a lane, as a button that opens its detail. */
  function thumb(src, width, height, label, onclick) {
    const w = LANE_W();
    const box = h('button', { type: 'button', class: 'frame', 'aria-label': label, style: `height:${Math.round(w * height / width)}px`, onclick });
    if (!src) { box.classList.add('blank'); return box; }
    box.make = () => h('iframe', { src, title: label, tabindex: '-1', scrolling: 'no', sandbox: 'allow-scripts allow-same-origin',
      style: `width:${width}px;height:${height}px;transform:scale(${w / width})` });
    watch(box);
    return box;
  }
  const itemCap = (title, mark, meta) => h('div', { class: 'cap' }, h('div', { class: 'cap-row' }, h('b', { title }, title), mark), meta ? h('div', { class: 'meta', title: meta }, meta) : null);
  /**
   * The lanes of the board. Before the screens: the sketches of brainstorms and intakes, and the
   * references that the screens draw on. After the screens: the components that the screens reuse,
   * and the tokens. A lane with nothing in it does not show.
   */
  function lanes() {
    const sketchOf = (x) => x.title || x.key;
    const sketches = data.explore.map((x) => h('article', { class: 'item' },
      thumb(SNAP ? null : `${BASE}s/explore/${x.key}.html`, 1280, 800, `Open the sketch ${sketchOf(x)}`, () => panel(`sketch:${x.key}`)),
      itemCap(sketchOf(x), null, x.link ? `For ${x.link}` : null)));
    const references = data.references.map((r) => {
      const open = () => panel(`reference:${r.key}`);
      const label = `Open the reference ${r.key}`;
      const pic = !SNAP && r.readable && r.kind === 'image';
      const page = !SNAP && r.readable && ['page', 'screen', 'canvas'].includes(r.kind);
      const frame = page ? thumb(`${BASE}ref/${r.key}`, 1280, 800, label, open)
        : h('button', { type: 'button', class: `frame${pic ? '' : ' doc'}`, 'aria-label': label, style: `height:${Math.round(LANE_W() * 0.625)}px`, onclick: open },
          pic ? h('img', { src: `${BASE}ref/${r.key}`, alt: '', loading: 'lazy' }) : h('span', {}, cap(r.kind || 'other')));
      return h('article', { class: 'item' }, frame,
        itemCap(r.key, r.readable ? null : h('span', { class: 'mark issue', title: r.problem }, 'Unreadable'), r.note || null));
    });
    const components = data.components.map((c) => {
      const t = { kind: 'component', key: c.key };
      return h('article', { class: 'item', 'data-trace': traceId(t), ...traceHover(t) },
        thumb(SNAP ? null : `${BASE}s/components/${c.key}.html`, 400, 200, `Open the component ${c.title}`, () => panel(`component:${c.key}`)),
        itemCap(c.title, h('span', { class: `mark ${c.code ? 'ok' : 'draft'}` }, c.code ? 'In code' : 'To build'), c.screens.length ? `Used by ${plural(c.screens.length, 'screen')}` : 'No screen uses it yet'));
    });
    if (!components.length && data.noComponents) components.push(h('p', { class: 'none' }, `No reusable parts: ${data.noComponents}`));
    const tokens = data.tokens.length ? [h('div', { class: 'toklist' }, ...data.tokens.map((t) => {
      const tr = { kind: 'token', key: t.name };
      const n = data.screens.filter((s) => (s.tokens || []).includes(t.name)).length;
      return h('button', { type: 'button', class: 'tok', 'data-trace': traceId(tr), title: `${t.value}. ${n ? `Used by ${plural(n, 'screen')}` : 'No screen uses it'}. Select it to show only those screens.`,
        onclick: () => traceTo(tr), ...traceHover(tr) },
      h('span', { class: `swatch${t.value.startsWith('var(') ? ' alias' : ''}`, style: t.value.startsWith('var(') ? '' : `background:${t.value}` }),
      h('span', { class: 'tname' }, t.name, h('small', {}, t.value)));
    })), h('p', { class: 'none' }, 'From DESIGN.md. Change them there.')] : [];
    const lane = (title, sub, items) => (items.length ? { title, sub, items } : null);
    return {
      left: [lane('Sketches', 'before any screen', sketches), lane('References', 'what the screens draw on', references)].filter(Boolean),
      right: [lane('Components', components.length && data.components.length ? plural(data.components.length, 'part') : '', components), lane('Tokens', 'select one to trace it', tokens)].filter(Boolean),
    };
  }
  function laneView(l, side) {
    return h('section', { class: 'lane', 'aria-label': l.title, 'data-side': side, style: phone() ? '' : `top:0;width:${LANE_W()}px` },
      h('h2', { class: 'lane-label' }, l.title, l.sub ? h('small', {}, l.sub) : null), ...l.items);
  }
  /**
   * The lane elements of the board, left and right of the screens. They stay while their data is
   * the same, so their pages do not load again; `render` places them. On a phone the board is one
   * list, and every lane comes after the screens.
   */
  function laneEls(board, past) {
    const on = ui.view === 'grid' && !past;
    const sig = on ? JSON.stringify([phone(), LANE_W(), data.explore, data.references, data.components, data.noComponents, data.tokens, data.screens.map((s) => s.tokens)]) : '';
    if (board.dataset.lanes !== sig) {
      for (const el of board.querySelectorAll(':scope > .lane')) { unwatch(el); el.remove(); }
      board.dataset.lanes = sig;
      if (on) {
        const { left, right } = lanes();
        board.append(...left.map((l) => laneView(l, 'left')), ...right.map((l) => laneView(l, 'right')));
      }
    }
    const els = [...board.querySelectorAll(':scope > .lane')];
    return phone() ? { left: [], right: els } : { left: els.filter((e) => e.dataset.side === 'left'), right: els.filter((e) => e.dataset.side === 'right') };
  }

  function drawEdges(list, at) {
    const edges = $('#edges');
    const NS = 'http://www.w3.org/2000/svg';
    const el = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
    const marker = el('marker', { id: 'arrow', viewBox: '0 0 8 8', refX: '7', refY: '4', markerWidth: '8', markerHeight: '8', orient: 'auto' });
    marker.append(el('path', { d: 'M0,0 L8,4 L0,8 z', class: 'head' }));
    const defs = el('defs', {});
    defs.append(marker);
    edges.append(defs);
    const mid = frameH() / 2;
    const byKey = Object.fromEntries(list.map((s) => [s.key, s]));
    for (const s of list) {
      for (const to of s.links || []) {
        if (!byKey[to] || to === s.key) continue;
        const a = at(s);
        const b = at(byKey[to]);
        const x1 = a.x + CARD_W() + 6; const y1 = a.y + mid;
        const x2 = b.x - 8; const y2 = b.y + mid;
        const c = Math.max(40, Math.abs(x2 - x1) / 2);
        edges.append(el('path', { d: `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`, 'marker-end': 'url(#arrow)' }));
      }
    }
  }

  // ------------------------------------------------------------ pan, zoom, drag

  // A wheel or a pointer move can come many times in one frame: the board moves once a frame.
  let placeFrame = 0;
  function place() {
    if (!placeFrame) placeFrame = requestAnimationFrame(() => { placeFrame = 0; placeNow(); });
  }
  function placeNow() {
    const stage = $('#stage');
    if (phone()) {
      $('#board').style.transform = 'none';
      stage.style.backgroundSize = '';
      stage.style.backgroundPosition = '';
      return;
    }
    $('#board').style.transform = `translate(${ui.x}px, ${ui.y}px) scale(${ui.zoom})`;
    // The dots move with the board, so the grid reads as the surface the screens lie on.
    const g = 24 * ui.zoom;
    stage.style.backgroundSize = `${g}px ${g}px`;
    stage.style.backgroundPosition = `${ui.x}px ${ui.y}px`;
    $('#zval').textContent = `${Math.round(ui.zoom * 100)}%`;
    zoomFill();
  }
  function zoomTo(next, mx, my) {
    const z = Math.min(3, Math.max(0.15, next));
    ui.x = mx - (mx - ui.x) * z / ui.zoom;
    ui.y = my - (my - ui.y) * z / ui.zoom;
    ui.zoom = z;
    place();
  }
  function zoomBy(factor) {
    const r = $('#stage').getBoundingClientRect();
    zoomTo(ui.zoom * factor, r.width / 2, r.height / 2);
  }
  /** Show every screen and lane: the board at the zoom that fits the stage, never above 100 %. */
  function fit() {
    const items = [...document.querySelectorAll('#board > .card, #board > .area-label, #board > .lane, #board > .empty')];
    if (!items.length) { place(); return; }
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const c of items) {
      x0 = Math.min(x0, c.offsetLeft); y0 = Math.min(y0, c.offsetTop);
      x1 = Math.max(x1, c.offsetLeft + c.offsetWidth); y1 = Math.max(y1, c.offsetTop + c.offsetHeight);
    }
    const r = $('#stage').getBoundingClientRect();
    const pad = 48;
    const dock = 80;
    ui.zoom = Math.min(1, Math.max(0.15, Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad - dock) / (y1 - y0))));
    ui.x = Math.max(pad, (r.width - (x1 - x0) * ui.zoom) / 2) - x0 * ui.zoom;
    ui.y = pad - y0 * ui.zoom;
    place();
  }
  // A drag pans from anywhere on the board, a screen too: only a card's caption moves the card.
  // A press that moves less than PAN_SLOP px stays a click, so a tap on a screen still opens it.
  const PAN_SLOP = 4;
  function panZoom() {
    const stage = $('#stage');
    const pointers = new Map();
    let start = null;
    let panned = false;
    stage.addEventListener('pointerdown', (e) => {
      if (phone() || e.target.closest('.card .cap') || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1)) return;
      // No text selection and no native drag: they show the not-allowed cursor and steal the move.
      if (e.pointerType === 'mouse') e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start = { x: ui.x, y: ui.y, zoom: ui.zoom, pts: [...pointers.values()].map((p) => ({ ...p })) };
      panned = false;
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId) || !start) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.values()];
      if (!panned) {
        const far = pts.length > 1 || Math.hypot(pts[0].x - start.pts[0].x, pts[0].y - start.pts[0].y) >= PAN_SLOP;
        if (!far) return;
        // Capture only once the press is a drag, so a click on a screen still reaches it.
        panned = true;
        for (const id of pointers.keys()) { try { stage.setPointerCapture(id); } catch { /* it ended */ } }
        stage.classList.add('panning');
      }
      if (pts.length === 1 && start.pts.length === 1) {
        ui.x = start.x + pts[0].x - start.pts[0].x;
        ui.y = start.y + pts[0].y - start.pts[0].y;
      } else if (pts.length === 2 && start.pts.length === 2) {
        const d = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        ui.zoom = Math.min(3, Math.max(0.15, start.zoom * d(pts) / d(start.pts)));
      }
      place();
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      start = pointers.size ? { x: ui.x, y: ui.y, zoom: ui.zoom, pts: [...pointers.values()].map((p) => ({ ...p })) } : null;
      if (!pointers.size) stage.classList.remove('panning');
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    // The click that ends a pan opens nothing.
    stage.addEventListener('click', (e) => { if (panned) { e.stopPropagation(); e.preventDefault(); panned = false; } }, true);
    stage.addEventListener('dragstart', (e) => e.preventDefault());
    // The wheel and a two-finger trackpad move pan; a pinch or Ctrl or Cmd with the wheel zooms.
    stage.addEventListener('wheel', (e) => {
      if (phone()) return;
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        // A pinch sends small steps, a mouse wheel large ones: both zoom at a similar pace.
        const dy = e.deltaY * (e.deltaMode === 1 ? 16 : 1);
        zoomTo(ui.zoom * Math.exp(-dy * (Math.abs(dy) < 50 ? 0.01 : 0.0015)), e.clientX - r.left, e.clientY - r.top);
        return;
      }
      const k = e.deltaMode === 1 ? 16 : 1;
      ui.x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k;
      ui.y -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k;
      place();
    }, { passive: false });
  }

  let saveTimer = null;
  function dragCard(handle, card, s) {
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      if (e.pointerType === 'mouse') e.preventDefault();
      handle.setPointerCapture(e.pointerId);
      const sx = e.clientX; const sy = e.clientY;
      const ox = parseFloat(card.style.left); const oy = parseFloat(card.style.top);
      const move = (ev) => {
        card.style.left = `${ox + (ev.clientX - sx) / ui.zoom}px`;
        card.style.top = `${oy + (ev.clientY - sy) / ui.zoom}px`;
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
        s.position = { x: Math.round(parseFloat(card.style.left)), y: Math.round(parseFloat(card.style.top)) };
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveLayout, 600);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }
  /** Put every screen back in its column, and save those places. */
  function arrange() {
    const { pos } = autoLayout(data.screens);
    for (const s of data.screens) s.position = pos[s.key];
    ui.fitted = false;
    render();
    saveLayout();
  }
  async function saveLayout() {
    const positions = Object.fromEntries(data.screens.filter((s) => s.position).map((s) => [s.key, s.position]));
    const r = await fetch(`${BASE}layout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ positions }) });
    say(r.ok ? 'Layout saved' : 'The layout was not saved');
  }

  // ------------------------------------------------------------ one screen

  let focusState = null;
  let focusFrom = null;
  function focus(key, opts = {}) {
    const s = boardScreens().find((x) => x.key === key);
    if (!s) return;
    focusFrom = document.activeElement;
    focusState = { key, viewport: opts.viewport || ui.viewport, state: opts.state || ui.state, checks: true, audit: true, commenting: false, compare: '', capture: false, all: false, play: false, trail: [], restoring: '', rounds: [], scroll: 0 };
    drawFocus();
    $('#focus').hidden = false;
    $('#focus .close')?.focus();
  }
  /**
   * The screens in the order of the board: by area column (or flow row), then in flow order.
   * With a filter, only the screens that match it; the open screen always stays in the walk.
   */
  function walk() {
    const all = boardScreens();
    const { pos } = autoLayout(all);
    const shown = all.filter((s) => matches(s) || s.key === focusState?.key);
    const list = shown.length > 1 ? shown : all;
    const by = ui.view === 'grid' ? ['x', 'y'] : ['y', 'x'];
    return [...list].sort((a, b) => pos[a.key][by[0]] - pos[b.key][by[0]] || pos[a.key][by[1]] - pos[b.key][by[1]]);
  }
  /** Open the screen `step` places away in the walk, with the same viewport, state and toggles. */
  function step(by) {
    const list = walk();
    if (list.length < 2) return;
    const i = list.findIndex((s) => s.key === focusState.key);
    const next = list[(i + by + list.length) % list.length];
    focusState = { ...focusState, key: next.key, compare: '', restoring: '', commenting: false, trail: [], scroll: 0 };
    drawFocus();
    $(`#focus [data-step="${by}"]`)?.focus();
  }
  /**
   * Play: the screen's own links work. A link to another screen opens that screen in the view,
   * in the state that its `?state=` names, and Back returns along the trail. Any other link
   * stays on the screen, because a design page leads nowhere outside the screens.
   */
  function playLinks(ifr) {
    let doc = null;
    try { doc = ifr.contentDocument; } catch { doc = null; }
    if (!doc) return;
    doc.addEventListener('click', (e) => {
      const a = e.target.closest?.('a[href]');
      if (!a) return;
      e.preventDefault();
      let url = null;
      try { url = new URL(a.getAttribute('href'), doc.baseURI); } catch { url = null; }
      const key = url && /\/screens\/([a-z0-9-]+)\.html$/.exec(url.pathname)?.[1];
      if (!key || !boardScreens().some((x) => x.key === key)) { say('That link leads to no screen'); return; }
      const st = url.searchParams.get('state');
      focusState = { ...focusState, key, state: data.states.includes(st) ? st : 'default', compare: '', scroll: 0, trail: [...focusState.trail, { key: focusState.key, state: focusState.state }] };
      drawFocus();
    });
  }
  function closeFocus() {
    $('#focus').hidden = true;
    focusState = null;
    focusFrom?.focus?.();
  }

  function selectorOf(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n.tagName !== 'BODY' && parts.length < 5; n = n.parentElement) {
      if (n.id) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      parts.unshift(same.length > 1 ? `${n.tagName.toLowerCase()}:nth-of-type(${same.indexOf(n) + 1})` : n.tagName.toLowerCase());
    }
    return parts.join(' > ');
  }

  /** One box over the screen: a check failure or an audit finding at its rectangle. */
  const boxAt = (r, scale, label, title, kind = '') => h('div', { class: `box${kind ? ` ${kind}` : ''}`, title,
    style: `left:${r.x * scale}px;top:${r.y * scale}px;width:${r.width * scale}px;height:${r.height * scale}px` }, h('span', {}, label));
  function shot(caption, content, size, scale) {
    const box = h('div', { class: 'shot', style: `width:${Math.round(size.width * scale)}px;height:${Math.round(size.height * scale)}px` }, h('div', { class: 'cap' }, caption), content);
    const fit = (height) => {
      content.style.height = `${height}px`;
      box.style.height = `${Math.round(height * scale)}px`;
    };
    content.style.width = `${size.width}px`;
    content.style.height = `${size.height}px`;
    content.style.transform = `scale(${scale})`;
    if (content.tagName === 'IFRAME') content.addEventListener('load', () => hug(content, size, fit));
    return box;
  }
  /**
   * An artboard is as tall as its page, and the view around it scrolls. A page that takes its height
   * from the window grows with the frame, so that page keeps the device height and scrolls in the frame.
   */
  function hug(ifr, size, fit) {
    let root = null;
    try { root = ifr.contentDocument?.documentElement; } catch { root = null; }
    if (!root) return;
    const tall = root.scrollHeight;
    if (tall <= size.height) return;
    fit(tall);
    if (root.scrollHeight > tall) fit(size.height);
  }
  function segOf(values, value, on, label) {
    return h('div', { class: 'seg', role: 'group', 'aria-label': label },
      ...values.map((v) => h('button', { type: 'button', class: v === value ? 'on' : null, 'aria-pressed': String(v === value), onclick: () => on(v) }, cap(v))));
  }
  const toggle = (text, on, fn) => h('button', { type: 'button', class: 'btn', 'aria-pressed': String(Boolean(on)), onclick: fn }, text);

  /** The other device sizes that the screen view shows beside the screen. */
  const otherSizes = (f) => (f.sizes && !phone() ? Object.keys(data.viewports).filter((n) => n !== f.viewport) : []);
  /** The scale of the screens in the screen view: the widths of the panes fit the room of the window. */
  function focusScale(f) {
    const width = vp(f.viewport).width;
    const widths = [width, ...(f.compare || f.capture ? [width] : []), ...otherSizes(f).map((n) => vp(n).width)];
    const room = phone() ? window.innerWidth - 32 : window.innerWidth - 32 - 340 - 48;
    return Math.min(1, (room - (widths.length - 1) * 24) / widths.reduce((a, b) => a + b));
  }
  // The scale and the layout of the last drawn screen view: a resize that keeps both keeps the view.
  let focusDrawn = null;
  // What scrolls the artboards: the view, and on a phone the whole sheet.
  const focusScroller = () => $(phone() ? '#focus .sheet' : '#focus .view');
  function drawFocus() {
    const f = focusState;
    const s = boardScreens().find((x) => x.key === f.key);
    const past = versionAt(ui.version);
    const other = versionAt(f.compare);
    const draft = past ? null : draftOf(s);
    const size = vp(f.viewport);
    const scale = focusScale(f);
    // A redraw of the same screen stays where the person scrolled it.
    const top = focusDrawn?.key === f.key ? focusScroller()?.scrollTop || 0 : 0;
    // The page of the screen stays while the screen, the version, the viewport, the scale and play
    // stay: a toggle or a new state redraws the sheet around the page, and the page does not reload.
    const liveKey = [s.key, ui.version, f.viewport, scale, f.play, phone()].join('|');
    const kept = focusDrawn?.liveKey === liveKey ? $('#focus .view > .shot.now') : null;
    focusDrawn = { scale, phone: phone(), key: f.key, liveKey };
    const view = kept ? kept.parentElement : h('div', { class: 'view' });
    const named = past ? draftName(past) : 'Now';
    const caption = f.compare || f.capture ? named : `${past ? `${named}, ` : ''}${cap(f.viewport)}, ${f.state} state${f.play ? ', playing' : ''}`;
    const live = kept ?? shot(caption, frameFor(s.key, f.state, ui.version || null), size, scale);
    live.classList.add('now');
    const ifr = live.querySelector('iframe');
    const screenDoc = () => { try { return ifr.contentDocument; } catch { return null; } };
    // The layer moves with the page of the screen, so the pins and the boxes stay on their elements.
    const layer = h('div', { class: 'layer' });
    const overlay = h('div', { class: `overlay${f.commenting ? ' commenting' : ''}` }, layer);
    live.layer = layer;
    if (kept) {
      live.querySelector(':scope > .cap').textContent = caption;
      live.querySelector(':scope > .overlay')?.remove();
      for (const c of [...view.children]) if (c !== live) c.remove();
      setFrameState(ifr, s.key, f.state, ui.version || null);
      const win = screenDoc()?.defaultView;
      if (win) layer.style.transform = `translateY(${-win.scrollY * scale}px)`;
    } else {
      ifr.addEventListener('load', () => {
        const win = screenDoc()?.defaultView;
        if (!win) return;
        win.scrollTo({ top: f.scroll, behavior: 'instant' });
        const follow = () => { if (focusState) focusState.scroll = win.scrollY; live.layer.style.transform = `translateY(${-win.scrollY * scale}px)`; };
        win.addEventListener('scroll', follow);
        follow();
        focusScroller().scrollTop = top;
      });
      // In play, nothing covers the screen, so its links and controls take the pointer.
      if (f.play) {
        live.classList.add('playing');
        ifr.removeAttribute('tabindex');
        ifr.removeAttribute('scrolling');
        ifr.addEventListener('load', () => playLinks(ifr));
      }
    }
    if (!f.play) live.append(overlay);
    const fx = past ? { failures: [], failureGroups: [] } : failuresFor(s);
    if (f.checks && !past) {
      for (const x of (fx?.failures || []).filter((q) => q.viewport === f.viewport && q.state === f.state)) {
        if (x.rect) layer.append(boxAt(x.rect, scale, CHECK_NAMES[x.check] || x.check, x.message));
      }
    }
    const findings = auditOf(s.key);
    if (f.audit && !past) {
      for (const x of findings.filter((q) => q.state === f.state && q.rects?.[f.viewport])) {
        layer.append(boxAt(x.rects[f.viewport], scale, x.rule || 'Audit', x.message, 'audit'));
      }
    }
    s.threads.forEach((t, i) => {
      if (past || (!f.all && !t.open)) return;
      if ((t.anchor?.state || 'default') !== f.state || t.anchor?.x === null || t.anchor?.x === undefined) return;
      layer.append(h('div', { class: `pinmark${t.open ? '' : ' closed'}`, style: `left:${t.anchor.x * size.width * scale}px;top:${t.anchor.y * size.height * scale}px`, title: t.comments[0]?.text || '', onclick: (e) => { e.stopPropagation(); $(`#t-${t.id}`)?.scrollIntoView({ behavior: 'smooth' }); } }, String(i + 1)));
    });
    // Comment mode: the pointer outlines the element under it, and a click or a tap selects it.
    const hovered = h('div', { class: 'el-box', hidden: true }, h('span'));
    const selected = h('div', { class: 'el-box held', hidden: true }, h('span'));
    layer.append(hovered, selected);
    const elementAt = (e) => {
      const r = overlay.getBoundingClientRect();
      const el = screenDoc()?.elementFromPoint((e.clientX - r.left) / scale, (e.clientY - r.top) / scale);
      return el && el.tagName !== 'BODY' && el.tagName !== 'HTML' ? el : null;
    };
    const outline = (box, el) => {
      box.hidden = !el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const win = screenDoc().defaultView;
      box.style.cssText = `left:${(r.left + win.scrollX) * scale}px;top:${(r.top + win.scrollY) * scale}px;width:${r.width * scale}px;height:${r.height * scale}px`;
      box.firstChild.textContent = selectorOf(el).split(' > ').at(-1);
    };
    let pick = null;
    const field = h('textarea', { placeholder: 'Comment', 'aria-label': 'Comment' });
    const target = h('small');
    const wider = h('button', { type: 'button', class: 'btn quiet', onclick: () => { pick.el = pick.el.parentElement; showPick(); } }, 'Select the parent');
    const composer = h('div', { class: 'thread composer', hidden: true },
      target, field, h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => {
          if (!field.value.trim()) { field.focus(); return; }
          post(s.key, { text: field.value, anchor: { x: pick.x, y: pick.y, selector: pick.el ? selectorOf(pick.el) : null, state: f.state, viewport: f.viewport } });
        } }, 'Comment'),
        wider,
        h('button', { type: 'button', class: 'btn quiet', onclick: () => { pick = null; composer.hidden = true; selected.hidden = true; } }, 'Cancel')));
    function showPick() {
      outline(selected, pick.el);
      composer.hidden = false;
      target.textContent = pick.el ? `On ${selectorOf(pick.el)}` : 'On this point of the screen';
      wider.hidden = !pick.el || !pick.el.parentElement || pick.el.parentElement.tagName === 'BODY';
    }
    overlay.addEventListener('click', (e) => {
      if (!f.commenting) return;
      const r = overlay.getBoundingClientRect();
      pick = { el: elementAt(e), x: (e.clientX - r.left) / r.width, y: ((e.clientY - r.top) / scale + f.scroll) / size.height };
      hovered.hidden = true;
      showPick();
      field.focus();
    });
    overlay.addEventListener('wheel', (e) => {
      const win = screenDoc()?.defaultView;
      if (!win) return;
      const from = win.scrollY;
      win.scrollBy({ top: e.deltaY / scale, behavior: 'instant' });
      if (win.scrollY !== from) e.preventDefault();
      if (f.commenting) outline(hovered, elementAt(e));
    }, { passive: false });
    // A finger on the screen scrolls the page in comment mode, because a tap is what selects.
    let fingerY = null;
    overlay.addEventListener('pointerdown', (e) => { fingerY = f.commenting && e.pointerType !== 'mouse' ? e.clientY : null; });
    overlay.addEventListener('pointerup', () => { fingerY = null; });
    overlay.addEventListener('pointercancel', () => { fingerY = null; });
    overlay.addEventListener('pointermove', (e) => {
      if (fingerY !== null) {
        const win = screenDoc()?.defaultView;
        const from = win?.scrollY;
        win?.scrollBy({ top: (fingerY - e.clientY) / scale, behavior: 'instant' });
        if (win?.scrollY === from) focusScroller().scrollTop += fingerY - e.clientY;
        fingerY = e.clientY;
      } else if (f.commenting && e.pointerType === 'mouse') outline(hovered, elementAt(e));
    });
    overlay.addEventListener('pointerleave', () => { hovered.hidden = true; });
    // A kept page stays where it is: a page that moves in the document loads again.
    if (!kept) {
      view.append(live);
      // On a touch screen, a sideways swipe over the screens walks to the next or the previous one.
      let swipe = null;
      view.addEventListener('pointerdown', (e) => { swipe = e.pointerType !== 'mouse' && !focusState?.commenting ? { x: e.clientX, y: e.clientY } : null; });
      view.addEventListener('pointercancel', () => { swipe = null; });
      view.addEventListener('pointerup', (e) => {
        if (!swipe) return;
        const dx = e.clientX - swipe.x;
        const dy = e.clientY - swipe.y;
        swipe = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
      });
    }
    for (const n of otherSizes(f)) view.append(shot(cap(n), frameFor(s.key, f.state, ui.version || null), vp(n), scale));
    if (f.compare) view.append(shot(other ? draftName(other) : `At ${f.compare.slice(0, 8)}`, frameFor(s.key, f.state, f.compare), size, scale));
    if (f.capture) {
      const approval = (s.approvals || []).at(-1);
      const shotOf = (s.captures || [])[0];
      const src = shotOf ? `${BASE}${shotOf.url}` : (approval ? `${BASE}approvals/${approval.commit}/${s.key}.png` : '');
      view.append(shot(shotOf ? `Built, slice ${shotOf.slice}` : approval ? 'Approval picture' : 'No capture yet', h('img', { alt: shotOf ? 'The built screen' : 'The approved screen', src }), size, scale));
    }
    // A saved version comes first. An approval from before the versions compares at its commit.
    const versions = [...allVersions().filter((v) => v.screens.some((e) => e.key === s.key)).map((v) => [v.ref, draftName(v)]),
      ...(s.approvals || []).filter((a) => !a.version).map((a) => [a.commit, `Approved ${String(a.at).slice(0, 10)}`]),
      ...(s.history || []).filter((c) => !(s.approvals || []).some((a) => a.commit === c.commit)).map((c) => [c.commit, `${String(c.at).slice(0, 10)}: ${c.subject}`])];
    const order = walk();
    const at = order.findIndex((x) => x.key === s.key);
    const near = (by) => order[(at + by + order.length) % order.length];
    const stepper = order.length > 1 ? h('div', { class: 'stepper', role: 'group', 'aria-label': 'Screens' },
      h('button', { type: 'button', 'data-step': '-1', 'aria-label': `Previous screen: ${near(-1).title}`, title: `${near(-1).title} (←)`, onclick: () => step(-1) }, '‹'),
      h('span', { class: 'pos' }, `${at + 1} of ${order.length}`),
      h('button', { type: 'button', 'data-step': '1', 'aria-label': `Next screen: ${near(1).title}`, title: `${near(1).title} (→)`, onclick: () => step(1) }, '›')) : null;
    const back = f.play && f.trail.length ? f.trail.at(-1) : null;
    const backTitle = back ? data.screens.find((x) => x.key === back.key)?.title || back.key : '';
    const header = h('header', {},
      h('h2', {}, s.title, draft ? h('span', { class: 'mark draft', title: `${draft.name}: ${draft.reason}` }, 'Draft') : null, h('small', {}, metaOf(s))),
      back ? h('button', { type: 'button', class: 'btn', 'aria-label': `Back to ${backTitle}`, onclick: () => { focusState = { ...focusState, key: back.key, state: back.state, scroll: 0, trail: f.trail.slice(0, -1) }; drawFocus(); } }, `← ${backTitle}`) : null,
      stepper,
      h('button', { type: 'button', class: 'close', onclick: closeFocus, 'aria-label': 'Close' }, '×'));
    const tools = h('div', { class: 'tools' },
      segOf(Object.keys(data.viewports), f.viewport, (v) => { f.viewport = v; drawFocus(); }, 'Viewport'),
      segOf(data.states, f.state, (v) => { f.state = v; drawFocus(); }, 'State'),
      h('span', { class: 'gap' }),
      past ? null : toggle('Checks', f.checks, () => { f.checks = !f.checks; drawFocus(); }),
      findings.length && !past ? toggle('Audit', f.audit, () => { f.audit = !f.audit; drawFocus(); }) : null,
      SNAP ? null : toggle('Play', f.play, () => { f.play = !f.play; f.commenting = false; f.trail = []; drawFocus(); }),
      data.writable && !past ? toggle(f.commenting ? 'Select an element' : 'Comment', f.commenting, () => { f.commenting = !f.commenting; f.play = false; drawFocus(); }) : null,
      toggle('Capture', f.capture, () => { f.capture = !f.capture; drawFocus(); }),
      Object.keys(data.viewports).length > 1 && !phone() ? toggle('All sizes', f.sizes, () => { f.sizes = !f.sizes; drawFocus(); }) : null,
      SNAP || !versions.length ? null : h('label', {}, 'Compare', sel(['', ...versions.map((v) => v[0])], f.compare, (v) => { f.compare = v; drawFocus(); }, Object.fromEntries([['', 'Nothing'], ...versions]))));
    const openN = s.threads.filter((t) => t.open).length;
    const shown = s.threads.filter((t) => f.all || t.open);
    const failures = fx ? groupsOf(fx) : null;
    const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
    const side = h('section', { class: 'side' }, versionList(s, f), past ? null : [
      h('h3', {}, 'Comments', openN ? h('span', { class: 'count' }, String(openN)) : null,
        s.threads.length > openN ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: f.all, onchange: (e) => { f.all = e.target.checked; drawFocus(); } }), 'Show resolved') : null),
      composer,
      shown.length ? shown.map((t) => threadView(s, t)) : h('p', { class: 'none' }, data.writable ? 'No open comment. Choose Comment, then select an element of the screen.' : 'No open comment.'),
      whyView(s),
      s.components?.length ? [h('h3', {}, 'Components', h('span', { class: 'count' }, String(s.components.length))),
        h('ul', { class: 'parts' }, ...s.components.map((k) => {
          const c = data.components.find((x) => x.key === k);
          const name = c?.title || k;
          return h('li', {}, c ? h('button', { type: 'button', class: 'linkish', title: `Show the screens that use ${name}`, onclick: () => traceFrom({ kind: 'component', key: k }) }, name) : name,
            h('span', { class: `mark ${!c ? 'issue' : c.code ? 'ok' : 'draft'}` }, !c ? 'Not in the library' : c.code ? 'In code' : 'To build'));
        }))] : null,
      s.tokens?.length ? [h('h3', {}, 'Tokens', h('span', { class: 'count' }, String(s.tokens.length))),
        h('div', { class: 'chips' }, ...s.tokens.map((t) => h('button', { type: 'button', title: `${data.tokens.find((x) => x.name === t)?.value ?? 'Not in the token sheet'}. Show the screens that use it.`, onclick: () => traceFrom({ kind: 'token', key: t }) }, t)))] : null,
      h('h3', {}, 'Checks', failures?.length ? h('span', { class: 'count' }, String(failures.length)) : null),
      !failures ? h('p', { class: 'none' }, 'Loading the checks.') : failures.length ? failures.map((x) => h('div', { class: 'check' },
        h('b', {}, CHECK_NAMES[x.check] || x.check), x.places > 1 ? h('span', { class: 'sev' }, `${x.places} places`) : null,
        h('p', {}, x.message),
        h('small', {}, `${x.viewports.length ? `${list(x.viewports.map(cap))}, ` : ''}${list(x.states) || 'every'} state${x.states.length > 1 ? 's' : ''}.${x.move ? ` The ${x.move} move fixes it.` : x.check === 'script' ? ' Fix the script of the screen page.' : x.check === 'version' ? ' Save a round, or restore the version.' : x.check === 'component' ? ' Use a component of the library, or add the part to it.' : ''}`)))
        : h('p', { class: 'none' }, 'No check fails.'),
      findings.length ? [h('h3', {}, 'Audit', h('span', { class: 'count' }, String(findings.length))), ...findings.map((x) => findingView(x))] : null]);
    const sheet = kept && $('#focus .sheet');
    if (sheet) {
      sheet.querySelector(':scope > header').replaceWith(header);
      sheet.querySelector(':scope > .tools').replaceWith(tools);
      sheet.querySelector(':scope > .side').replaceWith(side);
    } else $('#focus').replaceChildren(h('div', { class: 'sheet' }, header, tools, view, side));
  }
  /** Close the screen view, and show on the board the screens that use a token or a component. */
  function traceFrom(t) {
    closeFocus();
    ui.trace = null;
    traceTo(t);
  }
  /**
   * Why a screen looks as it does: the design decisions of its workflows, and the rules of the
   * visual contract for its slices. A decision names its workflow, not its screens, so a screen
   * shows every design decision of its workflows.
   */
  function whyView(s) {
    const decisions = data.decisions.filter((d) => (s.workflows || []).includes(d.workflow));
    const rules = [...new Set(data.cards.filter((c) => c.screens.some((x) => x.key === s.key)).flatMap((c) => c.rules))];
    if (!decisions.length && !rules.length) return null;
    const many = new Set(decisions.map((d) => d.workflow)).size > 1;
    return [h('h3', {}, 'Why it looks like this'),
      ...decisions.map((d) => h('div', { class: 'why' }, h('b', {}, d.question || d.id), h('p', {}, d.answer ?? ''), many ? h('small', {}, d.workflow) : null)),
      rules.length ? [h('h4', {}, 'Rules of the visual contract'), h('ul', { class: 'rules' }, ...rules.map((r) => h('li', {}, r)))] : null];
  }
  /**
   * The check failures of one screen, one entry for each cause, for example one raw color in five
   * rules, with its places, viewports and states. The server groups them. An older server sends
   * only the failures, so then the canvas groups them.
   */
  function groupsOf(s) {
    if (Array.isArray(s.failureGroups)) return s.failureGroups;
    if (!s.failures) return [];
    const groups = new Map();
    for (const x of s.failures || []) {
      const k = `${x.check}|${x.cause ?? x.message}`;
      if (!groups.has(k)) groups.set(k, { check: x.check, message: x.message, move: x.move ?? null, viewports: [], states: [], at: new Set() });
      const g = groups.get(k);
      if (x.viewport && !g.viewports.includes(x.viewport)) g.viewports.push(x.viewport);
      if (x.state && !g.states.includes(x.state)) g.states.push(x.state);
      g.at.add(`${x.selector ?? ''}|${x.state}`);
    }
    return [...groups.values()].map(({ at, ...g }) => ({ ...g, places: at.size }));
  }
  function sel(values, value, on, labels = {}) {
    return h('select', { onchange: (e) => on(e.target.value) }, ...values.map((v) => h('option', { value: v, selected: v === value }, labels[v] ?? v)));
  }
  function threadView(s, t) {
    const reply = h('textarea', { placeholder: 'Reply', 'aria-label': 'Reply' });
    const where = `${cap(t.anchor?.state || 'default')} state${t.anchor?.selector ? `, at ${t.anchor.selector}` : ''}`;
    return h('div', { class: `thread${t.open ? '' : ' closed'}`, id: `t-${t.id}` },
      ...t.comments.map((c) => h('p', { class: 'c' }, h('b', {}, c.author), h('span', {}, c.text))),
      h('small', {}, where),
      data.writable ? h('div', {}, reply, h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => post(s.key, { thread: t.id, text: reply.value }) }, 'Reply'),
        h('button', { type: 'button', class: 'btn quiet', onclick: () => post(s.key, { thread: t.id, text: reply.value, resolve: t.open, reopen: !t.open }) }, t.open ? 'Resolve' : 'Reopen'))) : null);
  }
  /** One audit finding. In the panel, it also names its screen, which opens the screen. */
  function findingView(x, inPanel = false) {
    const s = x.screen ? data.screens.find((q) => q.key === x.screen) : null;
    const where = [
      inPanel && s ? h('button', { type: 'button', class: 'linkish', onclick: () => focus(s.key, { state: x.state }) }, `${s.title}, ${x.state} state`) : null,
      x.file ? h('code', {}, `${x.file}${x.line ? `:${x.line}` : ''}`) : null,
    ].filter(Boolean);
    return h('div', { class: 'check audit' },
      h('b', {}, x.rule || DIMENSION_NAMES[x.dimension] || 'Finding'), h('span', { class: `sev ${x.severity}` }, x.severity),
      h('p', {}, x.message),
      x.fix ? h('small', {}, `Fix: ${x.fix}`) : null,
      where.length ? h('small', {}, ...where.flatMap((w, i) => (i ? [' · ', w] : [w]))) : null);
  }

  async function fetchAudit() {
    try {
      const r = await fetch(`${BASE}audit.json`, { cache: 'no-store' });
      audit = r.ok ? await r.json() : null;
    } catch { audit = null; }
  }
  /** While an audit runs, read its report again every 5 seconds. */
  function pollAudit() {
    clearTimeout(pollAudit.t);
    if (audit?.status !== 'running') return;
    pollAudit.t = setTimeout(async () => {
      await fetchAudit();
      if (audit?.status !== 'running') {
        say(audit?.status === 'done' ? 'The audit is done' : 'The audit failed');
        drawHealth();
        render();
        if (focusState) drawFocus();
      }
      if (ui.panel === 'health') panel('health', true);
      pollAudit();
    }, 5000);
  }
  async function runAudit() {
    const r = await fetch(`${BASE}audit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflow: ui.workflow || null }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { say(`The audit did not start: ${body.reason || r.status}`); return; }
    audit = body;
    drawHealth();
    panel('health', true);
    pollAudit();
  }
  /** The screens with a failing check, and the open comments of the board. */
  function reviewCounts() {
    const failing = data.screens.filter((s) => failTotal(s));
    const commented = data.screens.filter((s) => s.openComments);
    return { failing, commented, comments: commented.reduce((n, s) => n + s.openComments, 0) };
  }
  /** The health control of the bar: what still needs a look on the board, in one line. */
  function drawHealth() {
    const { failing, comments } = reviewCounts();
    const parts = [data.checks ? (failing.length ? `${plural(failing.length, 'screen')} failing` : 'Checks pass') : 'No check yet'];
    if (comments) parts.push(plural(comments, 'comment'));
    if (audit?.status === 'running') parts.push('Audit running');
    else if (audit?.status === 'done') parts.push(plural((audit.findings || []).length, 'finding'));
    const b = $('#health');
    b.textContent = parts.join(' · ');
    b.classList.toggle('bad', failing.length > 0);
  }
  function healthPanel() {
    const { failing, commented, comments } = reviewCounts();
    const only = (key, id) => h('button', { type: 'button', class: 'btn quiet', onclick: () => { ui[key] = true; $(id).checked = true; filterCount(); applyFilter(); closePanel(); } }, 'Show only these screens');
    return [h('h2', {}, 'Review'), h('p', { class: 'lede' }, 'What still needs a look on this board.'),
      h('h3', {}, 'Checks'),
      !data.checks ? h('p', { class: 'none' }, 'No check has run.')
        : failing.length ? h('div', { class: 'row' }, h('p', {}, `${plural(failing.length, 'screen')} ${failing.length === 1 ? 'fails' : 'fail'} a check.`), only('failing', '#failing'))
          : h('p', {}, 'Every check passes.'),
      h('h3', {}, 'Comments'),
      comments ? h('div', { class: 'row' }, h('p', {}, `${plural(comments, 'open comment')} on ${plural(commented.length, 'screen')}.`), only('open', '#open'))
        : h('p', { class: 'none' }, 'No open comment.'),
      ...auditPanel()];
  }
  function auditPanel() {
    const head = [h('h3', {}, 'Design audit'), h('p', { class: 'sub' }, 'A read-only Sonnet agent checks the screens and the built code against DESIGN.md and the audit rules. It changes no file and writes no record.')];
    if (SNAP) return [...head, h('p', {}, 'The audit runs only on the design server.')];
    const runningNow = audit?.status === 'running';
    const scope = ui.workflow ? `the screens of ${ui.workflow}` : 'every screen';
    const run = h('div', { class: 'audit-run' },
      h('button', { type: 'button', class: 'btn primary', disabled: runningNow || !data.writable, onclick: runAudit }, runningNow ? 'Running…' : 'Run audit'),
      h('span', { class: 'sub' }, `Audits ${scope}. The workflow filter sets the scope.`));
    const when = (t) => (t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
    if (!audit || audit.status === 'none') return [...head, run, h('p', { class: 'none' }, 'No audit has run.')];
    if (runningNow) return [...head, run, h('p', {}, `The audit of ${audit.workflow || 'every screen'} started at ${when(audit.startedAt)}. A run takes a few minutes. The report shows here when it is done.`)];
    if (audit.status === 'failed') return [...head, run, h('div', { class: 'check' }, h('b', {}, 'The audit failed'), h('p', {}, audit.error || 'No reason.'), h('small', {}, when(audit.endedAt || audit.startedAt)))];
    const sc = audit.scores || {};
    const bySev = (n) => (audit.findings || []).filter((x) => x.severity === n).length;
    const counts = ['blocker', 'high', 'medium', 'low'].map((n) => [n, bySev(n)]).filter(([, c]) => c).map(([n, c]) => `${c} ${n}`).join(', ');
    return [...head, run,
      h('p', {}, audit.summary || ''),
      h('p', { class: 'sub' }, `${audit.workflow || 'Every screen'}, ${audit.platform && audit.platform !== 'unknown' ? `${audit.platform}, ` : ''}${when(audit.endedAt)}${typeof audit.costUsd === 'number' ? `, $${audit.costUsd.toFixed(2)}` : ''}.`),
      h('h4', {}, 'Scores (0 to 4)'),
      h('div', { class: 'scores' }, ...Object.keys(DIMENSION_NAMES).flatMap((d) => [
        h('span', {}, DIMENSION_NAMES[d]),
        h('span', { class: 'bar', role: 'img', 'aria-label': `${DIMENSION_NAMES[d]}: ${sc[d] ?? 'no score'} of 4` }, ...[1, 2, 3, 4].map((i) => h('i', { class: sc[d] >= i ? 'on' : null }))),
        h('b', {}, sc[d] === null || sc[d] === undefined ? '–' : String(sc[d]))])),
      h('h4', {}, 'Findings', counts ? h('span', { class: 'sub' }, ` ${counts}`) : null),
      ...((audit.findings || []).length ? audit.findings.map((x) => findingView(x, true)) : [h('p', { class: 'none' }, 'No finding.')])];
  }

  function author() {
    let a = null;
    try { a = localStorage.getItem('wf-canvas-author'); } catch { a = null; }
    if (!a) {
      a = (window.prompt('Your name, for your comments') || 'someone').trim().slice(0, 60);
      try { localStorage.setItem('wf-canvas-author', a); } catch { /* private window */ }
    }
    return a;
  }
  async function post(key, body) {
    const r = await fetch(`${BASE}comments/${key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, author: author() }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { say(`Not saved: ${j.reason || r.status}`); return; }
    // The answer carries the threads of the screen: only that screen and its counts change.
    const s = data.screens.find((x) => x.key === key);
    if (s && Array.isArray(j.threads)) {
      s.threads = j.threads;
      s.openComments = j.threads.filter((t) => t.open).length;
      for (const c of data.cards) if (c.screens.some((x) => x.key === key)) c.openComments = c.screens.reduce((n, x) => n + (data.screens.find((y) => y.key === x.key)?.openComments ?? 0), 0);
      drawHealth();
      render();
    } else await load();
    if (focusState) { focusState.commenting = false; drawFocus(); }
    say('Saved');
  }

  // ------------------------------------------------------------ panels

  function closePanel() {
    $('#panel').hidden = true;
    ui.panel = null;
    document.querySelectorAll('[data-panel]').forEach((b) => b.classList.remove('on'));
  }
  function panel(name, redraw = false) {
    const p = $('#panel');
    if (!redraw && ui.panel === name && !p.hidden) { closePanel(); return; }
    ui.panel = name;
    document.querySelectorAll('[data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === name));
    const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: closePanel }, '×');
    const body = detailOf(name);
    if (!body) { closePanel(); return; }
    p.replaceChildren(close, ...body.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
    p.hidden = false;
  }
  /**
   * The content of the panel: the review of the board (`health`), or the detail of one item of a
   * lane (`sketch:<key>`, `reference:<key>`, `component:<key>`). Null when the item is gone.
   */
  function detailOf(name) {
    if (name === 'health') return healthPanel();
    const [kind, key] = name.split(':');
    const newTab = (href, text) => h('p', {}, h('a', { href, target: '_blank', rel: 'noopener' }, text));
    if (kind === 'sketch') {
      const x = data.explore.find((e) => e.key === key);
      if (!x) return null;
      return [h('h2', {}, x.title || x.key), h('p', { class: 'lede' }, x.link ? `A sketch for ${x.link}, before any screen.` : 'A sketch from a brainstorm or an intake, before any screen.'),
        SNAP ? null : h('iframe', { class: 'part tall', title: x.title || x.key, sandbox: 'allow-scripts allow-same-origin', src: `${BASE}s/explore/${x.key}.html` }),
        SNAP ? null : newTab(`${BASE}s/explore/${x.key}.html`, 'Open the sketch in a new tab'),
        h('p', { class: 'sub' }, h('code', {}, x.file))];
    }
    if (kind === 'reference') {
      const r = data.references.find((e) => e.key === key);
      if (!r) return null;
      const src = `${BASE}ref/${r.key}`;
      return [h('h2', {}, r.key), h('p', { class: 'lede' }, `${cap(r.kind || 'other')}${r.note ? `: ${r.note}` : ''}`),
        r.readable ? null : h('div', { class: 'check' }, h('b', {}, 'Unreadable'), h('p', {}, r.problem)),
        !SNAP && r.readable && r.kind === 'image' ? h('img', { class: 'part', src, alt: r.note || r.key }) : null,
        !SNAP && r.readable && ['page', 'screen', 'canvas'].includes(r.kind) ? h('iframe', { class: 'part tall', title: r.key, src }) : null,
        !SNAP && r.readable ? newTab(src, 'Open the file in a new tab') : null,
        r.link ? newTab(r.link, 'Open the source') : null,
        r.file ? h('p', { class: 'sub' }, h('code', {}, r.file)) : null];
    }
    if (kind === 'component') {
      const c = data.components.find((e) => e.key === key);
      if (!c) return null;
      const t = { kind: 'component', key };
      const on = traceId(ui.trace) === traceId(t);
      return [h('h2', {}, c.title, ' ', h('span', { class: `mark ${c.code ? 'ok' : 'draft'}` }, c.code ? 'In code' : 'To build')),
        h('p', { class: 'lede' }, 'A part that the screens reuse. The code must use it.'),
        SNAP ? null : h('iframe', { class: 'part', title: c.title, loading: 'lazy', sandbox: 'allow-scripts allow-same-origin', src: `${BASE}s/components/${c.key}.html` }),
        c.code ? h('p', {}, h('code', {}, c.name), ' in ', h('code', {}, c.code)) : h('p', {}, 'New. The build makes it, and the code must use it.'),
        h('h3', {}, 'Used by', c.screens.length ? h('span', { class: 'count' }, String(c.screens.length)) : null),
        c.screens.length ? [h('ul', {}, ...c.screens.map((k) => h('li', {}, h('button', { type: 'button', class: 'linkish', onclick: () => focus(k) }, data.screens.find((x) => x.key === k)?.title || k)))),
          h('button', { type: 'button', class: 'btn', 'aria-pressed': String(on), onclick: () => { traceTo(t); panel(name, true); } }, on ? 'Show every screen' : 'Show only these screens')]
          : h('p', { class: 'none' }, 'No screen uses it yet.')];
    }
    return null;
  }

  // ------------------------------------------------------------ controls

  function wire() {
    document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      ui.view = b.dataset.view;
      ui.fitted = false;
      document.querySelectorAll('[data-view]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
      render();
    }));
    document.querySelectorAll('[data-panel]').forEach((b) => b.addEventListener('click', () => panel(b.dataset.panel)));
    const filter = (id, key, value) => $(id).addEventListener('change', (e) => { ui[key] = value(e.target); filterCount(); applyFilter(); if (ui.panel === 'health') panel('health', true); });
    $('#trace').addEventListener('click', () => traceTo(null));
    filter('#area', 'area', (t) => t.value);
    filter('#workflow', 'workflow', (t) => t.value);
    $('#workflow').addEventListener('change', () => { const was = ui.version; drawVersions(); if (was !== ui.version) render(); });
    filter('#open', 'open', (t) => t.checked);
    filter('#failing', 'failing', (t) => t.checked);
    $('#viewport').addEventListener('change', (e) => { ui.viewport = e.target.value; render(); });
    $('#version').addEventListener('change', (e) => { ui.version = e.target.value; render(); });
    $('#q').addEventListener('input', (e) => { ui.q = e.target.value; applyFilter(); });
    $('#zin').addEventListener('click', () => zoomBy(1.25));
    $('#zout').addEventListener('click', () => zoomBy(0.8));
    $('#zfit').addEventListener('click', fit);
    $('#arrange').addEventListener('click', arrange);
    document.addEventListener('click', (e) => { if (!e.target.closest('#filters')) $('#filters').open = false; });
    document.addEventListener('keydown', (e) => {
      // The arrow keys walk the screens in the screen view, unless a field or a control has the key.
      if (focusState && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey
        && !e.target.closest?.('input, textarea, select, [contenteditable]')) {
        e.preventDefault();
        step(e.key === 'ArrowLeft' ? -1 : 1);
        return;
      }
      if (e.key !== 'Escape') return;
      if (focusState?.commenting) { focusState.commenting = false; drawFocus(); }
      else if (focusState) closeFocus();
      else if ($('#filters').open) $('#filters').open = false;
      else if (ui.panel) closePanel();
      else if (ui.trace) traceTo(null);
    });
    // A resize comes many times a second, and on a phone also while the person scrolls. Once a
    // frame, the board redraws when the phone layout changes. The screen view redraws only when
    // its scale or the phone layout changes, so its frames and a typed reply stay.
    let last = phone();
    let resizeFrame = 0;
    addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        barHeight();
        if (phone() !== last) { last = phone(); ui.fitted = false; render(); }
        if (focusState && (focusDrawn?.phone !== phone() || focusDrawn?.scale !== focusScale(focusState))) drawFocus();
      });
    });
    panZoom();
  }

  wire();
  load().catch((e) => { $('#board').replaceChildren(h('p', { class: 'empty' }, `The canvas could not load its data: ${e.message}`)); });
})();
