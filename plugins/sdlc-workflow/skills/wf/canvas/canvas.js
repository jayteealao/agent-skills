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
  const ui = { view: 'grid', viewport: null, state: 'default', q: '', area: '', workflow: params.get('workflow') || '', open: false, failing: false, zoom: 1, x: 24, y: 24, panel: null };
  let data = null;
  // On a phone the card is the width of the page less its gutters (canvas.css).
  const CARD_W = () => (phone() ? window.innerWidth - 32 : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-w')) || 280);
  const phone = () => matchMedia('(max-width: 720px)').matches;

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

  // ------------------------------------------------------------ data

  async function load() {
    data = window.WF_STATE || await (await fetch(`${BASE}state.json`, { cache: 'no-store' })).json();
    $('#repo').textContent = `${data.repo || 'Design'} — canvas`;
    document.title = `${data.repo || 'Design'} — canvas`;
    const names = Object.keys(data.viewports);
    ui.viewport = ui.viewport || (names.includes('desktop') ? 'desktop' : names[0]);
    fill($('#viewport'), names.map((n) => [n, `${n} (${data.viewports[n]})`]), ui.viewport);
    fill($('#state'), data.states.map((s) => [s, s]), ui.state);
    fill($('#area'), [['', 'All'], ...data.areas.map((a) => [a, a])], ui.area);
    fill($('#workflow'), [['', 'All'], ...data.workflows.map((w) => [w, w])], ui.workflow);
    render();
    if (ui.panel) panel(ui.panel);
  }
  function fill(sel, rows, value) {
    sel.replaceChildren(...rows.map(([v, t]) => h('option', { value: v, selected: v === value }, t)));
  }
  const screenUrl = (key, state, at = null) => (SNAP ? null : at ? `${BASE}at/${at}/screens/${key}.html?state=${state}` : `${BASE}s/screens/${key}.html?state=${state}`);
  function frameFor(key, state, at = null) {
    const f = h('iframe', { title: key, loading: 'lazy', sandbox: SNAP ? 'allow-scripts' : 'allow-scripts allow-same-origin' });
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

  /** The automatic place of each screen: columns by area (or rows by flow), in flow order. */
  function autoLayout(list) {
    const w = CARD_W() + 40;
    const v = vp();
    const cardH = Math.round(CARD_W() * v.height / v.width) + 64;
    const pos = {};
    const labels = [];
    const groupKey = ui.view === 'flow' ? (s) => s.flow || '(no flow)' : (s) => s.area || '(no area)';
    const groups = [...new Set(list.map(groupKey))];
    groups.forEach((g, gi) => {
      const members = list.filter((s) => groupKey(s) === g).sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.key.localeCompare(b.key));
      if (ui.view === 'flow') {
        labels.push({ text: g, x: 0, y: gi * (cardH + 60) });
        members.forEach((s, i) => { pos[s.key] = { x: i * w, y: gi * (cardH + 60) + 26 }; });
      } else {
        labels.push({ text: g, x: gi * w, y: 0 });
        members.forEach((s, i) => { pos[s.key] = { x: gi * w, y: 26 + i * (cardH + 20) }; });
      }
    });
    return { pos, labels };
  }

  function render() {
    const board = $('#board');
    const edges = $('#edges');
    board.replaceChildren(edges);
    edges.replaceChildren();
    const list = data.screens;
    const { pos, labels } = autoLayout(list);
    const at = (s) => (ui.view === 'grid' && s.position ? s.position : pos[s.key]);
    if (!phone()) for (const l of labels) board.append(h('div', { class: 'area-label', style: `left:${l.x}px;top:${l.y}px` }, l.text));
    const v = vp();
    const scale = CARD_W() / v.width;
    for (const s of list) {
      const p = at(s);
      const failures = (s.failures || []).filter((f) => f.viewport === ui.viewport && f.state === ui.state);
      const approved = (s.approvals || []).at(-1);
      const frame = h('div', { class: 'frame', style: `height:${Math.round(v.height * scale)}px`, onclick: () => focus(s.key) }, frameFor(s.key, ui.state));
      const iframe = frame.firstChild;
      iframe.style.width = `${v.width}px`;
      iframe.style.height = `${v.height}px`;
      iframe.style.transform = `scale(${scale})`;
      const card = h('article', { class: `card${matches(s) ? '' : ' dim'}`, 'data-key': s.key, style: phone() ? '' : `left:${p.x}px;top:${p.y}px` },
        h('header', {}, h('b', { title: s.title }, s.title),
          s.openComments ? h('span', { class: 'badge pin', title: 'Open comments' }, `${s.openComments} open`) : null,
          failures.length ? h('span', { class: 'badge warn', title: 'Checks that fail in this viewport and state' }, `${failures.length} check${failures.length > 1 ? 's' : ''}`) : null,
          approved ? h('span', { class: 'badge ok', title: `Approved in ${approved.commit}` }, 'approved') : null),
        h('div', { class: 'key' }, `${s.key}${s.flow ? ` · ${s.flow}` : ''}${(s.workflows || []).length ? ` · ${s.workflows.join(', ')}` : ''}`),
        frame);
      if (!phone() && data.writable && ui.view === 'grid') dragCard(card.querySelector('header'), card, s);
      board.append(card);
    }
    if (ui.view === 'flow' && !phone()) drawEdges(list, at);
    place();
  }

  function drawEdges(list, at) {
    const edges = $('#edges');
    const v = vp();
    const cardH = Math.round(CARD_W() * v.height / v.width) + 64;
    const byKey = Object.fromEntries(list.map((s) => [s.key, s]));
    for (const s of list) {
      for (const to of s.links || []) {
        if (!byKey[to] || to === s.key) continue;
        const a = at(s);
        const b = at(byKey[to]);
        const x1 = a.x + CARD_W(); const y1 = a.y + cardH / 2;
        const x2 = b.x; const y2 = b.y + cardH / 2;
        const mid = (x1 + x2) / 2;
        edges.append(Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'path'), {}));
        edges.lastChild.setAttribute('d', `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}`);
      }
    }
  }

  // ------------------------------------------------------------ pan, zoom, drag

  function place() {
    $('#board').style.transform = phone() ? 'none' : `translate(${ui.x}px, ${ui.y}px) scale(${ui.zoom})`;
  }
  function panZoom() {
    const stage = $('#stage');
    const pointers = new Map();
    let start = null;
    stage.addEventListener('pointerdown', (e) => {
      if (phone() || e.target.closest('.card')) return;
      stage.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start = { x: ui.x, y: ui.y, zoom: ui.zoom, pts: [...pointers.values()].map((p) => ({ ...p })) };
      stage.classList.add('panning');
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId) || !start) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.values()];
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
    stage.addEventListener('wheel', (e) => {
      if (phone()) return;
      e.preventDefault();
      const r = stage.getBoundingClientRect();
      const mx = e.clientX - r.left; const my = e.clientY - r.top;
      const next = Math.min(3, Math.max(0.15, ui.zoom * Math.exp(-e.deltaY * 0.0015)));
      ui.x = mx - (mx - ui.x) * next / ui.zoom;
      ui.y = my - (my - ui.y) * next / ui.zoom;
      ui.zoom = next;
      place();
    }, { passive: false });
  }

  let saveTimer = null;
  function dragCard(handle, card, s) {
    handle.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
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
        s.position = { x: Math.round(parseFloat(card.style.left)), y: Math.round(parseFloat(card.style.top)) };
        clearTimeout(saveTimer);
        saveTimer = setTimeout(saveLayout, 600);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }
  async function saveLayout() {
    const positions = Object.fromEntries(data.screens.filter((s) => s.position).map((s) => [s.key, s.position]));
    const r = await fetch(`${BASE}layout`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ positions }) });
    say(r.ok ? 'Layout saved' : 'The layout was not saved');
  }

  // ------------------------------------------------------------ one screen

  let focusState = null;
  function focus(key, opts = {}) {
    const s = data.screens.find((x) => x.key === key);
    if (!s) return;
    focusState = { key, viewport: opts.viewport || ui.viewport, state: opts.state || ui.state, checks: true, commenting: false, compare: '', capture: false, all: false };
    drawFocus();
    $('#focus').hidden = false;
  }
  function closeFocus() { $('#focus').hidden = true; focusState = null; }

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

  function shot(caption, content, size, scale) {
    const box = h('div', { class: 'shot', style: `width:${Math.round(size.width * scale)}px;height:${Math.round(size.height * scale)}px` }, h('div', { class: 'cap' }, caption), content);
    content.style.width = `${size.width}px`;
    content.style.height = `${size.height}px`;
    content.style.transform = `scale(${scale})`;
    return box;
  }

  function drawFocus() {
    const f = focusState;
    const s = data.screens.find((x) => x.key === f.key);
    const size = vp(f.viewport);
    const pane = phone() ? window.innerWidth - 32 : Math.min(window.innerWidth - 420, window.innerWidth * 0.62);
    const panes = f.compare || f.capture ? 2 : 1;
    const scale = Math.min(1, (pane / panes - 16) / size.width, phone() ? 1 : (window.innerHeight - 140) / size.height);
    const view = h('div', { class: 'view' });
    const live = shot('Now', frameFor(s.key, f.state), size, scale);
    const overlay = h('div', { class: `overlay${f.commenting ? ' commenting' : ''}` });
    live.append(overlay);
    if (f.checks) {
      for (const x of (s.failures || []).filter((q) => q.viewport === f.viewport && q.state === f.state)) {
        if (!x.rect) continue;
        overlay.append(h('div', { class: 'box', title: x.message, style: `left:${x.rect.x * scale}px;top:${x.rect.y * scale}px;width:${x.rect.width * scale}px;height:${x.rect.height * scale}px` }, h('span', {}, x.check)));
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
    if (f.compare) view.append(shot(`At ${f.compare.slice(0, 8)}`, frameFor(s.key, f.state, f.compare), size, scale));
    if (f.capture) {
      const approval = (s.approvals || []).at(-1);
      const cap = (s.captures || [])[0];
      view.append(shot(cap ? `Capture ${cap.slice}` : 'No capture yet', h('img', { alt: 'capture', src: cap ? `${BASE}${cap.url}` : (approval ? `${BASE}approvals/${approval.commit}/${s.key}.png` : '') }), size, scale));
    }
    const versions = [...(s.approvals || []).map((a) => [a.commit, `approved ${String(a.at).slice(0, 10)} (${a.commit.slice(0, 8)})`]),
      ...(s.history || []).filter((c) => !(s.approvals || []).some((a) => a.commit === c.commit)).map((c) => [c.commit, `${String(c.at).slice(0, 10)} ${c.subject}`])];
    const header = h('header', {},
      h('h2', {}, `${s.title} `, h('small', { style: 'color:var(--mute)' }, s.key)),
      h('label', {}, 'Viewport ', sel(Object.keys(data.viewports), f.viewport, (v) => { f.viewport = v; drawFocus(); })),
      h('label', {}, 'State ', sel(data.states, f.state, (v) => { f.state = v; drawFocus(); })),
      h('button', { type: 'button', class: `btn${f.checks ? ' on' : ''}`, onclick: () => { f.checks = !f.checks; drawFocus(); } }, 'Checks'),
      data.writable ? h('button', { type: 'button', class: `btn${f.commenting ? ' on' : ''}`, onclick: () => { f.commenting = !f.commenting; drawFocus(); } }, f.commenting ? 'Tap the screen…' : 'Comment') : null,
      SNAP ? null : h('label', {}, 'Compare ', sel(['', ...versions.map((v) => v[0])], f.compare, (v) => { f.compare = v; drawFocus(); }, Object.fromEntries([['', 'none'], ...versions])))
      , h('button', { type: 'button', class: `btn${f.capture ? ' on' : ''}`, onclick: () => { f.capture = !f.capture; drawFocus(); } }, 'Capture'),
      h('button', { type: 'button', class: 'btn', onclick: closeFocus, 'aria-label': 'Close' }, 'Close'));
    const threads = h('section', { class: 'threads' },
      h('div', { class: 'row' }, h('b', { style: 'flex:1' }, `${s.threads.filter((t) => t.open).length} open thread(s)`),
        h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: f.all, onchange: (e) => { f.all = e.target.checked; drawFocus(); } }), ' Show resolved')),
      ...s.threads.filter((t) => f.all || t.open).map((t) => threadView(s, t)),
      (s.failures || []).length ? h('div', {}, h('h3', {}, 'Checks'), h('ul', {}, ...(s.failures || []).map((x) => h('li', {}, `${x.check} (${x.viewport}, ${x.state}): ${x.message}${x.move ? ` — move: ${x.move}` : ''}`)))) : null);
    $('#focus').replaceChildren(h('div', { class: 'sheet' }, header, view, threads));
  }
  function sel(values, value, on, labels = {}) {
    return h('select', { onchange: (e) => on(e.target.value) }, ...values.map((v) => h('option', { value: v, selected: v === value }, labels[v] ?? v)));
  }
  function threadView(s, t) {
    const reply = h('textarea', { placeholder: 'Reply', 'aria-label': 'Reply' });
    return h('div', { class: `thread${t.open ? '' : ' closed'}`, id: `t-${t.id}` },
      ...t.comments.map((c) => h('div', { class: 'c' }, h('b', {}, c.author), ` ${c.text}`)),
      h('small', { style: 'color:var(--mute)' }, `${t.anchor?.state || 'default'}${t.anchor?.selector ? ` · ${t.anchor.selector}` : ''}`),
      data.writable ? h('div', {}, reply, h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn primary', onclick: () => post(s.key, { thread: t.id, text: reply.value }) }, 'Reply'),
        h('button', { type: 'button', class: 'btn', onclick: () => post(s.key, { thread: t.id, text: reply.value, resolve: t.open, reopen: !t.open }) }, t.open ? 'Resolve' : 'Reopen'))) : null);
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

  function panel(name) {
    const p = $('#panel');
    document.querySelectorAll('[data-panel]').forEach((b) => b.classList.toggle('on', b.dataset.panel === name && !(ui.panel === name && !p.hidden && name === panel.last)));
    if (ui.panel === name && !p.hidden && panel.last === name) { p.hidden = true; ui.panel = null; return; }
    ui.panel = name;
    panel.last = name;
    const close = h('button', { type: 'button', class: 'close', 'aria-label': 'Close', onclick: () => { p.hidden = true; ui.panel = null; } }, '×');
    const body = {
      cards: () => [h('h2', {}, 'Design cards'), ...(data.cards.length ? data.cards : [null]).map((c) => (c ? h('div', { class: 'cardbox' },
        h('b', {}, `${c.workflow} · ${c.slice}`),
        h('h3', {}, 'Screens'), h('ul', {}, ...c.screens.map((s) => h('li', {}, h('button', { type: 'button', class: 'linkish', onclick: () => focus(s.key) }, s.title), ' ', ...s.states.map((st) => h('button', { type: 'button', class: 'linkish', style: 'margin-left:6px', onclick: () => focus(s.key, { state: st }) }, st))))),
        h('h3', {}, 'Tokens'), h('div', { class: 'chips' }, ...(c.tokens.length ? c.tokens.map((t) => h('span', {}, t)) : ['none'])),
        h('h3', {}, 'Rules'), c.rules.length ? h('ul', {}, ...c.rules.map((r) => h('li', {}, r))) : h('p', {}, 'No rule of the visual contract names these screens.'),
        h('h3', {}, 'Approval and checks'), h('p', {}, c.approval ? `Approved ${String(c.approval.at).slice(0, 10)} in ${c.approval.commit.slice(0, 8)}` : 'Not approved yet', ' · ', c.checks ? (c.checks.passed ? 'checks pass' : `${c.checks.failures} check(s) fail`) : 'no check run'),
        h('h3', {}, 'Open comments'), h('p', {}, c.openComments ? h('button', { type: 'button', class: 'linkish', onclick: () => { ui.open = true; ui.workflow = c.workflow; $('#open').checked = true; $('#workflow').value = c.workflow; render(); } }, `${c.openComments} open — show them`) : 'None'))
        : h('p', {}, 'No screen belongs to a slice yet.')))],
      decisions: () => [h('h2', {}, 'Design decisions'), data.decisions.length ? h('ul', {}, ...data.decisions.map((d) => h('li', {}, h('b', {}, d.workflow), ` ${d.question || d.id}: ${d.answer ?? ''}`))) : h('p', {}, 'No design decision is recorded.')],
      tokens: () => [h('h2', {}, 'Tokens'), h('p', { style: 'color:var(--mute)' }, 'From DESIGN.md. Change them there.'), h('ul', { style: 'list-style:none;padding:0' }, ...data.tokens.map((t) => h('li', {}, h('span', { class: 'swatch', style: `background:${t.value.startsWith('var(') ? '' : t.value}` }), `${t.name}: ${t.value}`)))],
      references: () => [h('h2', {}, 'References'), data.references.length ? h('ul', {}, ...data.references.map((r) => h('li', {}, SNAP ? r.key : h('a', { href: `${BASE}ref/${r.key}`, target: '_blank', rel: 'noopener' }, r.key), ` (${r.kind || 'other'})${r.note ? `: ${r.note}` : ''} `, r.readable ? h('span', { class: 'badge ok' }, 'readable') : h('span', { class: 'badge warn', title: r.problem }, r.problem)))) : h('p', {}, 'No reference yet.')],
      explore: () => [h('h2', {}, 'Explore'), data.explore.length ? h('ul', {}, ...data.explore.map((x) => h('li', {}, SNAP ? x.title || x.key : h('a', { href: `${BASE}s/explore/${x.key}.html`, target: '_blank', rel: 'noopener' }, x.title || x.key), x.link ? ` — for ${x.link}` : ''))) : h('p', {}, 'No explore sketch yet.')],
    }[name];
    p.replaceChildren(close, ...body());
    p.hidden = false;
  }

  // ------------------------------------------------------------ controls

  function wire() {
    document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      ui.view = b.dataset.view;
      document.querySelectorAll('[data-view]').forEach((x) => x.classList.toggle('on', x === b));
      render();
    }));
    document.querySelectorAll('[data-panel]').forEach((b) => b.addEventListener('click', () => panel(b.dataset.panel)));
    $('#viewport').addEventListener('change', (e) => { ui.viewport = e.target.value; render(); });
    $('#state').addEventListener('change', (e) => { ui.state = e.target.value; render(); });
    $('#area').addEventListener('change', (e) => { ui.area = e.target.value; render(); });
    $('#workflow').addEventListener('change', (e) => { ui.workflow = e.target.value; render(); });
    $('#open').addEventListener('change', (e) => { ui.open = e.target.checked; render(); });
    $('#failing').addEventListener('change', (e) => { ui.failing = e.target.checked; render(); });
    $('#q').addEventListener('input', (e) => { ui.q = e.target.value; render(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && focusState) closeFocus(); });
    let last = phone();
    addEventListener('resize', () => { if (phone() !== last) { last = phone(); render(); } if (focusState) drawFocus(); });
    panZoom();
  }

  wire();
  load().catch((e) => { $('#board').replaceChildren(h('p', { style: 'padding:16px' }, `The canvas could not load its data: ${e.message}`)); });
})();
