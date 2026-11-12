// Draws a design page straight into the canvas, with no frame around it.
//
// A page of the surface (a screen, a component page) is a whole document. The canvas mounts it in a
// shadow root: the markup of the body goes in, and the sheets of the page are shared by every
// mounted page as constructed sheets. A document gives a page four things that a shadow root does
// not, so the mount translates them:
//
// - `html`, `body` and `:root` match nothing in a shadow root. The mount has the elements `wf-html`
//   (with the class `wf-root`) and `wf-body`, and the selectors are rewritten to them. An element
//   name keeps the specificity of `html` and `body`.
// - `@media` on the width or the height reads the window of the canvas. It becomes `@container` on
//   the box of the mount, which has the size of the viewport of the screen.
// - `vh`, `vw` and their kin become the container units `cqh`, `cqw`.
// - `rem` reads the font size of the root of the canvas. It becomes a product with `--wf-rem`,
//   which holds the font size of `wf-html`: the root of the page.
// - `position: fixed` holds to the box of the mount, and the page scrolls under it.
//
// A page that the mount cannot draw truly stays in a frame: a page with a script of its own, an
// inline event handler, or a media query that mixes the viewport with another feature in a list.
// `mount()` then answers `{ fallback: true, reasons }` and the caller makes the frame.
//
// `viewOf(el)` gives one handle for a mounted page and for a frame, so the canvas reads both alike.
//
// The file has two parts, like canvas.js. `WF_CANVAS_MOUNT_LOGIC` holds the rules that need no
// browser; the tests and the check load it alone. The second part gives `WF_CANVAS_MOUNT`, which is
// null where there is no document.

