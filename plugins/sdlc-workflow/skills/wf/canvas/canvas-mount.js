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
  /**
   * An inline handler that the mount can do itself, with no code of the page: it changes a class
   * of its element, or of the nearest ancestor that a selector names. Returns the steps
   * `[{ closest, op, name }]`, or null for any other handler.
   */
  function parseHandler(text) {
    const steps = String(text).split(';').map((p) => p.trim()).filter(Boolean).map((p) => {
      const m = /^this(?:\.closest\((['"])([^'"]+)\1\))?\.classList\.(add|remove|toggle)\((['"])([\w-]+)\4\)$/.exec(p);
      return m ? { closest: m[2] ?? null, op: m[3], name: m[5] } : null;
    });
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
      for (const h of tag[0].matchAll(/\son[a-z]+\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)) {
        if (!parseHandler(h[1] ?? h[2])) out.add('it has an inline event handler that is more than a class change');
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
    return outside(String(text), (s) => s.replace(/(?<![\w-])(-?(?:\d+\.?\d*|\.\d+))[dsl]?v(h|w|min|max|i|b)(?![\w-])/gi, (_, d, u) => `${d}cq${u.toLowerCase()}`));
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
    const cond = String(condition).trim();
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
    const emit = (items) => items.map((item) => {
      if (item.body === undefined) {
        const t = absoluteUrls(item.text, base);
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
      return `${rewriteSelector(p)}{${emit(parseItems(item.body))}}`;
    }).join('');
    return { css: emit(parseItems(stripComments(String(text ?? '')))), hoist, problems };
  }

  /** The rules of the mount itself, under the sheets of the page. */
  const BASE_CSS = `:host{all:initial;display:block;position:relative;overflow:hidden;contain:layout paint style;transform-origin:0 0}
wf-view{display:block;width:100%;height:100%;overflow:hidden;container:wf-screen / size}
wf-scroll{display:block;width:100%;height:100%;overflow:auto;scrollbar-width:none;overscroll-behavior:contain}
wf-scroll::-webkit-scrollbar{display:none}
wf-html{display:block}
wf-body{display:block;margin:8px}
:host([data-wf-hug]){contain:layout style;overflow:visible}
:host([data-wf-hug]) wf-view{height:auto;overflow:visible;container-type:inline-size}
:host([data-wf-hug]) wf-scroll{height:auto;overflow:visible}`;

  return { mountProblems, hasThemeScript, stripComments, parseItems, splitList, rewriteSelector, displaySelector, rewriteUnits, absoluteUrls, mediaQuery, rewriteSheet, BASE_CSS, switchScript, parseHandler };
})();

// eslint-disable-next-line no-var, no-unused-vars
var WF_CANVAS_MOUNT = (() => {
  'use strict';
  if (typeof document === 'undefined') return null;
  const L = WF_CANVAS_MOUNT_LOGIC;
  // A browser with no constructed sheets draws every page in a frame.
  const can = typeof CSSStyleSheet !== 'undefined' && 'adoptedStyleSheets' in Document.prototype;

  const sheetOf = (css) => { const s = new CSSStyleSheet(); s.replaceSync(css); return s; };
  const BASE = can ? sheetOf(L.BASE_CSS) : null;
  /** The name of each sheet of a page, for the inspector: the address of its file, or `''` for the styles of the page. */
  const sheetNames = new WeakMap();
  const linked = new Map(); // address -> Promise<{ sheet, problems }>
  const inline = new Map(); // text -> { sheet, problems }
  const pages = new Map(); // address -> Promise<page>
  const hoisted = new Set();

  /** Give the document the rules that a shadow root does not read: the font faces and the imports. */
  function hoist(rules) {
    const fresh = rules.filter((r) => !hoisted.has(r));
    if (!fresh.length) return;
    for (const r of fresh) hoisted.add(r);
    let el = document.getElementById('wf-mount-fonts');
    if (!el) { el = document.createElement('style'); el.id = 'wf-mount-fonts'; document.head.append(el); }
    // An import must come before every other rule of its sheet.
    const all = [...hoisted];
    el.textContent = [...all.filter((r) => /^@import\b/i.test(r)), ...all.filter((r) => !/^@import\b/i.test(r))].join('\n');
  }
  function build(text, base, name, media) {
    const wrapped = media && !/^(?:all|screen)?$/i.test(media.trim()) ? `@media ${media}{${text}}` : text;
    const r = L.rewriteSheet(wrapped, base);
    hoist(r.hoist);
    const sheet = sheetOf(r.css);
    sheetNames.set(sheet, name);
    return { sheet, problems: r.problems };
  }
  function linkedSheet(href, media) {
    const id = `${media || ''}|${href}`;
    if (!linked.has(id)) {
      linked.set(id, fetch(href, { cache: 'no-cache' }).then(async (res) => {
        if (!res.ok) return { sheet: null, problems: [], gone: true };
        return build(await res.text(), href, href, media);
      }).catch(() => ({ sheet: null, problems: [], failed: true })));
    }
    return linked.get(id);
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
        for (const el of doc.querySelectorAll('link, style, script, meta, title, base')) el.remove();
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

  /**
   * Take the code out of the markup of a page. A mounted page is in the document of the canvas, with
   * the rights of the canvas, so no code of the page may run there: each inline handler is removed,
   * and a handler that only changes a class becomes a listener of the mount.
   */
  function disarm(rootEl) {
    for (const el of rootEl.querySelectorAll('object, embed, script')) el.remove();
    for (const el of [rootEl, ...rootEl.querySelectorAll('*')]) {
      for (const a of [...el.attributes]) {
        const name = a.name.toLowerCase();
        if (name.startsWith('on')) {
          const steps = L.parseHandler(a.value);
          el.removeAttribute(a.name);
          if (steps) {
            el.addEventListener(name.slice(2), () => {
              for (const s of steps) {
                let target = el;
                if (s.closest) { try { target = el.closest(s.closest); } catch { target = null; } }
                target?.classList[s.op](s.name);
              }
            });
          }
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
    const handle = shadowView(host, page, { root, html, body, scroller, ground });
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
  function shadowView(host, page, { root, html, body, scroller, ground }) {
    const open = new Map();
    return {
      kind: 'shadow', el: host, root, html, body, scroller, url: page.url, baseURI: page.url, win: window,
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

  return { load, mount, fill, forget, viewOf, mounts, LOGIC: L };
})();
