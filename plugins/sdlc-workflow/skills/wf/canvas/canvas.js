// The design canvas: every screen of one repo on one board.
//
// The design server serves this page at /r/<repo>/ with the data at ./state.json and the screen
// pages at ./s/screens/<key>.html. A published snapshot sets window.WF_STATE and
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
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const params = new URLSearchParams(location.search);
  const ui = { view: 'grid', viewport: null, state: 'default', q: '', area: '', workflow: params.get('workflow') || '', open: false, failing: false, zoom: 1, x: 24, y: 24, panel: null, fitted: false };
  let data = null;
  // The last design audit of the repo (./audit.json): a read-only agent's report, not a check.
  let audit = null;
  const phone = () => matchMedia('(max-width: 720px)').matches;
  // On a phone the card is the width of the page less its gutters (canvas.css).
  const CARD_W = () => (phone() ? window.innerWidth - 32 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-w')) || 300);
  const GAP_X = 64;
  const LABEL_H = 56;
  const CAPTION_H = 64;
  const cap = (s) => (s ? `${String(s)[0].toUpperCase()}${String(s).slice(1)}` : '');
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const CHECK_NAMES = {
    contrast: 'Contrast', 'target-size': 'Target size', 'viewport-fit': 'Viewport fit', 'worst-case': 'Worst-case content', states: 'Missing states',
    display: 'Display bug', overlap: 'Overlapping text', token: 'Not a token', script: 'Script error',
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

  // ------------------------------------------------------------ data

  async function load() {
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
    drawStates();
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
  const screenUrl = (key, state, at = null) => (SNAP ? null : at ? `${BASE}at/${at}/screens/${key}.html?state=${state}` : `${BASE}s/screens/${key}.html?state=${state}`);
  function frameFor(key, state, at = null) {
    const f = h('iframe', { title: key, loading: 'lazy', tabindex: '-1', sandbox: SNAP ? 'allow-scripts' : 'allow-scripts allow-same-origin' });
    // A snapshot screen has no query string, so the state is set after the page's own script.
    if (SNAP) f.srcdoc = (SNAP.screens[key] || '').replace('</head>', `<style>${SNAP.tokens || ''}</style><script>document.documentElement.dataset.state=${JSON.stringify(state)}<\/script></head>`);
    else f.src = screenUrl(key, state, at);
    return f;
  }

  // ------------------------------------------------------------ the board

  function matches(s) {
    const q = ui.q.toLowerCase();
    if (q && ![s.key, s.title, s.area, s.flow].some((v) => String(v || '').toLowerCase().includes(q))) return false;
    if (ui.area && s.area !== ui.area) return false;
    if (ui.workflow && !(s.workflows || []).includes(ui.workflow)) return false;
    if (ui.open && !s.openComments) return false;
    if (ui.failing && !(s.failures || []).length) return false;
    return true;
  }
  /** Dim the cards that the search box and the filters leave out, with no new screen frame. */
  function applyFilter() {
    if (!data) return;
    const byKey = new Map(data.screens.map((s) => [s.key, s]));
    for (const card of document.querySelectorAll('#board > .card')) {
      const s = byKey.get(card.dataset.key);
      card.classList.toggle('dim', Boolean(s) && !matches(s));
    }
  }

  const frameH = () => Math.round(CARD_W() * vp().height / vp().width);

  /** The automatic place of each screen: columns by area (or rows by flow), in flow order. */
  function autoLayout(list) {
    const w = CARD_W() + GAP_X;
    const cardH = frameH() + CAPTION_H;
    const pos = {};
    const labels = [];
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
    return { pos, labels };
  }

  function render() {
    // A resize can come before the data does.
    if (!data) return;
    const board = $('#board');
    const edges = $('#edges');
    board.replaceChildren(edges);
    edges.replaceChildren();
    const list = data.screens;
    if (!list.length) {
      board.append(h('div', { class: 'empty' }, h('b', {}, 'No screens yet'), 'The design stage draws the screens of this repo here. Run wf.mjs design screen add to add the first one.'));
      place();
      return;
    }
    const { pos, labels } = autoLayout(list);
    const at = (s) => (ui.view === 'grid' && s.position ? s.position : pos[s.key]);
    if (!phone()) for (const l of labels) board.append(h('h2', { class: 'area-label', style: `left:${l.x}px;top:${l.y}px` }, cap(l.text), h('small', {}, plural(l.n, 'screen'))));
    const v = vp();
    const scale = CARD_W() / v.width;
    for (const s of list) {
      const p = at(s);
      const failures = (s.failures || []).filter((f) => f.viewport === ui.viewport && f.state === ui.state);
      const approved = (s.approvals || []).at(-1);
      const open = () => focus(s.key);
      const frame = h('div', { class: 'frame', role: 'button', tabindex: '0', 'aria-label': `Open ${s.title}`, style: `height:${Math.round(v.height * scale)}px`, onclick: open,
        onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } }, frameFor(s.key, ui.state));
      const iframe = frame.firstChild;
      iframe.style.width = `${v.width}px`;
      iframe.style.height = `${v.height}px`;
      iframe.style.transform = `scale(${scale})`;
      const card = h('article', { class: `card${matches(s) ? '' : ' dim'}`, 'data-key': s.key, style: phone() ? '' : `left:${p.x}px;top:${p.y}px` },
        frame,
        h('header', { class: 'cap' },
          h('div', { class: 'cap-row' }, h('b', { title: s.title }, s.title),
            s.openComments ? h('span', { class: 'mark note', title: 'Open comment threads' }, plural(s.openComments, 'comment')) : null,
            failures.length ? h('span', { class: 'mark issue', title: 'Checks that fail in this viewport and state' }, plural(failures.length, 'issue')) : null,
            auditOf(s.key).length ? h('span', { class: 'mark audit', title: 'Findings of the last design audit' }, plural(auditOf(s.key).length, 'finding')) : null,
            approved ? h('span', { class: 'mark ok', title: `Approved in ${approved.commit.slice(0, 8)}` }, 'Approved') : null),
          h('div', { class: 'meta', title: metaOf(s) }, metaOf(s))));
      if (!phone() && data.writable && ui.view === 'grid') dragCard(card.querySelector('.cap'), card, s);
      board.append(card);
    }
    if (ui.view === 'flow' && !phone()) drawEdges(list, at);
    // Arrange shows only while a dragged screen is out of its column.
    const moved = list.some((s) => s.position && (s.position.x !== pos[s.key].x || s.position.y !== pos[s.key].y));
    $('#arrange').hidden = !(data.writable && ui.view === 'grid' && !phone() && moved);
    if (!ui.fitted && !phone()) { ui.fitted = true; fit(); } else place();
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
  /** Show every screen: the board at the zoom that fits the stage, never above 100 %. */
  function fit() {
    const items = [...document.querySelectorAll('#board > .card, #board > .area-label')];
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
    const s = data.screens.find((x) => x.key === key);
    if (!s) return;
    focusFrom = document.activeElement;
    focusState = { key, viewport: opts.viewport || ui.viewport, state: opts.state || ui.state, checks: true, audit: true, commenting: false, compare: '', capture: false, all: false, play: false, trail: [] };
    drawFocus();
    $('#focus').hidden = false;
    $('#focus .close')?.focus();
  }
  /**
   * The screens in the order of the board: by area column (or flow row), then in flow order.
   * With a filter, only the screens that match it; the open screen always stays in the walk.
   */
  function walk() {
    const { pos } = autoLayout(data.screens);
    const shown = data.screens.filter((s) => matches(s) || s.key === focusState?.key);
    const list = shown.length > 1 ? shown : data.screens;
    const by = ui.view === 'flow' ? ['y', 'x'] : ['x', 'y'];
    return [...list].sort((a, b) => pos[a.key][by[0]] - pos[b.key][by[0]] || pos[a.key][by[1]] - pos[b.key][by[1]]);
  }
  /** Open the screen `step` places away in the walk, with the same viewport, state and toggles. */
  function step(by) {
    const list = walk();
    if (list.length < 2) return;
    const i = list.findIndex((s) => s.key === focusState.key);
    const next = list[(i + by + list.length) % list.length];
    focusState = { ...focusState, key: next.key, compare: '', commenting: false, trail: [] };
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
      if (!key || !data.screens.some((x) => x.key === key)) { say('That link leads to no screen'); return; }
      const st = url.searchParams.get('state');
      focusState = { ...focusState, key, state: data.states.includes(st) ? st : 'default', compare: '', trail: [...focusState.trail, { key: focusState.key, state: focusState.state }] };
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
    content.style.width = `${size.width}px`;
    content.style.height = `${size.height}px`;
    content.style.transform = `scale(${scale})`;
    return box;
  }
  function segOf(values, value, on, label) {
    return h('div', { class: 'seg', role: 'group', 'aria-label': label },
      ...values.map((v) => h('button', { type: 'button', class: v === value ? 'on' : null, 'aria-pressed': String(v === value), onclick: () => on(v) }, cap(v))));
  }
  const toggle = (text, on, fn) => h('button', { type: 'button', class: 'btn', 'aria-pressed': String(Boolean(on)), onclick: fn }, text);

  /** The scale of the screens in the screen view: one or two panes in the room of the window. */
  function focusScale(f) {
    const size = vp(f.viewport);
    const panes = f.compare || f.capture ? 2 : 1;
    const room = phone() ? window.innerWidth - 32 : window.innerWidth - 32 - 340 - 48;
    return Math.min(1, (room - (panes - 1) * 24) / panes / size.width, phone() ? 1 : (window.innerHeight - 240) / size.height);
  }
  // The scale and the layout of the last drawn screen view: a resize that keeps both keeps the view.
  let focusDrawn = null;
  function drawFocus() {
    const f = focusState;
    const s = data.screens.find((x) => x.key === f.key);
    const size = vp(f.viewport);
    const scale = focusScale(f);
    focusDrawn = { scale, phone: phone() };
    const view = h('div', { class: 'view' });
    const live = shot(f.compare || f.capture ? 'Now' : `${cap(f.viewport)}, ${f.state} state${f.play ? ', playing' : ''}`, frameFor(s.key, f.state), size, scale);
    const overlay = h('div', { class: `overlay${f.commenting ? ' commenting' : ''}` });
    // In play, nothing covers the screen, so its links and controls take the pointer.
    if (f.play) {
      live.classList.add('playing');
      const ifr = live.querySelector('iframe');
      ifr.removeAttribute('tabindex');
      ifr.addEventListener('load', () => playLinks(ifr));
    } else live.append(overlay);
    if (f.checks) {
      for (const x of (s.failures || []).filter((q) => q.viewport === f.viewport && q.state === f.state)) {
        if (x.rect) overlay.append(boxAt(x.rect, scale, CHECK_NAMES[x.check] || x.check, x.message));
      }
    }
    const findings = auditOf(s.key);
    if (f.audit) {
      for (const x of findings.filter((q) => q.state === f.state && q.rects?.[f.viewport])) {
        overlay.append(boxAt(x.rects[f.viewport], scale, x.rule || 'Audit', x.message, 'audit'));
      }
    }
    s.threads.forEach((t, i) => {
      if (!f.all && !t.open) return;
      if ((t.anchor?.state || 'default') !== f.state || t.anchor?.x === null || t.anchor?.x === undefined) return;
      overlay.append(h('div', { class: `pinmark${t.open ? '' : ' closed'}`, style: `left:${t.anchor.x * size.width * scale}px;top:${t.anchor.y * size.height * scale}px`, title: t.comments[0]?.text || '', onclick: (e) => { e.stopPropagation(); $(`#t-${t.id}`)?.scrollIntoView({ behavior: 'smooth' }); } }, String(i + 1)));
    });
    overlay.addEventListener('click', (e) => {
      if (!f.commenting) return;
      const r = overlay.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width; const y = (e.clientY - r.top) / r.height;
      let selector = null;
      try { selector = selectorOf(live.querySelector('iframe').contentDocument.elementFromPoint(x * size.width, y * size.height)); } catch { selector = null; }
      newThread({ x, y, selector, state: f.state, viewport: f.viewport });
    });
    view.append(live);
    // On a touch screen, a sideways swipe over the screens walks to the next or the previous one.
    let swipe = null;
    view.addEventListener('pointerdown', (e) => { swipe = e.pointerType !== 'mouse' && !f.commenting ? { x: e.clientX, y: e.clientY } : null; });
    view.addEventListener('pointercancel', () => { swipe = null; });
    view.addEventListener('pointerup', (e) => {
      if (!swipe) return;
      const dx = e.clientX - swipe.x;
      const dy = e.clientY - swipe.y;
      swipe = null;
      if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
    });
    if (f.compare) view.append(shot(`At ${f.compare.slice(0, 8)}`, frameFor(s.key, f.state, f.compare), size, scale));
    if (f.capture) {
      const approval = (s.approvals || []).at(-1);
      const shotOf = (s.captures || [])[0];
      const src = shotOf ? `${BASE}${shotOf.url}` : (approval ? `${BASE}approvals/${approval.commit}/${s.key}.png` : '');
      view.append(shot(shotOf ? `Built, slice ${shotOf.slice}` : approval ? 'Approval picture' : 'No capture yet', h('img', { alt: shotOf ? 'The built screen' : 'The approved screen', src }), size, scale));
    }
    const versions = [...(s.approvals || []).map((a) => [a.commit, `Approved ${String(a.at).slice(0, 10)}`]),
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
      h('h2', {}, s.title, h('small', {}, metaOf(s))),
      back ? h('button', { type: 'button', class: 'btn', 'aria-label': `Back to ${backTitle}`, onclick: () => { focusState = { ...focusState, key: back.key, state: back.state, trail: f.trail.slice(0, -1) }; drawFocus(); } }, `← ${backTitle}`) : null,
      stepper,
      h('button', { type: 'button', class: 'close', onclick: closeFocus, 'aria-label': 'Close' }, '×'));
    const tools = h('div', { class: 'tools' },
      segOf(Object.keys(data.viewports), f.viewport, (v) => { f.viewport = v; drawFocus(); }, 'Viewport'),
      segOf(data.states, f.state, (v) => { f.state = v; drawFocus(); }, 'State'),
      h('span', { class: 'gap' }),
      toggle('Checks', f.checks, () => { f.checks = !f.checks; drawFocus(); }),
      findings.length ? toggle('Audit', f.audit, () => { f.audit = !f.audit; drawFocus(); }) : null,
      SNAP ? null : toggle('Play', f.play, () => { f.play = !f.play; f.commenting = false; f.trail = []; drawFocus(); }),
      data.writable ? toggle(f.commenting ? 'Tap the screen' : 'Comment', f.commenting, () => { f.commenting = !f.commenting; f.play = false; drawFocus(); }) : null,
      toggle('Capture', f.capture, () => { f.capture = !f.capture; drawFocus(); }),
      SNAP || !versions.length ? null : h('label', {}, 'Compare', sel(['', ...versions.map((v) => v[0])], f.compare, (v) => { f.compare = v; drawFocus(); }, Object.fromEntries([['', 'Nothing'], ...versions]))));
    const openN = s.threads.filter((t) => t.open).length;
    const shown = s.threads.filter((t) => f.all || t.open);
    const failures = groupsOf(s);
    const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
    const side = h('section', { class: 'side' },
      h('h3', {}, 'Comments', openN ? h('span', { class: 'count' }, String(openN)) : null,
        s.threads.length > openN ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: f.all, onchange: (e) => { f.all = e.target.checked; drawFocus(); } }), 'Show resolved') : null),
      shown.length ? shown.map((t) => threadView(s, t)) : h('p', { class: 'none' }, data.writable ? 'No open comment. Choose Comment, then tap a point of the screen.' : 'No open comment.'),
      h('h3', {}, 'Checks', failures.length ? h('span', { class: 'count' }, String(failures.length)) : null),
      failures.length ? failures.map((x) => h('div', { class: 'check' },
        h('b', {}, CHECK_NAMES[x.check] || x.check), x.places > 1 ? h('span', { class: 'sev' }, `${x.places} places`) : null,
        h('p', {}, x.message),
        h('small', {}, `${x.viewports.length ? `${list(x.viewports.map(cap))}, ` : ''}${list(x.states) || 'every'} state${x.states.length > 1 ? 's' : ''}.${x.move ? ` The ${x.move} move fixes it.` : x.check === 'script' ? ' Fix the script of the screen page.' : ''}`)))
        : h('p', { class: 'none' }, 'No check fails.'),
      findings.length ? [h('h3', {}, 'Audit', h('span', { class: 'count' }, String(findings.length))), ...findings.map((x) => findingView(x))] : null);
    $('#focus').replaceChildren(h('div', { class: 'sheet' }, header, tools, view, side));
  }
  /**
   * The check failures of one screen, one entry for each cause, for example one raw color in five
   * rules, with its places, viewports and states. The server groups them. An older server sends
   * only the failures, so then the canvas groups them.
   */
  function groupsOf(s) {
    if (Array.isArray(s.failureGroups)) return s.failureGroups;
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
        render();
        if (focusState) drawFocus();
      }
      if (ui.panel === 'audit') panel('audit', true);
      pollAudit();
    }, 5000);
  }
  async function runAudit() {
    const r = await fetch(`${BASE}audit`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ workflow: ui.workflow || null }) });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) { say(`The audit did not start: ${body.reason || r.status}`); return; }
    audit = body;
    panel('audit', true);
    pollAudit();
  }
  function auditPanel() {
    const head = [h('h2', {}, 'Design audit'), h('p', { class: 'lede' }, 'A read-only Sonnet agent checks the screens and the built code against DESIGN.md and the audit rules. It changes no file and writes no record.')];
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
      h('h3', {}, 'Scores (0 to 4)'),
      h('div', { class: 'scores' }, ...Object.keys(DIMENSION_NAMES).flatMap((d) => [
        h('span', {}, DIMENSION_NAMES[d]),
        h('span', { class: 'bar', role: 'img', 'aria-label': `${DIMENSION_NAMES[d]}: ${sc[d] ?? 'no score'} of 4` }, ...[1, 2, 3, 4].map((i) => h('i', { class: sc[d] >= i ? 'on' : null }))),
        h('b', {}, sc[d] === null || sc[d] === undefined ? '–' : String(sc[d]))])),
      h('h3', {}, 'Findings', counts ? h('span', { class: 'sub' }, ` ${counts}`) : null),
      ...((audit.findings || []).length ? audit.findings.map((x) => findingView(x, true)) : [h('p', { class: 'none' }, 'No finding.')])];
  }

  function newThread(anchor) {
    const text = window.prompt('Comment on this point of the screen');
    if (text && text.trim()) post(focusState.key, { text, anchor });
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
    if (!r.ok) { say(`Not saved: ${(await r.json().catch(() => ({}))).reason || r.status}`); return; }
    const keep = focusState && { ...focusState };
    await load();
    if (keep) { focusState = keep; focusState.commenting = false; drawFocus(); }
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
    const approvalText = (c) => (c.approval ? `Approved on ${String(c.approval.at).slice(0, 10)} in ${c.approval.commit.slice(0, 8)}.` : 'Not approved yet.');
    const checksText = (c) => (c.checks ? (c.checks.passed ? 'All checks pass.' : `${plural(c.checks.failures, 'check')} fail.`) : 'No check has run.');
    const body = {
      cards: () => [h('h2', {}, 'Design cards'), h('p', { class: 'lede' }, 'One card for each slice that changes screens.'),
        ...(data.cards.length ? data.cards.map((c) => h('div', { class: 'dcard' },
          h('b', {}, c.workflow, h('span', { class: 'sub' }, c.slice && !String(c.slice).startsWith('(') ? `, slice ${c.slice}` : ', the whole workflow')),
          h('h3', {}, 'Screens and states'),
          h('ul', {}, ...c.screens.map((s) => h('li', {}, h('button', { type: 'button', class: 'linkish', onclick: () => focus(s.key) }, s.title),
            h('span', { class: 'states-inline' }, ...s.states.map((st) => h('button', { type: 'button', class: 'linkish', onclick: () => focus(s.key, { state: st }) }, st)))))),
          h('h3', {}, 'Tokens'), h('div', { class: 'chips' }, ...(c.tokens.length ? c.tokens.map((t) => h('span', {}, t)) : ['None'])),
          h('h3', {}, 'Rules'), c.rules.length ? h('ul', {}, ...c.rules.map((r) => h('li', {}, r))) : h('p', {}, 'No rule of the visual contract names these screens.'),
          h('h3', {}, 'Approval and checks'), h('p', {}, approvalText(c), ' ', checksText(c)),
          h('h3', {}, 'Open comments'), h('p', {}, c.openComments ? h('button', { type: 'button', class: 'linkish', onclick: () => { ui.open = true; ui.workflow = c.workflow; $('#open').checked = true; $('#workflow').value = c.workflow; filterCount(); applyFilter(); } }, `Show the ${plural(c.openComments, 'open comment')}`) : 'None.')))
          : [h('p', {}, 'No screen belongs to a slice yet.')])],
      decisions: () => [h('h2', {}, 'Design decisions'), h('p', { class: 'lede' }, 'The answers that shaped these screens.'),
        data.decisions.length ? h('ul', {}, ...data.decisions.map((d) => h('li', {}, h('b', {}, d.question || d.id), h('br'), d.answer ?? '', h('span', { class: 'sub' }, ` (${d.workflow})`)))) : h('p', {}, 'No design decision is recorded.')],
      tokens: () => [h('h2', {}, 'Tokens'), h('p', { class: 'lede' }, 'From DESIGN.md. Change them there.'),
        h('ul', { class: 'tokens' }, ...data.tokens.map((t) => h('li', {}, h('span', { class: 'swatch', style: `background:${t.value.startsWith('var(') ? 'transparent' : t.value}` }), h('span', {}, t.name, h('br'), h('code', {}, t.value)))))],
      references: () => [h('h2', {}, 'References'), h('p', { class: 'lede' }, 'The files the screens draw on.'),
        data.references.length ? h('ul', {}, ...data.references.map((r) => h('li', {}, SNAP ? r.key : h('a', { href: `${BASE}ref/${r.key}`, target: '_blank', rel: 'noopener' }, r.key),
          ` (${r.kind || 'other'})${r.note ? `: ${r.note}` : ''} `, r.readable ? h('span', { class: 'mark ok' }, 'Readable') : h('span', { class: 'mark issue', title: r.problem }, r.problem)))) : h('p', {}, 'No reference yet.')],
      explore: () => [h('h2', {}, 'Explore'), h('p', { class: 'lede' }, 'Sketches from brainstorms and intakes, before any screen.'),
        data.explore.length ? h('ul', {}, ...data.explore.map((x) => h('li', {}, SNAP ? x.title || x.key : h('a', { href: `${BASE}s/explore/${x.key}.html`, target: '_blank', rel: 'noopener' }, x.title || x.key), x.link ? `, for ${x.link}` : ''))) : h('p', {}, 'No explore sketch yet.')],
      audit: auditPanel,
    }[name];
    p.replaceChildren(close, ...body());
    p.hidden = false;
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
    const filter = (id, key, value) => $(id).addEventListener('change', (e) => { ui[key] = value(e.target); filterCount(); applyFilter(); if (ui.panel === 'audit') panel('audit', true); });
    filter('#area', 'area', (t) => t.value);
    filter('#workflow', 'workflow', (t) => t.value);
    filter('#open', 'open', (t) => t.checked);
    filter('#failing', 'failing', (t) => t.checked);
    $('#viewport').addEventListener('change', (e) => { ui.viewport = e.target.value; render(); });
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
      if (focusState) closeFocus();
      else if ($('#filters').open) $('#filters').open = false;
      else if (ui.panel) closePanel();
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
