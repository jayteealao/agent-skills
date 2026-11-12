// The inspector and the mode switch of the design canvas.
//
// Inspect: in the screen view, the element under the pointer (or the finger) shows the component it
// belongs to, its variants and whether the spec declares them, and for each design property the
// token that gives its value, through the custom properties of components.css, with the rule and
// the sheet that set it. A value that no token gives shows as raw, with the nearest token.
// The panel has the component block, then three tabs: the tokens, the layout with the rule of
// each value, and the checks of the element. A raw value becomes a comment for the agent in one press.
//
// The mode switch: one theme of the token model on every frame of the board, or the system's.
//
// The file has two parts, like canvas.js. `WF_CANVAS_INSPECT_LOGIC` holds the rules that need no
// browser; the tests load it alone. The second part gives `WF_CANVAS_INSPECT.create()`, which
// canvas.js calls, and returns at once where there is no document.

// eslint-disable-next-line no-var, no-unused-vars
var WF_CANVAS_INSPECT_LOGIC = (() => {
  'use strict';

  /** The design properties the inspector shows, each with the token kind it takes and the shorthands that can set it. */
  const PROPS = [
    ['color', 'color', []],
    ['background-color', 'color', ['background']],
    ['border-color', 'color', ['border-top-color', 'border', 'border-top']],
    ['padding-top', 'space', ['padding']], ['padding-right', 'space', ['padding']], ['padding-bottom', 'space', ['padding']], ['padding-left', 'space', ['padding']],
    ['margin-top', 'space', ['margin']], ['margin-right', 'space', ['margin']], ['margin-bottom', 'space', ['margin']], ['margin-left', 'space', ['margin']],
    ['gap', 'space', ['row-gap', 'column-gap']],
    ['width', 'size', []], ['height', 'size', []],
    ['border-radius', 'radius', ['border-top-left-radius']],
    ['font-family', 'font', ['font']], ['font-size', 'type', ['font']], ['font-weight', 'weight', ['font']], ['line-height', 'leading', ['font']],
    ['box-shadow', 'shadow', []], ['z-index', 'layer', []],
    ['transition-duration', 'motion', ['transition']],
  ];
  /** The properties that an element takes from its parent when no rule of its own sets them. */
  const INHERITED = new Set(['color', 'font-family', 'font-size', 'font-weight', 'line-height']);

  /** A selector list split at its top-level commas. */
  function splitList(text) {
    const out = [];
    let depth = 0;
    let from = 0;
    const s = String(text ?? '');
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      if (c === '(' || c === '[') depth += 1;
      else if (c === ')' || c === ']') depth -= 1;
      else if (c === ',' && depth === 0) { out.push(s.slice(from, i).trim()); from = i + 1; }
    }
    out.push(s.slice(from).trim());
    return out.filter(Boolean);
  }
  /** The specificity of one selector as [ids, classes, types]: close enough to order two rules. */
  function specificity(sel) {
    const s = String(sel ?? '').replace(/:where\([^)]*\)/g, '').replace(/"[^"]*"|'[^']*'/g, '');
    const ids = (s.match(/#[\w-]+/g) || []).length;
    const classes = (s.match(/\.[\w-]+|\[[^\]]*\]|(?<!:):(?!not\b|is\b)[\w-]+/g) || []).length;
    const types = (s.replace(/\[[^\]]*\]/g, '').match(/(?:^|[\s>+~(])[a-z][\w-]*/gi) || []).length + (s.match(/::[\w-]+/g) || []).length;
    return [ids, classes, types];
  }
  const cmpSpec = (a, b) => (a[0] - b[0]) || (a[1] - b[1]) || (a[2] - b[2]);
  /**
   * The declaration that wins among `decls` (`{ value, important, spec, order }`): an important one
   * first, then the higher specificity, then the later in source order. Null when there is none.
   */
  function cascade(decls) {
    let best = null;
    for (const d of decls || []) {
      if (!d || d.value === '' || d.value === null || d.value === undefined) continue;
      if (!best) { best = d; continue; }
      const imp = Number(Boolean(d.important)) - Number(Boolean(best.important));
      const spec = imp || cmpSpec(d.spec || [0, 0, 0], best.spec || [0, 0, 0]);
      if (spec > 0 || (spec === 0 && (d.order ?? 0) >= (best.order ?? 0))) best = d;
    }
    return best;
  }

  /** The custom properties that a value reads, in order: `var(--a, var(--b))` gives both. */
  const varNames = (value) => [...String(value ?? '').matchAll(/var\(\s*(--[\w-]+)/g)].map((m) => m[1]);
  /** The value with its var() calls taken out, fallbacks and all. */
  function withoutVars(value) {
    let text = String(value ?? '');
    for (let at = text.search(/var\(/i); at >= 0; at = text.search(/var\(/i)) {
      let depth = 0;
      let end = at + 3;
      for (; end < text.length; end += 1) {
        if (text[end] === '(') depth += 1;
        else if (text[end] === ')') { depth -= 1; if (depth === 0) break; }
      }
      text = `${text.slice(0, at)} ${text.slice(end + 1)}`;
    }
    return text.replace(/!important/gi, '').replace(/\s+/g, ' ').trim();
  }
  /**
   * Follow a custom property to the token that it stands for. `lookup(name)` gives the value that
   * the element sees for a custom property that is not a token (an alias of components.css), or
   * undefined. Gives `{ token, chain, value }`: `chain` the aliases passed, `token` null when the
   * chain ends in a value of its own (`value`) or in nothing.
   */
  function follow(name, lookup, tokenNames, seen = new Set()) {
    const chain = [];
    let n = name;
    while (n && !seen.has(n)) {
      if (tokenNames.has(n)) return { token: n, chain, value: null };
      seen.add(n);
      chain.push(n);
      const v = lookup(n);
      if (v === undefined || v === null || v === '') return { token: null, chain, value: null };
      const next = varNames(v)[0];
      if (!next) return { token: null, chain, value: String(v).trim() };
      n = next;
    }
    return { token: null, chain, value: null };
  }

  // ---- raw values: the rules of the design check (lib/design-check.mjs rawValue, rawLength)

  const KEYWORDS = /^(?:inherit|initial|unset|revert|revert-layer|none|auto|normal|fit-content|min-content|max-content|transparent|currentcolor)$/i;
  /** The first raw length of a value, or null: 0, a bare number, %, fr, viewport units and 2 px or less pass. */
  function rawLength(text) {
    for (const m of String(text ?? '').replace(/url\([^)]*\)/gi, ' ').matchAll(/(?<![\w#.-])(-?(?:\d+\.?\d*|\.\d+))([a-z%]*)/gi)) {
      const n = Number(m[1]);
      const unit = m[2].toLowerCase();
      if (!unit || n === 0 || /^(?:%|fr|vw|vh|vi|vb|vmin|vmax|dvh|svh|lvh|dvw|svw|lvw)$/.test(unit)) continue;
      const px = unit === 'px' ? n : unit === 'rem' || unit === 'em' ? n * 16 : null;
      if (px !== null && Math.abs(px) <= 2) continue;
      return m[0];
    }
    return null;
  }
  const NOT_RAW_WORD = /^(?:transparent|currentcolor|inherit|initial|unset|revert|revert-layer|none|solid|dashed|dotted|double|groove|ridge|inset|outset|hidden|auto)$/i;
  /** The raw colour of a value, or null. `isColorWord(w)` says whether a word is a colour name (the browser knows). */
  function rawColor(text, isColorWord = null) {
    const s = String(text ?? '');
    const m = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/i.exec(s);
    if (m) return m[0];
    if (!isColorWord) return null;
    return s.split(/[\s,()/]+/).find((w) => /^[a-z]+$/i.test(w) && !NOT_RAW_WORD.test(w) && isColorWord(w)) ?? null;
  }
  /** The raw part of a value of token kind `kind`, or null when tokens give it all. */
  function rawOf(kind, value, isColorWord = null) {
    const rest = withoutVars(value);
    if (!rest || KEYWORDS.test(rest)) return null;
    if (kind === 'color') return rawColor(rest, isColorWord);
    if (kind === 'font' || kind === 'shadow') return /^[\s,]*$/.test(rest) ? null : rest.slice(0, 60);
    if (kind === 'layer') return /^-?\d+$/.test(rest) && Math.abs(Number(rest)) > 1 ? rest : null;
    if (kind === 'motion') { const t = /(?<![\w.-])(\d*\.?\d+)(m?s)(?![\w-])/i.exec(rest); return t && Number(t[1]) !== 0 ? t[0] : null; }
    if (kind === 'space' || kind === 'size' || kind === 'radius' || kind === 'type') return rawLength(rest);
    return null;
  }

  /** A length as CSS pixels (rem and em at 16 px), a duration as milliseconds, a bare number as itself, or null. */
  function measure(value) {
    const m = /^\s*(-?(?:\d+\.?\d*|\.\d+))(px|rem|em|ms|s)?\s*$/i.exec(String(value ?? ''));
    if (!m) return null;
    const unit = (m[2] ?? '').toLowerCase();
    return Number(m[1]) * (unit === 'rem' || unit === 'em' ? 16 : unit === 's' ? 1000 : 1);
  }
  /** A colour of hex or rgb() form as [r, g, b], or null. */
  function rgbOf(value) {
    const s = String(value ?? '').trim();
    let m = /^#([0-9a-f]{3,8})$/i.exec(s);
    if (m) {
      let x = m[1];
      if (x.length <= 4) x = [...x].map((c) => c + c).join('');
      return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
    }
    m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  }
  /** The token kinds that may stand in for a raw value of a kind. */
  const NEAR_KINDS = { space: ['space'], size: ['size', 'space'], radius: ['radius'], type: ['type'], motion: ['motion'], layer: ['layer'], color: ['color'] };
  /**
   * The token nearest to a raw value, or null: `tokens` are `{ name, kind, value }` with the value
   * of the mode that shows. Lengths and durations by their number, colours by their distance in RGB.
   */
  function nearest(kind, raw, tokens) {
    const kinds = NEAR_KINDS[kind];
    if (!kinds) return null;
    const color = kind === 'color';
    const want = color ? rgbOf(raw) : measure(raw);
    if (want === null) return null;
    let best = null;
    for (const k of kinds) {
      for (const t of tokens || []) {
        if (t.kind !== k) continue;
        const have = color ? rgbOf(t.value) : measure(t.value);
        if (have === null) continue;
        const d = color ? Math.hypot(have[0] - want[0], have[1] - want[1], have[2] - want[2]) : Math.abs(have - want);
        if (!best || d < best.d) best = { name: t.name, value: t.value, d };
      }
      if (best) break;
    }
    return best ? { name: best.name, value: best.value } : null;
  }
  /** The words for a raw value: `raw 13px — not a token; nearest --space-3 (12px)`. */
  const rawText = (raw, near) => `raw ${raw} — not a token${near ? `; nearest ${near.name} (${near.value})` : ''}`;

  /**
   * What gives one property its value. `decl` is the winning declaration `{ prop, value, source,
   * selector }`; `lookup` and `tokenNames` as for `follow`; `tokenValue(token)` the value of a token in
   * the mode that shows; `tokens` the model `{ name, kind, value }` for the nearest token.
   * Gives `{ prop, value, source, selector, kind, tokens: [{ token, chain, value }], raw, nearest }`.
   */
  function resolveProperty(prop, kind, decl, { lookup = () => undefined, tokenNames = new Set(), tokenValue = () => '', tokens = [], isColorWord = null } = {}) {
    if (!decl) return null;
    const refs = varNames(decl.value).filter((n, i, a) => a.indexOf(n) === i).slice(0, 4).map((n) => {
      const f = follow(n, lookup, tokenNames);
      return { name: n, token: f.token, chain: f.chain, value: f.token ? tokenValue(f.token) : f.value };
    });
    // A raw part of the value itself, else of an alias that ends in a value of its own.
    let raw = rawOf(kind, decl.value, isColorWord);
    for (const r of refs) if (!raw && !r.token && r.value) raw = rawOf(kind, r.value, isColorWord);
    const kindTokens = (tokens || []).map((t) => ({ ...t, value: tokenValue(t.name) || t.value }));
    return { prop: decl.prop || prop, value: decl.value, source: decl.source || '', selector: decl.selector || '', kind, tokens: refs, raw, nearest: raw ? nearest(kind, raw, kindTokens) : null };
  }

  /** The pairs of a `data-variant` (`size=lg tone=quiet`); a bare word is a value of no named dimension. */
  function variantPairs(text) {
    return String(text ?? '').split(/[\s;]+/).filter(Boolean).map((p) => {
      const at = p.indexOf('=');
      return at < 0 ? { dim: null, value: p } : { dim: p.slice(0, at), value: p.slice(at + 1) };
    });
  }
  /**
   * The variants of an instance against the spec of its component: `[{ dim, value, declared }]`.
   * `variants` is the spec's `{ dim: [values] }`, or null when the component has no spec.
   */
  function variantCheck(text, variants) {
    return variantPairs(text).map(({ dim, value }) => {
      const v = variants || {};
      const declared = dim ? (v[dim] || []).includes(value) : Object.values(v).some((list) => (list || []).includes(value));
      return { dim, value, declared: variants ? declared : null };
    });
  }
  /** The name of a sheet by its address: tokens.css, layout.css, components.css, or `the page`. */
  function sheetName(href) {
    if (!href) return 'the page';
    const file = String(href).split(/[?#]/)[0].split('/').pop();
    return file || 'the page';
  }
  // ---- the rows of the panel

  /** The plain name of a design property, by its token kind: Background, Text, Padding, Radius. */
  function propLabel(prop, kind) {
    const p = String(prop ?? '');
    if (kind === 'color') return /^background/.test(p) ? 'Background' : /^border/.test(p) ? 'Border' : 'Text';
    if (kind === 'space') return /^padding/.test(p) ? 'Padding' : /^margin/.test(p) ? 'Margin' : 'Gap';
    if (kind === 'size') return /height/.test(p) ? 'Height' : 'Width';
    return { radius: 'Radius', font: 'Font', type: 'Type', weight: 'Weight', leading: 'Line height', shadow: 'Shadow', layer: 'Layer', motion: 'Motion' }[kind] || p;
  }
  /**
   * The rows of the Tokens tab from the resolved properties: one row for each label with its token
   * names and their values (the four sides of a padding share a row), then one row for each raw value
   * `{ label, kind, raw, nearest, selector, source }`. A property that no token and no raw value gives has no row.
   */
  function tokenRows(rows) {
    const out = [];
    const raws = [];
    for (const r of rows || []) {
      const label = propLabel(r.prop, r.kind);
      if (r.raw) raws.push({ label, kind: r.kind, raw: r.raw, nearest: r.nearest || null, selector: r.selector || '', source: r.source || '' });
      const toks = (r.tokens || []).filter((t) => t.token);
      if (!toks.length) continue;
      let row = out.find((x) => x.label === label);
      if (!row) { row = { label, kind: r.kind, names: [], values: [] }; out.push(row); }
      for (const t of toks) if (!row.names.includes(t.token)) { row.names.push(t.token); row.values.push(t.value || '?'); }
    }
    return [...out, ...raws];
  }
  /** The comment that a raw value starts: `Radius: raw 5px in .copy; use --radius-sm (4px).` */
  const rawComment = (r) => `${r.label}: raw ${r.raw}${r.selector ? ` in ${r.selector}` : ''}; use ${r.nearest ? `${r.nearest.name} (${r.nearest.value})` : 'a token'}.`;
  /** The comment that a variant outside the spec starts. */
  const variantComment = (v, name) => `Variant ${v.dim ? `${v.dim}=${v.value}` : v.value} of ${name} is not declared in the spec; declare it or use a declared value.`;

  /** The modes of the switch: each theme of the model and System, or none when the model has one theme or none. */
  const modeChoices = (themes) => ((themes || []).length > 1 ? [...themes.map((t) => t.name), ''] : []);

  return { PROPS, INHERITED, splitList, specificity, cmpSpec, cascade, varNames, withoutVars, follow, rawLength, rawColor, rawOf, measure, rgbOf, nearest, rawText, resolveProperty, variantPairs, variantCheck, sheetName, modeChoices, propLabel, tokenRows, rawComment, variantComment };
})();

// eslint-disable-next-line no-var, no-unused-vars
var WF_CANVAS_INSPECT = (() => {
  'use strict';
  if (typeof document === 'undefined') return null;
  const I = WF_CANVAS_INSPECT_LOGIC;
  const MODE_KEY = 'wf-canvas-mode';
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat(Infinity)) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  };

  // ---- the rules of a page, flattened

  const sheetsOf = new WeakMap();
  /**
   * Every style rule of a page that applies now, in source order: @media, @container and @supports
   * opened, a closed one left out. `view` is the handle of the page (canvas-mount.js): a mounted
   * page and a page in a frame read alike. A rule keeps the selector that the browser matches
   * (`parts`) and the selector as the page wrote it (`selector`).
   */
  function rulesOf(view) {
    // A container rule opens and closes with the size of the page.
    const size = `${view.el.offsetWidth}x${view.el.offsetHeight}`;
    const kept = sheetsOf.get(view.root);
    if (kept?.size === size) return kept.out;
    const out = [];
    const walk = (list, source) => {
      for (const r of list) {
        if (r.type === 1 && r.selectorText) out.push({ parts: I.splitList(r.selectorText), selector: view.selectorText(r), style: r.style, source, order: out.length });
        else if (r.cssRules && view.applies(r)) walk(r.cssRules, source);
      }
    };
    for (const s of view.sheets()) {
      let list = null;
      try { list = s.cssRules; } catch { list = null; }
      if (list) walk(list, I.sheetName(view.nameOf(s)));
    }
    // A frame loads its sheets before its load event; a draw before that reads them again.
    if (view.kind === 'shadow' || view.root.readyState === 'complete') sheetsOf.set(view.root, { size, out });
    return out;
  }
  /** The page that holds an element: set while the panel draws. */
  let page = null;
  /** The declarations of `props` on one element, from its matched rules and its style attribute. */
  function declsOf(el, props) {
    const out = [];
    const safe = (sel) => { try { return el.matches(sel); } catch { return false; } };
    for (const r of rulesOf(page)) {
      let spec = null;
      for (const p of r.parts) if (safe(p)) { const s = I.specificity(p); if (!spec || I.cmpSpec(s, spec) > 0) spec = s; }
      if (!spec) continue;
      // Within one rule a shorthand that holds the authored text comes first.
      for (const prop of props) {
        const value = r.style.getPropertyValue(prop);
        if (value) { out.push({ prop, value: value.trim(), important: r.style.getPropertyPriority(prop) === 'important', spec, order: r.order, source: r.source, selector: r.selector }); break; }
      }
    }
    for (const prop of props) {
      const value = el.style?.getPropertyValue(prop);
      if (value) { out.push({ prop, value: value.trim(), important: el.style.getPropertyPriority(prop) === 'important', spec: [1000, 0, 0], order: Infinity, source: 'the style attribute', selector: '' }); break; }
    }
    return out;
  }
  /** The declared value of a custom property that the element sees: its own rules, then its parents'. */
  function customValue(el, name) {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const d = I.cascade(declsOf(n, [name]));
      if (d) return d.value;
    }
    return undefined;
  }
  const isColorWord = (w) => { try { return CSS.supports('color', w); } catch { return false; } };

  /** Every design property of an element with what gives it, one row each; the sides of a shorthand share a row. */
  function propertiesOf(el, model) {
    const tokenNames = new Set((model.tokens || []).map((t) => t.name));
    const style = page.style(el);
    const valueOf = (name) => style.getPropertyValue(name).trim();
    const rows = [];
    const seen = new Set();
    for (const [prop, kind, shorthands] of I.PROPS) {
      let decl = null;
      let from = null;
      for (let n = el; n && n.nodeType === 1; n = I.INHERITED.has(prop) ? n.parentElement : null) {
        // A longhand and its shorthand in one cascade: the later one or the stronger one wins.
        decl = I.cascade([...declsOf(n, [...shorthands, prop])]);
        if (decl) { from = n === el ? null : n; break; }
        if (!I.INHERITED.has(prop)) break;
      }
      if (!decl) continue;
      const row = I.resolveProperty(prop, kind, decl, { lookup: (name) => customValue(from || el, name), tokenNames, tokenValue: valueOf, tokens: model.tokens, isColorWord });
      const id = `${row.prop}|${row.value}|${row.selector}|${row.source}`;
      if (seen.has(id)) continue;
      seen.add(id);
      row.inherited = from ? nameOf(from) : null;
      rows.push(row);
    }
    return rows;
  }
  /** A short name of an element: its tag and its first classes. The root and the body of a mounted page have the names of a document. */
  const nameOf = (el) => `${el.tagName.toLowerCase().replace(/^wf-(html|body)$/, '$1')}${[...el.classList].filter((c) => c !== 'wf-root').slice(0, 2).map((c) => `.${c}`).join('')}`;

  // ---- the panel

  /** The sample of a token row: the colour, a bar for a space or a size, letters for the type. */
  function sample(r) {
    const s = h('span', { class: `ins-sw ${r.kind}`, 'aria-hidden': 'true' }, ['font', 'type', 'weight', 'leading'].includes(r.kind) ? 'Ag' : null);
    if (r.kind === 'color') s.style.backgroundColor = r.values[0] || '';
    return s;
  }
  /**
   * The panel of one element: the component block, the tabs Tokens, Layout and Checks, and the rows
   * of the open tab. `comment(el, text)` starts a comment for the agent on the element, or is null.
   */
  function panelBody(el, model, { view, openComponent, comment, tab, setTab }) {
    page = view;
    const comp = el.closest('[data-component]');
    const key = comp?.getAttribute('data-component');
    const c = comp ? (model.components || []).find((x) => x.key === key) : null;
    const title = comp ? c?.title || key : nameOf(el);
    const variants = comp ? I.variantCheck(comp.getAttribute('data-variant'), c?.spec ? c.spec.variants || {} : null) : [];
    const rows = propertiesOf(el, model);
    const shown = I.tokenRows(rows);
    const raws = shown.filter((r) => r.raw);
    const undeclared = variants.filter((v) => v.declared === false);
    const issues = raws.length + undeclared.length + (comp && !c ? 1 : 0);
    const agent = (i, text) => (comment ? h('button', { type: 'button', class: 'ins-agent', 'data-fk': `ins:c:${i}`, onclick: () => comment(el, text) }, 'Comment for the agent') : null);
    const warn = (head, body, button) => h('div', { class: 'ins-raw' }, h('span', { class: 'ins-warn', 'aria-hidden': 'true' }), h('div', {}, h('b', {}, head), h('p', {}, body), button));
    const rawRow = (r, i) => warn(`${r.label} is not a token`,
      [`raw ${r.raw}`, r.selector ? [' in ', h('code', {}, r.selector)] : null, r.source ? `, ${r.source}` : null, '. ', r.nearest ? ['Nearest: ', h('code', {}, r.nearest.name), ` (${r.nearest.value}).`] : 'No token of its kind is near.'],
      agent(i, I.rawComment(r)));
    const head = h('div', { class: 'ins-head' },
      h('div', { class: 'ins-what' },
        h('div', { class: 'ins-kicker' }, comp ? (comp === el ? 'Component' : `Part of a component · ${nameOf(el)}`) : 'Element, not inside a component'),
        h('div', { class: 'ins-name' }, title),
        variants.length ? h('div', { class: 'ins-chips' }, ...variants.map((v) => h('code', { class: v.declared === false ? 'warn' : null, title: v.declared === null ? 'The component has no spec' : v.declared ? 'Declared in the spec' : 'Not declared in the spec' }, v.dim ? `${v.dim}=${v.value}` : v.value))) : null,
        comp ? h('div', { class: `ins-spec${undeclared.length ? ' warn' : variants.length && c?.spec ? ' ok' : ''}` },
          !variants.length ? 'No variant.' : !c?.spec ? 'The component has no spec.' : undeclared.length ? `${undeclared.length} of ${variants.length} not declared in the spec` : variants.length > 1 ? 'All are declared in the spec' : 'Declared in the spec') : null),
      c ? h('button', { type: 'button', class: 'ins-open', 'data-fk': 'ins:open', title: `Open the component ${title}`, onclick: () => openComponent(key) }, 'Open in library')
        : comp ? h('span', { class: 'mark issue' }, 'Not in the library') : null);
    const tabs = h('div', { class: 'ins-tabs', role: 'group', 'aria-label': 'What to show of the element' },
      ...[['tokens', 'Tokens'], ['layout', 'Layout'], ['checks', issues ? `Checks · ${issues}` : 'Checks']].map(([id, text]) => h('button', { type: 'button', 'data-fk': `ins:${id}`, 'aria-pressed': String(tab === id), onclick: () => setTab(id) }, text)));
    let list = null;
    if (tab === 'layout') {
      const layout = [...el.classList].filter((x) => x.startsWith('l-'));
      const gap = el.getAttribute('data-gap');
      const pad = el.getAttribute('data-pad');
      const box = view.rect(el);
      list = [
        h('p', { class: 'ins-layout' }, 'Size ', h('code', {}, `${Math.round(box.width)} × ${Math.round(box.height)}`)),
        layout.length || gap || pad ? h('p', { class: 'ins-layout' }, 'Layout ', ...layout.map((x) => h('code', {}, `.${x}`)), gap ? h('code', {}, `gap ${gap}`) : null, pad ? h('code', {}, `pad ${pad}`) : null) : null,
        rows.length ? h('ul', { class: 'ins-props' }, ...rows.map((r) => h('li', { class: r.raw ? 'warn' : null },
          h('code', { class: 'p' }, r.prop), ' → ',
          r.tokens.filter((t) => t.token).length
            ? r.tokens.filter((t) => t.token).map((t) => h('span', { class: 'tok' }, h('code', {}, t.token), ` (${t.value || '?'})`, t.chain.length ? h('small', {}, ` via ${t.chain.join(' → ')}`) : null))
            : h('code', {}, r.value),
          r.raw ? h('div', { class: 'raw' }, I.rawText(r.raw, r.nearest)) : null,
          h('small', { class: 'src' }, r.inherited ? `inherited from ${r.inherited}, ` : '', r.selector ? `${r.selector} in ${r.source}` : r.source))))
          : h('p', { class: 'sub' }, 'No rule sets a design property of this element.')];
    } else if (tab === 'checks') {
      list = issues ? [
        comp && !c ? warn('Not in the library', [h('code', {}, key), ' has no component in the library.'], agent('lib', `The component ${key} is not in the library; add it or use a component of the library.`)) : null,
        ...undeclared.map((v, i) => warn('Variant not declared', [h('code', {}, v.dim ? `${v.dim}=${v.value}` : v.value), ` is not in the spec of ${title}.`], agent(`v${i}`, I.variantComment(v, title)))),
        ...raws.map(rawRow)] : h('p', { class: 'sub' }, 'No check fails on this element.');
    } else {
      list = shown.length ? shown.map((r, i) => (r.raw ? rawRow(r, i) : h('div', { class: 'ins-row', title: r.names.join(', ') },
        sample(r), h('div', { class: 'ins-prop' }, h('span', {}, r.label), h('code', {}, r.names.join(' · '))), h('code', { class: 'ins-val' }, [...new Set(r.values)].join(' · ')))))
        : h('p', { class: 'sub' }, 'No token gives a design property of this element.');
    }
    return [head, tabs, h('div', { class: 'ins-list' }, list)];
  }

  // ---- the mode switch

  let mode = '';
  try { mode = localStorage.getItem(MODE_KEY) || ''; } catch { mode = ''; }
  const MOUNT = window.WF_CANVAS_MOUNT || null;
  /** Put the chosen theme on one page, in a frame or mounted, or take it off for the system's. */
  function applyMode(el) {
    const view = MOUNT?.viewOf(el);
    const root = view?.html;
    if (!root) return;
    // The theme that the page names itself comes back with System.
    if (mode) {
      if (!root.hasAttribute('data-wf-mode')) {
        // A mounted page that was drawn again came back in the mode: its host kept the theme of the page.
        const again = el.wfOwn && root.getAttribute('data-theme') === el.wfOwn.mode;
        el.wfOwn = { mode, theme: again ? el.wfOwn.theme : root.getAttribute('data-theme') ?? '' };
        root.setAttribute('data-wf-mode', el.wfOwn.theme);
      } else if (el.wfOwn) el.wfOwn.mode = mode;
      view.setTheme(mode);
    } else if (root.hasAttribute('data-wf-mode')) {
      view.setTheme(root.getAttribute('data-wf-mode') || null);
      root.removeAttribute('data-wf-mode');
      el.wfOwn = null;
    }
  }
  const applyAll = () => { for (const el of [...document.querySelectorAll('iframe'), ...(MOUNT?.mounts() || [])]) applyMode(el); };
  // The load of a page does not bubble, but the document sees it on the way down: every page that
  // comes in later, on the board, in the screen view or in a panel, takes the mode too.
  document.addEventListener('load', (e) => { if (e.target?.tagName === 'IFRAME') applyMode(e.target); }, true);
  document.addEventListener('wf-load', (e) => applyMode(e.target), true);

  function create({ data, openComponent }) {
    // The inspected element: kept by the screen it is on, so a redraw finds it again.
    const st = { key: null, hover: null, pick: null, page: null, ctx: null, tab: 'tokens' };
    let bar = null;
    const outlineIn = (c, el, held) => {
      if (!el?.isConnected) return;
      const r = c.view.rect(el);
      c.layer.append(h('div', { class: `ins-box${held ? ' held' : ''}`, style: `left:${r.x * c.scale}px;top:${r.y * c.scale}px;width:${r.width * c.scale}px;height:${r.height * c.scale}px` }));
    };
    /** The outlines go on the layer of the screen; the panel goes into the host that the screen view gives. */
    function drawPanel(focus = false) {
      const c = st.ctx;
      if (!c) return;
      c.layer.querySelectorAll('.ins-box').forEach((b) => b.remove());
      if (!c.on) return;
      const el = st.hover?.isConnected ? st.hover : st.pick?.isConnected ? st.pick : null;
      if (st.pick?.isConnected) outlineIn(c, st.pick, true);
      if (st.hover?.isConnected && st.hover !== st.pick) outlineIn(c, st.hover, false);
      if (!c.host?.isConnected) return;
      const name = el ? nameOf(el) : null;
      const setTab = (id) => { st.tab = id; drawPanel(); c.host.querySelector(`[data-fk="ins:${id}"]`)?.focus({ preventScroll: true }); };
      const body = el ? panelBody(el, data(), { view: c.view, openComponent, comment: c.comment || null, tab: st.tab, setTab })
        : [h('p', { class: 'ins-hint' }, c.touch ? 'Tap an element of the screen to see its component and its tokens.' : 'Point at an element of the screen, or select it, to see its component and its tokens.')];
      const box = h('div', { id: 'inspect', tabindex: '-1', role: 'region', 'aria-label': name ? `Inspect ${name}` : 'Inspect' }, ...body);
      c.host.replaceChildren(box);
      if (focus) box.focus({ preventScroll: true });
    }
    return {
      /** Draw the outlines and the panel after the screen view drew its marks. */
      draw(ctx) {
        // The page of the screen: the document of a frame, or the root of a mount.
        const now = ctx.view?.root ?? null;
        if (st.key !== ctx.key || st.page !== now || !ctx.on) { st.hover = null; if (st.key !== ctx.key || st.page !== now) st.pick = null; }
        st.key = ctx.key;
        st.page = now;
        st.ctx = ctx;
        drawPanel();
      },
      hover(el) { if (st.hover === el) return; st.hover = el; drawPanel(); },
      pick(el) { st.pick = el; st.hover = null; drawPanel(Boolean(el)); },
      /** The mode switch in the bar: the themes of the model and System, hidden with one theme or none. */
      bar(state) {
        const choices = I.modeChoices(state?.themes);
        if (!bar) {
          const select = h('select', { id: 'mode', 'aria-label': 'Mode of every screen', onchange: (e) => {
            mode = e.target.value;
            try { if (mode) localStorage.setItem(MODE_KEY, mode); else localStorage.removeItem(MODE_KEY); } catch { /* the choice lasts for this visit */ }
            applyAll();
          } });
          bar = h('label', { class: 'pick', id: 'mode-pick', title: 'Show every screen in one theme of the tokens, or as the system asks' }, h('span', { class: 'sr' }, 'Mode'), select);
          const at = document.querySelector('.bar #health');
          if (at) at.before(bar); else document.querySelector('.bar')?.append(bar);
        }
        const select = bar.querySelector('select');
        if (mode && !choices.includes(mode)) mode = '';
        const want = choices.join('|');
        if (select.dataset.choices !== want) {
          select.dataset.choices = want;
          select.replaceChildren(...choices.map((n) => h('option', { value: n }, n ? `${n[0].toUpperCase()}${n.slice(1)} mode` : 'System mode')));
        }
        select.value = mode;
        bar.hidden = !choices.length;
        applyAll();
      },
      mode: () => mode,
      /** The modes that the switch offers now: the themes of the model and '' for the system's. */
      modes: () => I.modeChoices(data()?.themes),
      /** Choose a mode from another control: the screen view has its own theme control. */
      setMode(next) {
        mode = I.modeChoices(data()?.themes).includes(next) ? next : '';
        try { if (mode) localStorage.setItem(MODE_KEY, mode); else localStorage.removeItem(MODE_KEY); } catch { /* the choice lasts for this visit */ }
        const select = bar?.querySelector('select');
        if (select) select.value = mode;
        applyAll();
      },
    };
  }
  return { create };
})();