// eslint-disable-next-line no-var, no-unused-vars
var WF_CANVAS_MOUNT_LOGIC = (() => {
  'use strict';

  // ------------------------------------------------------------ scripts

  // The switch of a screen page: a script that only sets the state and the theme of the root from
  // the address. The mount sets both itself, so such a script is no script of the page's own.
  const PARAMS = String.raw`(?:\w+|new URLSearchParams\(location\.search\))`;
  const GET = String.raw`${PARAMS}\.get\(['"][\w-]+['"]\)`;
  const WORD = String.raw`['"][\w-]*['"]`;
  const VALUE = String.raw`(?:${GET}|${WORD})(?:\s*\|\|\s*(?:${GET}|${WORD}))*`;
  const SET = String.raw`document\.documentElement\.dataset\.(?:state|theme)\s*=\s*${VALUE}`;
  const SWITCH_RE = new RegExp(String.raw`^(?:(?:const|let|var)\s+\w+\s*=\s*new URLSearchParams\(location\.search\)|${SET}|if\s*\(\s*${GET}(?:\s*[!=]==?\s*${WORD})?\s*\)\s*${SET})$`);
  /** True when a script only sets the state and the theme of the root from the address. */
  function switchScript(body) {
    const lines = String(body).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').split(/[;\n]/).map((l) => l.trim()).filter(Boolean);
    return lines.every((l) => SWITCH_RE.test(l));
  }
  const QUOTED = String.raw`(?:'([^']*)'|"([^"]*)")`;
  /** The attributes that a handler may set: the ones that carry a state and run nothing. */
  const SAFE_ATTR_RE = /^(?:aria-[a-z-]+|data-[\w-]+|hidden|open)$/;
  /** One statement of a handler as a step, or null. */
  function parseStep(text) {
    let rest = text;
    const eat = (re) => { const m = re.exec(rest); if (m) rest = rest.slice(m[0].length); return m; };
    const arg = () => { const m = eat(new RegExp(String.raw`^\(\s*${QUOTED}\s*\)`)); return m ? m[1] ?? m[2] : null; };
    const step = { base: 'this', closest: null, query: null, all: false };
    /** The change after the target: a class, a data value or a state attribute. */
    const action = (arrow = true) => {
      let m = eat(/^\.classList\.(add|remove|toggle)(?=\()/);
      if (m) {
        const name = arg();
        if (name == null || !/^[\w-]+$/.test(name)) return false;
        Object.assign(step, { act: 'class', op: m[1], name });
        return true;
      }
      m = eat(/^\.dataset\.([A-Za-z_]\w*)\s*=\s*/);
      if (m) {
        const lit = eat(new RegExp(`^${QUOTED}`));
        if (lit) { Object.assign(step, { act: 'data', name: m[1], value: lit[1] ?? lit[2] }); return true; }
        // The value of the pressed element itself. In a function, `this` is not that element.
        const own = arrow ? eat(/^this\.dataset\.([A-Za-z_]\w*)/) : null;
        if (!own) return false;
        Object.assign(step, { act: 'data', name: m[1], from: own[1] });
        return true;
      }
      m = eat(new RegExp(String.raw`^\.(setAttribute|removeAttribute|toggleAttribute)\(\s*${QUOTED}\s*`));
      if (!m) return false;
      const name = (m[2] ?? m[3]).toLowerCase();
      if (!SAFE_ATTR_RE.test(name)) return false;
      let value = null;
      if (m[1] === 'setAttribute') {
        const v = eat(new RegExp(String.raw`^,\s*${QUOTED}\s*\)`));
        if (!v) return false;
        value = v[1] ?? v[2];
      } else if (!eat(/^\)/)) return false;
      Object.assign(step, { act: 'attr', op: m[1], name, value });
      return true;
    };
    if (!eat(/^this(?![\w$])/)) return null;
    if (eat(/^\.parentElement(?![\w$])/)) step.base = 'parent';
    else if (eat(/^\.closest(?=\()/)) {
      step.closest = arg();
      if (step.closest == null) return null;
      step.base = 'closest';
    }
    if (eat(/^\.querySelectorAll(?=\()/)) {
      step.query = arg();
      if (step.query == null) return null;
      step.all = true;
      const fn = eat(/^\.forEach\(\s*(?:function\s*\(\s*([A-Za-z_$][\w$]*)\s*\)\s*\{\s*|\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>\s*\{?\s*)/);
      const each = fn && (fn[1] ?? fn[2]);
      if (!each || !rest.startsWith(each)) return null;
      rest = rest.slice(each.length);
      return action(!fn[1]) && eat(/^\s*;?\s*\}?\s*\)$/) ? step : null;
    }
    if (eat(/^\.querySelector(?=\()/)) {
      step.query = arg();
      if (step.query == null) return null;
    }
    return action() && !rest.trim() ? step : null;
  }
  /**
   * An inline handler that the mount can do itself, with no code of the page. Each statement names
   * a target and one change:
   *
   * - the target: `this`, `this.parentElement` or `this.closest('<selector>')`, then nothing,
   *   `.querySelector('<selector>')`, or `.querySelectorAll('<selector>').forEach((e) => e.<change>)`;
   * - the change: `classList.add|remove|toggle('<name>')`, `dataset.<name> = '<value>'` (or
   *   `= this.dataset.<name>`), or `setAttribute|removeAttribute|toggleAttribute` of `aria-*`,
   *   `data-*`, `hidden` or `open`.
   *
   * Returns the steps, or null for any other handler.
   */
  function parseHandler(text) {
    const parts = [];
    const src = String(text);
    let start = 0;
    for (let i = 0; i < src.length; i += 1) {
      const c = src[i];
      if (c === '"' || c === "'" || c === '(' || c === '{') i = skip(src, i);
      else if (c === ';') { parts.push(src.slice(start, i)); start = i + 1; }
    }
    parts.push(src.slice(start));
    const steps = parts.map((p) => p.trim()).filter(Boolean).map(parseStep);
    return steps.length && steps.every(Boolean) ? steps : null;
  }
  const SCRIPT_RE = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  const JS_TYPE_RE = /^(?:module|(?:text|application)\/(?:java|ecma)script)$/i;
  const attrOf = (attrs, name) => new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);

  /**
   * Why a page cannot be mounted, as a list of plain reasons: empty when it can. The state switch of
   * a screen and the theme script of a component page are known; the mount does their work.
   */
  function mountProblems(html) {
    const text = String(html ?? '');
    const out = new Set();
    for (const m of text.matchAll(SCRIPT_RE)) {
      const [, attrs, body] = m;
      if (/(?:^|\s)data-wf-themes\b/i.test(attrs)) continue;
      const type = attrOf(attrs, 'type');
      const kind = type ? (type[1] ?? type[2] ?? type[3] ?? '').trim() : '';
      const src = attrOf(attrs, 'src');
      if (kind && !JS_TYPE_RE.test(kind) && !src) continue; // data, not a script
      if (src) { out.add('it loads a script file'); continue; }
      if (switchScript(body)) continue;
      out.add('it has a script of its own');
    }
    // Comments and the text of scripts and styles can hold anything; tags cannot.
    const tags = text.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
    for (const tag of tags.matchAll(/<[a-z](?:"[^"]*"|'[^']*'|[^<>"'])*>/gi)) {
      for (const h of tag[0].matchAll(/\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
        if (!parseHandler(h[1] ?? h[2] ?? h[3])) out.add('it has an inline event handler that is more than a change of a class or an attribute');
      }
      if (/\s(?:href|src|action)\s*=\s*["']?\s*javascript:/i.test(tag[0])) out.add('it has a javascript: address');
    }
    if (/<base\b/i.test(tags)) out.add('it has a base element');
    return [...out];
  }
  /** True when a page has the theme script of a component page: each copy panel shows the cells of the source panel. */
  const hasThemeScript = (html) => /<script\b[^>]*\sdata-wf-themes\b/i.test(String(html ?? ''));

  // ------------------------------------------------------------ the sheets

  /** A sheet with no comment. A string keeps what it holds. */
  function stripComments(text) {
    let out = '';
    const n = text.length;
    for (let i = 0; i < n; i += 1) {
      const c = text[i];
      if (c === '"' || c === "'") {
        let j = i + 1;
        while (j < n && text[j] !== c) { if (text[j] === '\\') j += 1; j += 1; }
        out += text.slice(i, j + 1);
        i = j;
      } else if (c === '/' && text[i + 1] === '*') {
        const end = text.indexOf('*/', i + 2);
        i = end < 0 ? n : end + 1;
        out += ' ';
      } else out += c;
    }
    return out;
  }
  /** The end of the string or the bracket that opens at `i`: the place of its last character. */
  function skip(text, i) {
    const n = text.length;
    const c = text[i];
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== c) { if (text[j] === '\\') j += 1; j += 1; }
      return j;
    }
    const close = c === '(' ? ')' : c === '[' ? ']' : '}';
    let j = i + 1;
    for (; j < n; j += 1) {
      const d = text[j];
      if (d === close) return j;
      if (d === '"' || d === "'" || d === '(' || d === '[' || d === '{') j = skip(text, j);
    }
    return n - 1;
  }
  /**
   * The parts of a sheet, or of a block: `{ text }` for a declaration or a rule with no block, and
   * `{ prelude, body }` for a rule with a block.
   */
  function parseItems(text) {
    const out = [];
    const n = text.length;
    let start = 0;
    for (let i = 0; i < n; i += 1) {
      const c = text[i];
      if (c === '"' || c === "'" || c === '(' || c === '[') i = skip(text, i);
      else if (c === ';') {
        const t = text.slice(start, i).trim();
        if (t) out.push({ text: t });
        start = i + 1;
      } else if (c === '{') {
        const end = skip(text, i);
        out.push({ prelude: text.slice(start, i).trim(), body: text.slice(i + 1, text[end] === '}' ? end : end + 1) });
        i = end;
        start = i + 1;
      }
    }
    const t = text.slice(start).trim();
    if (t) out.push({ text: t });
    return out;
  }
  /** A list split at its top-level commas. */
  function splitList(text) {
    const out = [];
    let start = 0;
    for (let i = 0; i < text.length; i += 1) {
      const c = text[i];
      if (c === '"' || c === "'" || c === '(' || c === '[') i = skip(text, i);
      else if (c === ',') { out.push(text.slice(start, i)); start = i + 1; }
    }
    out.push(text.slice(start));
    return out.map((s) => s.trim()).filter(Boolean);
  }
  /** Run `fn` on the text outside the strings and the `url()` parts; those stay as they are. */
  function outside(text, fn, keepRe = /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|url\([^)]*\)/gi) {
    const kept = [];
    const masked = text.replace(keepRe, (m) => { kept.push(m); return `\u0001${kept.length - 1}\u0002`; });
    // eslint-disable-next-line no-control-regex
    return fn(masked).replace(/\u0001(\d+)\u0002/g, (_, i) => kept[Number(i)]);
  }

  /**
   * A selector for the mount: `:root` is the class `wf-root`, `html` is the element `wf-html` and
   * `body` is the element `wf-body`. A string and an attribute test stay as they are.
   */
  function rewriteSelector(selector) {
    return outside(String(selector), (s) => outside(s, (t) => t
      .replace(/:root(?![\w-])/gi, '.wf-root')
      .replace(/(^|[\s>+~,(])html(?![\w-])/gi, '$1wf-html')
      .replace(/(^|[\s>+~,(])body(?![\w-])/gi, '$1wf-body'), /\[[^\]]*\]/g), /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g);
  }
  /** A selector of the mount as the page wrote it, for the inspector. */
  function displaySelector(selector) {
    return outside(String(selector), (s) => s
      .replace(/\.wf-root(?![\w-])/g, ':root')
      .replace(/(^|[\s>+~,(])wf-html(?![\w-])/g, '$1html')
      .replace(/(^|[\s>+~,(])wf-body(?![\w-])/g, '$1body'), /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\[[^\]]*\]/g);
  }
  /** The units of the window as the units of the container: `100vh` is `100cqh`, `50dvw` is `50cqw`. */
  function rewriteUnits(text) {
    return outside(String(text), (s) => s
      .replace(/(?<![\w-])(-?(?:\d+\.?\d*|\.\d+))[dsl]?v(h|w|min|max|i|b)(?![\w-])/gi, (_, d, u) => `${d}cq${u.toLowerCase()}`)
      .replace(REM_RE, (_, d) => `calc(${d}*var(--wf-rem)*1)`));
  }
  const REM_RE = /(?<![\w-])([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)rem(?![\w-])/gi;
  /** The font size of a root before any rule: a rem of a query, and a rem of the font size of the root itself. */
  const ROOT_PX = 16;
  /** Each rem as pixels of the first font size. A query and the font size of the root read that size. */
  const remAsPx = (text) => outside(String(text), (s) => s.replace(REM_RE, (_, d) => `${Number(d) * ROOT_PX}px`));
  /** True for a selector that names the root of the page as its subject. */
  const ROOT_SUBJECT_RE = /^\s*(?:html|:root)(?:[.[:#][^\s>+~]*)?\s*$/i;
  const ROOT_FONT_RE = /^font(?:-size)?\s*:.*\drem(?![\w-])/is;
  /**
   * A value of the mount as the page wrote it, for the inspector: the product with `--wf-rem` is a
   * rem again. A computed value has the pixels of the root in the place of the property: the `*1` at
   * the end marks the product as one of the mount, so it is a rem again too.
   */
  function displayValue(value) {
    return String(value ?? '')
      .replace(/calc\(([^()*\s]+)\*(?:var\(--wf-rem\)|-?[\d.]+px)\*1\)/g, '$1rem');
  }
  /** The `url()` parts of a sheet as whole addresses, so a sheet reads its files from where its file is. */
  function absoluteUrls(text, base) {
    if (!base || typeof URL !== 'function') return text;
    return String(text).replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, q, u) => {
      const ref = u.trim();
      if (!ref || /^(?:data:|blob:|#|[a-z][a-z0-9+.-]*:)/i.test(ref)) return m;
      try { return `url("${new URL(ref, base).href}")`; } catch { return m; }
    });
  }

  const VIEWPORT_RE = /(?:^|[^\w-])(?:min-|max-)?(?:width|height|aspect-ratio|orientation|inline-size|block-size)(?![\w-])/i;
  /**
   * A media query for the mount: `{ open, close }`, the rules that take its place around the block.
   * A query with no viewport feature stays a media query. A query on the viewport becomes a container
   * query, inside a media query for the other features. Returns null for a query that has no true
   * translation: `not` on the viewport, or a list that mixes the viewport with another feature.
   */
  function mediaQuery(condition) {
    const cond = remAsPx(String(condition).trim());
    if (!VIEWPORT_RE.test(cond)) return { open: `@media ${cond}{`, close: '}' };
    const alts = splitList(cond).map((alt) => {
      let a = alt.replace(/^only\s+/i, '');
      if (/^not\s/i.test(a)) return null;
      const vp = [];
      const other = [];
      let all = false;
      for (const part of a.split(/\s+and\s+/i).map((p) => p.trim()).filter(Boolean)) {
        if (/^(?:screen|all)$/i.test(part)) all = true;
        else if (part.startsWith('(') && VIEWPORT_RE.test(part)) vp.push(part);
        else other.push(part);
      }
      a = null;
      return { vp, other, always: all && !vp.length && !other.length };
    });
    if (alts.some((a) => !a)) return null;
    // One part of the list is true on every screen: so is the whole list.
    if (alts.some((a) => a.always)) return { open: '@media all{', close: '}' };
    const group = (parts) => parts.join(' and ');
    if (alts.length === 1) {
      const [{ vp, other }] = alts;
      const inner = `@container wf-screen ${group(vp)}{`;
      return other.length ? { open: `@media ${group(other)}{${inner}`, close: '}}' } : { open: inner, close: '}' };
    }
    if (alts.some((a) => a.other.length || !a.vp.length)) return null;
    return { open: `@container wf-screen ${alts.map((a) => (a.vp.length > 1 ? `(${group(a.vp)})` : a.vp[0])).join(' or ')}{`, close: '}' };
  }

  const HOIST_RE = /^@(?:font-face|property|font-feature-values|font-palette-values|counter-style)\b/i;
  /**
   * A sheet for the mount. Returns `{ css, hoist, problems }`: the sheet for the shadow root, the
   * rules that only a document reads (the font faces, the imports and the registered properties),
   * and the media queries with no translation.
   */
  function rewriteSheet(text, base = '') {
    const hoist = [];
    const problems = [];
    const emit = (items, root = false) => items.map((item) => {
      if (item.body === undefined) {
        let t = absoluteUrls(item.text, base);
        // The font size of the root cannot read `--wf-rem`, which reads that font size.
        if (root && /^font(?:-size)?s*:/i.test(t)) t = remAsPx(t);
        if (/^@import\b/i.test(t)) { hoist.push(`${t};`); return ''; }
        if (/^@(?:charset|namespace)\b/i.test(t)) return '';
        return `${rewriteUnits(t)};`;
      }
      const p = item.prelude;
      if (HOIST_RE.test(p)) { hoist.push(`${p}{${absoluteUrls(item.body, base)}}`); return ''; }
      if (/^@(?:-[a-z]+-)?keyframes\b/i.test(p)) return `${p}{${rewriteUnits(absoluteUrls(item.body, base))}}`;
      if (/^@page\b/i.test(p)) return '';
      if (/^@media\b/i.test(p)) {
        const q = mediaQuery(p.slice(6));
        if (!q) { problems.push(`@media ${p.slice(6).trim()}`); return `${p}{${emit(parseItems(item.body))}}`; }
        return `${q.open}${emit(parseItems(item.body))}${q.close}`;
      }
      if (p.startsWith('@')) return `${p}{${emit(parseItems(item.body))}}`;
      const items = parseItems(item.body);
      const parts = splitList(p);
      const roots = parts.filter((part) => ROOT_SUBJECT_RE.test(part));
      // A rule for the root and for other elements too is two rules: only the root reads its font size another way.
      if (roots.length && roots.length < parts.length && items.some((i) => i.body === undefined && ROOT_FONT_RE.test(i.text))) {
        const rest = parts.filter((part) => !roots.includes(part));
        return `${rewriteSelector(roots.join(','))}{${emit(items, true)}}${rewriteSelector(rest.join(','))}{${emit(items)}}`;
      }
      return `${rewriteSelector(p)}{${emit(items, roots.length > 0)}}`;
    }).join('');
    return { css: emit(parseItems(stripComments(String(text ?? '')))), hoist, problems };
  }

  /**
   * What was built from the text of each file, kept by the address of the file. `take(id, text,
   * make)` answers what `make()` built from this text the last time, and builds again only when
   * the text of `id` is another. So a file that was read again and did not change keeps its sheet,
   * and every mounted page goes on sharing that one sheet.
   */
  function keeper() {
    const kept = new Map();
    return {
      take(id, text, make, renew = null) {
        const was = kept.get(id);
        if (was && was.text === text) return was.built;
        // A new text: the thing that was made takes it itself when `renew` says that it could.
        // Everything that holds the thing then has the new text, with nothing made again.
        if (was && renew && renew(was.built)) { kept.set(id, { text, built: was.built }); return was.built; }
        const built = make();
        kept.set(id, { text, built });
        return built;
      },
      ids: () => [...kept.keys()],
      get: (id) => kept.get(id)?.built,
    };
  }

  /**
   * A store of at most `max` things, by key, with the parts of a Map that the mount uses. When it
   * is full, a new thing takes the place of the thing that was asked for the longest time ago.
   */
  function bounded(max) {
    const map = new Map();
    return {
      has: (key) => map.has(key),
      get(key) {
        if (!map.has(key)) return undefined;
        const value = map.get(key);
        map.delete(key);
        map.set(key, value);
        return value;
      },
      set(key, value) {
        map.delete(key);
        map.set(key, value);
        while (map.size > max) map.delete(map.keys().next().value);
      },
      delete: (key) => map.delete(key),
      clear: () => map.clear(),
      size: () => map.size,
    };
  }

  /** The rules of the mount itself, under the sheets of the page. */
  const BASE_CSS = `:host{all:initial;display:block;position:relative;overflow:hidden;contain:layout paint style;transform-origin:0 0}
wf-view{display:block;width:100%;height:100%;overflow:hidden;container:wf-screen / size}
wf-scroll{display:block;width:100%;height:100%;overflow:auto;scrollbar-width:none;overscroll-behavior:contain}
wf-scroll::-webkit-scrollbar{display:none}
wf-html{display:block;--wf-rem:1em}
wf-body{display:block;margin:8px}
:host([data-wf-hug]){contain:layout style;overflow:visible}
:host([data-wf-hug]) wf-view{height:auto;overflow:visible;container-type:inline-size}
:host([data-wf-hug]) wf-scroll{height:auto;overflow:visible}`;

  return { mountProblems, hasThemeScript, stripComments, parseItems, splitList, rewriteSelector, displaySelector, displayValue, rewriteUnits, absoluteUrls, mediaQuery, rewriteSheet, keeper, bounded, BASE_CSS, switchScript, parseHandler };
})();

// eslint-disable-next-line no-var, no-unused-vars
var WF_CANVAS_MOUNT = (() => {
  'use strict';
  if (typeof document === 'undefined') return null;
  const L = WF_CANVAS_MOUNT_LOGIC;
  // A browser with no constructed sheets draws every page in a frame.
  const can = typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in Document.prototype;

  const sheetOf = (css) => { const s = new CSSStyleSheet(); s.replaceSync(css); return s; };
  // `--wf-rem` is a length: so `1em` on `wf-html` is the font size of `wf-html` in pixels, and
  // every element of the page inherits those pixels. Where the browser cannot register a property,
  // the mount writes the pixels on `wf-html` itself.
  let remIsLength = false;
  if (can) try { CSS.registerProperty({ name: '--wf-rem', syntax: '<length>', inherits: true, initialValue: '16px' }); remIsLength = true; } catch { /* the mount writes the pixels */ }
  const BASE = can ? sheetOf(L.BASE_CSS) : null;
  /** The name of each sheet of a page, for the inspector: the address of its file, or `''` for the styles of the page. */
  const sheetNames = new WeakMap();
  const linked = new Map(); // address -> Promise<{ sheet, problems }>
  // `forget()` makes the next mount ask the server for each file again. Most of the files did not
  // change: their sheets stay, with no new rewrite and no second copy of their rules.
  const built = L.keeper();
  const inline = new Map(); // text -> { sheet, problems }
  // A read page holds its whole document. A large surface has hundreds of pages, so the mount keeps
  // the ones that were asked for last; a page that left is read again when it is asked for.
  const MAX_PAGES = 96;
  const pages = L.bounded(MAX_PAGES); // address -> Promise<page>
  const hoisted = new Set();
  // An imported sheet that comes in after a page is drawn makes the browser lay out the whole canvas
  // again, every mounted page with it. So a page waits a short time for the imports: it is laid out
  // once. A sheet that is late does not hold the page; it comes in as before.
  const HOIST_WAIT_MS = 400;
  // A promise while a hoisted import is not in yet, else null.
  let hoistBusy = null;

  /** Give the document the rules that a shadow root does not read: the font faces and the imports. */
  function hoist(rules) {
    const fresh = rules.filter((r) => !hoisted.has(r));
    if (!fresh.length) return;
    for (const r of fresh) hoisted.add(r);
    // Each new set of rules has a style element of its own. One element for all would be written
    // again with each new rule, and the browser would then read every font again and lay out every
    // page again. An import must come before every other rule of its sheet.
    const imports = fresh.filter((r) => /^@import\b/i.test(r));
    const el = document.createElement('style');
    el.setAttribute('data-wf-mount', 'hoisted');
    el.textContent = [...imports, ...fresh.filter((r) => !imports.includes(r))].join('\n');
    if (imports.length) {
      const loaded = new Promise((ok) => { el.addEventListener('load', ok); el.addEventListener('error', ok); setTimeout(ok, HOIST_WAIT_MS); });
      const mine = Promise.all([hoistBusy, loaded]).then(() => { if (hoistBusy === mine) hoistBusy = null; });
      hoistBusy = mine;
    }
    document.head.append(el);
  }
  const rewritten = (text, base, media) => L.rewriteSheet(media && !/^(?:all|screen)?$/i.test(media.trim()) ? `@media ${media}{${text}}` : text, base);
  function build(text, base, name, media) {
    const r = rewritten(text, base, media);
    hoist(r.hoist);
    const sheet = sheetOf(r.css);
    sheetNames.set(sheet, name);
    return { sheet, problems: r.problems };
  }
  // A linked sheet is one object that every page with that link adopts. When its file changes, the
  // object takes the new rules in place: every mounted page then shows them, and no page is built
  // again. `sheetStamp` counts those changes, for who keeps rules of a sheet. `renewed` holds the
  // changed sheets until their pages are told.
  let sheetStamp = 0;
  const renewed = new Set();
  /**
   * Give a built sheet the new text of its file. False when it cannot be done in place: the new
   * text has a media query with no container form, so the pages that link it must go to a frame,
   * as a first read of them says.
   */
  function renew(was, text, base, media) {
    if (!was.sheet) return false;
    const r = rewritten(text, base, media);
    if (r.problems.length) return false;
    hoist(r.hoist);
    was.sheet.replaceSync(r.css);
    // The old text kept its pages in a frame: they are read again, and can leave the frame now.
    if (was.problems.length) pages.clear();
    was.problems = [];
    sheetStamp += 1;
    renewed.add(was.sheet);
    setTimeout(tellRenewed, 0);
    return true;
  }
  /**
   * Tell each mounted page that one of its sheets has new rules: the page paints its ground again,
   * and its host gets the event `wf-restyle`, which goes up to the canvas. Answers the hosts.
   */
  async function tellRenewed() {
    // A new import of the sheet may not be in yet: the pages are measured after it.
    if (hoistBusy) await hoistBusy;
    if (!renewed.size) return [];
    const hosts = mounts().filter((host) => host.shadowRoot?.adoptedStyleSheets.some((s) => renewed.has(s)));
    renewed.clear();
    for (const host of hosts) host.wfView.restyle();
    for (const host of hosts) host.dispatchEvent(new CustomEvent('wf-restyle', { bubbles: true }));
    return hosts;
  }
  const sources = new Map(); // id of a linked sheet -> { href, media }
  // The linked sheets that the last read did not get: a page that was read then has no such sheet.
  const lost = new Set();
  function linkedSheet(href, media) {
    const id = `${media || ''}|${href}`;
    sources.set(id, { href, media });
    if (!linked.has(id)) {
      linked.set(id, fetch(href, { cache: 'no-cache' }).then(async (res) => {
        if (!res.ok) return { sheet: null, problems: [], gone: true };
        const text = await res.text();
        return built.take(id, text, () => build(text, href, href, media), (was) => renew(was, text, href, media));
      }).catch(() => ({ sheet: null, problems: [], failed: true })).then((r) => { if (r.sheet) lost.delete(id); else lost.add(id); return r; }));
    }
    return linked.get(id);
  }
  /**
   * Read every linked sheet again, after a sheet changed and no page did. A sheet with new text
   * takes it in place, and its mounted pages keep their elements. Answers `{ stale, restyled, renewed, again }`:
   * `renewed` is the count of the sheets that took new rules, and `restyled` are the hosts whose
   * page has new rules now. `stale` are the hosts whose page links a
   * sheet that could not take its text in place (the file is gone or did not load, or it has a
   * media query with no container form): the caller reads those pages again whole, as before.
   * `again` is true when a sheet that was lost is back: the pages that were read without it cannot
   * be told from the others, so the caller reads every page again.
   */
  async function refreshSheets() {
    const ids = [...sources.keys()];
    const before = ids.map((id) => built.get(id)?.sheet ?? null);
    const wasLost = [...lost];
    const stamp = sheetStamp;
    linked.clear();
    const now = await Promise.all(ids.map((id) => linkedSheet(sources.get(id).href, sources.get(id).media)));
    const old = new Set(before.filter((sheet, i) => sheet && now[i].sheet !== sheet));
    // A page that was read holds its sheets: with a stale sheet, the next mount must read it again.
    if (old.size) pages.clear();
    const restyled = await tellRenewed();
    const stale = mounts().filter((host) => host.shadowRoot?.adoptedStyleSheets.some((s) => old.has(s)));
    const again = wasLost.some((id) => !lost.has(id));
    if (again) pages.clear();
    return { stale, restyled: restyled.filter((host) => !stale.includes(host)), renewed: sheetStamp - stamp, again };
  }
  function inlineSheet(text, base, media) {
    const id = `${media || ''}|${base}|${text}`;
    if (!inline.has(id)) inline.set(id, build(text, base, '', media));
    return inline.get(id);
  }

  const URL_ATTRS = ['src', 'href', 'poster', 'data'];
  /** The addresses of the markup as whole addresses: a mounted page has the address of the canvas. */
  function absolute(rootEl, base) {
    for (const name of URL_ATTRS) {
      for (const el of rootEl.querySelectorAll(`[${name}]`)) {
        const v = el.getAttribute(name);
        if (!v || /^(?:#|data:|blob:|[a-z][a-z0-9+.-]*:)/i.test(v)) continue;
        try { el.setAttribute(name, new URL(v, base).href); } catch { /* stays */ }
      }
    }
  }

  /**
   * Read a page for the mount. Answers `{ ok: true, url, doc, sheets, themes }`, or
   * `{ ok: false, missing }` when the server has no such page, or `{ ok: false, reasons }` when
   * the page must stay in a frame. The answer is kept until `forget()`.
   */
  function load(url) {
    const href = new URL(url, document.baseURI).href;
    if (!pages.has(href)) {
      pages.set(href, (async () => {
        let res;
        try { res = await fetch(href, { cache: 'no-cache' }); } catch { return { ok: false, url: href, reasons: ['the page did not load'] }; }
        if (!res.ok || !/html/i.test(res.headers.get('content-type') || '')) return { ok: false, url: href, missing: true, reasons: ['the file of the page is gone'] };
        const html = await res.text();
        const reasons = L.mountProblems(html);
        if (reasons.length) return { ok: false, url: href, reasons };
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const sources = [...doc.querySelectorAll('link[rel~="stylesheet"][href], style')];
        const made = await Promise.all(sources.map((el) => (el.tagName === 'LINK'
          ? linkedSheet(new URL(el.getAttribute('href'), href).href, el.getAttribute('media'))
          : inlineSheet(el.textContent, href, el.getAttribute('media')))));
        const bad = made.flatMap((m) => m.problems);
        if (bad.length) return { ok: false, url: href, reasons: [...new Set(bad.map((b) => `a media query has no container form: ${b}`))] };
        if (made.some((m) => m.failed)) return { ok: false, url: href, reasons: ['a sheet of the page did not load'] };
        if (hoistBusy) await hoistBusy;
        for (const el of doc.querySelectorAll('link, style, script, meta, head title, base')) el.remove();
        absolute(doc.body, href);
        return { ok: true, url: href, doc, sheets: made.map((m) => m.sheet).filter(Boolean), themes: L.hasThemeScript(html) };
      })());
    }
    return pages.get(href);
  }
  /** Forget what was read, so the next mount reads the files again. With an address: that page only, and the sheets with it. */
  function forget(url = null) {
    if (url) pages.delete(new URL(url, document.baseURI).href);
    else pages.clear();
    linked.clear();
    inline.clear();
  }

  /** Do one step of a handler on the pressed element: the mount changes the page, and no code of the page runs. */
  function runStep(el, s) {
    let base = el;
    if (s.base === 'parent') base = el.parentElement;
    else if (s.base === 'closest') { try { base = el.closest(L.rewriteSelector(s.closest)); } catch { base = null; } }
    if (!base) return;
    let targets = [base];
    if (s.query) {
      const q = L.rewriteSelector(s.query);
      try { targets = s.all ? [...base.querySelectorAll(q)] : [base.querySelector(q)].filter(Boolean); } catch { targets = []; }
    }
    for (const t of targets) {
      if (s.act === 'class') t.classList[s.op](s.name);
      else if (s.act === 'data') t.dataset[s.name] = s.from ? String(el.dataset[s.from]) : s.value;
      else if (s.op === 'setAttribute') t.setAttribute(s.name, s.value);
      else t[s.op](s.name);
    }
  }

  /**
   * Take the code out of the markup of a page. A mounted page is in the document of the canvas, with
   * the rights of the canvas, so no code of the page may run there: each inline handler is removed,
   * and a handler that only changes a class, a data value or a state attribute becomes a listener of the mount.
   */
  function disarm(rootEl) {
    for (const el of rootEl.querySelectorAll('object, embed, script')) el.remove();
    for (const el of [rootEl, ...rootEl.querySelectorAll('*')]) {
      for (const a of [...el.attributes]) {
        const name = a.name.toLowerCase();
        if (name.startsWith('on')) {
          const steps = L.parseHandler(a.value);
          el.removeAttribute(a.name);
          if (steps) el.addEventListener(name.slice(2), () => { for (const step of steps) runStep(el, step); });
        } else if (/^\s*javascript:/i.test(a.value) && ['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name)) el.removeAttribute(a.name);
      }
    }
  }

  const copyAttrs = (from, to) => { for (const a of from.attributes) { try { to.setAttribute(a.name, a.value); } catch { /* a name the element refuses */ } } };
  /** The work of the theme script of a component page: each copy panel shows the cells of the source panel, and one theme can show alone. */
  function themePanels(body, only) {
    const panels = [...body.querySelectorAll('section.wf-theme')];
    const source = panels.find((p) => p.dataset.themeSource !== undefined);
    for (const p of panels) if (source && p !== source) p.innerHTML = source.innerHTML;
    if (only && panels.some((p) => p.dataset.theme === only)) for (const p of panels) p.hidden = p.dataset.theme !== only;
  }

  const extraSheets = new Map();
  /**
   * Put a read page in a host element. `opts`:
   * - `state`: the state of a screen (`data-state` of the root).
   * - `theme`: the theme of the root (`data-theme`), or null to keep what the page names.
   * - `panel`: a component page shows the panel of this theme alone, as `?theme=` does.
   * - `pick`: a function that takes the body of the read page and answers the one element to draw
   *   (a specimen cell); the mount then holds a copy of that element alone.
   * - `css`: more rules for this mount, in the selectors of the page (`html`, `body`).
   * - `hug`: the mount takes the size of its content, for a component; else it has the size its
   *   host is given, and the page scrolls inside.
   */
  function fill(host, page, opts = {}) {
    const root = host.shadowRoot || host.attachShadow({ mode: 'open' });
    let extra = null;
    if (opts.css) {
      if (!extraSheets.has(opts.css)) extraSheets.set(opts.css, sheetOf(L.rewriteSheet(opts.css).css));
      extra = extraSheets.get(opts.css);
    }
    root.adoptedStyleSheets = [BASE, ...page.sheets, ...(extra ? [extra] : [])];
    const view = document.createElement('wf-view');
    const scroller = document.createElement('wf-scroll');
    const html = document.createElement('wf-html');
    const body = document.createElement('wf-body');
    copyAttrs(page.doc.documentElement, html);
    copyAttrs(page.doc.body, body);
    html.classList.add('wf-root');
    // The copy is made in the document of the read page, which runs no code, and the code is taken
    // out before the copy comes to the canvas.
    const source = page.doc.body.cloneNode(true);
    if (page.themes) themePanels(source, opts.pick ? null : opts.panel);
    disarm(source);
    // The style attribute of an element is text of the page too.
    for (const el of source.querySelectorAll('[style]')) {
      const was = el.getAttribute('style');
      const now = L.rewriteUnits(was);
      if (now !== was) el.setAttribute('style', now);
    }
    const one = opts.pick ? opts.pick(source) : null;
    if (opts.pick) { if (one) body.append(document.adoptNode(one)); } else body.append(...[...source.childNodes].map((n) => document.adoptNode(n)));
    for (const a of [...html.attributes, ...body.attributes]) if (a.name.toLowerCase().startsWith('on')) a.ownerElement.removeAttribute(a.name);
    if (opts.state) html.dataset.state = opts.state;
    else if (!html.dataset.state) html.dataset.state = new URL(page.url).searchParams.get('state') || 'default';
    if (opts.theme) html.dataset.theme = opts.theme;
    if (opts.hug) host.setAttribute('data-wf-hug', ''); else host.removeAttribute('data-wf-hug');
    html.append(body);
    scroller.append(html);
    view.append(scroller);
    root.replaceChildren(view);
    if (!remIsLength) html.style.setProperty('--wf-rem', getComputedStyle(html).fontSize);
    if (!root.wfGuard) {
      root.wfGuard = true;
      // A link or a form of the page must not take the canvas away. The host hears `wf-link`.
      root.addEventListener('click', (e) => {
        const a = e.target.closest?.('a[href]');
        if (!a) return;
        e.preventDefault();
        host.dispatchEvent(new CustomEvent('wf-link', { detail: { href: a.href, anchor: a } }));
      });
      root.addEventListener('submit', (e) => e.preventDefault());
    }
    host.classList.add('wf-mount');
    // A document paints the ground of its root (or of its body) on the whole window.
    const ground = () => {
      const of = (el) => { const c = getComputedStyle(el).backgroundColor; return c && c !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(c) ? c : ''; };
      scroller.style.background = opts.hug ? '' : of(html) || of(body) || '';
    };
    ground();
    // What the mount reads from the rules of the page, read again: the size of the root font where
    // the browser registers no property, and the ground.
    const restyle = () => {
      if (!remIsLength) { html.style.removeProperty('--wf-rem'); html.style.setProperty('--wf-rem', getComputedStyle(html).fontSize); }
      ground();
    };
    const handle = shadowView(host, page, { root, html, body, scroller, ground, restyle });
    host.wfView = handle;
    return handle;
  }

  /**
   * Read a page and put it in a host. Answers the view of the mount, or `{ fallback: true, reasons,
   * missing }` when the page must stay in a frame or is gone. The host then holds nothing new.
   * The host gets the event `wf-load` when its page is in.
   */
  async function mount(host, url, opts = {}) {
    if (!can) return { fallback: true, reasons: ['this browser draws a page only in a frame'], missing: false };
    const page = await load(url);
    if (!page.ok) return { fallback: true, reasons: page.reasons, missing: Boolean(page.missing) };
    const view = fill(host, page, opts);
    view.opts = opts;
    host.dispatchEvent(new CustomEvent('wf-load'));
    return view;
  }

  /** The deepest element of a tree that holds a point of the window, by its box: the last resort of `fromPoint`. */
  function deepestAt(el, x, y) {
    let found = null;
    for (const child of el.children) {
      const r = child.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom && getComputedStyle(child).display !== 'none') found = deepestAt(child, x, y) || child;
    }
    return found;
  }

  /**
   * The view of a mounted page. Lengths are in the pixels of the page, whatever scale the canvas
   * draws the mount at, and places are from the top left corner of the page.
   */
  function shadowView(host, page, { root, html, body, scroller, ground, restyle }) {
    const open = new Map();
    return {
      kind: 'shadow', el: host, root, html, body, scroller, url: page.url, baseURI: page.url, win: window,
      /** Grows each time a sheet takes new rules in place: rules that were read before are old then. */
      get sheetStamp() { return sheetStamp; },
      /** A sheet of the page has new rules: read again what the mount takes from them. */
      restyle,
      /** The scale that the canvas draws the page at. */
      get scale() { const w = host.offsetWidth; return w ? host.getBoundingClientRect().width / w || 1 : 1; },
      query: (sel) => { try { return root.querySelector(L.rewriteSelector(sel)); } catch { return null; } },
      queryAll: (sel) => { try { return [...root.querySelectorAll(L.rewriteSelector(sel))]; } catch { return []; } },
      /** The box of an element on its page. */
      rect(node) {
        // An element that draws no box has no place.
        if (!node.getClientRects().length) return { x: 0, y: 0, width: 0, height: 0 };
        const s = this.scale;
        const a = node.getBoundingClientRect();
        const o = scroller.getBoundingClientRect();
        return { x: (a.left - o.left) / s + scroller.scrollLeft, y: (a.top - o.top) / s + scroller.scrollTop, width: a.width / s, height: a.height / s };
      },
      /** The element of the page under a point of the window; null when the point is off the page. */
      fromPoint(x, y) {
        const o = host.getBoundingClientRect();
        if (x < o.left || x > o.right || y < o.top || y > o.bottom) return null;
        const hit = root.elementsFromPoint(x, y).find((e) => e.getRootNode() === root && body.contains(e));
        return hit || deepestAt(body, x, y) || body;
      },
      style: (node, pseudo) => getComputedStyle(node, pseudo),
      /** The sheets of the page, in their order; `nameOf(sheet)` is the address of its file, or `''` for the styles of the page. */
      sheets: () => root.adoptedStyleSheets.filter((s) => s !== BASE),
      nameOf: (sheet) => sheetNames.get(sheet) ?? '',
      selectorText: (rule) => L.displaySelector(rule.selectorText || ''),
      /** A value of a rule or of a computed style as the page wrote it. */
      valueText: (value) => L.displayValue(value),
      /** True when a group rule of the page is open now. A container rule is asked of the box of the mount. */
      applies(rule) {
        if (rule.type === 4) return matchMedia(rule.media.mediaText).matches;
        if (rule.type === 12) return CSS.supports(rule.conditionText);
        if (typeof CSSContainerRule === 'undefined' || !(rule instanceof CSSContainerRule)) return true;
        const id = `${rule.conditionText}|${host.offsetWidth}|${host.offsetHeight}`;
        if (!open.has(id)) {
          // The browser answers: a probe in the container takes a mark from a rule with the same condition.
          const probe = document.createElement('wf-probe');
          const sheet = sheetOf(`@container ${rule.conditionText}{wf-probe{--wf-open:1}}`);
          const view = scroller.parentNode;
          view.append(probe);
          root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
          open.set(id, getComputedStyle(probe).getPropertyValue('--wf-open').trim() === '1');
          root.adoptedStyleSheets = root.adoptedStyleSheets.filter((s) => s !== sheet);
          probe.remove();
        }
        return open.get(id);
      },
      get scrollTop() { return scroller.scrollTop; },
      set scrollTop(v) { scroller.scrollTop = v; },
      onScroll(fn) { scroller.addEventListener('scroll', fn, { passive: true }); return () => scroller.removeEventListener('scroll', fn); },
      /** The height of the whole page, and its width. */
      pageHeight: () => scroller.scrollHeight,
      pageWidth: () => scroller.scrollWidth,
      get state() { return html.dataset.state; },
      setState(s) { html.dataset.state = s; ground(); },
      setTheme(t) { if (t) html.dataset.theme = t; else delete html.dataset.theme; ground(); },
      /**
       * Read the files again and draw the page anew, in the state and the theme it has now.
       * `fresh: false` reads what `forget()` left: the caller forgot once for many mounts.
       */
      async reload({ fresh = true } = {}) {
        if (fresh) forget(page.url);
        const next = await load(page.url);
        if (!next.ok) return { fallback: true, reasons: next.reasons, missing: Boolean(next.missing) };
        const top = scroller.scrollTop;
        const opts = { ...(this.opts || {}), state: html.dataset.state, theme: html.dataset.theme || (this.opts || {}).theme };
        const view = fill(host, next, opts);
        view.opts = opts;
        view.scrollTop = top;
        host.dispatchEvent(new CustomEvent('wf-load'));
        return view;
      },
    };
  }

  /** The view of a page in a frame, with the same parts; null while the frame has no page of this origin. */
  function frameView(frame) {
    let doc = null;
    try { doc = frame.contentDocument; } catch { doc = null; }
    if (!doc?.body) return null;
    const win = doc.defaultView;
    const html = doc.documentElement;
    return {
      kind: 'frame', el: frame, root: doc, html, body: doc.body, scroller: doc.scrollingElement || html, url: doc.URL, baseURI: doc.baseURI, win,
      get scale() { const w = frame.offsetWidth; return w ? frame.getBoundingClientRect().width / w || 1 : 1; },
      query: (sel) => { try { return doc.querySelector(sel); } catch { return null; } },
      queryAll: (sel) => { try { return [...doc.querySelectorAll(sel)]; } catch { return []; } },
      rect(node) { const a = node.getBoundingClientRect(); return { x: a.left + win.scrollX, y: a.top + win.scrollY, width: a.width, height: a.height }; },
      fromPoint(x, y) {
        const o = frame.getBoundingClientRect();
        if (x < o.left || x > o.right || y < o.top || y > o.bottom) return null;
        const s = this.scale;
        return doc.elementFromPoint((x - o.left) / s, (y - o.top) / s);
      },
      style: (node, pseudo) => win.getComputedStyle(node, pseudo),
      sheets: () => [...doc.styleSheets],
      nameOf: (sheet) => sheet.href || '',
      selectorText: (rule) => rule.selectorText || '',
      valueText: (value) => String(value ?? ''),
      applies: (rule) => (rule.type === 4 ? win.matchMedia(rule.media.mediaText).matches : rule.type === 12 ? CSS.supports(rule.conditionText) : true),
      get scrollTop() { return win.scrollY; },
      set scrollTop(v) { win.scrollTo({ top: v, behavior: 'instant' }); },
      onScroll(fn) { win.addEventListener('scroll', fn, { passive: true }); return () => win.removeEventListener('scroll', fn); },
      pageHeight: () => html.scrollHeight,
      pageWidth: () => html.scrollWidth,
      get state() { return html.dataset.state; },
      setState(s) { html.dataset.state = s; },
      setTheme(t) { if (t) html.dataset.theme = t; else delete html.dataset.theme; },
      async reload() { try { win.location.reload(); } catch { const src = frame.src; frame.src = src; } return this; },
    };
  }
  /** The view of a mounted host or of a frame; null when the element holds no page yet. */
  const viewOf = (el) => (!el ? null : el.tagName === 'IFRAME' ? frameView(el) : el.wfView || null);
  /** Every mounted host of the canvas. */
  const mounts = (scope = document) => [...scope.querySelectorAll('.wf-mount')].filter((el) => el.wfView);

  return { load, mount, fill, forget, refreshSheets, viewOf, mounts, LOGIC: L };
})();
