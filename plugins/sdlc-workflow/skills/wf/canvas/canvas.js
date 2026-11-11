// The design canvas: every screen of one repo on one board.
//
// The design server serves this page at /r/<repo>/ with the data at ./state.json and the screen
// pages at ./s/screens/<key>.html, a saved version at ./versions/<workflow>/<id>/. A published snapshot sets window.WF_STATE and
// window.WF_SNAPSHOT (the page text of each screen), and has no write route.
//
// The file has two parts. `WF_CANVAS_LOGIC` holds the rules that need no browser: how a comment
// names its target, where a pin goes, how a dragged place is stored, what changed between two
// states. The tests load this part alone. The second part draws the canvas.

// eslint-disable-next-line no-var, no-unused-vars
var WF_CANVAS_LOGIC = (() => {
  'use strict';
  const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
  const clip = (s, max) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t; };

  // ---- the name of a comment's target

  const TAG_WORDS = {
    a: 'link', button: 'button', input: 'field', textarea: 'field', select: 'menu', img: 'image', svg: 'icon', picture: 'image',
    h1: 'heading', h2: 'heading', h3: 'heading', h4: 'heading', h5: 'heading', h6: 'heading', p: 'text', li: 'list item', label: 'label',
    nav: 'navigation', table: 'table', td: 'cell', th: 'cell', video: 'video', summary: 'toggle', dialog: 'dialog', form: 'form',
  };
  const ROLE_WORDS = {
    button: 'button', link: 'link', tab: 'tab', checkbox: 'checkbox', switch: 'switch', radio: 'radio button', textbox: 'field',
    searchbox: 'field', img: 'image', heading: 'heading', menuitem: 'menu item', dialog: 'dialog', listitem: 'list item',
    navigation: 'navigation', slider: 'slider', combobox: 'menu', option: 'option',
  };
  const TYPE_WORDS = { checkbox: 'checkbox', radio: 'radio button', button: 'button', submit: 'button', range: 'slider' };
  /** The plain word for what an element is, or '' when it is only a box. */
  function roleWord({ tag = '', role = '', type = '' } = {}) {
    const t = String(tag).toLowerCase();
    return ROLE_WORDS[String(role).toLowerCase()] || (t === 'input' && TYPE_WORDS[String(type).toLowerCase()]) || TAG_WORDS[t] || '';
  }
  /**
   * How a comment names its target: by what the element is and what it says, for example
   * `the button "Chrome"`. `d` is `{ tag, role, type, name, text, block }`: `name` is the accessible
   * name (aria-label, alt, placeholder), `text` the element's own text, `block` true for a box that
   * holds other elements. Null gives the fallback.
   */
  function targetName(d) {
    if (!d) return 'an element of the screen';
    const word = roleWord(d);
    const said = clip(d.name || d.text, 40);
    if (word && said) return `the ${word} "${said}"`;
    if (said) return `the ${d.block ? 'block' : 'text'} "${said}"`;
    if (word) return `the ${word}`;
    return 'an element of the screen';
  }
  /** The name of a target as the server keeps it with the anchor: one clean line of at most 80 characters, or null. */
  const anchorLabel = (label) => clip(String(label ?? '').replace(/[\u0000-\u001f\u007f]/g, ' '), 80) || null;
  /**
   * The target of a thread: the element as it is now when the page has it (`desc`), else the name
   * that the comment kept (`anchor.label`), else the fallback.
   */
  function threadTarget(desc, anchor) {
    if (desc) return targetName(desc);
    return anchorLabel(anchor?.label) || 'an element of the screen';
  }
  /** Where a thread is: `Default state, Phone viewport, on the button "Chrome"`. */
  function whereText(anchor, label) {
    const a = anchor || {};
    const cap1 = (s) => `${String(s)[0].toUpperCase()}${String(s).slice(1)}`;
    const on = a.selector ? `on ${label || 'an element of the screen'}` : (a.x === null || a.x === undefined ? 'on the whole screen' : 'at a point of the screen');
    return [`${cap1(a.state || 'default')} state`, a.viewport ? `${cap1(a.viewport)} viewport` : null, on].filter(Boolean).join(', ');
  }

  // ---- the place of a pin

  /**
   * The place of a thread's pin on a screen, in page pixels, or null when the pin does not show.
   * `rect` is the rectangle of the anchor's element in this viewport (`{ left, top, width, height }`,
   * page pixels), or null when the selector finds nothing. The element places the pin in every
   * viewport. The stored point is a fraction of the viewport that the comment was made in, so it
   * places the pin only there, and inside the element only while the point is still on it.
   */
  function pinPlace(anchor, viewport, size, rect) {
    const a = anchor || {};
    const has = a.x !== null && a.x !== undefined && a.y !== null && a.y !== undefined;
    const same = !a.viewport || a.viewport === viewport;
    const point = has && same ? { x: a.x * size.width, y: a.y * size.height } : null;
    if (rect && (rect.width > 0 || rect.height > 0)) {
      const inside = point && point.x >= rect.left && point.x <= rect.left + rect.width && point.y >= rect.top && point.y <= rect.top + rect.height;
      return inside ? point : { x: rect.left + Math.min(12, rect.width / 2), y: rect.top + Math.min(12, rect.height / 2) };
    }
    return point;
  }

  // ---- a dragged place

  // A dragged place is saved in the units of one reference row height, so the same place fits
  // every viewport of the dock: a card that sits at row 2.5 of a column stays at row 2.5 when the
  // cards grow taller. The reference is a 1280x800 screen on a 300 px card.
  const LABEL_H = 56;
  const REF_PITCH = 188 + 64 + 32;
  const toStored = (p, pitch) => ({ x: Math.round(p.x), y: Math.round(LABEL_H + (p.y - LABEL_H) * REF_PITCH / pitch) });
  const fromStored = (p, pitch) => ({ x: Math.round(p.x), y: Math.round(LABEL_H + (p.y - LABEL_H) * pitch / REF_PITCH) });
  /** A press that moved less than this many pixels is a click: it opens the screen and pins nothing. */
  const DRAG_SLOP = 4;
  const isDrag = (dx, dy) => Math.hypot(dx, dy) >= DRAG_SLOP;
  /** The body of the layout write that deletes every dragged place. */
  const resetBody = (screens) => ({ positions: Object.fromEntries((screens || []).filter((s) => s.position).map((s) => [s.key, null])) });
  /** The columns that a group of `n` cards takes when a column holds at most `maxRows`. */
  const columnsFor = (n, maxRows) => Math.max(1, Math.ceil(n / maxRows));

  // ---- drafts

  /**
   * What the person typed and did not send yet, by key (`<screen>|new`, `<screen>|<thread>`).
   * A redraw, a live update and a reload of the page read the text back from here. `storage` is a
   * Storage or null; `name` is the storage key.
   */
  function createDrafts(storage = null, name = 'wf-canvas-drafts') {
    let map = {};
    try { map = JSON.parse(storage?.getItem(name) || '{}') || {}; } catch { map = {}; }
    if (typeof map !== 'object' || Array.isArray(map)) map = {};
    const save = () => { try { storage?.setItem(name, JSON.stringify(map)); } catch { /* the drafts last for this visit */ } };
    return {
      get: (key) => map[key] ?? '',
      set(key, text) { if (text) map[key] = String(text); else delete map[key]; save(); },
      clear(key) { delete map[key]; save(); },
      any: () => Object.values(map).some((t) => String(t).trim()),
      keys: () => Object.keys(map).filter((k) => String(map[k]).trim()),
    };
  }

  // ---- changes

  /** Two changes that wait together: every page and part that either names. */
  function mergeChange(a, b) {
    if (!a) return b;
    if (!b) return a;
    return { all: Boolean(a.all || b.all), catchUp: Boolean(a.catchUp || b.catchUp), pages: [...new Set([...(a.pages || []), ...(b.pages || [])])], parts: [...new Set([...(a.parts || []), ...(b.parts || [])])] };
  }
  /**
   * What differs between the state that the canvas holds and a newer one, for a canvas that was
   * away: the screens whose page changed or is new (`pages`), the screens that are gone
   * (`removed`), `all` when the token sheet or the component sheet changed (`sheets.fingerprint`),
   * and `lanes` when a sketch or a component did.
   */
  function diffStates(old, next) {
    const was = new Map((old?.screens || []).map((s) => [s.key, s.fingerprint]));
    const now = new Set((next?.screens || []).map((s) => s.key));
    const j = (v) => JSON.stringify(v ?? null);
    return {
      pages: (next?.screens || []).filter((s) => was.get(s.key) !== s.fingerprint).map((s) => s.key),
      removed: [...was.keys()].filter((k) => !now.has(k)),
      // Every page links the token sheet and the component sheet: a new fingerprint of the sheets is a new look of every screen.
      all: j(old?.tokens) !== j(next?.tokens) || (old?.sheets?.fingerprint ?? null) !== (next?.sheets?.fingerprint ?? null),
      lanes: j([old?.explore, old?.components, old?.references]) !== j([next?.explore, next?.components, next?.references]),
    };
  }

  // ---- the design system

  /** The kinds of tokens in the order the Tokens lane shows them. */
  const TOKEN_KIND_ORDER = ['color', 'font', 'type', 'weight', 'leading', 'space', 'size', 'radius', 'shadow', 'motion', 'layer', 'other'];
  /** The kind of a token named alone, for a token sheet from before the token model. */
  function kindOfToken(name) {
    const n = String(name ?? '').replace(/^--/, '').toLowerCase();
    if (/^(?:space|gap|inset|pad|padding|margin|gutter)(?:-|$)/.test(n)) return 'space';
    if (/^(?:radius|rounded|corner|round)(?:-|$)/.test(n)) return 'radius';
    if (/^(?:font|family|face)(?:-|$)/.test(n)) return 'font';
    if (/^(?:type|fs|font-size)(?:-|$)/.test(n)) return 'type';
    if (/^(?:weight|fw)(?:-|$)/.test(n)) return 'weight';
    if (/^(?:leading|line|lh)(?:-|$)/.test(n)) return 'leading';
    if (/^(?:shadow|elevation)(?:-|$)/.test(n)) return 'shadow';
    if (/^(?:duration|ease|easing|motion|delay)(?:-|$)/.test(n)) return 'motion';
    if (/^(?:z|layer)(?:-|$)/.test(n)) return 'layer';
    if (/^(?:size|width|height|icon|control|target|avatar)(?:-|$)/.test(n)) return 'size';
    return 'other';
  }
  /**
   * The tokens in groups by kind, in TOKEN_KIND_ORDER, each group in the order of the model: `[{ kind,
   * tokens }]`. A token with no known kind goes to `other`; a group with no token does not show.
   */
  function tokenGroups(tokens) {
    const by = new Map(TOKEN_KIND_ORDER.map((k) => [k, []]));
    for (const t of tokens || []) {
      const k = TOKEN_KIND_ORDER.includes(t?.kind) ? t.kind : (t?.kind ? 'other' : kindOfToken(t?.name));
      by.get(k).push(t);
    }
    return [...by].filter(([, list]) => list.length).map(([kind, list]) => ({ kind, tokens: list }));
  }
  /** The value of a token in each theme, in the order of the themes: `[{ theme, value }]`. */
  function themeValues(t, themes) {
    const values = t?.values || {};
    const names = (themes || []).map((x) => x.name).filter((n) => n in values);
    return names.length ? names.map((n) => ({ theme: n, value: values[n] })) : [{ theme: null, value: t?.value ?? '' }];
  }
  /** The mark of a thread that a reviewer agent opened (its first author is `review:<model>`): 'Review', else null. */
  const reviewMark = (t) => (/^review:/.test(String(t?.comments?.[0]?.author ?? '')) ? 'Review' : null);
  /** The mark of a component spec: null when it lacks nothing, else 'No spec' or the count of its gaps. */
  function specMark(c) {
    const problems = c?.problems || [];
    if (!problems.length) return null;
    if (problems.some((p) => p.cause === 'no-spec' || p.cause === 'no-page')) return 'No spec';
    return plural(problems.length, 'gap');
  }

  // ---- what needs the person

  /** True when a screen waits for a decision: it has a draft round after its last approval, or no approval. */
  const needsDecision = (screen, hasDraft) => screen?.exists !== false && (Boolean(hasDraft) || !(screen?.approvals || []).length);
  /** The words of a count of failing checks: one number for one thing, on the card and in the view. */
  const failText = (n) => `${plural(n, 'check')} fail${n === 1 ? 's' : ''}`;

  // ---- the screen view

  /** The scale that fits panes of `widths` and one of `height` into the room, never above 100 %. */
  function fitScale({ availW, availH = Infinity, widths, height, gap = 24 }) {
    const total = widths.reduce((a, b) => a + b, 0);
    const byW = (availW - (widths.length - 1) * gap) / total;
    const s = Math.min(1, byW, availH / height);
    return Math.max(0.05, Number.isFinite(s) ? s : 1);
  }
  /** The address of an open screen, so Back closes the view and a link opens one screen. */
  const hashOf = (f) => `#screen=${encodeURIComponent(f.key)}&viewport=${encodeURIComponent(f.viewport)}&state=${encodeURIComponent(f.state)}`;
  function parseHash(hash) {
    const p = new URLSearchParams(String(hash || '').replace(/^#/, ''));
    const key = p.get('screen');
    return key ? { key, viewport: p.get('viewport') || null, state: p.get('state') || null } : null;
  }
  /** The size of a viewport: `"375x812"` → `{ width, height }`; a value of another form gives the default. */
  function parseSize(text) {
    const m = /^(\d+)\s*[x×]\s*(\d+)$/i.exec(String(text ?? '').trim());
    return m && Number(m[1]) > 0 && Number(m[2]) > 0 ? { width: Number(m[1]), height: Number(m[2]) } : { width: 1280, height: 800 };
  }

  /** The next wait before the event stream opens again: 5 s, then twice as long each time, at most a minute. */
  const reopenDelay = (tries) => Math.min(60000, 5000 * 2 ** Math.max(0, Math.min(tries, 10)));

  return { plural, clip, roleWord, targetName, anchorLabel, threadTarget, reopenDelay, whereText, pinPlace, LABEL_H, REF_PITCH, toStored, fromStored, DRAG_SLOP, isDrag, resetBody, columnsFor, createDrafts, mergeChange, diffStates, TOKEN_KIND_ORDER, tokenGroups, themeValues, specMark, reviewMark, needsDecision, failText, fitScale, hashOf, parseHash, parseSize };
})();

(() => {
  'use strict';
  if (typeof document === 'undefined') return;
  const L = WF_CANVAS_LOGIC;
  const { plural } = L;
  const SNAP = window.WF_SNAPSHOT || null;
  const BASE = SNAP ? '' : location.pathname.replace(/[^/]*$/, '');
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  // `fk` is the focus key of a control: a redraw gives the focus back to the control with the same key.
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'fk') el.dataset.fk = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };
  const params = new URLSearchParams(location.search);
  const ui = { view: 'grid', viewport: null, state: 'default', q: '', area: '', workflow: params.get('workflow') || '', waiting: false, fresh: false, open: false, failing: false, zoom: 1, x: 24, y: 24, panel: null, fitted: false, version: '', trace: null, hover: null, dragging: 0, confirm: '' };
  let data = null;
  // The ETag of the state that the canvas holds, the time it loaded, and the token that a write carries.
  let stateEtag = null;
  let loadedAt = null;
  let token = null;
  // The last design audit of the repo (./audit.json): a read-only agent's report, not a check.
  let audit = null;
  const phone = () => matchMedia('(max-width: 720px)').matches;
  const CARD_BASE = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-w')) || 300;
  const GAP_X = 64;
  const GAP_Y = 32;
  const LABEL_H = L.LABEL_H;
  const CAPTION_H = 64;
  // A column of the Areas layout holds at most this many screens; a larger group takes more columns.
  const MAX_ROWS = 6;
  const cap = (s) => (s ? `${String(s)[0].toUpperCase()}${String(s).slice(1)}` : '');
  const CHECK_NAMES = {
    contrast: 'Contrast', 'target-size': 'Target size', 'viewport-fit': 'Viewport fit', 'worst-case': 'Worst-case content', states: 'Missing states',
    display: 'Display bug', overlap: 'Overlapping text', token: 'Not a token', component: 'Not a component', script: 'Script error', version: 'Not a saved version', focus: 'Focus',
  };
  const DIMENSION_NAMES = { accessibility: 'Accessibility', performance: 'Performance', theming: 'Theming', responsive: 'Responsive', integrity: 'Integrity' };
  /** The audit findings of one screen, when the last audit is done. */
  const auditOf = (key) => (audit?.status === 'done' ? (audit.findings || []).filter((f) => f.screen === key) : []);

  function say(text) {
    const s = $('#status');
    s.textContent = text;
    s.classList.add('show');
    clearTimeout(say.t);
    say.t = setTimeout(() => s.classList.remove('show'), 2600);
  }
  const vp = (name = ui.viewport) => L.parseSize(data?.viewports?.[name]);
  /** The second line of a screen: its key, its flow and its workflows. */
  const metaOf = (s) => [s.key, s.flow ? `${s.flow} flow` : null, (s.workflows || []).length ? `from ${s.workflows.join(', ')}` : null].filter(Boolean).join(', ');
  const titleOf = (s) => s?.title || s?.key || 'Screen';
  const day = (t) => String(t ?? '').slice(0, 10);
  const clock = (t) => (t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '');

  // The height of the window, read once for each width: the bar of a phone browser hides while the
  // person scrolls, and the list must not change its sizes then.
  function roomH() {
    const w = document.documentElement.clientWidth;
    if (roomH.w !== w) { roomH.w = w; roomH.h = window.innerHeight; }
    return roomH.h;
  }
  // The sizes of one draw: the width of a card, the height of its frame, the step between two rows.
  let M = null;
  function measure() {
    const ph = phone();
    const v = vp();
    const cardW = ph ? Math.max(200, document.documentElement.clientWidth - 32) : CARD_BASE;
    const full = Math.round(cardW * v.height / v.width);
    // On a phone a card shows the top of a tall screen: the list stays a list.
    const frameH = ph ? Math.min(full, Math.round(roomH() * 0.6)) : full;
    M = { phone: ph, v, cardW, laneW: ph ? cardW : 220, frameH, cardH: frameH + CAPTION_H, pitch: frameH + CAPTION_H + GAP_Y, scale: cardW / v.width };
    return M;
  }

  // ------------------------------------------------------------ notices

  // The lines that stay until their cause ends: no connection, a restarted server, updates that
  // wait, a version of the past on the board. Each has an id, a text and up to one button.
  const notices = new Map();
  function notice(id, text, action = null) {
    const was = notices.get(id);
    if (was && was.text === text) return;
    notices.set(id, { text, action });
    drawNotices();
  }
  function unnotice(id) {
    if (notices.delete(id)) drawNotices();
  }
  function drawNotices() {
    $('#notice').replaceChildren(...[...notices].map(([id, n]) => h('div', { class: `note ${id}` }, h('span', {}, n.text),
      n.action ? h('button', { type: 'button', class: 'btn', onclick: n.action.run }, n.action.text) : null)));
  }

  // ------------------------------------------------------------ versions

  // A round is a draft on the way to a decision; an approved version is the decision. A ref is
  // `<workflow>/<id>`, and a snapshot has none, because only the server holds the pages.
  // The list is built once for each state.
  let versionsHeld = null;
  function allVersions() {
    if (SNAP) return [];
    if (versionsHeld) return versionsHeld;
    const out = [];
    for (const [workflow, list] of Object.entries(data.versions || {})) {
      const last = list.approved.at(-1)?.number ?? 0;
      for (const v of [...list.approved, ...list.rounds]) {
        const draft = v.kind === 'round';
        out.push({ ...v, ref: `${workflow}/${v.id}`, name: draft ? `v${v.number} round ${v.round}` : v.id, draft, pending: draft && v.number > last, open: list.open });
      }
    }
    versionsHeld = out.sort((a, b) => String(b.at).localeCompare(String(a.at)) || b.number - a.number || (b.round ?? 0) - (a.round ?? 0));
    return versionsHeld;
  }
  const versionAt = (ref) => (ref ? allVersions().find((v) => v.ref === ref) ?? null : null);
  const longName = (v) => (Object.keys(data.versions || {}).length > 1 ? `${v.workflow} ${v.name}` : v.name);
  const draftName = (v) => (v.draft ? `Draft: ${longName(v)}` : longName(v));
  /** The newest draft that changed a screen after its last approval. */
  let draftsHeld = null;
  function draftOf(s) {
    if (!draftsHeld) {
      draftsHeld = new Map();
      for (const v of allVersions()) if (v.pending) for (const key of v.changed || []) if (!draftsHeld.has(key)) draftsHeld.set(key, v);
    }
    return draftsHeld.get(s.key) ?? null;
  }
  /** True when a screen waits for the person's decision. */
  const waits = (s) => L.needsDecision(s, draftOf(s));
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
    drawPast();
  }
  /** A version of the past on the board says so, with the way back. */
  function drawPast() {
    const past = versionAt(ui.version);
    if (past) notice('past', `The board shows ${draftName(past)}, not the screens as they are now. Comments and checks are of the screens as they are now.`, { text: 'Back to now', run: () => { ui.version = ''; $('#version').value = ''; drawPast(); render(); } });
    else unnotice('past');
  }
  /** Put a version back on the surface. The server saves it as a new round, never as an approval. */
  async function restore(v) {
    const j = await send(`versions/${v.workflow}/restore`, { id: v.id });
    if (focusState) { focusState.restoring = ''; focusState.compare = ''; }
    await load();
    say(j.tokensDiffer ? 'Restored as a new round. The token sheet stays as it is now.' : 'Restored as a new round. It needs a new approval.');
  }
  /** The versions of one screen: the drafts in progress, then each approved version with its rounds. */
  function versionList(s, f) {
    const held = allVersions().filter((v) => v.screens.some((e) => e.key === s.key));
    if (!held.length) return null;
    const row = (v) => {
      const key = `restore:${v.ref}`;
      return h('div', { class: `version${f.compare === v.ref ? ' on' : ''}` },
        h('div', { class: 'cap-row' }, h('span', { class: v.draft ? 'mark draft' : 'mark ok' }, v.draft ? 'Draft' : ''), h('b', {}, longName(v)), h('small', {}, day(v.at))),
        v.reason ? h('p', {}, v.reason) : null,
        h('div', { class: 'acts' },
          h('button', { type: 'button', class: 'btn quiet', fk: `cmp:${v.ref}`, 'aria-pressed': String(f.compare === v.ref), onclick: () => { f.compare = f.compare === v.ref ? '' : v.ref; drawFocus(); } }, 'Compare'),
          data.writable && v.open ? h('button', { type: 'button', class: 'btn quiet', fk: key, disabled: busy.has(key),
            onclick: () => { if (f.restoring === v.ref) act(key, () => restore(v), drawFocus); else { f.restoring = v.ref; drawFocus(); } } }, busy.has(key) ? 'Restoring…' : f.restoring === v.ref ? 'Confirm: put these screens back' : 'Restore') : null,
          f.restoring === v.ref && !busy.has(key) ? h('button', { type: 'button', class: 'btn quiet', fk: `norestore:${v.ref}`, onclick: () => { f.restoring = ''; drawFocus(); } }, 'Cancel') : null),
        failLine(key, () => act(key, () => restore(v), drawFocus)));
    };
    const under = (v) => held.filter((r) => r.draft && r.workflow === v.workflow && r.number === v.number);
    const waiting = held.filter((v) => v.pending);
    const approved = held.filter((v) => !v.draft);
    return [
      waiting.length ? [h('h4', {}, 'Rounds in progress'), ...waiting.map(row)] : null,
      ...approved.map((v) => [row(v), under(v).length ? h('details', { class: 'rounds', open: f.rounds.includes(v.ref),
        ontoggle: (e) => { f.rounds = e.target.open ? [...new Set([...f.rounds, v.ref])] : f.rounds.filter((x) => x !== v.ref); } },
      h('summary', {}, plural(under(v).length, 'round')), ...under(v).map(row)) : null]),
    ];
  }

  // ------------------------------------------------------------ writes

  // A write that runs, by key, and the last failure of each key. A control with a key shows
  // progress, cannot send twice, and offers Retry after a failure.
  const busy = new Set();
  const fails = new Map();
  async function act(key, fn, redraw = () => {}) {
    if (busy.has(key)) return;
    busy.add(key);
    fails.delete(key);
    redraw();
    try { await fn(); } catch (e) { fails.set(key, { text: e?.message || 'it failed', fix: e?.fix || null }); } finally { busy.delete(key); redraw(); }
  }
  /** The failure of a write: the reason, what to do about it on a second line when the server says, and Retry. */
  const failLine = (key, retry, lead = 'Not saved') => (fails.has(key) ? h('p', { class: 'fail', role: 'alert' }, `${lead}: ${fails.get(key).text}. `,
    retry ? h('button', { type: 'button', class: 'linkish', fk: `retry:${key}`, onclick: retry }, 'Retry') : null,
    fails.get(key).fix ? h('span', { class: 'fix' }, fails.get(key).fix) : null) : null);
  /** Read the write token again: a restarted server has a new one. */
  async function refreshToken() {
    try {
      const r = await fetch(`${BASE}state.json`, { cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      if (j?.writeToken) token = j.writeToken;
    } catch { /* the write says why it failed */ }
  }
  /** One write to the server. It throws with the reason when the server refuses or does not answer. */
  async function send(path, body) {
    const go = () => fetch(`${BASE}${path}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-wf-canvas': token } : {}) }, body: JSON.stringify(body) });
    let r = null;
    try {
      r = await go();
      // A refused write can be a token of the server before its restart: read the new one, and try once more.
      if (r.status === 403) { await refreshToken(); r = await go(); }
    } catch { throw new Error('the design server did not answer'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      // A refused write says why (`reason`), and sometimes what to do (`fix.do`).
      const e = new Error(String(j.reason || `the server answered ${r.status}`).replace(/[.\s]+$/, ''));
      e.fix = typeof j.fix?.do === 'string' ? j.fix.do : null;
      throw e;
    }
    return j;
  }
  /** A failure as one toast: the reason, then what to do. */
  const failToast = (lead, e) => say(`${lead}: ${e.message}.${e.fix ? ` ${e.fix}` : ''}`);

  // ------------------------------------------------------------ data

  // The failures of each screen that the screen view opened: the state holds only their counts.
  const failCache = new Map();
  let failEpoch = 0;
  function failuresFor(s) {
    if (s.failures) return { failures: s.failures, failureGroups: s.failureGroups };
    if (SNAP) return { failures: [], failureGroups: [] };
    const held = failCache.get(s.key);
    if (held) return held === 'loading' ? null : held;
    failCache.set(s.key, 'loading');
    const epoch = failEpoch;
    const done = (value) => { if (epoch !== failEpoch) return; failCache.set(s.key, value); if (focusState?.key === s.key) drawFocus(); };
    fetch(`${BASE}failures/${s.key}.json`, { cache: 'no-store' })
      .then(async (r) => { const j = await r.json().catch(() => null); if (!r.ok || !j || !Array.isArray(j.failures)) throw new Error(j?.reason || `the server answered ${r.status}`); return j; })
      .then(done, (e) => done({ error: e?.message || 'no answer' }));
    return null;
  }

  // The places of cards that were dragged and are not saved yet, by screen key.
  const moved = new Map();
  let lanesSig = '';
  /** Load the state and draw. With `ifChanged`, a state that the canvas holds already changes nothing, and the answer is false. */
  async function load({ ifChanged = false } = {}) {
    // The state and the audit load at the same time; the board draws once, when both are here.
    const [got] = await Promise.all([
      window.WF_STATE ? { state: window.WF_STATE, etag: null } : fetch(`${BASE}state.json`, { cache: 'no-cache' }).then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) throw new Error(j?.reason || `the server answered ${r.status}`);
        return { state: j, etag: r.headers.get('etag') };
      }, () => { throw new Error('the design server did not answer'); }),
      SNAP ? null : fetchAudit(),
    ]);
    if (ifChanged && got.etag && got.etag === stateEtag) { loadedAt = Date.now(); unnotice('load'); return false; }
    const state = got.state;
    // A state of another shape never replaces the board that shows.
    if (!state || !Array.isArray(state.screens) || !state.viewports) throw new Error('the server sent no board');
    failEpoch += 1;
    failCache.clear();
    versionsHeld = null;
    draftsHeld = null;
    data = state;
    stateEtag = got.etag;
    loadedAt = Date.now();
    if (data.writeToken) token = data.writeToken;
    for (const k of ['explore', 'references', 'tokens', 'components', 'decisions', 'cards', 'areas', 'workflows', 'states']) if (!Array.isArray(data[k])) data[k] = [];
    for (const sc of data.screens) { sc.threads ||= []; if (moved.has(sc.key)) sc.position = moved.get(sc.key); }
    lanesSig = JSON.stringify([data.explore, data.references, data.components, data.noComponents, data.tokens, data.screens.map((s) => s.tokens)]);
    seenInit();
    draftsInit();
    if (!SNAP) pollAudit();
    $('#loading')?.remove();
    $('#loaderror')?.remove();
    unnotice('load');
    // The server could not commit the design records after a write: the comment is saved, the commit is not.
    const lost = data.recordsCommit?.failed || (data.recordsCommit?.ok === false ? data.recordsCommit : null);
    if (lost) notice('records', `Your change is saved, but the commit of the design records failed${lost.reason ? `: ${lost.reason}` : ''}. Tell the agent.`);
    else unnotice('records');
    // The list of screens does not read: the board is not empty, it is broken.
    if (data.manifestFault) notice('manifest', `The screens are not shown, because the list of screens cannot be read: ${data.manifestFault}. Tell the agent.`);
    else unnotice('manifest');
    $('#repo').textContent = data.repo || 'Design canvas';
    document.title = `${data.repo || 'Design'} canvas`;
    const names = Object.keys(data.viewports);
    if (!names.includes(ui.viewport)) ui.viewport = phone() && names.includes('phone') ? 'phone' : names.includes('desktop') ? 'desktop' : names[0];
    if (!data.states.includes(ui.state)) ui.state = data.states[0] || 'default';
    // A phone has no room for the size in the dock; the screen view shows it.
    fill($('#viewport'), names.map((n) => [n, phone() ? cap(n) : `${cap(n)} ${String(data.viewports[n]).replace('x', '×')}`]), ui.viewport);
    fill($('#area'), [['', 'All areas'], ...data.areas.map((a) => [a, cap(a)])], ui.area);
    // A workflow of the address that the repo does not have filters nothing.
    if (ui.workflow && !data.workflows.includes(ui.workflow)) { say(`No workflow ${ui.workflow} on this board`); ui.workflow = ''; }
    fill($('#workflow'), [['', 'All workflows'], ...data.workflows.map((w) => [w, w])], ui.workflow);
    drawVersions();
    drawStates();
    drawHealth();
    filterCount();
    barHeight();
    render();
    if (ui.panel) panel(ui.panel, true);
    if (focusState) drawFocus();
    return true;
  }
  /** The board could not load: say why, keep what shows, and offer Retry. */
  function loadFailed(e) {
    const text = `The canvas could not load its data: ${e?.message || 'no reason'}.`;
    const retry = () => load().catch(loadFailed);
    if (data) { notice('load', `${text} The board shows the screens as of ${clock(loadedAt)}.`, { text: 'Retry', run: retry }); return; }
    $('#loading')?.remove();
    $('#loaderror')?.remove();
    $('#board').append(h('div', { class: 'empty', id: 'loaderror', role: 'alert' }, h('b', {}, 'The board did not load'), text, ' ',
      h('button', { type: 'button', class: 'btn', onclick: retry }, 'Retry')));
  }
  /** Fill a select, and keep it as it is when nothing differs: an open list stays open. */
  function fill(sel, rows, value) {
    const sig = JSON.stringify(rows);
    if (sel.dataset.sig !== sig) {
      sel.dataset.sig = sig;
      sel.replaceChildren(...rows.map(([v, t]) => h('option', { value: v }, t)));
    }
    sel.value = value ?? '';
  }
  /** The states of the dock: a row of buttons, and one select on a phone. The buttons stay, so the focus stays. */
  function drawStates() {
    const box = $('#states');
    if (box.dataset.sig !== data.states.join('|')) {
      box.dataset.sig = data.states.join('|');
      box.replaceChildren(...data.states.map((s) => h('button', { type: 'button', 'data-state': s, onclick: () => setState(s) }, cap(s))));
    }
    for (const b of box.children) { b.classList.toggle('on', b.dataset.state === ui.state); b.setAttribute('aria-pressed', String(b.dataset.state === ui.state)); }
    fill($('#state'), data.states.map((s) => [s, `${cap(s)} state`]), ui.state);
  }
  function setState(s) {
    ui.state = s;
    drawStates();
    render();
  }
  function filterCount() {
    const n = [ui.area, ui.workflow, ui.waiting, ui.fresh, ui.open, ui.failing].filter(Boolean).length;
    const c = $('#fcount');
    c.textContent = String(n);
    c.hidden = n === 0;
    $('#filters > summary').setAttribute('aria-label', n ? `Filter, ${plural(n, 'filter')} on` : 'Filter');
  }
  function barHeight() {
    const bar = $('.bar');
    document.documentElement.style.setProperty('--bar-h', `${bar.offsetHeight}px`);
    // On a phone the bar sticks at the row of the review control: the rows above it scroll away.
    document.documentElement.style.setProperty('--bar-stick', phone() ? `${-Math.max(0, $('#health').offsetTop - 8)}px` : '0px');
  }
  const screenUrl = (key, state, at = null) => (SNAP ? null : at ? `${BASE}${at.includes('/') ? 'versions' : 'at'}/${at}/screens/${key}.html?state=${state}` : `${BASE}s/screens/${key}.html?state=${state}`);
  // A snapshot screen has no query string, so the state is set after the page's own script.
  const snapDoc = (key, state) => {
    const page = SNAP.screens[key] || '';
    const add = `<style>${String(SNAP.tokens || '').replace(/<\/style/gi, '<\\/style')}</style><script>document.documentElement.dataset.state=${JSON.stringify(state)}<\/script>`;
    const at = page.search(/<\/head>/i);
    // A function as the second part: a `$` of the token sheet stays a `$`.
    return at < 0 ? `${add}${page}` : `${page.slice(0, at)}${add}${page.slice(at)}`;
  };
  /** True when a frame holds an answer of the server that is not a page: the file is gone. */
  const notPage = (f) => { try { const t = f.contentDocument?.contentType; return Boolean(t) && !/html|xml/.test(t); } catch { return false; } };
  const missingText = (at) => (at ? 'This screen is not in the saved version.' : 'The file of this screen is gone.');
  function frameFor(key, state, at = null) {
    // A screen is an artboard, not a window: a scrollbar would take width from the page.
    const f = h('iframe', { title: key, tabindex: '-1', scrolling: 'no', 'data-state': state, sandbox: SNAP ? 'allow-scripts' : 'allow-scripts allow-same-origin' });
    if (SNAP) f.srcdoc = snapDoc(key, state);
    else {
      f.src = screenUrl(key, state, at);
      f.addEventListener('load', () => {
        if (notPage(f)) { f.replaceWith(h('div', { class: 'missing', style: `width:${f.style.width};height:${f.style.height};transform:${f.style.transform}` }, h('span', {}, missingText(at)))); return; }
        // The state can change before the page loads; the page then shows the state of the frame.
        try { f.contentDocument.documentElement.dataset.state = f.dataset.state; } catch { /* no access */ }
      });
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
  // page only while it is near the view, and at most MAX_LIVE frames hold a page at a time: the
  // others show the name of their screen and load when a page leaves the view. Zoomed far out, a
  // screen shows its approval picture when that still shows its page, else its name.
  // A frame has `make`, which makes its page, `pic`, and `name`.
  const FAR = 0.35;
  const MAX_LIVE = 48;
  let watcher = null;
  let wasFar = false;
  function watch(frame) {
    const root = phone() ? null : $('#stage');
    if (watcher?.root !== root) {
      watcher?.io.disconnect();
      const io = new IntersectionObserver((entries) => {
        let freed = false;
        for (const e of entries) { e.target.near = e.isIntersecting; if (fillFrame(e.target)) freed = true; }
        if (freed) fillWaiting();
      }, { root, rootMargin: '25%' });
      watcher = { root, io };
      for (const f of $$('#board .frame')) if (f.make && f !== frame) io.observe(f);
    }
    watcher.io.observe(frame);
  }
  function unwatch(el) {
    for (const f of el.matches('.frame') ? [el] : $$('.frame', el)) watcher?.io.unobserve(f);
  }
  const liveCount = () => $$('#board > .card > .frame[data-fill="live"]').length;
  /**
   * Give a frame what its place asks for: nothing away from the view, the picture or the name far
   * out, else the page. Returns true when a page left the board, so a frame that waits can load.
   */
  function fillFrame(frame) {
    const far = ui.zoom < FAR && !phone();
    let want = !frame.near ? 'none' : far ? (frame.pic ? 'pic' : frame.name ? 'name' : 'live') : 'live';
    const was = frame.dataset.fill;
    if (want === 'live' && was !== 'live' && frame.name && liveCount() >= MAX_LIVE) want = 'wait';
    if (was === want) return false;
    frame.dataset.fill = want;
    frame.querySelector(':scope > iframe, :scope > img.pic, :scope > .ph, :scope > .missing')?.remove();
    if (want === 'live') frame.append(frame.make());
    else if (want === 'pic') frame.append(h('img', { class: 'pic', src: frame.pic, alt: '' }));
    else if (want === 'name' || want === 'wait') frame.append(h('span', { class: 'ph' }, frame.name));
    return was === 'live';
  }
  /** Load the frames that waited for room. */
  function fillWaiting() {
    for (const f of $$('#board .frame[data-fill="wait"]')) { if (liveCount() >= MAX_LIVE) break; fillFrame(f); }
  }
  /** After a zoom across the far line, swap the pages, the pictures and the names. */
  function zoomFill() {
    const far = ui.zoom < FAR;
    if (far === wasFar) return;
    wasFar = far;
    for (const f of $$('#board .frame')) if (f.make) fillFrame(f);
    fillWaiting();
  }

  // ------------------------------------------------------------ the board

  function matches(s) {
    const q = ui.q.toLowerCase();
    if (q && ![s.key, s.title, s.area, s.flow].some((v) => String(v || '').toLowerCase().includes(q))) return false;
    if (ui.area && s.area !== ui.area) return false;
    if (ui.workflow && !(s.workflows || []).includes(ui.workflow)) return false;
    if (ui.waiting && !waits(s)) return false;
    if (ui.fresh && !unseenOf(s)) return false;
    if (ui.open && !s.openComments) return false;
    if (ui.failing && !failTotal(s)) return false;
    // A traced token or component leaves only the screens that use it.
    const t = ui.hover || ui.trace;
    if (t && !((t.kind === 'token' ? s.tokens : s.components) || []).includes(t.key)) return false;
    return true;
  }
  const traceId = (t) => (t ? `${t.kind}:${t.key}` : '');
  /**
   * Leave out the cards that the search box, the filters and the trace do not match, with no new
   * screen frame: dimmed on the board, hidden in the list of a phone. The bar says how many show.
   */
  function applyFilter() {
    if (!data) return;
    const list = boardScreens();
    const byKey = new Map(list.map((s) => [s.key, s]));
    const shown = new Set(list.filter(matches).map((s) => s.key));
    for (const card of $$('#board > .card')) card.classList.toggle('dim', byKey.has(card.dataset.key) && !shown.has(card.dataset.key));
    // On a phone a heading with no screen under it goes too.
    for (const label of $$('#board > .area-label')) label.classList.toggle('dim', Boolean(label.keys) && !label.keys.some((k) => shown.has(k)));
    const on = traceId(ui.hover || ui.trace);
    for (const el of $$('[data-trace]')) el.classList.toggle('on', el.dataset.trace === on);
    const out = $('#shown');
    const filtered = shown.size !== list.length;
    out.hidden = !filtered;
    out.textContent = filtered ? (shown.size ? `${shown.size} of ${plural(list.length, 'screen')}` : 'No screen matches') : '';
    $('#nomatch')?.remove();
    if (filtered && !shown.size && list.length) {
      $('#board').append(h('div', { class: 'empty nomatch', id: 'nomatch' }, h('b', {}, 'No screen matches'), 'The search and the filters leave no screen. ',
        h('button', { type: 'button', class: 'btn', onclick: clearFilters }, 'Show every screen')));
    }
  }
  function clearFilters() {
    Object.assign(ui, { q: '', area: '', workflow: '', waiting: false, fresh: false, open: false, failing: false, trace: null, hover: null });
    $('#q').value = '';
    $('#area').value = '';
    $('#workflow').value = '';
    for (const id of ['waiting', 'fresh', 'open', 'failing']) $(`#${id}`).checked = false;
    $('#trace').hidden = true;
    filterCount();
    drawVersions();
    barHeight();
    applyFilter();
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

  /** The second line of a slice row: its screens, its approval, its checks and its comments. */
  const sliceSummary = (c, n) => [plural(n, 'screen'),
    c.approval ? 'Approved' : 'Not approved',
    c.checks ? (c.checks.passed ? 'Checks pass' : L.failText(c.checks.failures)) : null,
    c.openComments ? plural(c.openComments, 'open comment') : null].filter(Boolean).join(' · ');
  /**
   * The automatic place of each screen: columns by area, rows by flow, or rows by slice, in flow
   * order. `places` holds every card of the board in the order of a walk. In the slices layout a
   * screen of two slices shows in both rows, and `pos` holds its first place. Each label holds the
   * keys of its screens.
   */
  function autoLayout(list) {
    const w = M.cardW + GAP_X;
    const pos = {};
    const places = [];
    const labels = [];
    if (ui.view === 'slice') {
      const shown = new Set(list.map((s) => s.key));
      let y = 0;
      const row = (text, sub, keys) => {
        labels.push({ text, sub, x: 0, y, slug: true, keys, width: Math.max(1, keys.length) * w - GAP_X });
        keys.forEach((key, i) => { const p = { x: i * w, y: y + LABEL_H }; places.push({ key, ...p }); pos[key] ??= p; });
        y += M.cardH + LABEL_H + 48;
      };
      for (const c of data.cards) {
        const keys = c.screens.map((x) => x.key).filter((k) => shown.has(k));
        if (keys.length) row(`${c.workflow}${c.slice && !String(c.slice).startsWith('(') ? `, slice ${c.slice}` : ''}`, sliceSummary(c, keys.length), keys);
      }
      const rest = list.filter((s) => !(s.key in pos)).map((s) => s.key);
      if (rest.length) row('No slice', plural(rest.length, 'screen'), rest);
      return { pos, places, labels };
    }
    // A screen with no area groups with the screens of its flow, so "No area" holds only what has neither.
    const NONE = '\u0000';
    const groupKey = ui.view === 'flow' ? (s) => s.flow || NONE : (s) => s.area || (s.flow ? `\u0001${s.flow}` : NONE);
    const nameOf = (g) => (g === NONE ? (ui.view === 'flow' ? 'No flow' : 'No area') : g.startsWith('\u0001') ? `${cap(g.slice(1))} flow` : cap(g));
    // Areas follow the manifest's list, the order of the product's navigation. A flow follows
    // the area of its first screen. A screen with no area or no flow goes last.
    const areaRank = (a) => { const i = (data.areas || []).indexOf(a); return i < 0 ? (a ? 1e6 : 2e6) : i; };
    const byGroup = new Map();
    for (const s of list) { const g = groupKey(s); if (!byGroup.has(g)) byGroup.set(g, []); byGroup.get(g).push(s); }
    for (const members of byGroup.values()) members.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.key.localeCompare(b.key));
    const rank = (g) => {
      if (g === NONE) return 9e9;
      const first = byGroup.get(g)[0];
      if (ui.view === 'flow') return areaRank(first.area) * 1000 + (first.order ?? 999);
      return g.startsWith('\u0001') ? 3e6 : areaRank(g);
    };
    const groups = [...byGroup.keys()].sort((a, b) => rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b)));
    let col = 0;
    groups.forEach((g, gi) => {
      const members = byGroup.get(g);
      const keys = members.map((s) => s.key);
      if (ui.view === 'flow') {
        const y = gi * (M.cardH + LABEL_H + 48);
        labels.push({ text: nameOf(g), n: members.length, x: 0, y, keys, width: members.length * w - GAP_X });
        members.forEach((s, i) => { pos[s.key] = { x: i * w, y: y + LABEL_H }; });
      } else {
        // A long group takes more columns, so no column runs far below the window.
        const cols = L.columnsFor(members.length, MAX_ROWS);
        const rows = Math.ceil(members.length / cols);
        labels.push({ text: nameOf(g), n: members.length, x: col * w, y: 0, keys, width: cols * w - GAP_X });
        members.forEach((s, i) => { pos[s.key] = { x: (col + Math.floor(i / rows)) * w, y: LABEL_H + (i % rows) * M.pitch }; });
        col += cols;
      }
      for (const s of members) places.push({ key: s.key, ...pos[s.key] });
    });
    return { pos, places, labels };
  }

  /** The number of check failures of a screen in one viewport and state, and in all. */
  const failCount = (s, viewport, state) => (s.failureCounts ? s.failureCounts[`${viewport}|${state}`] ?? 0 : (s.failures || []).filter((f) => f.viewport === viewport && f.state === state).length);
  const failTotal = (s) => s.failureTotal ?? (s.failures || []).length;
  /** The place of a dragged card in this draw, or null. The Areas layout alone keeps dragged places. */
  const draggedPlace = (s) => (ui.view === 'grid' && s.position && !M.phone ? L.fromStored(s.position, M.pitch) : null);

  /**
   * Draw the board. A card keeps its element and its page from one draw to the next: a page moves
   * in the document only by a reload, so the draw moves, sizes and relabels the cards in place, and
   * a new viewport or state changes the page with no reload. Only a new version makes new pages.
   */
  function render() {
    // A resize can come before the data does.
    if (!data) return;
    measure();
    const board = $('#board');
    $('#edges').replaceChildren();
    for (const el of $$(':scope > .area-label, :scope > .empty:not(.nomatch)', board)) el.remove();
    const list = boardScreens();
    const past = versionAt(ui.version);
    const { left, right } = laneEls(board, past);
    const laneStep = M.laneW + GAP_X;
    left.forEach((el, i) => { el.style.left = `${-(left.length - i) * laneStep}px`; });
    if (!list.length) {
      for (const c of $$(':scope > .card', board)) { unwatch(c); c.remove(); }
      board.append(h('div', { class: 'empty' }, h('b', {}, 'No screens yet'), 'The design stage draws the screens of this repo here. Start it in the chat with /wf design.'));
      right.forEach((el, i) => { if (M.phone) el.style.order = String(100000 + i); else el.style.left = `${420 + GAP_X + i * laneStep}px`; });
      drawArrange(false);
      if (!ui.fitted && !M.phone) { ui.fitted = true; fit(); } else place();
      applyFilter();
      return;
    }
    const { pos, places, labels } = autoLayout(list);
    const at = (s) => draggedPlace(s) || pos[s.key];
    // On a phone the headings are in the list, each before its screens.
    let order = 0;
    const orderOf = new Map();
    if (M.phone) {
      for (const l of labels) { l.order = order; order += 1; for (const k of l.keys) { orderOf.set(`${k}@${l.y}`, order); order += 1; } }
    }
    for (const l of labels) {
      const el = h('h2', { class: `area-label${l.slug ? ' slug' : ''}`, style: M.phone ? `order:${l.order}` : `left:${l.x}px;top:${l.y}px;max-width:${Math.max(l.width, M.cardW)}px` },
        h('span', {}, l.text), h('small', {}, l.sub ?? plural(l.n, 'screen')));
      el.keys = l.keys;
      board.append(el);
    }
    const byKey = new Map(list.map((s) => [s.key, s]));
    const old = new Map($$(':scope > .card', board).map((c) => [c.dataset.slot, c]));
    const count = new Map();
    let edge = 0;
    places.forEach((place0) => {
      const s = byKey.get(place0.key);
      // A screen of two slices has two cards: the slot tells them apart.
      const n = count.get(s.key) ?? 0;
      count.set(s.key, n + 1);
      const slot = `${s.key}#${n}`;
      const p = draggedPlace(s) || place0;
      edge = Math.max(edge, p.x + M.cardW);
      let card = old.get(slot);
      old.delete(slot);
      if (card && card.dataset.at !== (ui.version || '')) { unwatch(card); card.remove(); card = null; }
      if (!card) {
        card = newCard(s, slot);
        board.append(card);
      }
      const labelY = ui.view === 'slice' ? place0.y - LABEL_H : labels.find((l) => l.keys.includes(s.key))?.y ?? 0;
      updateCard(card, s, past, p, orderOf.get(`${s.key}@${labelY}`) ?? 0);
    });
    for (const c of old.values()) { unwatch(c); c.remove(); }
    right.forEach((el, i) => { if (M.phone) el.style.order = String(100000 + i); else el.style.left = `${edge + GAP_X + i * laneStep}px`; });
    if (ui.view === 'flow' && !M.phone) drawEdges(list, at);
    drawArrange(Boolean(data.writable && ui.view === 'grid' && !M.phone && !past && list.some((s) => s.position)));
    if (!ui.fitted && !M.phone) { ui.fitted = true; firstFit(); } else place();
    applyFilter();
    fillWaiting();
  }
  /** A new card: its frame makes the page of the screen when the frame comes near the view. */
  function newCard(s, slot) {
    const key = s.key;
    const open = () => openScreen(key);
    const frame = h('div', { class: 'frame', role: 'button', tabindex: '0', onclick: open,
      onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } } });
    const at = ui.version || '';
    frame.make = () => sized(frameFor(key, frame.dataset.state, at || null));
    const card = h('article', { class: 'card', 'data-key': key, 'data-slot': slot, 'data-at': at }, frame, h('header', { class: 'cap' }));
    // A click on the caption opens the screen too; a drag of the caption moves the card.
    // (A card that can move opens from the press of `dragCard`, which holds the pointer.)
    card.addEventListener('click', (e) => { if (!card.dataset.drag && e.target.closest('.cap')) open(); });
    dragCard(card);
    watch(frame);
    return card;
  }
  /** Size a page to the viewport, and scale it to the width of a card. */
  function sized(f) {
    f.style.width = `${M.v.width}px`;
    f.style.height = `${M.v.height}px`;
    f.style.transform = `scale(${M.scale})`;
    return f;
  }
  /** Move, size and relabel a card for this draw, and give its page this state. */
  function updateCard(card, s, past, p, order) {
    const frame = card.firstChild;
    card.screen = s;
    card.classList.toggle('dim', !matches(s));
    if (M.phone) card.style.cssText = `order:${order}`;
    else if (!card.dragging) card.style.cssText = `left:${p.x}px;top:${p.y}px`;
    const canDrag = !M.phone && data.writable && ui.view === 'grid' && !past;
    if (canDrag) card.dataset.drag = '1'; else delete card.dataset.drag;
    frame.style.height = `${M.frameH}px`;
    frame.dataset.state = ui.state;
    frame.name = titleOf(s);
    const live = frame.querySelector(':scope > iframe, :scope > .missing');
    if (live?.tagName === 'IFRAME') setFrameState(sized(live), s.key, ui.state, ui.version || null);
    else if (live) sized(live);
    // An approval picture shows the default state at its viewport, and the page as it is now.
    const pic = !past && s.picture && ui.state === 'default' && ui.viewport === data.pictureViewport ? `${BASE}${s.picture}` : null;
    if ((frame.pic ?? null) !== pic) { frame.pic = pic; if (frame.dataset.fill === 'pic') delete frame.dataset.fill; frame.querySelector(':scope > img.pic')?.remove(); }
    const ph = frame.querySelector(':scope > .ph');
    if (ph) ph.textContent = frame.name;
    fillFrame(frame);
    // The comments, the checks and the audit are of the screen as it is now, not of a past version.
    const failures = past ? 0 : failTotal(s);
    const here = past ? 0 : failCount(s, ui.viewport, ui.state);
    const approved = (s.approvals || []).at(-1);
    const draft = past ? null : draftOf(s);
    const fresh = past ? null : unseenOf(s);
    const findings = past ? 0 : auditOf(s.key).length;
    const state = past ? (past.draft ? 'a draft' : past.name) : draft ? 'a draft that waits for your decision' : approved ? 'approved' : 'not approved yet';
    frame.setAttribute('aria-label', `Open ${titleOf(s)}: ${[state, fresh ? (fresh === 'new' ? 'new' : 'changed since you last opened it') : null, failures ? L.failText(failures) : null, s.openComments && !past ? plural(s.openComments, 'open comment') : null].filter(Boolean).join(', ')}`);
    const head = h('header', { class: 'cap' },
      h('div', { class: 'cap-row' }, h('b', { title: titleOf(s) }, titleOf(s)),
        fresh ? h('span', { class: 'mark changed', title: fresh === 'new' ? 'A new screen that you did not open yet' : 'The screen changed since you last opened it' }, fresh === 'new' ? 'New' : 'Changed') : null,
        !past && s.openComments ? h('span', { class: 'mark note', title: 'Open comment threads' }, plural(s.openComments, 'comment')) : null,
        failures ? h('span', { class: 'mark issue', title: `Checks that fail on this screen, in every viewport and state. ${here} in the ${ui.viewport} viewport and the ${ui.state} state.` }, L.failText(failures)) : null,
        findings ? h('span', { class: 'mark audit', title: 'Findings of the last design audit' }, plural(findings, 'finding')) : null,
        past ? h('span', { class: past.draft ? 'mark draft' : 'mark ok', title: past.reason }, past.draft ? 'Draft' : past.name)
          : draft ? h('span', { class: 'mark draft', title: `${draft.name}: ${draft.reason}. It waits for your decision.` }, 'Draft')
            : approved ? h('span', { class: 'mark ok', title: `Approved in ${String(approved.commit || '').slice(0, 8)}` }, 'Approved')
              : s.exists === false ? h('span', { class: 'mark issue', title: 'The manifest names this screen, and its file is gone' }, 'No file')
                : h('span', { class: 'mark draft', title: 'No approval yet. It waits for your decision.' }, 'Not approved')),
      h('div', { class: 'meta', title: metaOf(s) }, metaOf(s)));
    card.lastChild.replaceWith(head);
  }

  // ------------------------------------------------------------ the lanes

  /** A page scaled down to the width of a lane, as a button that opens its detail. */
  function thumb(src, width, height, label, onclick) {
    const w = M.laneW;
    const box = h('button', { type: 'button', class: 'frame', 'aria-label': label, style: `height:${Math.round(w * height / width)}px`, onclick });
    if (!src) { box.classList.add('blank'); return box; }
    box.make = () => h('iframe', { src, title: label, tabindex: '-1', scrolling: 'no', sandbox: 'allow-scripts allow-same-origin',
      style: `width:${width}px;height:${height}px;transform:scale(${w / width})` });
    watch(box);
    return box;
  }
  const TOKEN_KIND_WORDS = { color: 'Color', font: 'Font', type: 'Type size', weight: 'Weight', leading: 'Line height', space: 'Space', size: 'Size', radius: 'Radius', shadow: 'Shadow', motion: 'Motion', layer: 'Layer', other: 'Other' };
  // The CSS property that reads a value of each kind, to ask the browser whether the value is one.
  const KIND_PROPERTY = { color: 'color', font: 'font-family', type: 'font-size', space: 'width', size: 'width', radius: 'border-radius', shadow: 'box-shadow' };
  /**
   * The value of a token in a theme with each `var(--x)` of the token model put in, a few levels
   * deep: the canvas page has its own custom properties, so a value of the design must never read them.
   * Null when a name is not in the model.
   */
  function tokenValue(value, theme, depth = 0) {
    const text = String(value ?? '');
    if (!text.includes('var(')) return text;
    if (depth > 4) return null;
    let missing = false;
    const out = text.replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,([^)]*))?\)/gi, (all, name, fallback) => {
      const t = data.tokens.find((x) => x.name === name);
      const v = t ? (theme && t.values?.[theme] != null ? t.values[theme] : t.value) : fallback?.trim();
      const r = v == null ? null : tokenValue(v, theme, depth + 1);
      if (r == null) { missing = true; return all; }
      return r;
    });
    return missing ? null : out;
  }
  /** A value the browser reads for the property of its kind, else null. */
  const usable = (kind, value) => (value != null && (!KIND_PROPERTY[kind] || window.CSS?.supports?.(KIND_PROPERTY[kind], value)) ? value : null);
  /** The specimen of one token: what its value looks like, drawn by its kind. */
  function tokenSpecimen(t, kind) {
    const themes = data.themes || [];
    if (kind === 'color') {
      return h('span', { class: 'swatches' }, ...L.themeValues(t, themes).map(({ theme, value }) => {
        const v = usable('color', tokenValue(value, theme));
        const el = h('span', { class: `swatch${v ? '' : ' alias'}`, title: `${theme ? `${theme}: ` : ''}${value}`, 'aria-label': `${theme ? `${theme}: ` : ''}${value}`, role: 'img' });
        if (v) el.style.background = v;
        return el;
      }));
    }
    const v = usable(kind, tokenValue(t.value, data.defaultTheme));
    if (kind === 'font' || kind === 'type') {
      const el = h('span', { class: 'glyph', 'aria-hidden': 'true' }, 'Ag');
      if (v) el.style.setProperty(kind === 'font' ? 'font-family' : 'font-size', v);
      return el;
    }
    if (kind === 'space') {
      const el = h('span', { class: 'spec-bar', 'aria-hidden': 'true' });
      if (v) el.style.width = `min(${v}, 100%)`;
      return el;
    }
    if (kind === 'size') {
      const el = h('span', { class: 'spec-box', 'aria-hidden': 'true' }, h('small', {}, String(t.value ?? '')));
      if (v) { el.style.width = `min(${v}, 100%)`; el.style.height = `min(${v}, 96px)`; }
      return el;
    }
    if (kind === 'radius' || kind === 'shadow') {
      const el = h('span', { class: `spec-tile ${kind}`, 'aria-hidden': 'true' });
      if (v) el.style.setProperty(kind === 'radius' ? 'border-radius' : 'box-shadow', v);
      return el;
    }
    return h('span', { class: 'tval', 'aria-hidden': 'true' }, String(t.value ?? ''));
  }
  /** One token of the Tokens lane: its specimen, its name and what it is for. A click shows only the screens that use it. */
  function tokenItem(t, kind) {
    const tr = { kind: 'token', key: t.name };
    const n = data.screens.filter((s) => (s.tokens || []).includes(t.name)).length;
    const value = String(t.value ?? '');
    const themed = kind === 'color' ? L.themeValues(t, data.themes || []).filter((x) => x.theme) : [];
    const valueText = themed.length > 1 ? themed.map((x) => `${x.theme} ${x.value}`).join(', ') : value;
    // The value kinds show the value as their specimen: the line below then says what the token is for, or nothing.
    const textKind = !['color', 'font', 'type', 'space', 'size', 'radius', 'shadow'].includes(kind);
    const sub = t.usedFor || (textKind ? '' : valueText);
    const wide = kind === 'space' || kind === 'size';
    return h('button', { type: 'button', class: `tok k-${kind}${wide ? ' wide' : ''}`, 'data-trace': traceId(tr),
      'aria-label': `${t.name}, ${valueText}${t.usedFor ? `, ${t.usedFor}` : ''}. ${n ? `Used by ${plural(n, 'screen')}` : 'No screen uses it'}. Show only those screens.`,
      onclick: () => traceTo(tr), ...traceHover(tr) },
    tokenSpecimen(t, kind), h('span', { class: 'tname' }, t.name, sub ? h('small', { title: sub }, sub) : null));
  }
  /** The address of a component page, with the one theme it shows. */
  const componentSrc = (key, theme) => `${BASE}s/components/${key}.html${theme && theme !== 'default' ? `?theme=${encodeURIComponent(theme)}` : ''}`;
  /** The marks of a component: in code or to build, a layout, and what its spec lacks. */
  function componentMarks(c) {
    const gaps = L.specMark(c);
    return h('span', { class: 'marks' },
      c.kind === 'layout' ? h('span', { class: 'mark kind', title: 'A page shell: it lays out the other components' }, 'Layout') : null,
      gaps ? h('span', { class: 'mark issue', title: (c.problems || []).map((x) => x.message).join('. ') }, gaps) : null,
      h('span', { class: `mark ${c.code ? 'ok' : 'draft'}` }, c.code ? 'In code' : 'To build'));
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
      const frame = page ? thumb(`${BASE}ref/${encodeURIComponent(r.key)}`, 1280, 800, label, open)
        : h('button', { type: 'button', class: `frame${pic ? '' : ' doc'}`, 'aria-label': label, style: `height:${Math.round(M.laneW * 0.625)}px`, onclick: open },
          pic ? h('img', { src: `${BASE}ref/${encodeURIComponent(r.key)}`, alt: '', loading: 'lazy' }) : h('span', {}, cap(r.kind || 'other')));
      return h('article', { class: 'item' }, frame,
        itemCap(r.key, r.readable ? null : h('span', { class: 'mark issue', title: r.problem }, 'Unreadable'), r.note || null));
    });
    const components = data.components.map((c) => {
      const t = { kind: 'component', key: c.key };
      return h('article', { class: 'item', 'data-trace': traceId(t), ...traceHover(t) },
        // The page shows one theme panel at a time: the default theme, at the top of the frame.
        thumb(SNAP ? null : componentSrc(c.key, data.defaultTheme), 400, 300, `Open the component ${c.title}`, () => panel(`component:${c.key}`)),
        itemCap(c.title, componentMarks(c), c.screens.length ? `Used by ${plural(c.screens.length, 'screen')}` : 'No screen uses it yet'));
    });
    if (!components.length && data.noComponents) components.push(h('p', { class: 'none' }, `No components: ${data.noComponents}`));
    const tokens = data.tokens.length ? [h('div', { class: 'toklist' }, ...L.tokenGroups(data.tokens).flatMap((g) => [
      h('h3', { class: 'tokgroup' }, TOKEN_KIND_WORDS[g.kind] || cap(g.kind), h('span', { class: 'count' }, String(g.tokens.length))),
      ...g.tokens.map((t) => tokenItem(t, g.kind)),
    ])), h('p', { class: 'none' }, 'From DESIGN.md. Change them there.')] : [];
    const lane = (title, sub, items, n) => (items.length ? { title, sub, items, n } : null);
    return {
      left: [lane('Sketches', 'before any screen', sketches, sketches.length), lane('References', 'what the screens draw on', references, references.length)].filter(Boolean),
      right: [lane('Components', data.components.length ? plural(data.components.length, 'component') : '', components, data.components.length), lane('Tokens', 'select one to show its screens', tokens, data.tokens.length)].filter(Boolean),
    };
  }
  // On a phone a lane is one closed row of the list: the screens come first.
  function laneView(l, side) {
    if (M.phone) {
      return h('details', { class: 'lane', 'data-side': side }, h('summary', { class: 'lane-label' }, l.title, l.n ? h('span', { class: 'count' }, String(l.n)) : null), ...l.items);
    }
    return h('section', { class: 'lane', 'aria-label': l.title, 'data-side': side, style: `top:0;width:${M.laneW}px` },
      h('h2', { class: 'lane-label' }, l.title, l.sub ? h('small', {}, l.sub) : null), ...l.items);
  }
  /**
   * The lane elements of the board, left and right of the screens. They stay while their data is
   * the same, so their pages do not load again; `render` places them. On a phone the board is one
   * list, and every lane comes after the screens.
   */
  function laneEls(board, past) {
    const on = ui.view === 'grid' && !past;
    const sig = on ? `${M.phone}|${M.laneW}|${lanesSig}` : '';
    if (board.dataset.lanes !== sig) {
      for (const el of $$(':scope > .lane', board)) { unwatch(el); el.remove(); }
      board.dataset.lanes = sig;
      if (on) {
        const { left, right } = lanes();
        board.append(...left.map((l) => laneView(l, 'left')), ...right.map((l) => laneView(l, 'right')));
      }
    }
    const els = $$(':scope > .lane', board);
    return M.phone ? { left: [], right: els } : { left: els.filter((e) => e.dataset.side === 'left'), right: els.filter((e) => e.dataset.side === 'right') };
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
    const mid = M.frameH / 2;
    const byKey = Object.fromEntries(list.map((s) => [s.key, s]));
    for (const s of list) {
      for (const to of s.links || []) {
        if (!byKey[to] || to === s.key) continue;
        const a = at(s);
        const b = at(byKey[to]);
        const x1 = a.x + M.cardW + 6; const y1 = a.y + mid;
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
  const clampZoom = (z) => Math.min(3, Math.max(0.15, z));
  function zoomTo(next, mx, my) {
    const z = clampZoom(next);
    ui.x = mx - (mx - ui.x) * z / ui.zoom;
    ui.y = my - (my - ui.y) * z / ui.zoom;
    ui.zoom = z;
    place();
  }
  function zoomBy(factor) {
    const r = $('#stage').getBoundingClientRect();
    zoomTo(ui.zoom * factor, r.width / 2, r.height / 2);
  }
  /** The box around some elements of the board, in board pixels. */
  function boundsOf(items) {
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
    for (const c of items) {
      x0 = Math.min(x0, c.offsetLeft); y0 = Math.min(y0, c.offsetTop);
      x1 = Math.max(x1, c.offsetLeft + c.offsetWidth); y1 = Math.max(y1, c.offsetTop + c.offsetHeight);
    }
    return { x0, y0, x1, y1 };
  }
  /** Show every screen and lane, or the given cards: the zoom that fits the stage, never above 100 %. */
  function fit(items = $$('#board > .card, #board > .area-label, #board > .lane, #board > .empty')) {
    if (!items.length) { place(); return; }
    const { x0, y0, x1, y1 } = boundsOf(items);
    const r = $('#stage').getBoundingClientRect();
    const pad = 48;
    const dock = 80;
    ui.zoom = Math.min(1, clampZoom(Math.min((r.width - pad * 2) / (x1 - x0), (r.height - pad - dock) / (y1 - y0))));
    ui.x = Math.max(pad, (r.width - (x1 - x0) * ui.zoom) / 2) - x0 * ui.zoom;
    ui.y = pad - y0 * ui.zoom;
    place();
  }
  /**
   * The first view of a board. When some screens wait for the person and others do not, the view
   * fits the ones that wait. A board too large to read when it all fits opens at a zoom that reads,
   * at its first screens; Fit still shows it all.
   */
  const READABLE = 0.4;
  function firstFit() {
    const cards = $$('#board > .card');
    const need = cards.filter((c) => c.screen && waits(c.screen));
    const some = need.length && need.length < cards.length && !versionAt(ui.version);
    // The lanes are beside the screens, a pan away: the first view is of the screens.
    const screens = $$('#board > .card, #board > .area-label');
    fit(some ? need : screens);
    if (ui.zoom >= READABLE) return;
    const { x0, y0 } = boundsOf(some ? need : screens);
    ui.zoom = 0.5;
    ui.x = 48 - x0 * ui.zoom;
    ui.y = 48 - (y0 - (some ? LABEL_H : 0)) * ui.zoom;
    place();
  }
  // A drag pans from anywhere on the board, a screen too: only the caption of a card that can move moves the card.
  // A press that moves less than the slop stays a click, so a tap on a screen still opens it.
  function panZoom() {
    const stage = $('#stage');
    const pointers = new Map();
    let start = null;
    let panned = false;
    const mark = () => ({ x: ui.x, y: ui.y, zoom: ui.zoom, pts: [...pointers.values()].map((p) => ({ ...p })) });
    stage.addEventListener('pointerdown', (e) => {
      if (phone() || e.target.closest('.card[data-drag] .cap') || (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1)) return;
      // No text selection and no native drag: they show the not-allowed cursor and steal the move.
      if (e.pointerType === 'mouse') e.preventDefault();
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      start = mark();
      panned = false;
    });
    stage.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId) || !start) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.values()];
      if (!panned) {
        const far = pts.length > 1 || L.isDrag(pts[0].x - start.pts[0].x, pts[0].y - start.pts[0].y);
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
        // Two fingers zoom about the point between them, and move the board with that point.
        const r = stage.getBoundingClientRect();
        const d = (p) => Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) || 1;
        const mid = (p) => ({ x: (p[0].x + p[1].x) / 2 - r.left, y: (p[0].y + p[1].y) / 2 - r.top });
        const z = clampZoom(start.zoom * d(pts) / d(start.pts));
        const m0 = mid(start.pts);
        const m1 = mid(pts);
        ui.x = m1.x - (m0.x - start.x) * z / start.zoom;
        ui.y = m1.y - (m0.y - start.y) * z / start.zoom;
        ui.zoom = z;
      }
      place();
    });
    const end = (e) => {
      pointers.delete(e.pointerId);
      start = pointers.size ? mark() : null;
      if (!pointers.size) stage.classList.remove('panning');
    };
    stage.addEventListener('pointerup', end);
    stage.addEventListener('pointercancel', end);
    // The click that ends a pan opens nothing.
    stage.addEventListener('click', (e) => { if (panned) { e.stopPropagation(); e.preventDefault(); panned = false; } }, true);
    stage.addEventListener('dragstart', (e) => e.preventDefault());
    // The focus on a card away from the view scrolls the stage: the scroll becomes a move of the board.
    stage.addEventListener('scroll', () => {
      if (phone() || (!stage.scrollLeft && !stage.scrollTop)) return;
      ui.x -= stage.scrollLeft;
      ui.y -= stage.scrollTop;
      stage.scrollLeft = 0;
      stage.scrollTop = 0;
      placeNow();
    });
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

  /**
   * The caption of a card moves the card, in the Areas layout of a wide window. The card holds the
   * pointer, and the card stays from one draw to the next, so a draw in the middle of a drag ends
   * nothing. A press of the left button that moves less than the slop is a click.
   */
  function dragCard(card) {
    card.addEventListener('pointerdown', (e) => {
      if (!card.dataset.drag || !e.target.closest('.cap') || e.button !== 0 || card.dragging) return;
      e.stopPropagation();
      if (e.pointerType === 'mouse') e.preventDefault();
      const id = e.pointerId;
      const sx = e.clientX; const sy = e.clientY;
      const ox = parseFloat(card.style.left); const oy = parseFloat(card.style.top);
      // The card takes the pointer at the press: a fast move leaves the caption before the next event.
      try { card.setPointerCapture(id); } catch { /* it ended */ }
      const move = (ev) => {
        if (ev.pointerId !== id) return;
        if (!card.dragging) {
          if (!L.isDrag(ev.clientX - sx, ev.clientY - sy)) return;
          card.dragging = true;
          ui.dragging += 1;
          card.classList.add('moving');
        }
        card.style.left = `${ox + (ev.clientX - sx) / ui.zoom}px`;
        card.style.top = `${oy + (ev.clientY - sy) / ui.zoom}px`;
      };
      const up = async (ev) => {
        if (ev.pointerId !== id) return;
        card.removeEventListener('pointermove', move);
        card.removeEventListener('pointerup', up);
        card.removeEventListener('pointercancel', up);
        // A press that did not move is a click: it opens the screen, and pins nothing.
        if (!card.dragging) { if (ev.type === 'pointerup') openScreen(card.dataset.key); return; }
        card.dragging = false;
        card.classList.remove('moving');
        const s = card.screen;
        // The place is stored and saved before a change that waited loads a new state: the new
        // state would otherwise carry the old place, and the card would jump back.
        s.position = L.toStored({ x: parseFloat(card.style.left), y: parseFloat(card.style.top) }, M.pitch);
        moved.set(s.key, s.position);
        drawArrange(true);
        await saveLayout({ [s.key]: s.position });
        ui.dragging -= 1;
        if (!ui.dragging && pending) applyChange(pending);
      };
      card.addEventListener('pointermove', move);
      card.addEventListener('pointerup', up);
      card.addEventListener('pointercancel', up);
    });
  }
  /** Save some dragged places; a null deletes a place. */
  async function saveLayout(positions) {
    let ok = true;
    try { await send('layout', { positions }); } catch (e) { ok = false; failToast('The layout was not saved', e); }
    // A saved place is in the next state; until then, each new state takes the place that was moved.
    if (ok) { for (const [key, p] of Object.entries(positions)) if (moved.get(key) === p) moved.delete(key); say('Layout saved'); }
    return ok;
  }
  /** The control that puts every screen back in its column: two steps, because it deletes every dragged place. */
  function drawArrange(show) {
    const box = $('#arrange');
    box.hidden = !show;
    if (!show) { if (ui.confirm === 'layout') ui.confirm = ''; box.replaceChildren(); return; }
    const sure = ui.confirm === 'layout';
    const sig = `${sure}|${busy.has('layout')}`;
    if (box.dataset.sig === sig && box.children.length) return;
    box.dataset.sig = sig;
    const had = box.contains(document.activeElement);
    box.replaceChildren(
      h('button', { type: 'button', class: `btn ${sure ? 'primary' : 'quiet'}`, disabled: busy.has('layout'), onclick: () => {
        if (!sure) { ui.confirm = 'layout'; drawArrange(true); return; }
        ui.confirm = '';
        act('layout', resetLayout, () => drawArrange(data.screens.some((s) => s.position)));
      } }, busy.has('layout') ? 'Resetting…' : sure ? 'Confirm: put every screen back' : 'Reset the layout'),
      ...(sure ? [h('button', { type: 'button', class: 'btn quiet', onclick: () => { ui.confirm = ''; drawArrange(true); } }, 'Cancel')] : []));
    if (had) box.firstChild.focus();
  }
  async function resetLayout() {
    const body = L.resetBody(data.screens);
    try { await send('layout', body); } catch (e) { failToast('The layout was not reset', e); throw e; }
    for (const s of data.screens) s.position = null;
    moved.clear();
    ui.fitted = false;
    render();
    say('Every screen is back in its column');
  }

  // ------------------------------------------------------------ drafts and names

  // What the person typed and did not send: it stays through a redraw, a live update and a reload.
  let drafts = L.createDrafts();
  let draftsFor = null;
  function draftsInit() {
    const name = `wf-canvas-drafts:${data.repo || location.pathname}`;
    if (draftsFor === name) return;
    draftsFor = name;
    let store = null;
    try { store = window.sessionStorage; } catch { store = null; }
    drafts = L.createDrafts(SNAP ? null : store, name);
  }
  /** A text field of a draft: what is typed goes to the drafts at each key press. */
  function draftField(key, label, onkeys = null) {
    const t = h('textarea', { placeholder: label, 'aria-label': label, fk: `draft:${key}`, rows: '2', enterkeyhint: 'enter',
      oninput: () => { drafts.set(key, t.value); onkeys?.(); } });
    t.value = drafts.get(key);
    return t;
  }
  function authorName() {
    try { return (localStorage.getItem('wf-canvas-author') || '').trim(); } catch { return ''; }
  }
  function setAuthor(name) {
    const a = String(name || '').trim().slice(0, 60);
    try { if (a) localStorage.setItem('wf-canvas-author', a); else localStorage.removeItem('wf-canvas-author'); } catch { /* a private window: the name lasts for this visit */ }
    author.now = a;
  }
  const author = () => author.now || authorName() || drafts.get('@author').trim().slice(0, 60) || 'someone';
  /** The line that says whose comments these are, with the field for a name that is not set yet. */
  function authorLine(f) {
    const name = author.now || authorName();
    if (name && !f.naming) {
      return h('p', { class: 'who' }, `You comment as ${name}. `, h('button', { type: 'button', class: 'linkish', fk: 'who:change', onclick: () => { f.naming = true; drafts.set('@author', name); drawFocus(); $('#focus [data-fk="who:name"]')?.focus(); } }, 'Change the name'));
    }
    const field = h('input', { type: 'text', fk: 'who:name', 'aria-label': 'Your name, for your comments', placeholder: 'Your name', maxlength: '60', autocomplete: 'name',
      oninput: () => drafts.set('@author', field.value), onchange: () => { if (field.value.trim()) { setAuthor(field.value); drafts.clear('@author'); f.naming = false; drawFocus(); } } });
    field.value = drafts.get('@author');
    return h('label', { class: 'who' }, 'Your name, for your comments', field);
  }

  // ------------------------------------------------------------ one screen

  let focusState = null;
  let focusFrom = null;
  /** While the screen view is open, the board behind it takes no focus and no pointer. */
  function setInert(on) {
    for (const el of $$('.bar, #stage, .dock, #panel')) { if (on) el.setAttribute('inert', ''); else el.removeAttribute('inert'); }
    document.body.classList.toggle('viewing', on);
  }
  /** Open the screen view on one screen. It adds a step to the history, so Back closes the view. */
  function openScreen(key, opts = {}, { push = true } = {}) {
    if (!data) return;
    const s = boardScreens().find((x) => x.key === key);
    if (!s) return;
    if (!focusState) focusFrom = document.activeElement;
    const names = Object.keys(data.viewports);
    focusState = { key, viewport: names.includes(opts.viewport) ? opts.viewport : ui.viewport, state: data.states.includes(opts.state) ? opts.state : ui.state,
      checks: true, audit: true, commenting: false, pick: null, compare: '', built: false, all: false, play: false, sizes: false, trail: [], restoring: '', rounds: [], scroll: 0, zoom: 'fit', full: false, open: {}, reply: {}, sel: null, naming: false };
    focusDrawn = null;
    setInert(true);
    $('#focus').hidden = false;
    drawFocus();
    $('#focus h2')?.focus({ preventScroll: true });
    if (!SNAP) {
      try { if (push) history.pushState({ wfScreen: true }, '', L.hashOf(focusState)); else history.replaceState(history.state, '', L.hashOf(focusState)); } catch { /* a snapshot file has no history */ }
    }
  }
  /** Keep the address at the open screen, with no new step in the history. */
  function syncHash() {
    if (SNAP || !focusState) return;
    try { history.replaceState(history.state, '', L.hashOf(focusState)); } catch { /* no history */ }
  }
  /** Close the screen view the way the person asked: through the history when the view added a step to it. */
  function closeFocus() {
    if (!focusState) return;
    closeNow();
    if (SNAP) return;
    try {
      // The view added a step to the history when it opened: closing takes the step back.
      if (history.state?.wfScreen) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    } catch { /* no history */ }
  }
  function closeNow() {
    if (!focusState) return;
    $('#focus').hidden = true;
    $('#focus').replaceChildren();
    focusState = null;
    focusDrawn = null;
    setInert(false);
    held();
    const back = focusFrom?.isConnected ? focusFrom : $('#health');
    focusFrom = null;
    back?.focus?.({ preventScroll: true });
  }
  /** The address names the open screen: after Back, Forward, or a link. */
  function fromHash() {
    const want = SNAP ? null : L.parseHash(location.hash);
    if (want && data && boardScreens().some((s) => s.key === want.key)) {
      if (focusState?.key !== want.key) openScreen(want.key, want, { push: false });
    } else if (focusState) closeNow();
  }
  /**
   * The screens in the order of the board: by area column (or flow row), then in flow order.
   * With a filter, only the screens that match it; the open screen always stays in the walk.
   */
  function walk() {
    const all = boardScreens();
    if (!M) measure();
    const byKey = new Map(all.map((s) => [s.key, s]));
    const seenKeys = new Set();
    const order = autoLayout(all).places.map((p) => p.key).filter((k) => !seenKeys.has(k) && seenKeys.add(k)).map((k) => byKey.get(k));
    const shown = order.filter((s) => matches(s) || s.key === focusState?.key);
    return shown.length > 1 ? shown : order;
  }
  /** Open the screen `step` places away in the walk, with the same viewport, state and toggles. */
  function step(by) {
    const list = walk();
    if (list.length < 2) return;
    const i = list.findIndex((s) => s.key === focusState.key);
    const next = list[(i + by + list.length) % list.length];
    focusState = { ...focusState, key: next.key, compare: '', restoring: '', commenting: false, pick: null, trail: [], scroll: 0, sel: null, open: {}, reply: {} };
    drawFocus();
    syncHash();
  }
  /**
   * Try the links: the screen's own links work. A link to another screen opens that screen in the view,
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
      focusState = { ...focusState, key, state: data.states.includes(st) ? st : 'default', compare: '', scroll: 0, sel: null, trail: [...focusState.trail, { key: focusState.key, state: focusState.state }] };
      drawFocus();
      syncHash();
    });
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
  /** What an element is and says, for the name of a comment's target. */
  function describe(el) {
    if (!el || el.nodeType !== 1) return null;
    const attr = (n) => el.getAttribute(n) || '';
    const labelled = attr('aria-labelledby').split(/\s+/).filter(Boolean).map((id) => el.ownerDocument.getElementById(id)?.textContent || '').join(' ');
    const name = attr('aria-label') || labelled || attr('alt') || attr('placeholder') || (el.tagName === 'INPUT' ? attr('value') : '') || attr('title');
    // The text of the element, one piece for each text node: two lines of a card do not run together.
    const pieces = [];
    const walker = el.ownerDocument.createTreeWalker(el, 4);
    for (let n = walker.nextNode(), size = 0; n && size < 80; n = walker.nextNode()) { const t = n.nodeValue.trim(); if (t) { pieces.push(t); size += t.length; } }
    return { tag: el.tagName, role: attr('role'), type: attr('type'), name, text: pieces.join(' '), block: el.children.length > 0 };
  }
  /** The element of a selector in a document, or null. A selector that the browser cannot read finds nothing. */
  function find(doc, selector) {
    if (!doc || !selector) return null;
    try { return doc.querySelector(selector); } catch { return null; }
  }

  /** One screen in the view: its page or picture in a box of its own scale. `tall` is the height of the page. */
  function shot(caption, content, size) {
    const box = h('div', { class: 'shot' }, h('div', { class: 'cap' }, caption), content);
    Object.assign(box, { content, size, tall: size.height, scale: 1, bound: 0 });
    if (content.tagName === 'IFRAME') content.addEventListener('load', () => { if (content.isConnected) hug(box); });
    return box;
  }
  /** Give a box its scale, and the height that its page and its bound allow. */
  function sizeShot(box, scale = box.scale, bound = box.bound) {
    const c = box.querySelector(':scope > iframe, :scope > img, :scope > .missing') || box.content;
    box.scale = scale;
    box.bound = bound;
    c.style.width = `${box.size.width}px`;
    if (c.tagName !== 'IMG') c.style.height = `${box.tall}px`;
    c.style.transform = `scale(${scale})`;
    box.style.width = `${Math.round(box.size.width * scale)}px`;
    const full = Math.round(box.tall * scale);
    box.style.height = `${bound ? Math.min(full, bound) : full}px`;
    box.classList.toggle('cut', Boolean(bound) && full > bound);
  }
  /**
   * An artboard is as tall as its page, and the view around it scrolls. A page that takes its height
   * from the window grows with the frame, so that page keeps the device height and scrolls in the
   * frame. A bounded box keeps the device height: it shows the top of the screen.
   */
  function hug(box) {
    const ifr = box.querySelector(':scope > iframe');
    let root = null;
    try { root = ifr?.contentDocument?.documentElement; } catch { root = null; }
    box.tall = box.size.height;
    if (root && !box.bound) {
      ifr.style.height = `${box.size.height}px`;
      const tall = root.scrollHeight;
      if (tall > box.size.height) {
        ifr.style.height = `${tall}px`;
        box.tall = root.scrollHeight > tall ? box.size.height : tall;
      }
    }
    sizeShot(box);
  }
  const segOf = (name, values, value, on, label) => h('div', { class: 'seg', role: 'group', 'aria-label': label },
    ...values.map((v) => h('button', { type: 'button', fk: `${name}:${v}`, class: v === value ? 'on' : null, 'aria-pressed': String(v === value), onclick: () => on(v) }, cap(v))));
  const toggle = (name, text, on, fn, title = null) => h('button', { type: 'button', class: 'btn', fk: `t:${name}`, 'aria-pressed': String(Boolean(on)), title, onclick: fn }, text);
  function sel(name, values, value, on, labels = {}, label = null) {
    const s = h('select', { fk: `s:${name}`, 'aria-label': label, onchange: (e) => on(e.target.value) }, ...values.map((v) => h('option', { value: v }, labels[v] ?? v)));
    s.value = value;
    return s;
  }

  /** The other viewports that the screen view shows beside the screen. */
  const otherSizes = (f) => (f.sizes && !phone() ? Object.keys(data.viewports).filter((n) => n !== f.viewport) : []);
  /** The room that the screens of the view have, in pixels. */
  function viewRoom(f) {
    const ph = phone();
    const view = $('#focus .view');
    // On a phone the screen fits the width, and its length scrolls.
    if (ph) return { w: document.documentElement.clientWidth - 32, h: Infinity };
    const w = view ? view.clientWidth - 48 : window.innerWidth - 32 - 340 - 48;
    const hgt = view ? view.clientHeight - 64 : window.innerHeight - 32 - 150 - 64;
    return { w: Math.max(200, w), h: Math.max(200, hgt) };
  }
  /** The scale of the screens in the screen view: the fit of the room, or the zoom that the person chose. */
  function focusScale(f) {
    if (typeof f.zoom === 'number') return f.zoom;
    const size = vp(f.viewport);
    const ph = phone();
    const room = viewRoom(f);
    const widths = ph ? [size.width] : [size.width, ...(f.compare || f.built ? [size.width] : []), ...otherSizes(f).map((n) => vp(n).width)];
    return L.fitScale({ availW: room.w, availH: ph && !f.full ? Infinity : room.h, widths, height: size.height });
  }
  // The layout of the last drawn screen view: a draw that keeps it keeps the page of the screen.
  let focusDrawn = null;
  // What scrolls the artboards: the view, and on a phone the whole sheet until the screen is at full size.
  const focusScroller = () => $(phone() && !focusState?.full ? '#focus .sheet' : '#focus .view');
  /** One part of the side of the view: a heading with a count that opens and closes its content. */
  function section(f, id, title, count, body, { long = false, tone = '' } = {}) {
    const open = f.open[id] ?? (phone() ? !long : true);
    const d = h('details', { class: `sec${tone ? ` ${tone}` : ''}`, 'data-sec': id, open },
      h('summary', { fk: `sec:${id}` }, h('span', {}, title), count ? h('span', { class: 'count' }, String(count)) : null), h('div', { class: 'sec-body' }, body));
    // Only a press of the person is kept: the state before the press is the opposite of what it asks for.
    d.firstChild.addEventListener('click', () => { f.open[id] = !d.open; });
    return d;
  }
  /** The tools that a phone keeps behind "More". */
  function moreTools(f, tools) {
    const on = tools.filter((t) => t.getAttribute('aria-pressed') === 'true').length;
    const d = h('details', { class: 'moretools', open: Boolean(f.open.tools) },
      h('summary', { class: 'btn', fk: 'sec:tools' }, 'More', on ? h('span', { class: 'count' }, String(on)) : null), h('div', { class: 'row' }, tools));
    d.firstChild.addEventListener('click', () => { f.open.tools = !d.open; });
    return d;
  }
  /** Open a part of the side, and bring one of its rows into view. */
  function showRow(f, id, rowSel) {
    f.open[id] = true;
    drawFocus();
    const row = $(`#focus ${rowSel}`);
    row?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    row?.focus?.({ preventScroll: true });
  }
  /** The key of a failure's group: the server groups by the check and its cause. */
  const groupKeyOf = (x) => `${x.check}|${x.cause ?? x.message}`;

  function drawFocus() {
    const f = focusState;
    if (!f) return;
    const s = boardScreens().find((x) => x.key === f.key);
    if (!s) { closeFocus(); return; }
    const root = $('#focus');
    const ph = phone();
    const past = versionAt(ui.version);
    const other = versionAt(f.compare);
    const draft = past ? null : draftOf(s);
    if (!past) queueMicrotask(() => markSeen(s.key));
    const size = vp(f.viewport);
    // What the draw must give back: the focus, the caret, and each scroll.
    const active = document.activeElement;
    const fkWas = active && root.contains(active) ? active.dataset.fk || '@' : null;
    const caret = fkWas && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
    const same = focusDrawn?.key === f.key;
    const scrolls = same ? { side: $('#focus .side')?.scrollTop || 0, sheet: $('#focus .sheet')?.scrollTop || 0, viewX: $('#focus .view')?.scrollLeft || 0, viewY: $('#focus .view')?.scrollTop || 0 } : null;
    // The page of the screen stays while the screen, the version, the viewport and the link mode
    // stay: a toggle, a zoom or a new state redraws the sheet around the page, and the page does not reload.
    const liveKey = [s.key, ui.version, f.viewport, f.play, ph].join('|');
    const kept = focusDrawn?.liveKey === liveKey ? $('#focus .view > .shot.now') : null;
    focusDrawn = { phone: ph, key: f.key, liveKey };
    const view = kept ? kept.parentElement : h('div', { class: 'view' });
    const named = past ? draftName(past) : 'Now';
    const caption = f.compare || f.built ? named : `${past ? `${named}, ` : ''}${cap(f.viewport)} ${size.width}×${size.height}, ${f.state} state${f.play ? ', the links work' : ''}`;
    const live = kept ?? shot(caption, frameFor(s.key, f.state, ui.version || null), size);
    live.classList.add('now');
    const ifr = live.querySelector('iframe');
    const screenDoc = () => { try { return ifr?.isConnected ? ifr.contentDocument : null; } catch { return null; } };
    const loaded = () => { const d = screenDoc(); return d && d.readyState !== 'loading' && d.body ? d : null; };
    // The layer moves with the page of the screen, so the pins and the boxes stay on their elements.
    const layer = h('div', { class: 'layer' });
    const overlay = h('div', { class: `overlay${f.commenting ? ' commenting' : ''}` }, layer);
    live.layer = layer;
    if (kept) {
      live.querySelector(':scope > .cap').textContent = caption;
      live.querySelector(':scope > .overlay')?.remove();
      for (const c of [...view.children]) if (c !== live) c.remove();
      if (ifr) setFrameState(ifr, s.key, f.state, ui.version || null);
    } else if (ifr) {
      ifr.addEventListener('load', () => {
        const win = screenDoc()?.defaultView;
        if (!win || focusState?.key !== s.key) return;
        win.scrollTo({ top: focusState.scroll, behavior: 'instant' });
        const follow = () => { if (focusState?.key === s.key) focusState.scroll = win.scrollY; live.layer.style.transform = `translateY(${-win.scrollY * live.scale}px)`; };
        win.addEventListener('scroll', follow);
        follow();
        // The pins and the names of the targets need the page: draw them now that it is here.
        drawFocus();
      });
      // With the links on, nothing covers the screen, so its links and controls take the pointer.
      if (f.play) {
        live.classList.add('playing');
        ifr.removeAttribute('tabindex');
        ifr.removeAttribute('scrolling');
        ifr.addEventListener('load', () => playLinks(ifr));
      }
    }
    if (!f.play) live.append(overlay);
    const doc = loaded();
    const fx = past ? { failures: [], failureGroups: [] } : failuresFor(s);
    const failuresHere = (fx?.failures || []).filter((q) => q.viewport === f.viewport && q.state === f.state);
    const groups = fx && !fx.error ? groupsOf(fx) : null;

    // ---- the boxes of the checks and the audit, and the pins of the threads

    // A box marks the rectangle; its tag is a button that opens the row of the check, and shows the message.
    const boxAt = (r, label, message, kind, pressed, onclick, fk) => h('div', { class: `box${kind ? ` ${kind}` : ''}${pressed ? ' sel' : ''}`,
      style: `left:${r.x * live.scale}px;top:${r.y * live.scale}px;width:${r.width * live.scale}px;height:${r.height * live.scale}px` },
    h('button', { type: 'button', class: 'tag', fk, 'aria-label': `${label}: ${message}`, 'aria-pressed': String(Boolean(pressed)), onclick: (e) => { e.stopPropagation(); onclick(); } }, h('span', {}, label)),
    h('span', { class: 'msg' }, message));
    const drawMarks = () => {
      const scale = live.scale;
      layer.replaceChildren();
      const win = loaded()?.defaultView;
      layer.style.transform = `translateY(${-(win?.scrollY || 0) * scale}px)`;
      if (f.checks && !past) {
        failuresHere.forEach((x, i) => {
          if (!x.rect) return;
          const g = (groups || []).findIndex((q) => groupKeyOf(q) === groupKeyOf(x));
          const id = `check:${g}`;
          layer.append(boxAt(x.rect, CHECK_NAMES[x.check] || x.check, x.message, '', f.sel === id, () => { f.sel = id; showRow(f, 'checks', `[data-row="${id}"]`); }, `box:${i}`));
        });
      }
      if (f.audit && !past) {
        findings.forEach((x, i) => {
          if (x.state !== f.state || !x.rects?.[f.viewport]) return;
          const id = `finding:${i}`;
          layer.append(boxAt(x.rects[f.viewport], x.rule || 'Audit', x.message, 'audit', f.sel === id, () => { f.sel = id; showRow(f, 'audit', `[data-row="${id}"]`); }, `abox:${i}`));
        });
      }
      const d = loaded();
      (s.threads || []).forEach((t, i) => {
        if (past || (!f.all && !t.open)) return;
        const a = t.anchor || {};
        if ((a.state || 'default') !== f.state) return;
        const el = find(d, a.selector);
        let rect = null;
        if (el) { const r = el.getBoundingClientRect(); rect = { left: r.left + (win?.scrollX || 0), top: r.top + (win?.scrollY || 0), width: r.width, height: r.height }; }
        const p = L.pinPlace(a, f.viewport, size, rect);
        if (!p) return;
        layer.append(h('button', { type: 'button', class: `pin${t.open ? '' : ' closed'}${L.reviewMark(t) ? ' review' : ''}`, fk: `pin:${t.id}`, style: `left:${p.x * scale}px;top:${p.y * scale}px`,
          'aria-label': `Comment ${i + 1}: ${t.comments[0]?.text || ''}`, onclick: (e) => { e.stopPropagation(); showRow(f, 'comments', `[data-row="thread:${t.id}"]`); } }, h('span', {}, String(i + 1))));
      });
      // Comment mode: the pointer outlines the element under it, and a click or a tap selects it.
      layer.append(hovered, selected);
      outline(selected, f.pick?.selector ? find(d, f.pick.selector) : null);
    };
    const findings = auditOf(s.key);
    const hovered = h('div', { class: 'el-box', hidden: true }, h('span'));
    const selected = h('div', { class: 'el-box held', hidden: true }, h('span'));
    const elementAt = (e) => {
      const r = overlay.getBoundingClientRect();
      const el = loaded()?.elementFromPoint((e.clientX - r.left) / live.scale, (e.clientY - r.top) / live.scale);
      return el && el.tagName !== 'BODY' && el.tagName !== 'HTML' ? el : null;
    };
    function outline(box, el) {
      box.hidden = !el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const win = el.ownerDocument.defaultView;
      const scale = live.scale;
      box.style.cssText = `left:${(r.left + win.scrollX) * scale}px;top:${(r.top + win.scrollY) * scale}px;width:${r.width * scale}px;height:${r.height * scale}px`;
      box.firstChild.textContent = L.targetName(describe(el)).replace(/^the /, '');
    }
    /** The selected element of the comment: kept as its selector and its name, so a redraw finds it again. */
    const pickOf = (el, x, y) => ({ selector: el ? selectorOf(el) : null, label: el ? L.targetName(describe(el)) : null, x, y, whole: false, canWiden: Boolean(el?.parentElement && el.parentElement.tagName !== 'BODY') });
    overlay.addEventListener('click', (e) => {
      if (!f.commenting) {
        // On a phone the bounded screen opens at full size.
        if (ph && !f.full) { f.full = true; drawFocus(); }
        return;
      }
      const r = overlay.getBoundingClientRect();
      const win = loaded()?.defaultView;
      f.pick = pickOf(elementAt(e), (e.clientX - r.left) / r.width, ((e.clientY - r.top) / live.scale + (win?.scrollY || 0)) / size.height);
      drawFocus();
      $('#focus [data-fk="draft:' + CSS.escape(`${s.key}|new`) + '"]')?.focus({ preventScroll: ph });
      keepPickInView();
    });
    overlay.addEventListener('wheel', (e) => {
      const win = loaded()?.defaultView;
      if (!win || e.ctrlKey || e.metaKey) return;
      const from = win.scrollY;
      win.scrollBy({ top: e.deltaY / live.scale, behavior: 'instant' });
      if (win.scrollY !== from) e.preventDefault();
      if (f.commenting) outline(hovered, elementAt(e));
    }, { passive: false });
    // A finger on the screen scrolls in comment mode, because a tap is what selects.
    let finger = null;
    overlay.addEventListener('pointerdown', (e) => { finger = f.commenting && e.pointerType !== 'mouse' ? { x: e.clientX, y: e.clientY } : null; });
    overlay.addEventListener('pointerup', () => { finger = null; });
    overlay.addEventListener('pointercancel', () => { finger = null; });
    overlay.addEventListener('pointermove', (e) => {
      if (finger) {
        const win = loaded()?.defaultView;
        const from = win?.scrollY;
        win?.scrollBy({ top: (finger.y - e.clientY) / live.scale, behavior: 'instant' });
        const sc = focusScroller();
        if (sc && win?.scrollY === from) sc.scrollTop += finger.y - e.clientY;
        if (sc && f.full) sc.scrollLeft += finger.x - e.clientX;
        finger = { x: e.clientX, y: e.clientY };
      } else if (f.commenting && e.pointerType === 'mouse') outline(hovered, elementAt(e));
    });
    overlay.addEventListener('pointerleave', () => { hovered.hidden = true; });
    // A kept page stays where it is: a page that moves in the document loads again.
    if (!kept) {
      view.append(live);
      // On a touch screen, a sideways swipe over the screen walks to the next or the previous one.
      // A zoomed page pans with that move, so the swipe is off while the page is zoomed.
      let swipe = null;
      const zoomed = () => (window.visualViewport?.scale || 1) > 1.01 || focusState?.full || typeof focusState?.zoom === 'number';
      view.addEventListener('pointerdown', (e) => { swipe = e.pointerType !== 'mouse' && e.isPrimary && !focusState?.commenting && !focusState?.play && !zoomed() ? { x: e.clientX, y: e.clientY } : null; });
      view.addEventListener('pointercancel', () => { swipe = null; });
      view.addEventListener('pointerup', (e) => {
        if (!swipe || zoomed()) { swipe = null; return; }
        const dx = e.clientX - swipe.x;
        const dy = e.clientY - swipe.y;
        swipe = null;
        if (Math.abs(dx) > 60 && Math.abs(dx) > 2 * Math.abs(dy)) step(dx < 0 ? 1 : -1);
      });
    }
    const panes = [live];
    for (const n of otherSizes(f)) panes.push(shot(`${cap(n)} ${vp(n).width}×${vp(n).height}`, frameFor(s.key, f.state, ui.version || null), vp(n)));
    if (f.compare) panes.push(shot(other ? draftName(other) : `At ${f.compare.slice(0, 8)}`, frameFor(s.key, f.state, f.compare), size));
    if (f.built) {
      const approval = (s.approvals || []).at(-1);
      const shotOf = (s.captures || [])[0];
      const src = shotOf ? `${BASE}${shotOf.url}` : (approval ? `${BASE}approvals/${approval.commit}/${s.key}.png` : '');
      panes.push(src ? shot(shotOf ? `Built, slice ${shotOf.slice}` : 'The picture of the approval', h('img', { alt: shotOf ? 'The built screen' : 'The approved screen', src }), size)
        : shot('Built screen', h('div', { class: 'missing' }, h('span', {}, 'No picture of the built screen yet. The build takes one when it finishes a slice.')), size));
    }
    for (const p of panes.slice(1)) view.append(p);

    // ---- the header and the tools

    // A saved version comes first. An approval from before the versions compares at its commit.
    const versions = [...allVersions().filter((v) => v.screens.some((e) => e.key === s.key)).map((v) => [v.ref, draftName(v)]),
      ...(s.approvals || []).filter((a) => !a.version).map((a) => [a.commit, `Approved ${day(a.at)}`]),
      ...(s.history || []).filter((c) => !(s.approvals || []).some((a) => a.commit === c.commit)).map((c) => [c.commit, `${day(c.at)}: ${c.subject}`])];
    const order = walk();
    const at = order.findIndex((x) => x.key === s.key);
    const near = (by) => order[(at + by + order.length) % order.length];
    const stepper = order.length > 1 ? h('div', { class: 'stepper', role: 'group', 'aria-label': 'Screens' },
      h('button', { type: 'button', fk: 'step:-1', 'aria-label': `Previous screen: ${titleOf(near(-1))}`, title: `${titleOf(near(-1))} (←)`, onclick: () => step(-1) }, '‹'),
      h('span', { class: 'pos' }, `${at + 1} of ${order.length}`),
      h('button', { type: 'button', fk: 'step:1', 'aria-label': `Next screen: ${titleOf(near(1))}`, title: `${titleOf(near(1))} (→)`, onclick: () => step(1) }, '›')) : null;
    const back = f.play && f.trail.length ? f.trail.at(-1) : null;
    const backTitle = back ? titleOf(data.screens.find((x) => x.key === back.key) || { key: back.key }) : '';
    const approved = (s.approvals || []).at(-1);
    const fresh = past ? null : unseenOf(s);
    const stateMark = past ? h('span', { class: past.draft ? 'mark draft' : 'mark ok' }, past.draft ? 'Draft' : past.name)
      : draft ? h('span', { class: 'mark draft' }, 'Draft') : approved ? h('span', { class: 'mark ok' }, 'Approved') : h('span', { class: 'mark draft' }, 'Not approved');
    const header = h('header', {},
      h('div', { class: 'title' }, h('h2', { tabindex: '-1', title: titleOf(s) }, titleOf(s)), h('div', { class: 'meta' }, stateMark, h('span', {}, metaOf(s)))),
      back ? h('button', { type: 'button', class: 'btn', fk: 'trail', 'aria-label': `Back to ${backTitle}`, onclick: () => { focusState = { ...focusState, key: back.key, state: back.state, scroll: 0, trail: f.trail.slice(0, -1) }; drawFocus(); syncHash(); } }, `← ${backTitle}`) : null,
      f.full && ph ? h('button', { type: 'button', class: 'btn', fk: 'full:off', onclick: () => { f.full = false; f.zoom = 'fit'; drawFocus(); } }, 'Done') : stepper,
      h('button', { type: 'button', class: 'close', fk: 'close', onclick: closeFocus, 'aria-label': 'Close the screen' }, '×'));
    const names = Object.keys(data.viewports);
    const setViewport = (v) => { f.viewport = v; f.sel = null; f.zoom = 'fit'; drawFocus(); syncHash(); };
    const setFState = (v) => { f.state = v; f.sel = null; drawFocus(); syncHash(); };
    const scaleNow = focusScale(f);
    const zoomTo2 = (z) => { f.zoom = z === 'fit' ? 'fit' : Math.min(3, Math.max(0.1, z)); drawFocus(); };
    const zoomBox = !ph || f.full ? h('div', { class: 'zoom', role: 'group', 'aria-label': 'Zoom of the screen' },
      h('button', { type: 'button', fk: 'z:out', 'aria-label': 'Zoom out', onclick: () => zoomTo2(scaleNow * 0.8) }, '−'),
      h('output', { 'aria-label': 'Zoom' }, `${Math.round(scaleNow * 100)}%`),
      h('button', { type: 'button', fk: 'z:in', 'aria-label': 'Zoom in', onclick: () => zoomTo2(scaleNow * 1.25) }, '+'),
      h('button', { type: 'button', fk: 'z:fit', 'aria-pressed': String(f.zoom === 'fit'), onclick: () => zoomTo2('fit') }, 'Fit'),
      h('button', { type: 'button', fk: 'z:100', 'aria-pressed': String(f.zoom === 1), onclick: () => zoomTo2(1) }, '100%')) : null;
    const commentBtn = data.writable && !past ? toggle('comment', f.commenting ? 'Select an element' : 'Comment', f.commenting, () => { f.commenting = !f.commenting; if (!f.commenting) f.pick = null; f.play = false; drawFocus(); }) : null;
    const extra = [
      past ? null : toggle('checks', 'Checks', f.checks, () => { f.checks = !f.checks; drawFocus(); }, 'Show the failing checks on the screen'),
      findings.length && !past ? toggle('audit', 'Audit', f.audit, () => { f.audit = !f.audit; drawFocus(); }, 'Show the findings of the audit on the screen') : null,
      SNAP ? null : toggle('play', 'Try the links', f.play, () => { f.play = !f.play; f.commenting = false; f.pick = null; f.trail = []; drawFocus(); }, 'The links of the screen open the screens they lead to'),
      toggle('built', 'Built screen', f.built, () => { f.built = !f.built; drawFocus(); }, 'Show the picture of the built screen beside the design'),
      names.length > 1 && !ph ? toggle('sizes', 'All viewports', f.sizes, () => { f.sizes = !f.sizes; drawFocus(); }) : null,
      SNAP || !versions.length ? null : h('label', {}, 'Compare with', sel('compare', ['', ...versions.map((v) => v[0])], f.compare, (v) => { f.compare = v; drawFocus(); }, Object.fromEntries([['', 'No other version'], ...versions]))),
    ].filter(Boolean);
    const tools = h('div', { class: 'tools' },
      names.length > 4 || ph ? sel('viewport', names, f.viewport, setViewport, Object.fromEntries(names.map((n) => [n, `${cap(n)} ${vp(n).width}×${vp(n).height}`])), 'Viewport')
        : segOf('vp', names, f.viewport, setViewport, 'Viewport'),
      ph ? sel('state', data.states, f.state, setFState, Object.fromEntries(data.states.map((n) => [n, `${cap(n)} state`])), 'State') : segOf('st', data.states, f.state, setFState, 'State'),
      h('span', { class: 'gap' }),
      commentBtn,
      ph && !f.full ? h('button', { type: 'button', class: 'btn', fk: 'full:on', onclick: () => { f.full = true; drawFocus(); } }, 'Full size') : null,
      // A phone keeps the tools that are used less behind one control.
      ph ? moreTools(f, extra) : extra,
      zoomBox);

    // ---- the side: what needs the person first

    const key = `${s.key}|new`;
    const openThreads = (s.threads || []).filter((t) => t.open);
    const shown = (s.threads || []).filter((t) => f.all || t.open);
    const list = (xs) => (xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}` : xs[0]);
    const post = (id, body, after) => act(id, async () => {
      const who = author();
      const j = await send(`comments/${s.key}`, { ...body, author: who });
      if (who !== 'someone' && !authorName()) { setAuthor(who); drafts.clear('@author'); }
      after?.();
      // The answer carries the threads of the screen: only that screen and its counts change.
      const cur = data.screens.find((x) => x.key === s.key);
      if (cur && Array.isArray(j.threads)) {
        cur.threads = j.threads;
        cur.openComments = j.threads.filter((t) => t.open).length;
        for (const c of data.cards) if (c.screens.some((x) => x.key === s.key)) c.openComments = c.screens.reduce((n, x) => n + (data.screens.find((y) => y.key === x.key)?.openComments ?? 0), 0);
        drawHealth();
        render();
      } else await load();
      say('Saved');
    }, drawFocus);
    const sendNew = () => {
      if (!drafts.get(key).trim()) { $(`#focus [data-fk="draft:${CSS.escape(key)}"]`)?.focus(); return; }
      const p = f.pick || { whole: true };
      post(`post:${key}`, { text: drafts.get(key), anchor: { x: p.whole ? null : p.x, y: p.whole ? null : p.y, selector: p.selector || null, label: p.selector ? L.anchorLabel(p.label) : null, state: f.state, viewport: f.viewport } },
        () => { drafts.clear(key); f.pick = null; f.commenting = false; f.open.comments = true; });
    };
    const leaveComment = () => { f.pick = null; f.commenting = false; drawFocus(); };
    // The composer: the target, the text, and the buttons. On a phone it is a sheet above the keyboard.
    let composer = null;
    if (data.writable && !past && (f.pick || f.commenting)) {
      const sending = busy.has(`post:${key}`);
      composer = f.pick ? h('div', { class: 'composer' },
        h('p', { class: 'target' }, f.pick.whole ? 'On the whole screen' : f.pick.selector ? `On ${f.pick.label || 'an element of the screen'}` : 'On this point of the screen', h('small', {}, `${cap(f.state)} state, ${cap(f.viewport)} viewport`)),
        authorName() || author.now ? null : authorLine(f),
        draftField(key, 'Comment'),
        failLine(`post:${key}`, sendNew),
        h('div', { class: 'row' },
          h('button', { type: 'button', class: 'btn primary', fk: 'new:send', disabled: sending, onclick: sendNew }, sending ? 'Saving…' : 'Comment'),
          f.pick.canWiden ? h('button', { type: 'button', class: 'btn quiet', fk: 'new:wider', onclick: () => { const el = find(loaded(), f.pick.selector)?.parentElement; if (el) { f.pick = pickOf(el, f.pick.x, f.pick.y); drawFocus(); } } }, 'Select the parent') : null,
          h('button', { type: 'button', class: 'btn quiet', fk: 'new:cancel', onclick: leaveComment }, 'Cancel')))
        : h('div', { class: 'composer hint' },
          h('p', { class: 'target' }, ph ? 'Tap an element of the screen to comment on it.' : 'Select an element of the screen to comment on it.'),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: 'btn', fk: 'new:whole', onclick: () => { f.pick = { whole: true }; drawFocus(); $(`#focus [data-fk="draft:${CSS.escape(key)}"]`)?.focus(); } }, 'Comment on the whole screen'),
            h('button', { type: 'button', class: 'btn quiet', fk: 'new:cancel', onclick: leaveComment }, 'Cancel')));
    }
    if (composer && !ph) f.open.comments = true;
    const threadView = (t, n) => {
      const dk = `${s.key}|${t.id}`;
      const a = t.anchor || {};
      // The element as the page has it now names the target; a page that lost it leaves the name that the comment kept.
      const label = a.selector ? L.threadTarget(describe(find(doc, a.selector)), a) : null;
      // The field of a reply shows when the person asks for it, or holds a draft.
      const writingReply = Boolean(f.reply[t.id] || drafts.get(dk));
      const reply = () => {
        if (!writingReply || !drafts.get(dk).trim()) { f.reply[t.id] = true; drawFocus(); $(`#focus [data-fk="draft:${CSS.escape(dk)}"]`)?.focus(); return; }
        post(`reply:${dk}`, { thread: t.id, text: drafts.get(dk) }, () => { drafts.clear(dk); delete f.reply[t.id]; });
      };
      const flip = () => post(`flip:${dk}`, { thread: t.id, text: drafts.get(dk), resolve: t.open, reopen: !t.open }, () => { drafts.clear(dk); delete f.reply[t.id]; });
      return h('div', { class: `thread${t.open ? '' : ' closed'}`, 'data-row': `thread:${t.id}`, tabindex: '-1' },
        h('div', { class: 'thread-head' }, h('span', { class: `pin still${t.open ? '' : ' closed'}${L.reviewMark(t) ? ' review' : ''}` }, h('span', {}, String(n))), L.reviewMark(t) ? h('span', { class: 'mark review', title: 'A reviewer agent opened this thread' }, L.reviewMark(t)) : null, h('small', {}, L.whereText(a, label), t.open ? '' : ' · Resolved')),
        ...t.comments.map((c) => h('p', { class: 'c' }, h('b', {}, c.author), h('span', {}, c.text))),
        data.writable ? h('div', {}, writingReply ? draftField(dk, 'Reply') : null,
          failLine(`reply:${dk}`, reply), failLine(`flip:${dk}`, flip),
          h('div', { class: 'row' },
            h('button', { type: 'button', class: writingReply ? 'btn primary' : 'btn', fk: `reply:${t.id}`, disabled: busy.has(`reply:${dk}`), onclick: reply }, busy.has(`reply:${dk}`) ? 'Saving…' : writingReply ? 'Send the reply' : 'Reply'),
            h('button', { type: 'button', class: 'btn quiet', fk: `flip:${t.id}`, disabled: busy.has(`flip:${dk}`), onclick: flip }, busy.has(`flip:${dk}`) ? 'Saving…' : t.open ? 'Resolve' : 'Reopen'))) : null);
    };

    // What changed and what the decision is.
    const lastApproved = allVersions().find((v) => !v.draft && v.screens.some((e) => e.key === s.key));
    // An approved screen with no change needs one line; a screen that waits says why and what to do.
    const decision = past ? null : !draft && approved
      ? h('p', { class: 'decided' }, h('span', { class: 'mark ok' }, 'Approved'), ` ${day(approved.at)}. Nothing changed since.`, fresh ? ' You did not open it since its last change.' : '')
      : section(f, 'decision', 'Waits for your decision', null, [
        h('p', {}, draft ? `${draftName(draft)}${draft.reason ? `: ${draft.reason}` : ''}` : 'This screen has no approval yet.'),
        fresh ? h('p', { class: 'sub' }, fresh === 'new' ? 'New since your last visit.' : 'It changed since you last opened it.') : null,
        draft && lastApproved ? h('button', { type: 'button', class: 'btn quiet', fk: 'cmp:last', 'aria-pressed': String(f.compare === lastApproved.ref), onclick: () => { f.compare = f.compare === lastApproved.ref ? '' : lastApproved.ref; drawFocus(); } }, `Compare with ${longName(lastApproved)}`) : null,
        h('p', { class: 'how' }, 'Comment here, then answer the approval question of the agent in the chat.'),
      ], { tone: 'wait' });
    const total = fx?.failures ? fx.failures.length : failTotal(s);
    const checkRows = !fx ? h('p', { class: 'none' }, 'Loading the checks…')
      : fx.error ? h('p', { class: 'fail', role: 'alert' }, `The checks did not load: ${fx.error}. `, h('button', { type: 'button', class: 'linkish', fk: 'checks:retry', onclick: () => { failCache.delete(s.key); drawFocus(); } }, 'Retry'))
        : groups.length ? [
          total !== failuresHere.length ? h('p', { class: 'sub' }, `${failuresHere.length} of ${total} show in the ${f.viewport} viewport and the ${f.state} state.`) : null,
          ...groups.map((x, gi) => {
            const id = `check:${gi}`;
            const first = (fx.failures || []).find((q) => groupKeyOf(q) === groupKeyOf(x));
            const n = (fx.failures || []).filter((q) => groupKeyOf(q) === groupKeyOf(x)).length;
            const here = failuresHere.some((q) => groupKeyOf(q) === groupKeyOf(x));
            // What to tell the agent: the design step that repairs the check, or the repair that the check names.
            const fixText = x.move ? `To fix it, tell the agent: "Run the ${x.move} step of the design stage on ${s.key}."` : first?.do ? `To fix it, tell the agent: "${first.do}"` : `To fix it, tell the agent which check fails on ${s.key}.`;
            return h('div', { class: `check${f.sel === id ? ' sel' : ''}`, 'data-row': id, tabindex: '-1' },
              h('b', {}, CHECK_NAMES[x.check] || x.check), n > 1 ? h('span', { class: 'sev' }, `${n} times`) : null,
              h('p', {}, x.message),
              h('small', {}, `${x.viewports?.length ? `${list(x.viewports.map(cap))}, ` : ''}${list(x.states || []) || 'every'} state${(x.states || []).length > 1 ? 's' : ''}. ${fixText}`),
              first?.viewport && first?.state ? h('button', { type: 'button', class: 'linkish', fk: `show:${gi}`, onclick: () => {
                f.sel = id; f.checks = true;
                if (!here) { f.viewport = Object.keys(data.viewports).includes(first.viewport) ? first.viewport : f.viewport; f.state = data.states.includes(first.state) ? first.state : f.state; }
                drawFocus(); syncHash();
                $('#focus .box.sel')?.scrollIntoView({ block: 'center', inline: 'center' });
              } }, here ? 'Show it on the screen' : `Show it in the ${first.viewport} viewport, ${first.state} state`) : null);
          })] : h('p', { class: 'none' }, data.checks ? 'No check fails.' : 'No check has run yet.');
    // On a phone a part with nothing in it, or with much in it, is one line until the person opens it.
    // A part with nothing in it is one plain line.
    const line = (text) => h('p', { class: 'decided' }, text);
    const checks = past ? null : fx && !fx.error && !total ? line(data.checks ? 'No check fails.' : 'No check has run yet.')
      : section(f, 'checks', total ? cap(L.failText(total)) : 'Checks', null, checkRows, { long: (groups?.length || 0) > 2, tone: total ? 'bad' : '' });
    const comments = past ? null : !(s.threads || []).length && (ph || !data.writable) && !f.naming ? line('No comment yet.')
      : section(f, 'comments', openThreads.length ? plural(openThreads.length, 'open comment') : 'Comments', null, [
      data.writable && (authorName() || author.now || f.naming) ? authorLine(f) : null,
      ph ? null : composer,
      data.writable && !composer && !ph ? h('div', { class: 'row' },
        h('button', { type: 'button', class: 'btn', fk: 'c:el', onclick: () => { f.commenting = true; f.play = false; drawFocus(); } }, 'Comment on an element'),
        h('button', { type: 'button', class: 'btn', fk: 'c:whole', onclick: () => { f.commenting = true; f.play = false; f.pick = { whole: true }; drawFocus(); $(`#focus [data-fk="draft:${CSS.escape(key)}"]`)?.focus(); } }, 'Comment on the whole screen')) : null,
      (s.threads || []).length > openThreads.length ? h('label', { class: 'chk' }, h('input', { type: 'checkbox', fk: 'c:all', checked: f.all, onchange: (e) => { f.all = e.target.checked; drawFocus(); } }), 'Show resolved comments') : null,
      shown.length ? shown.map((t) => threadView(t, s.threads.indexOf(t) + 1)) : (s.threads || []).length ? h('p', { class: 'none' }, 'Every comment is resolved.') : null,
    ], { long: shown.length !== 1 });
    const material = [decision, checks, comments].filter(Boolean);

    const vlist = versionList(s, f);
    const why = whyView(s);
    const rest = [
      vlist ? section(f, 'versions', 'Versions', allVersions().filter((v) => !v.draft && v.screens.some((e) => e.key === s.key)).length || null, vlist, { long: true }) : null,
      !past && why ? section(f, 'why', 'Why it looks like this', null, why, { long: true }) : null,
      !past && s.components?.length ? section(f, 'components', 'Components', s.components.length, h('ul', { class: 'parts' }, ...s.components.map((k) => {
        const c = data.components.find((x) => x.key === k);
        const name = c?.title || k;
        return h('li', {}, c ? h('button', { type: 'button', class: 'linkish', fk: `comp:${k}`, title: `Show the screens that use ${name}`, onclick: () => traceFrom({ kind: 'component', key: k }) }, name) : name,
          h('span', { class: `mark ${!c ? 'issue' : c.code ? 'ok' : 'draft'}` }, !c ? 'Not in the library' : c.code ? 'In code' : 'To build'));
      })), { long: true }) : null,
      !past && s.tokens?.length ? section(f, 'tokens', 'Tokens', s.tokens.length, h('div', { class: 'chips' }, ...s.tokens.map((t) => h('button', { type: 'button', fk: `tok:${t}`, title: `${data.tokens.find((x) => x.name === t)?.value ?? 'Not in the token sheet'}. Show the screens that use it.`, onclick: () => traceFrom({ kind: 'token', key: t }) }, t))), { long: true }) : null,
      !past && findings.length ? section(f, 'audit', 'Audit', findings.length, findings.map((x, i) => findingView(x, false, `finding:${i}`, f.sel === `finding:${i}`)), { long: true }) : null,
    ].filter(Boolean);

    // ---- put the sheet together

    const sheet = kept && $('#focus .sheet');
    const cls = `sheet${f.full ? ' full' : ''}${ph ? ' narrow' : ''}`;
    // On a phone what needs the person comes before the screen; in a wide window it is the column beside it.
    const before = ph ? [header, f.full ? null : h('div', { class: 'material' }, material), tools] : [header, tools];
    const after = ph ? (f.full ? [] : [h('div', { class: 'rest' }, rest)]) : [h('section', { class: 'side', 'aria-label': 'About this screen' }, material, rest)];
    if (sheet) {
      sheet.className = cls;
      for (const c of [...sheet.children]) if (c !== view) c.remove();
      view.before(...before.filter(Boolean));
      view.after(...after);
    } else root.replaceChildren(h('div', { class: cls }, ...before.filter(Boolean), view, ...after));
    $('#focus > .composer')?.remove();
    if (ph && composer) root.append(composer);
    root.classList.toggle('composing', Boolean(ph && composer));

    // ---- sizes, marks, scrolls and focus, now that the sheet has its layout

    const bound = ph && !f.full ? Math.round(roomH() * 0.5) : 0;
    const scale = focusScale(f);
    for (const p of panes) {
      const wasBound = p.bound;
      p.scale = scale;
      p.bound = bound;
      if (p === live && kept && Boolean(wasBound) !== Boolean(bound)) hug(p); else sizeShot(p);
    }
    $('#focus .tools output')?.replaceChildren(`${Math.round(scale * 100)}%`);
    drawMarks();
    if (scrolls) {
      const side = $('#focus .side');
      if (side) side.scrollTop = scrolls.side;
      const sh = $('#focus .sheet');
      if (sh) sh.scrollTop = scrolls.sheet;
      view.scrollLeft = scrolls.viewX;
      view.scrollTop = scrolls.viewY;
    }
    if (fkWas) {
      const next = fkWas === '@' ? null : $(`#focus [data-fk="${CSS.escape(fkWas)}"]`);
      const to = next && !next.disabled ? next : $('#focus h2');
      to?.focus({ preventScroll: true });
      if (next && caret && next.setSelectionRange) { try { next.setSelectionRange(caret[0], caret[1]); } catch { /* not a text field */ } }
    }
    held();
  }
  /** On a phone, keep the selected element above the composer and the keyboard. */
  function keepPickInView() {
    if (!phone() || !focusState?.pick) return;
    const box = $('#focus .el-box.held:not([hidden])');
    const comp = $('#focus > .composer');
    const sc = focusScroller();
    if (!box || !comp || !sc) return;
    const r = box.getBoundingClientRect();
    const top = ($('#focus .sheet > header')?.getBoundingClientRect().bottom || 0) + 8;
    const bottom = comp.getBoundingClientRect().top - 8;
    if (r.top >= top && r.bottom <= bottom) return;
    sc.scrollTop += r.top - Math.max(top, (top + bottom - Math.min(r.height, bottom - top)) / 2);
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
    const rules = [...new Set(data.cards.filter((c) => c.screens.some((x) => x.key === s.key)).flatMap((c) => c.rules || []))];
    if (!decisions.length && !rules.length) return null;
    const many = new Set(decisions.map((d) => d.workflow)).size > 1;
    return [...decisions.map((d) => h('div', { class: 'why' }, h('b', {}, d.question || d.id), h('p', {}, d.answer ?? ''), many ? h('small', {}, d.workflow) : null)),
      rules.length ? [h('h4', {}, 'Rules of the visual contract'), h('ul', { class: 'rules' }, ...rules.map((r) => h('li', {}, r)))] : null];
  }
  /** The check failures of one screen, one entry for each cause, with its viewports and states. The server groups them. */
  const groupsOf = (s) => (Array.isArray(s.failureGroups) ? s.failureGroups : []);
  /** One audit finding. In the panel, it also names its screen, which opens the screen. */
  function findingView(x, inPanel = false, row = null, selected = false) {
    const s = x.screen ? data.screens.find((q) => q.key === x.screen) : null;
    const where = [
      inPanel && s ? h('button', { type: 'button', class: 'linkish', onclick: () => openScreen(s.key, { state: x.state }) }, `${titleOf(s)}, ${x.state} state`) : null,
      x.file ? h('code', {}, `${x.file}${x.line ? `:${x.line}` : ''}`) : null,
    ].filter(Boolean);
    return h('div', { class: `check audit${selected ? ' sel' : ''}`, 'data-row': row, tabindex: row ? '-1' : null },
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
        if (focusState && !typing()) drawFocus();
        if (ui.panel === 'health') panel('health', true);
      }
      pollAudit();
    }, 5000);
  }
  async function runAudit() {
    audit = await send('audit', { workflow: ui.workflow || null });
    drawHealth();
    pollAudit();
  }
  /** The screens with a failing check, and the open comments of the board. */
  function reviewCounts() {
    const failing = data.screens.filter((s) => failTotal(s));
    const commented = data.screens.filter((s) => s.openComments);
    return { failing, commented, comments: commented.reduce((n, s) => n + s.openComments, 0), waiting: data.screens.filter(waits) };
  }
  // ------------------------------------------------------------ seen screens

  // This browser keeps the fingerprint of each screen that the person saw. A screen whose fingerprint
  // differs carries the mark Changed until the person opens it in the screen view; a screen with no
  // fingerprint carries New. On the first visit, the board takes every screen as seen. Each device
  // keeps its own fingerprints.
  let seen = null;
  const seenKey = () => `wf-canvas-seen:${data.repo || location.pathname}`;
  function saveSeen() {
    try { localStorage.setItem(seenKey(), JSON.stringify(seen)); } catch { /* the marks last for this visit */ }
  }
  function seenInit() {
    if (SNAP || seen) return;
    try { seen = JSON.parse(localStorage.getItem(seenKey()) || 'null'); } catch { seen = null; }
    if (!seen || typeof seen !== 'object' || Array.isArray(seen)) {
      seen = Object.fromEntries(data.screens.map((s) => [s.key, s.fingerprint]));
      saveSeen();
    }
  }
  /** 'new', 'changed', or null when the person saw the screen as it is now. */
  function unseenOf(s) {
    if (!seen || !s.fingerprint || !s.exists) return null;
    const f = seen[s.key];
    return f === undefined ? 'new' : f === s.fingerprint ? null : 'changed';
  }
  const unseen = () => data.screens.filter((s) => unseenOf(s));
  function markSeen(...keys) {
    if (!data) return;
    let changed = false;
    for (const key of keys) {
      const s = data.screens.find((x) => x.key === key);
      if (!seen || !s?.fingerprint || seen[key] === s.fingerprint) continue;
      seen[key] = s.fingerprint;
      changed = true;
    }
    if (!changed) return;
    saveSeen();
    drawHealth();
    render();
    if (ui.panel === 'health') panel('health', true);
  }

  // ------------------------------------------------------------ the review panel

  /** The control of the bar: its name, then what still needs a look on the board, in one line. */
  function drawHealth() {
    const { failing, comments, waiting } = reviewCounts();
    const changed = unseen().length;
    const parts = [
      waiting.length ? `${waiting.length} wait for you` : null,
      changed ? `${changed} changed` : null,
      data.checks ? (failing.length ? `${plural(failing.length, 'screen')} with failing checks` : 'checks pass') : 'no check yet',
      comments ? plural(comments, 'open comment') : null,
      audit?.status === 'running' ? 'audit running' : audit?.status === 'done' ? plural((audit.findings || []).length, 'audit finding') : null,
    ].filter(Boolean);
    $('#hcounts').textContent = parts.join(' · ');
    const b = $('#health');
    b.classList.toggle('bad', failing.length > 0);
    b.classList.toggle('fresh', changed > 0 || waiting.length > 0);
  }
  /** A list of screens of the panel: the first ones, and the others behind one line. */
  function screenList(list, markOf = () => null) {
    const row = (s) => h('li', {}, h('button', { type: 'button', class: 'linkish', fk: `open:${s.key}`, onclick: () => { closePanel(); openScreen(s.key); } }, titleOf(s)), markOf(s) ? h('span', { class: 'sub' }, markOf(s)) : null);
    const first = list.slice(0, 6);
    const more = list.slice(6);
    return [h('ul', { class: 'changes' }, ...first.map(row)),
      more.length ? h('details', { class: 'more' }, h('summary', {}, `and ${more.length} more`), h('ul', { class: 'changes' }, ...more.map(row))) : null];
  }
  function healthPanel() {
    const { failing, commented, comments, waiting } = reviewCounts();
    const only = (key) => h('button', { type: 'button', class: 'btn', fk: `only:${key}`, onclick: () => {
      Object.assign(ui, { waiting: false, fresh: false, open: false, failing: false, [key]: true });
      for (const id of ['waiting', 'fresh', 'open', 'failing']) $(`#${id}`).checked = ui[id];
      filterCount(); applyFilter(); closePanel();
      if (!phone()) { const cards = $$('#board > .card:not(.dim)'); if (cards.length) { fit(cards); if (ui.zoom < READABLE) firstFitTo(cards); } }
    } }, 'Show only these');
    const fresh = unseen();
    return [h('h2', { tabindex: '-1' }, 'Review'), h('p', { class: 'lede' }, 'What still needs you on this board.'),
      h('h3', {}, waiting.length ? `Waiting for your decision: ${plural(waiting.length, 'screen')}` : 'Waiting for your decision'),
      waiting.length ? [screenList(waiting, (s) => (draftOf(s) ? 'Draft' : 'Not approved')), only('waiting')] : h('p', { class: 'none' }, 'No screen waits for a decision.'),
      h('p', { class: 'how' }, 'To decide: comment here on what must change, then answer the approval question of the agent in the chat.'),
      SNAP ? null : [h('h3', {}, fresh.length ? `Changed since your last visit: ${plural(fresh.length, 'screen')}` : 'Changed since your last visit'),
        fresh.length ? [screenList(fresh, (s) => (unseenOf(s) === 'new' ? 'New' : 'Changed')),
          h('div', { class: 'row' }, only('fresh'), h('button', { type: 'button', class: 'btn quiet', fk: 'seen:all', onclick: () => markSeen(...fresh.map((s) => s.key)) }, 'Mark all as seen')),
          h('p', { class: 'sub' }, 'Opening a screen clears its mark.')]
          : h('p', { class: 'none' }, 'You saw every screen as it is now.')],
      h('h3', {}, failing.length ? `Failing checks: ${plural(failing.length, 'screen')}` : 'Failing checks'),
      !data.checks ? h('p', { class: 'none' }, 'No check has run yet.')
        : failing.length ? [screenList(failing, (s) => L.failText(failTotal(s))), only('failing')] : h('p', { class: 'none' }, 'Every check passes.'),
      h('h3', {}, comments ? `Open comments: ${comments} on ${plural(commented.length, 'screen')}` : 'Open comments'),
      comments ? [screenList(commented, (s) => plural(s.openComments, 'comment')), only('open')] : h('p', { class: 'none' }, 'No open comment.'),
      ...auditPanel()];
  }
  function firstFitTo(cards) {
    const { x0, y0 } = boundsOf(cards);
    ui.zoom = 0.5;
    ui.x = 48 - x0 * ui.zoom;
    ui.y = 48 - (y0 - LABEL_H) * ui.zoom;
    place();
  }
  function auditPanel() {
    const head = [h('h3', {}, 'Design audit'), h('p', { class: 'sub' }, 'A read-only agent checks the screens and the built code against DESIGN.md and the audit rules. It changes no file and writes no record.')];
    if (SNAP) return [...head, h('p', {}, 'The audit runs only on the design server.')];
    const runningNow = audit?.status === 'running';
    const starting = busy.has('audit');
    const scope = ui.workflow ? `the screens of ${ui.workflow}` : 'every screen';
    const sure = ui.confirm === 'audit';
    const redraw = () => { if (ui.panel === 'health') panel('health', true); };
    const run = h('div', { class: 'audit-run' },
      h('button', { type: 'button', class: 'btn primary', fk: 'audit:run', disabled: runningNow || starting || !data.writable, onclick: () => {
        // An audit is a paid run of some minutes: it starts on the second press.
        if (!sure) { ui.confirm = 'audit'; redraw(); return; }
        ui.confirm = '';
        act('audit', runAudit, redraw);
      } }, runningNow || starting ? 'Running…' : sure ? 'Confirm: start the audit' : 'Run audit'),
      sure ? h('button', { type: 'button', class: 'btn quiet', fk: 'audit:no', onclick: () => { ui.confirm = ''; redraw(); } }, 'Cancel') : null,
      h('span', { class: 'sub' }, sure ? `It audits ${scope}, takes a few minutes, and costs model use.` : `Audits ${scope}. The workflow filter sets the scope.`));
    const failed = failLine('audit', null, 'The audit did not start');
    const when = (t) => (t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
    if (!audit || audit.status === 'none') return [...head, run, failed, h('p', { class: 'none' }, 'No audit has run.')];
    if (runningNow) return [...head, run, h('p', {}, `The audit of ${audit.workflow || 'every screen'} started at ${when(audit.startedAt)}. A run takes a few minutes. The report shows here when it is done.`)];
    if (audit.status === 'failed') return [...head, run, failed, h('div', { class: 'check' }, h('b', {}, 'The audit failed'), h('p', {}, audit.error || 'No reason.'), h('small', {}, when(audit.endedAt || audit.startedAt)))];
    const sc = audit.scores || {};
    const bySev = (n) => (audit.findings || []).filter((x) => x.severity === n).length;
    const counts = ['blocker', 'high', 'medium', 'low'].map((n) => [n, bySev(n)]).filter(([, c]) => c).map(([n, c]) => `${c} ${n}`).join(', ');
    return [...head, run, failed,
      h('p', {}, audit.summary || ''),
      h('p', { class: 'sub' }, `${audit.workflow || 'Every screen'}, ${audit.platform && audit.platform !== 'unknown' ? `${audit.platform}, ` : ''}${when(audit.endedAt)}${typeof audit.costUsd === 'number' ? `, $${audit.costUsd.toFixed(2)}` : ''}.`),
      h('h4', {}, 'Scores (0 to 4)'),
      h('div', { class: 'scores' }, ...Object.keys(DIMENSION_NAMES).flatMap((d) => [
        h('span', {}, DIMENSION_NAMES[d]),
        h('span', { class: 'meter', role: 'img', 'aria-label': `${DIMENSION_NAMES[d]}: ${sc[d] ?? 'no score'} of 4` }, ...[1, 2, 3, 4].map((i) => h('i', { class: sc[d] >= i ? 'on' : null }))),
        h('b', {}, sc[d] === null || sc[d] === undefined ? '–' : String(sc[d]))])),
      h('h4', {}, 'Findings', counts ? h('span', { class: 'sub' }, ` ${counts}`) : null),
      ...((audit.findings || []).length ? audit.findings.map((x) => findingView(x, true)) : [h('p', { class: 'none' }, 'No finding.')])];
  }

  // ------------------------------------------------------------ panels

  let panelFrom = null;
  function closePanel() {
    const p = $('#panel');
    const had = p.contains(document.activeElement);
    p.hidden = true;
    ui.panel = null;
    if (ui.confirm === 'audit') ui.confirm = '';
    for (const b of $$('[data-panel]')) { b.classList.remove('on'); b.setAttribute('aria-expanded', 'false'); }
    if (had) (panelFrom?.isConnected ? panelFrom : $('#health')).focus({ preventScroll: true });
    panelFrom = null;
  }
  function panel(name, redraw = false) {
    const p = $('#panel');
    if (!redraw && ui.panel === name && !p.hidden) { closePanel(); return; }
    const opening = !redraw || p.hidden;
    if (opening && !p.contains(document.activeElement)) panelFrom = document.activeElement;
    ui.panel = name;
    for (const b of $$('[data-panel]')) { b.classList.toggle('on', b.dataset.panel === name); b.setAttribute('aria-expanded', String(b.dataset.panel === name)); }
    const body = detailOf(name);
    if (!body) { closePanel(); return; }
    const active = document.activeElement;
    const fkWas = p.contains(active) ? active.dataset.fk || '@' : null;
    const top = p.scrollTop;
    const opened = new Set($$('details.more', p).map((d, i) => (d.open ? i : -1)));
    const close = h('button', { type: 'button', class: 'close', fk: 'close', 'aria-label': 'Close the panel', onclick: closePanel }, '×');
    p.replaceChildren(close, ...body.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
    $$('details.more', p).forEach((d, i) => { if (opened.has(i)) d.open = true; });
    p.hidden = false;
    p.setAttribute('aria-label', $('h2', p)?.textContent || 'Panel');
    if (!redraw || opening) { p.scrollTop = 0; $('h2', p)?.focus({ preventScroll: true }); return; }
    p.scrollTop = top;
    if (fkWas) ((fkWas !== '@' && $(`[data-fk="${CSS.escape(fkWas)}"]`, p)) || $('h2', p))?.focus({ preventScroll: true });
  }
  /**
   * The content of the panel: the review of the board (`health`), or the detail of one item of a
   * lane (`sketch:<key>`, `reference:<key>`, `component:<key>`). Null when the item is gone.
   */
  function detailOf(name) {
    if (name === 'health') return healthPanel();
    const at = name.indexOf(':');
    const kind = name.slice(0, at);
    const key = name.slice(at + 1);
    const newTab = (href, text) => h('p', {}, h('a', { href, target: '_blank', rel: 'noopener', class: 'out' }, text));
    if (kind === 'sketch') {
      const x = data.explore.find((e) => e.key === key);
      if (!x) return null;
      return [h('h2', { tabindex: '-1' }, x.title || x.key), h('p', { class: 'lede' }, x.link ? `A sketch for ${x.link}, before any screen.` : 'A sketch from a brainstorm or an intake, before any screen.'),
        SNAP ? null : h('iframe', { class: 'part tall', title: x.title || x.key, sandbox: 'allow-scripts allow-same-origin', src: `${BASE}s/explore/${x.key}.html` }),
        SNAP ? null : newTab(`${BASE}s/explore/${x.key}.html`, 'Open the sketch in a new tab'),
        h('p', { class: 'sub' }, h('code', {}, x.file))];
    }
    if (kind === 'reference') {
      const r = data.references.find((e) => e.key === key);
      if (!r) return null;
      const src = `${BASE}ref/${encodeURIComponent(r.key)}`;
      return [h('h2', { tabindex: '-1' }, r.key), h('p', { class: 'lede' }, `${cap(r.kind || 'other')}${r.note ? `: ${r.note}` : ''}`),
        r.readable ? null : h('div', { class: 'check' }, h('b', {}, 'Unreadable'), h('p', {}, r.problem)),
        !SNAP && r.readable && r.kind === 'image' ? h('img', { class: 'part', src, alt: r.note || r.key }) : null,
        !SNAP && r.readable && ['page', 'screen', 'canvas'].includes(r.kind) ? h('iframe', { class: 'part tall', title: r.key, sandbox: 'allow-scripts', src }) : null,
        !SNAP && r.readable ? newTab(src, 'Open the file in a new tab') : null,
        r.link && /^https?:/i.test(r.link) ? newTab(r.link, 'Open the source') : null,
        r.file ? h('p', { class: 'sub' }, h('code', {}, r.file)) : null];
    }
    if (kind === 'component') {
      const c = data.components.find((e) => e.key === key);
      if (!c) return null;
      const t = { kind: 'component', key };
      const on = traceId(ui.trace) === traceId(t);
      const spec = c.spec;
      const themes = (spec?.themes?.length ? spec.themes : (data.themes || []).map((x) => x.name)).filter((x) => x && x !== 'default');
      let theme = ui.componentTheme && themes.includes(ui.componentTheme) ? ui.componentTheme : (themes.includes(data.defaultTheme) ? data.defaultTheme : themes[0] || null);
      const frame = SNAP ? null : h('iframe', { class: 'part tall', title: c.title, loading: 'lazy', sandbox: 'allow-scripts allow-same-origin', src: componentSrc(c.key, theme) });
      const out = SNAP ? null : h('a', { href: componentSrc(c.key, theme), target: '_blank', rel: 'noopener', class: 'out' }, 'Open the component in a new tab');
      const switches = !SNAP && themes.length > 1 ? h('div', { class: 'seg themes', role: 'group', 'aria-label': 'Theme' }, ...themes.map((name) => h('button', {
        type: 'button', fk: `theme:${name}`, 'aria-pressed': String(name === theme),
        onclick: (e) => {
          theme = name;
          ui.componentTheme = name;
          frame.src = componentSrc(c.key, name);
          out.href = componentSrc(c.key, name);
          for (const b of e.currentTarget.parentElement.children) b.setAttribute('aria-pressed', String(b === e.currentTarget));
        },
      }, name))) : null;
      const dims = Object.entries(spec?.variants || {});
      const tokensOf = c.tokens || [];
      return [h('h2', { tabindex: '-1' }, c.title, ' ', componentMarks(c)),
        h('p', { class: 'lede' }, c.kind === 'layout' ? 'A page shell that the screens lay out their parts in. The code must use it.' : 'A component that the screens reuse. The code must use it.'),
        switches, frame, out ? h('p', {}, out) : null,
        c.code ? h('p', {}, h('code', {}, c.name), ' in ', h('code', {}, c.code)) : h('p', {}, 'New. The build makes it, and the code must use it.'),
        h('h3', {}, 'Variants', dims.length ? h('span', { class: 'count' }, String(dims.length)) : null),
        dims.length ? h('table', { class: 'spec' }, h('tbody', {}, ...dims.map(([dim, values]) => h('tr', {}, h('th', { scope: 'row' }, dim), h('td', {}, values.join(', '))))))
          : h('p', { class: 'none' }, spec?.declared ? 'One look: the spec declares no variant.' : 'The page declares no variants.'),
        h('h3', {}, 'States', spec?.states?.length ? h('span', { class: 'count' }, String(spec.states.length)) : null),
        spec?.states?.length ? h('div', { class: 'chips' }, ...spec.states.map((x) => h('span', { class: 'tag' }, x))) : h('p', { class: 'none' }, 'The page declares no states.'),
        (c.problems || []).length ? [h('h3', {}, 'What the spec lacks', h('span', { class: 'count' }, String(c.problems.length))),
          h('ul', { class: 'changes gaps' }, ...c.problems.map((x) => h('li', {}, x.message)))] : null,
        h('h3', {}, 'Tokens it uses', tokensOf.length ? h('span', { class: 'count' }, String(tokensOf.length)) : null),
        tokensOf.length ? h('div', { class: 'chips' }, ...tokensOf.map((name) => h('button', { type: 'button', fk: `tok:${name}`,
          title: `${data.tokens.find((x) => x.name === name)?.value ?? 'Not in the token model'}. Show the screens that use it.`, onclick: () => traceTo({ kind: 'token', key: name }) }, name)))
          : h('p', { class: 'none' }, 'The component sheet gives it no token.'),
        h('h3', {}, 'Used by', c.screens.length ? h('span', { class: 'count' }, String(c.screens.length)) : null),
        c.screens.length ? [h('ul', { class: 'changes' }, ...c.screens.map((k) => h('li', {}, h('button', { type: 'button', class: 'linkish', fk: `open:${k}`, onclick: () => openScreen(k) }, titleOf(data.screens.find((x) => x.key === k) || { key: k }))))),
          h('button', { type: 'button', class: 'btn', fk: 'trace', 'aria-pressed': String(on), onclick: () => { traceTo(t); panel(name, true); } }, on ? 'Show every screen' : 'Show only these screens')]
          : h('p', { class: 'none' }, 'No screen uses it yet.')];
    }
    return null;
  }

  // ------------------------------------------------------------ controls

  /** True while a text field of the screen view has the focus: a redraw now would interrupt the typing. */
  function typing() {
    const el = document.activeElement;
    return Boolean(focusState && el?.closest?.('#focus') && el.matches('textarea, input[type="text"]'));
  }
  function wire() {
    for (const b of $$('[data-view]')) {
      b.addEventListener('click', () => {
        ui.view = b.dataset.view;
        ui.fitted = false;
        for (const x of $$('[data-view]')) { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }
        render();
      });
    }
    for (const b of $$('[data-panel]')) b.addEventListener('click', () => panel(b.dataset.panel));
    const filter = (id, key, value) => $(id).addEventListener('change', (e) => { ui[key] = value(e.target); filterCount(); applyFilter(); if (ui.panel === 'health') panel('health', true); });
    $('#trace').addEventListener('click', () => traceTo(null));
    filter('#area', 'area', (t) => t.value);
    filter('#workflow', 'workflow', (t) => t.value);
    $('#workflow').addEventListener('change', () => { const was = ui.version; drawVersions(); if (was !== ui.version) render(); });
    for (const id of ['waiting', 'fresh', 'open', 'failing']) filter(`#${id}`, id, (t) => t.checked);
    $('#viewport').addEventListener('change', (e) => { ui.viewport = e.target.value; render(); });
    $('#state').addEventListener('change', (e) => setState(e.target.value));
    $('#version').addEventListener('change', (e) => { ui.version = e.target.value; drawPast(); render(); });
    $('#q').addEventListener('input', (e) => { ui.q = e.target.value; applyFilter(); });
    $('#zin').addEventListener('click', () => zoomBy(1.25));
    $('#zout').addEventListener('click', () => zoomBy(0.8));
    $('#zfit').addEventListener('click', () => fit());
    document.addEventListener('click', (e) => { if (!e.target.closest('#filters')) $('#filters').open = false; });
    document.addEventListener('keydown', (e) => {
      // The arrow keys walk the screens in the screen view, unless a field or a control has the key.
      if (focusState && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !e.altKey && !e.ctrlKey && !e.metaKey
        && !e.target.closest?.('input, textarea, select, [contenteditable]')) {
        e.preventDefault();
        step(e.key === 'ArrowLeft' ? -1 : 1);
        $(`#focus [data-fk="step:${e.key === 'ArrowLeft' ? -1 : 1}"]`)?.focus({ preventScroll: true });
        return;
      }
      if (e.key !== 'Escape') return;
      if (focusState) {
        // Escape never loses what was typed: it leaves the field and the comment mode, and the draft stays.
        const field = typing() ? document.activeElement : null;
        if (focusState.commenting || focusState.pick) { focusState.commenting = false; focusState.pick = null; $('#focus h2')?.focus({ preventScroll: true }); drawFocus(); }
        else if (field && field.value.trim()) { $('#focus h2')?.focus({ preventScroll: true }); held(); }
        else if (focusState.full) { focusState.full = false; focusState.zoom = 'fit'; drawFocus(); }
        else closeFocus();
      } else if ($('#filters').open) { $('#filters').open = false; $('#filters > summary').focus(); }
      else if (ui.panel) closePanel();
      else if (ui.trace) traceTo(null);
    });
    // A field of the screen view that loses the focus lets a change that waited load.
    document.addEventListener('focusout', () => { setTimeout(() => { if (pending && !holding()) applyChange(pending); else held(); }, 0); });
    addEventListener('popstate', fromHash);
    addEventListener('hashchange', fromHash);
    // A resize comes many times a second, and on a phone also while the person scrolls. Once a
    // frame, the board redraws when its sizes change. The screen view redraws around its page.
    let last = `${phone()}|${document.documentElement.clientWidth}`;
    let resizeFrame = 0;
    addEventListener('resize', () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        barHeight();
        const ph = phone();
        const sig = `${ph}|${document.documentElement.clientWidth}`;
        const wider = sig !== last;
        last = sig;
        // The list of a phone follows its width; the board of a wide window has cards of one width.
        if (data && wider && (ph || M?.phone !== ph)) { if (M?.phone !== ph) ui.fitted = false; render(); }
        // The bar of a phone browser comes and goes while the person scrolls: that changes no layout.
        if (focusState && !typing() && (wider || !ph)) drawFocus();
      });
    });
    // The keyboard of a phone covers the bottom of the window: the composer sits above it.
    const vv = window.visualViewport;
    if (vv) {
      const lift = () => {
        document.documentElement.style.setProperty('--kb', `${Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))}px`);
        keepPickInView();
      };
      vv.addEventListener('resize', lift);
      vv.addEventListener('scroll', lift);
    }
    panZoom();
  }

  // ------------------------------------------------------------ live updates

  // The server pushes each change of the repo: an agent wrote a page, a person commented from the
  // phone, a check ran. The canvas loads the new state and reloads only the pages that changed.
  // A drag, or a field that the person types in, holds the change until it ends; a line says so.
  let pending = null;
  let es = null;
  let downTimer = null;
  let reopenTimer = null;
  function listen() {
    if (SNAP || !window.EventSource) return;
    listen.tries ||= 0;
    clearTimeout(reopenTimer);
    es?.close();
    es = new EventSource(`${BASE}events`);
    // Each stream starts with the boot of the server. A stream that opens again missed the changes
    // made while it was down: the canvas reads the state, and reloads only what differs. A new
    // server runs new code: the canvas reloads, unless that would lose a draft or a drag.
    es.addEventListener('hello', (e) => {
      let hello = null;
      try { hello = JSON.parse(e.data); } catch { return; }
      clearTimeout(downTimer);
      downTimer = null;
      listen.tries = 0;
      unnotice('down');
      if (hello.writeToken || hello.token) token = hello.writeToken || hello.token;
      if (listen.boot === undefined) { listen.boot = hello.boot; return; }
      if (hello.boot !== listen.boot) {
        listen.boot = hello.boot;
        if (drafts.any() || ui.dragging) notice('restart', 'The server restarted: reload when you are ready. What you typed stays.', { text: 'Reload', run: () => location.reload() });
        else { location.reload(); return; }
      }
      applyChange(L.mergeChange(pending, { catchUp: true, all: false, pages: [], parts: [] }));
    });
    es.addEventListener('change', (e) => {
      let change = null;
      try { change = JSON.parse(e.data); } catch { return; }
      applyChange(L.mergeChange(pending, { all: Boolean(change.all), pages: change.pages || [], parts: change.parts || [] }));
    });
    es.addEventListener('error', () => {
      // A short gap is a phone that woke up: the line shows only when the gap lasts.
      if (!downTimer) downTimer = setTimeout(() => { downTimer = null; notice('down', `Not connected: the board shows the screens as of ${clock(loadedAt)}.`, { text: 'Retry', run: () => { listen(); load().catch(loadFailed); } }); }, 4000);
      // A stream that the browser gave up on opens again.
      // The server refuses a stream when too many are open: each try waits longer than the last.
      if (es.readyState === 2) { clearTimeout(reopenTimer); reopenTimer = setTimeout(listen, L.reopenDelay(listen.tries)); listen.tries += 1; }
    });
  }
  /** Reload the page of a frame in place, so the frame keeps its place and its state. */
  function reloadFrame(ifr) {
    try { ifr.contentWindow.location.reload(); } catch { const src = ifr.src; ifr.src = src; }
  }
  const holding = () => Boolean(ui.dragging || typing() || applying);
  /** Say that updates wait, while they do. */
  function held() {
    if (pending && (ui.dragging || typing())) notice('held', ui.dragging ? 'Updates are waiting while you move a screen.' : 'Updates are waiting while you write.');
    else unnotice('held');
  }
  let applying = false;
  async function applyChange(change) {
    if (holding()) { pending = L.mergeChange(pending, change); held(); holdRetry(); return; }
    pending = null;
    held();
    applying = true;
    try {
      const before = data;
      let { all, pages, parts } = change;
      const named = Boolean(all || pages.length || parts.length);
      // The canvas was away: the state says what changed. The same state changes nothing.
      const fresh = await load({ ifChanged: Boolean(change.catchUp) && !named });
      if (!fresh) return;
      let lanes = false;
      // The sheets that every page links changed: every screen shows another design.
      if (before && (before.sheets?.fingerprint ?? null) !== (data.sheets?.fingerprint ?? null)) all = true;
      if (change.catchUp) {
        const d = L.diffStates(before, data);
        all = all || d.all;
        pages = [...new Set([...pages, ...d.pages])];
        lanes = d.lanes || (!d.pages.length && !d.all);
      }
      const touched = (key) => all || pages.includes(key);
      for (const card of $$('#board > .card')) {
        const ifr = card.firstChild.querySelector(':scope > iframe');
        if (ifr && touched(card.dataset.key)) reloadFrame(ifr);
      }
      for (const ifr of $$('#board .lane iframe')) {
        if (all || lanes || parts.some((p) => ifr.src.endsWith(`/s/${p}`))) reloadFrame(ifr);
      }
      if (focusState && touched(focusState.key)) {
        // The page of the open screen loads again in its frame; the sheet around it stays.
        for (const ifr of $$('#focus .view iframe')) reloadFrame(ifr);
      }
      const n = all ? 'every screen' : pages.length ? plural(pages.length, 'screen') : null;
      if (n) say(`Updated: ${n}`);
    } catch (e) { loadFailed(e); } finally {
      applying = false;
      if (pending) applyChange(pending);
    }
  }
  // A held change runs once the field loses the focus or the drag ends. The canvas also looks
  // again each second while a change waits.
  let retry = null;
  function holdRetry() {
    if (retry) return;
    retry = setTimeout(() => {
      retry = null;
      if (pending && !applying) applyChange(pending);
    }, 1000);
  }

  wire();
  listen();
  load().then(fromHash, loadFailed);
})();
