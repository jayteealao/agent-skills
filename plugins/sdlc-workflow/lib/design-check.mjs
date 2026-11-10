// The checks of the screens, before an approval: contrast, target size, viewport fit,
// worst-case content, display bugs, overlapping text, script errors, files that do not load,
// colors that are not tokens, and the use of the component library, in each viewport and each
// state. The hover, press and keyboard-focus states of each control are checked too. A headless
// Chromium opens each screen page over the DevTools protocol, and a script in the page measures
// it. A pool of pages in one browser loads the screen pages side by side.
//
// Each failure names its screen, check, viewport and state, a message, the box of the element
// on the page, and what fixes it: a move (design/<move>.md) or a `do` sentence. The result goes
// to `_design/checks.json` in the records; the canvas draws the boxes, and the approval question
// shows each failure. A run never drops a kind of failure in silence: `truncated` counts what a
// cap cut, by check, and `notices` says what the run could not measure.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { browserCandidates, noBrowserReason, removeProfile, sweepProfiles } from './design-browser.mjs';
import { groupFailures, readChecks, writeChecks } from './design-records.mjs';
import { COMPONENTS_FILE, STATES, TOKENS_FILE, listScreens, parseViewport, readManifest, screenUrl, surfaceDir, tokensOf } from './design-surface.mjs';
import { versionDrift } from './design-versions.mjs';
import { agentFix, personFix, refuse } from './fix.mjs';
import { killTree } from './proc.mjs';

export { groupFailures };

/**
 * The check of a failure → the move that fixes it (design/<move>.md). A check with no move
 * names its repair in CHECK_DO.
 */
export const CHECK_MOVES = Object.freeze({
  contrast: 'colorize', 'target-size': 'harden', 'viewport-fit': 'layout', 'worst-case': 'harden', states: 'harden',
  display: 'harden', overlap: 'layout', token: 'colorize', focus: 'harden', component: null, script: null,
  resource: null, load: null, version: null,
});
/** What to change for a failure of a check that has no move. */
export const CHECK_DO = Object.freeze({
  component: 'Draw the control with a component of the library (data-component="<key>"), or add the part with design component add. Change the look of a component in components.css, never in the page.',
  script: 'Repair the script of the screen page, so that it runs with no error and opens no dialog at load.',
  resource: 'Point the link at a file that exists in .ai/design/, or remove the link.',
  load: 'Remove or repair what the page waits for at load: a screen page loads from its own files, with no network.',
  version: 'Save the change as a round with design round, or put the approved page back with design restore.',
});
/** A page that changes the look of a component: the fix is to bring the two back in line. */
const isRestyle = (f) => f.check === 'component' && String(f.cause ?? '').startsWith('restyle:');
/** The move of one failure, or null: a restyle goes to polish, every other failure to the move of its check. */
export const moveOf = (f) => (isRestyle(f) ? 'polish' : CHECK_MOVES[f.check] ?? null);
/** The fix fields of a failure: its move, or the `do` sentence when no move fixes it. */
const routed = (f) => { const move = moveOf(f); return { move, ...(move ? {} : { do: f.do ?? CHECK_DO[f.check] ?? null }) }; };
/** One rule for target size: a pointer target is at least 24 by 24 CSS pixels. */
export const MIN_TARGET = 24;
const START_MS = 15000;
const STEP_MS = 15000;
const CONNECT_MS = 10000;
/** The places that one load keeps for one cause, and the causes that one screen keeps for one check. */
export const MAX_PLACES = 5;
export const MAX_CAUSES = 15;
/** The pages that load screen pages at the same time, in one browser. */
const PAGES = 3;

/* ───────────────────────── the page script ───────────────────────── */

// Runs in the page: the box of an element in CSS pixels of the document. The checks and the
// boxes of the audit findings share it.
function pageBox(el) {
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + scrollX), y: Math.round(r.top + scrollY), width: Math.round(r.width), height: Math.round(r.height) };
}

/** A script for the page: the box of the first element that `selector` matches, or null when none matches or it has no size. */
export function selectorRect(selector) {
  return `((pageBox) => { try {
    const el = document.querySelector(${JSON.stringify(String(selector))});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return null;
    return pageBox(el);
  } catch { return null; } })(${pageBox.toString()})`;
}

// Runs in the page: the helpers that each page script shares. The colors are measured on a
// 1×1 canvas, so every color syntax that the browser knows reads as RGBA.
function pageKit() {
  const canvas = document.createElement('canvas');
  canvas.width = 1; canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgba = (c) => {
    if (!c || c === 'transparent') return [0, 0, 0, 0];
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000'; ctx.fillStyle = c;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3] / 255];
  };
  const over = (top, under) => {
    const a = top[3] + under[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a).concat(a);
  };
  const lum = (c) => {
    const f = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  // The opacity that an element shows with: its own and that of each ancestor.
  const opacities = new WeakMap();
  const opacityOf = (el) => {
    if (!el || el.nodeType !== 1) return 1;
    if (!opacities.has(el)) opacities.set(el, Number(getComputedStyle(el).opacity) * opacityOf(el.parentElement));
    return opacities.get(el);
  };
  // Shown: the element has a box, and neither it nor an ancestor is hidden or fully transparent.
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0)) return false;
    if (getComputedStyle(el).visibility === 'hidden') return false;
    return opacityOf(el) > 0;
  };
  const box = pageBox;
  const selector = (el) => {
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.body && parts.length < 4; n = n.parentElement) {
      if (n.id) { parts.unshift(`#${CSS.escape(n.id)}`); break; }
      const same = n.parentElement ? [...n.parentElement.children].filter((c) => c.tagName === n.tagName) : [];
      parts.unshift(same.length > 1 ? `${n.tagName.toLowerCase()}:nth-of-type(${same.indexOf(n) + 1})` : n.tagName.toLowerCase());
    }
    return parts.join(' > ');
  };
  const hex = (c) => `#${c.slice(0, 3).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  // The colors of the stops of the gradients of a background image. Null when a picture is in
  // the way, because no list of colors is the background then.
  const stops = (image) => {
    if (/url\(|image-set\(|element\(|cross-fade\(|paint\(/i.test(image)) return null;
    const found = image.match(/(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^()]*\)|#[0-9a-f]{3,8}\b/gi) ?? [];
    return found.length ? found.map(rgba) : null;
  };
  // The backgrounds under an element: its layers composited down to white, with the opacity of
  // each layer. A gradient gives one background for each of its stops. Null when a picture is in the way.
  const backgrounds = (el) => {
    const layers = [];
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const o = opacityOf(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const s = stops(cs.backgroundImage);
        if (!s) return null;
        layers.push(s.map((c) => [c[0], c[1], c[2], c[3] * o]));
        if (s.every((c) => c[3] * o >= 1)) break;
      }
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) layers.push([[c[0], c[1], c[2], c[3] * o]]);
      if (c[3] * o >= 1) break;
    }
    let under = [[255, 255, 255, 1]];
    for (const layer of layers.reverse()) {
      const next = new Map();
      for (const top of layer) for (const u of under) { const c = over(top, u); next.set(c.map((v) => Math.round(v * 100)).join(','), c); }
      under = [...next.values()].slice(0, 16);
    }
    return under;
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  // The contrast of the text of an element in the color `color`: the worst of its backgrounds,
  // `{ fg, bg, ratio, need, large }`. `{ image: true }` when a picture is the background.
  const textContrast = (el, color = null) => {
    const cs = getComputedStyle(el);
    const bgs = backgrounds(el);
    if (!bgs) return { image: true };
    const raw = rgba(color ?? cs.color);
    const ink = [raw[0], raw[1], raw[2], raw[3] * opacityOf(el)];
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    let worst = null;
    for (const bg of bgs) {
      const fg = over(ink, bg);
      const r = ratio(fg, bg);
      if (!worst || r < worst.ratio) worst = { fg, bg, ratio: r };
    }
    return { ...worst, need: large ? 3 : 4.5, large };
  };
  // A disabled control is exempt from contrast (WCAG 1.4.3).
  const disabled = (el) => Boolean(el.closest('[disabled], [aria-disabled="true"]') || el.matches(':disabled'));
  const ownText = (el) => [...el.childNodes].some((t) => t.nodeType === 3 && t.textContent.trim());
  // Text for a screen reader only: a box of one or two pixels, or a clip that shows nothing.
  const readerOnly = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width <= 2 || r.height <= 2 || /rect\(0(px)?[, ]+0(px)?[, ]+0(px)?[, ]+0(px)?\)/.test(cs.clip) || /inset\(50%\)/.test(cs.clipPath);
  };
  const TARGETS = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [role=link], [role=tab], [role=checkbox], [role=switch], [role=menuitem], [onclick]';
  return { rgba, over, lum, shown, opacityOf, box, selector, hex, backgrounds, ratio, textContrast, disabled, ownText, readerOnly, TARGETS };
}

// Runs in the screen page. It returns `{ found, notices, brokenImages }`: `found` is
// `[{ check, message, cause, rect, selector }]`. `tokens` are the color tokens of the token sheet,
// `[{ name, value }]`, for the token check; `scanTokens` runs it. `restyle` checks that the page
// does not restyle a component of the library.
function pageChecks(minTarget, { worst = false, scanTokens = false, tokens = [], componentsCss = '', components = [], restyle = false } = {}) {
  const out = [];
  const notices = [];
  const { rgba, shown, box, selector, hex, textContrast, disabled, ownText, readerOnly, TARGETS } = pageKit();
  // `cause` is what the failures of one fault share, for example one color pair: the list groups by it.
  const add = (check, el, message, cause = message, more = null) => out.push({ check, message, cause, rect: box(el), selector: selector(el), ...(more ?? {}) });

  // Contrast: WCAG AA, 4.5:1, or 3:1 for large text. The text of an element, and the value or
  // the placeholder of a form field.
  let overImage = 0;
  const contrast = (el, what, color = null) => {
    const t = textContrast(el, color);
    if (t.image) { overImage += 1; return; }
    if (t.ratio + 1e-9 >= t.need) return;
    add('contrast', el, `The ${what} ${hex(t.fg)} on ${hex(t.bg)} is ${t.ratio.toFixed(2)}:1; ${t.need}:1 is the minimum for ${t.large ? 'large' : 'body'} text`, `${what}/${hex(t.fg)}/${hex(t.bg)}/${t.need}`);
  };
  for (const el of document.body.querySelectorAll('*')) {
    if (!shown(el) || !ownText(el) || disabled(el) || /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|TEXTAREA)$/.test(el.tagName)) continue;
    contrast(el, 'text');
  }
  for (const el of document.body.querySelectorAll('input, textarea, select')) {
    if (!shown(el) || disabled(el) || /^(checkbox|radio|range|color|file|hidden|image)$/i.test(el.type ?? '')) continue;
    const value = el.tagName === 'SELECT' ? (el.selectedOptions[0]?.textContent ?? '') : (el.value ?? '');
    if (String(value).trim()) contrast(el, 'field text');
    else if (el.placeholder) contrast(el, 'placeholder text', getComputedStyle(el, '::placeholder').color);
  }
  if (overImage) notices.push({ kind: 'contrast-over-image', count: overImage, message: `not measured: text over an image (${overImage} element(s)); look at its contrast by eye` });

  // Target size: one rule, at least minTarget by minTarget CSS pixels. The target is the box of
  // the control, with a positioned ::before or ::after that widens the hit area, and with the
  // label of an input that is hidden to the eye. A link inside running text is exempt.
  const targetBox = (el) => {
    const r = el.getBoundingClientRect();
    let [left, top, right, bottom] = [r.left, r.top, r.right, r.bottom];
    const grow = (x1, y1, x2, y2) => { left = Math.min(left, x1); top = Math.min(top, y1); right = Math.max(right, x2); bottom = Math.max(bottom, y2); };
    const cs = getComputedStyle(el);
    if (cs.position !== 'static') {
      for (const pseudo of ['::before', '::after']) {
        const ps = getComputedStyle(el, pseudo);
        if (!ps.content || ps.content === 'none' || ps.content === 'normal' || ps.position !== 'absolute' || ps.display === 'none' || ps.pointerEvents === 'none') continue;
        const [l, t, w, h] = [ps.left, ps.top, ps.width, ps.height].map(parseFloat);
        if ([l, t, w, h].some(Number.isNaN)) continue;
        const x = r.left + parseFloat(cs.borderLeftWidth || 0) + l;
        const y = r.top + parseFloat(cs.borderTopWidth || 0) + t;
        grow(x, y, x + w, y + h);
      }
    }
    if (el.tagName === 'INPUT' && readerOnly(el)) {
      left = Infinity; top = Infinity; right = -Infinity; bottom = -Infinity;
      for (const label of el.labels ?? []) { const lr = label.getBoundingClientRect(); if (lr.width > 0 && lr.height > 0) grow(lr.left, lr.top, lr.right, lr.bottom); }
      if (left === Infinity) [left, top, right, bottom] = [r.left, r.top, r.right, r.bottom];
    }
    return { width: right - left, height: bottom - top };
  };
  for (const el of document.body.querySelectorAll(TARGETS)) {
    if (!shown(el)) continue;
    const r = targetBox(el);
    if (r.width >= minTarget - 0.5 && r.height >= minTarget - 0.5) continue;
    const cs = getComputedStyle(el);
    if (el.tagName === 'A' && cs.display === 'inline' && el.parentElement && el.parentElement.textContent.trim().length > el.textContent.trim().length + 20) continue;
    add('target-size', el, `The target is ${Math.round(r.width)}×${Math.round(r.height)} px; ${minTarget}×${minTarget} px is the minimum`, `${Math.round(r.width)}×${Math.round(r.height)}`);
  }

  // Viewport fit: no horizontal scroll at this width.
  const width = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > width + 1) {
    const wide = [...document.body.querySelectorAll('*')].filter((el) => shown(el) && el.getBoundingClientRect().right > width + 1)
      .filter((el, _, all) => !all.some((o) => o !== el && o.contains(el)));
    for (const el of wide.slice(0, 5)) add('viewport-fit', el, `The element ends at ${Math.round(el.getBoundingClientRect().right)} px, past the ${width} px viewport`);
    if (!wide.length) add('viewport-fit', document.body, `The page is ${document.documentElement.scrollWidth} px wide, past the ${width} px viewport`);
  }

  // Worst-case content: in the worst state, no text is cut off by a box that hides overflow.
  // Text for a screen reader only is hidden on purpose, and a form field scrolls its own value.
  if (worst) {
    for (const el of document.body.querySelectorAll('*')) {
      if (!shown(el) || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || readerOnly(el)) continue;
      const cs = getComputedStyle(el);
      const clipX = /hidden|clip/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis';
      const clipY = /hidden|clip/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1 && cs.webkitLineClamp === 'none';
      if (clipX || clipY) add('worst-case', el, `The content is cut off: ${el.scrollWidth}×${el.scrollHeight} px in a ${el.clientWidth}×${el.clientHeight} px box with hidden overflow`);
    }
  }

  // Display bugs: the text of a missing value, and an image that does not load.
  const texts = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = walker.nextNode(); t; t = walker.nextNode()) {
    const el = t.parentElement;
    if (!el || !t.textContent.trim() || /^(SCRIPT|STYLE|CODE|PRE|KBD|SAMP|TEXTAREA)$/.test(el.tagName) || !shown(el)) continue;
    texts.push(t);
  }
  const missing = new Set();
  for (const t of texts) {
    const m = /(^|[^\w])(undefined|null|NaN)(?!\w)|\[object Object\]/.exec(t.textContent);
    if (m && !missing.has(t.parentElement)) {
      missing.add(t.parentElement);
      const shownText = m[0].replace(/^[^\w[]/, '');
      add('display', t.parentElement, `The text shows "${shownText}", the text of a missing value`, `text:${shownText}`);
    }
  }
  const brokenImages = [];
  for (const img of document.body.querySelectorAll('img[src]')) {
    if (!img.complete || img.naturalWidth > 0) continue;
    brokenImages.push(img.currentSrc || img.src);
    if (!img.getClientRects().length) continue;
    add('display', img, `The image ${img.getAttribute('src').slice(0, 80)} does not load`, `image:${img.getAttribute('src')}`);
  }

  // Overlap: two pieces of text whose lines cross. Each line of a text is its own box, so a
  // text that wraps around another never counts. A fixed or sticky bar, an open dialog and a
  // popover lie over the page on purpose: a text is compared only with the texts of its own
  // layer. A scroll container shows only the part of a text inside its box.
  const layerOf = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const p = getComputedStyle(n).position;
      if (p === 'fixed' || p === 'sticky' || n.matches('dialog[open], [role=dialog], [role=alertdialog], [aria-modal="true"], [popover]')) return n;
    }
    return null;
  };
  const clipped = (el, rects) => {
    let list = rects.map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }));
    for (let n = el; n && n !== document.body && list.length; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = n.getBoundingClientRect();
      list = list.map((r) => ({ left: Math.max(r.left, c.left), top: Math.max(r.top, c.top), right: Math.min(r.right, c.right), bottom: Math.min(r.bottom, c.bottom) }))
        .filter((r) => r.right - r.left > 1 && r.bottom - r.top > 1);
    }
    return list;
  };
  const lines = texts.slice(0, 400).map((t) => {
    const range = document.createRange();
    range.selectNodeContents(t);
    return { t, layer: layerOf(t.parentElement), rects: clipped(t.parentElement, [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1)) };
  }).filter((l) => l.rects.length);
  if (texts.length > 400) notices.push({ kind: 'overlap-partial', count: texts.length - 400, message: `the overlap check read the first 400 texts of the page; ${texts.length - 400} more were not compared` });
  const crossed = new Set();
  for (let i = 0; i < lines.length; i += 1) {
    for (let j = i + 1; j < lines.length; j += 1) {
      if (lines[i].layer !== lines[j].layer) continue;
      const hit = lines[i].rects.some((a) => lines[j].rects.some((b) => {
        const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const hgt = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        return w > 2 && hgt > 2 && w * hgt > 0.25 * Math.min((a.right - a.left) * (a.bottom - a.top), (b.right - b.left) * (b.bottom - b.top));
      }));
      if (!hit || crossed.has(lines[j].t.parentElement)) continue;
      crossed.add(lines[j].t.parentElement);
      const words = (t) => `"${t.textContent.trim().slice(0, 30)}"`;
      add('overlap', lines[j].t.parentElement, `The text ${words(lines[j].t)} overlaps the text ${words(lines[i].t)}`);
      break;
    }
  }

  // The style rules of every sheet that the page can read, each with its sheet.
  const flat = (list) => [...list].flatMap((r) => (r.cssRules && !r.selectorText ? flat(r.cssRules) : [r]));
  const rulesOf = (sheet) => { try { return flat(sheet.cssRules).filter((r) => r.selectorText && r.style); } catch { return []; } };
  // The elements that a rule styles: its selector without the parts that only a state of the
  // pointer or a pseudo-element gives. A shown element comes first.
  const plainParts = (selectorText) => selectorText.split(',').map((part) => part
    .replace(/::?(?:before|after|placeholder|selection|marker|backdrop|first-line|first-letter|file-selector-button)/gi, '')
    .replace(/:(?:hover|active|focus-visible|focus-within|focus|visited|link|any-link|target|checked|disabled|enabled|invalid|valid|required|optional|placeholder-shown|read-only|read-write)/gi, '').trim());
  const styled = (selectorText) => {
    const els = new Set();
    for (const part of plainParts(selectorText)) {
      if (!part || /[>+~]$/.test(part)) continue;
      try { for (const el of document.querySelectorAll(part)) els.add(el); } catch { /* a selector that this page cannot query */ }
    }
    return [...els];
  };
  // A rule of a bare state (`:focus-visible { ... }`) styles any element.
  const bare = (selectorText) => plainParts(selectorText).some((part) => !part);
  const first = (els) => els.find(shown) ?? els[0] ?? null;

  // Tokens: a color written in the page, not taken from the token sheet.
  if (scanTokens) {
    const swatches = tokens.filter((t) => !/^var\(/.test(t.value) && CSS.supports('color', t.value)).map((t) => ({ ...t, c: rgba(t.value) }));
    if (!swatches.length) {
      add('token', document.body, 'The token sheet tokens.css has no color token, so the colors of this page are not checked', 'no-color-token',
        { do: 'Write the color roles in the "## Colors" table of DESIGN.md, then run design tokens.' });
    } else {
      const COLOR = /^(color|background-color|background-image|border-(top|right|bottom|left|block-start|block-end|inline-start|inline-end)-color|outline-color|fill|stroke|box-shadow|text-shadow|text-decoration-color|caret-color|accent-color|column-rule-color)$/;
      // A shorthand that holds a var() reads back whole, and its longhands read back empty.
      const SHORTHANDS = ['background', 'border', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-color', 'border-block', 'border-inline', 'outline', 'text-decoration', 'column-rule'];
      const FUNC = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\([^)]*\)/i;
      // A named color (red, rebeccapurple) is a raw color too; transparent, currentcolor and the
      // global keywords are not.
      const NOT_RAW = /^(?:transparent|currentcolor|inherit|initial|unset|revert|revert-layer|none)$/i;
      const namedIn = (value) => String(value).split(/[\s,()/]+/).find((w) => /^[a-z]+$/i.test(w) && !NOT_RAW.test(w) && CSS.supports('color', w)) ?? null;
      // A URL is no color: its path and its fragment can read like one.
      const noUrl = (value) => String(value).replace(/url\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\)/gi, ' ');
      // A value without its var() calls, each taken out whole with its fallback.
      const noVar = (value) => {
        let text = String(value);
        for (let at = text.search(/var\(/i); at >= 0; at = text.search(/var\(/i)) {
          let depth = 0;
          let end = at + 3;
          for (; end < text.length; end += 1) {
            if (text[end] === '(') depth += 1;
            else if (text[end] === ')') { depth -= 1; if (depth === 0) break; }
          }
          text = `${text.slice(0, at)} ${text.slice(end + 1)}`;
        }
        return text;
      };
      const rawIn = (value) => { const v = noUrl(value); return FUNC.exec(v)?.[0] ?? namedIn(v); };
      // The custom properties of the token sheet; a var() of any other one is a color the page made.
      // The component sheet may name its own properties: those are the library's, not the page's.
      const tokenNames = new Set([...tokens.map((t) => t.name), ...[...String(componentsCss).matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1])]);
      const foreignVar = (value) => [...String(value).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]).find((n) => !tokenNames.has(n)) ?? null;
      const nearest = (c) => swatches.reduce((best, t) => {
        const d = Math.hypot(c[0] - t.c[0], c[1] - t.c[1], c[2] - t.c[2], (c[3] - t.c[3]) * 255);
        return !best || d < best.d ? { t, d } : best;
      }, null);
      // The color declarations of a style: the longhands, and each shorthand that holds a var().
      const declarations = (style) => {
        const list = [];
        for (let i = 0; i < style.length; i += 1) {
          const value = style.getPropertyValue(style[i]);
          if (COLOR.test(style[i]) && value) list.push([style[i], value]);
        }
        for (const prop of SHORTHANDS) {
          const value = style.getPropertyValue(prop);
          if (value && value.includes('var(')) list.push([prop, value]);
        }
        return list;
      };
      const told = new Set();
      const scan = (style, where, find) => {
        let el;
        for (const [prop, value] of declarations(style)) {
          const own = value.includes('var(') ? foreignVar(value) : null;
          // With a var() of a token, the text beside it is read too (`1px solid var(--line), #f00`).
          // The fallback of a token is never used, because the token sheet gives the token: it is no color of the page.
          const raw = own ? null : rawIn(value.includes('var(') ? noVar(value) : value);
          const what = own ?? raw;
          if (!what || told.has(`${where}|${what}`)) continue;
          el ??= find();
          if (!el) return;
          told.add(`${where}|${what}`);
          if (own) { add('token', el, `The ${prop} of ${where} uses the custom property ${own}, which is not a token`, own); continue; }
          // The browser writes every color as rgb(); an opaque one reads back as hex.
          const c = rgba(raw);
          const { t: n, d } = nearest(c);
          const color = c[3] >= 1 ? hex(c) : raw;
          add('token', el, `The ${prop} ${color} of ${where} is not a token; ${d < 1 ? `use ${n.name}, which has this value` : `the nearest token is ${n.name} (${n.value})`}`, color);
        }
      };
      // The component sheet comes as text too: a page that does not link it is checked against it all the same.
      const shared = new CSSStyleSheet();
      shared.replaceSync(componentsCss);
      for (const sheet of [...document.styleSheets, shared]) {
        if (sheet.href && /tokens\.css(?:[?#].*)?$/.test(sheet.href)) continue;
        for (const r of rulesOf(sheet)) scan(r.style, r.selectorText, () => first(styled(r.selectorText)) ?? (bare(r.selectorText) ? document.body : null));
      }
      for (const el of document.body.querySelectorAll('[style]')) scan(el.style, `the style of ${selector(el)}`, () => el);
    }
  }

  // Components: with a library, a screen reuses it, and a control stands inside a component.
  if (components.length) {
    for (const el of document.body.querySelectorAll('[data-component]')) {
      if (!components.includes(el.dataset.component)) add('component', el, `The library has no component ${el.dataset.component}`, el.dataset.component);
    }
    for (const el of document.body.querySelectorAll('button, input, select, textarea, [role=button], [role=tab], [role=switch], [role=checkbox], [role=radio]')) {
      if (!shown(el) || el.closest('[data-component]')) continue;
      const kind = el.getAttribute('role') || el.tagName.toLowerCase();
      add('component', el, `A ${kind} of this page is not a component of the library`, kind);
    }
  }
  // A look-alike: the page's own style changes how a component of the library looks. The page may
  // place a component (its margin, size and grid place), never restyle it. A reset is no restyle:
  // a rule of the universal selector, and a declaration that only inherits or clears a value.
  if (restyle && components.length) {
    const LOOK = /^(?:color|background|border|outline|box-shadow|font|letter-spacing|line-height|text-(?:decoration|transform|shadow|align)|padding|opacity|filter|fill|stroke|border-radius|cursor)/;
    const RESET = /^(?:inherit|initial|unset|revert|revert-layer|0|0px|none|normal|auto|medium|currentcolor)$/i;
    const universal = (selectorText) => selectorText.split(',').every((part) => /^\s*\*?\s*(?:::?[a-z-]+)*\s*$/i.test(part) || /^\s*(?:html|body|:root)\s*$/i.test(part));
    const looks = (style) => {
      const props = [];
      for (let i = 0; i < style.length; i += 1) {
        if (!LOOK.test(style[i])) continue;
        const value = style.getPropertyValue(style[i]).trim();
        // An empty value is a shorthand with a var(): a var() is no reset.
        if (value && value.split(/\s+/).every((w) => RESET.test(w))) continue;
        props.push(style[i]);
      }
      return props;
    };
    const told = new Set();
    const restyled = (el, where, props) => {
      const host = el.closest('[data-component]');
      if (!host || told.has(`${host.dataset.component}|${where}`)) return;
      told.add(`${host.dataset.component}|${where}`);
      add('component', el, `The page restyles the component ${host.dataset.component} with ${where} (${props.slice(0, 3).join(', ')}); change it in components.css, or add a variant`, `restyle:${host.dataset.component}`);
    };
    for (const sheet of document.styleSheets) {
      // The sheets of the library are the library; every other sheet is the page's own style.
      if (sheet.href && /(?:tokens|components)\.css(?:[?#].*)?$/.test(sheet.href)) continue;
      for (const r of rulesOf(sheet)) {
        if (universal(r.selectorText)) continue;
        const props = looks(r.style);
        if (!props.length) continue;
        for (const el of styled(r.selectorText)) restyled(el, r.selectorText, props);
      }
    }
    for (const el of document.body.querySelectorAll('[data-component] [style], [data-component][style]')) {
      const props = looks(el.style);
      if (props.length) restyled(el, `the style of ${selector(el)}`, props);
    }
  }
  return { found: out, notices, brokenImages };
}

/* ───────────────────────── the interaction states ───────────────────────── */

// The interaction states that the check forces on each control, with the pseudo-classes of each.
const INTERACTIONS = [
  { name: 'hover', classes: ['hover'] },
  { name: 'press', classes: ['hover', 'active'] },
  { name: 'keyboard focus', classes: ['focus', 'focus-visible'] },
];
/** The controls that one load forces the states on. What is over the cap is counted in `truncated.interaction`. */
export const MAX_CONTROLS = 60;

// Runs in the page before the states are forced: it stops transitions, so a forced state shows its
// end style at once, and marks each enabled control with `data-wf-i`. It keeps the look of each
// control at rest, to compare with each state. `seen` holds the controls that an earlier state of
// the screen measured: they are left out. Returns `{ count, cut, marks }`.
function interactionPrep(max, seen) {
  const { shown, disabled, selector, TARGETS } = pageKit();
  const still = document.createElement('style');
  still.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }';
  document.head.append(still);
  const mark = (el) => `${selector(el)}|${String(el.textContent || el.value || '').trim().slice(0, 40)}`;
  const had = new Set(seen ?? []);
  const all = [...document.body.querySelectorAll(TARGETS)].filter((el) => shown(el) && !disabled(el)).map((el) => ({ el, mark: mark(el) })).filter((x) => !had.has(x.mark));
  const els = all.slice(0, max);
  const look = (el) => { const cs = getComputedStyle(el); return { color: cs.color, background: cs.backgroundColor, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, shadow: cs.boxShadow, border: cs.borderColor, decoration: cs.textDecorationLine }; };
  window.__wfRest = els.map(({ el }, i) => { el.setAttribute('data-wf-i', String(i)); return look(el); });
  return { count: els.length, cut: all.length - els.length, marks: els.map((x) => x.mark) };
}

// Runs in the page while one state is forced on control `i`. Returns the failures of that control.
function interactionMeasure(i, state) {
  const { rgba, over, shown, box, selector, hex, backgrounds, ratio, textContrast, ownText } = pageKit();
  const el = document.querySelector(`[data-wf-i="${i}"]`);
  const rest = window.__wfRest?.[i];
  if (!el || !rest || !shown(el)) return [];
  const out = [];
  const kind = el.getAttribute('role') || el.tagName.toLowerCase();
  const add = (check, message, cause) => out.push({ check, message, cause, rect: box(el), selector: selector(el), interaction: state });
  const cs = getComputedStyle(el);
  const now = { color: cs.color, background: cs.backgroundColor, outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, shadow: cs.boxShadow, border: cs.borderColor, decoration: cs.textDecorationLine };
  if (state === 'keyboard focus' && el.tabIndex >= 0) {
    const ring = cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0;
    const changed = ring || ['shadow', 'border', 'background', 'decoration'].some((k) => now[k] !== rest[k]);
    if (!changed) add('focus', `The ${kind} shows no focus indicator: its outline, shadow, border and background stay the same on keyboard focus`, `no-ring:${kind}`);
    else if (ring && cs.outlineStyle !== 'auto') {
      // The ring sits outside the control when its offset is not negative, so the page behind it is
      // its background. The browser draws its own ring (`auto`) in two tones, for any background.
      const behind = backgrounds(parseFloat(cs.outlineOffset) >= 0 ? el.parentElement ?? el : el);
      const ringColor = rgba(cs.outlineColor);
      if (behind && ringColor[3] > 0) {
        const worst = behind.map((bg) => ({ bg, fg: over(ringColor, bg) })).map((x) => ({ ...x, r: ratio(x.fg, x.bg) })).sort((a, b) => a.r - b.r)[0];
        if (worst.r + 1e-9 < 3) add('focus', `The focus ring ${hex(worst.fg)} on ${hex(worst.bg)} is ${worst.r.toFixed(2)}:1; 3:1 is the minimum`, `ring:${hex(worst.fg)}/${hex(worst.bg)}`);
      }
    }
  }
  // A link with no color of its own gets the browser's colors: blue at rest, red while pressed.
  // The press color of the browser is no choice of the page.
  const browserPress = state === 'press' && el.tagName === 'A' && rest.color === 'rgb(0, 0, 238)' && now.color === 'rgb(255, 0, 0)';
  // The text contrast in this state, only when the state changes a color: the rest state is checked already.
  if (!browserPress && (now.color !== rest.color || now.background !== rest.background)) {
    const texts = [el, ...el.querySelectorAll('*')].filter((n) => shown(n) && ownText(n));
    for (const n of texts.slice(0, 3)) {
      const t = textContrast(n);
      if (!t.image && t.ratio + 1e-9 < t.need) {
        add('contrast', `On ${state}, the text ${hex(t.fg)} on ${hex(t.bg)} is ${t.ratio.toFixed(2)}:1; ${t.need}:1 is the minimum for ${t.large ? 'large' : 'body'} text`, `${state}:${hex(t.fg)}/${hex(t.bg)}`);
        break;
      }
    }
  }
  return out;
}

/**
 * Force each interaction state on each control of the open page, through the DevTools protocol,
 * and measure it. The controls of `seen` are left out. The page has its own state afterwards, so
 * the caller opens it again before another check. Returns `{ found, cut, marks }`.
 */
async function interactionChecks(page, kit, seen = []) {
  const prep = await page.evaluate(`${kit(interactionPrep)}(${MAX_CONTROLS}, ${JSON.stringify(seen)})`);
  if (!prep?.count) return { found: [], cut: prep?.cut ?? 0, marks: [] };
  await page.send('DOM.enable');
  await page.send('CSS.enable');
  const { root } = await page.send('DOM.getDocument', { depth: 0 });
  const out = [];
  for (let i = 0; i < prep.count; i += 1) {
    const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector: `[data-wf-i="${i}"]` });
    if (!nodeId) continue;
    for (const st of INTERACTIONS) {
      try { await page.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: st.classes }); } catch { continue; }
      out.push(...(await page.evaluate(`${kit(interactionMeasure)}(${i}, ${JSON.stringify(st.name)})`) ?? []));
    }
    await page.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] }).catch(() => {});
  }
  return { found: out, cut: prep.cut, marks: prep.marks };
}

/* ───────────────────────── the browser ───────────────────────── */

/** The browsers that can run the checks, in the order a run tries them: a Chromium or a headless shell, not a script. */
export function checkBrowsers(root, env = process.env) {
  return browserCandidates(root, env).filter((b) => b.kind === 'chromium' || b.kind === 'shell');
}

/** The first browser that can run the checks, or null. */
export function checkBrowser(root, env = process.env) {
  return checkBrowsers(root, env)[0] ?? null;
}

// The browsers that this process started and did not close. An exit or a signal ends each one
// and removes its profile folder, so a stopped run leaves nothing behind.
const live = new Set();
// The profile folders of the browsers that ended. A browser that ends can still hold its folder
// for a moment, or write a file into it after the remove, so each folder is looked at again when
// this process ends.
const leftover = new Set();
const endAll = () => {
  for (const b of live) {
    killTree(b.child.pid);
    leftover.add(b.profile);
  }
  live.clear();
  for (const dir of leftover) removeProfile(dir);
  leftover.clear();
};
const SIGNALS = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
const onSignal = Object.fromEntries(Object.entries(SIGNALS).map(([sig, code]) => [sig, () => { endAll(); process.exit(code); }]));
function hold(started) {
  if (!live.size && !leftover.size) {
    process.on('exit', endAll);
    for (const sig of Object.keys(SIGNALS)) process.on(sig, onSignal[sig]);
  }
  live.add(started);
}
function release(started) {
  live.delete(started);
  if (live.size || leftover.size) return;
  process.removeListener('exit', endAll);
  for (const sig of Object.keys(SIGNALS)) process.removeListener(sig, onSignal[sig]);
}

/** End one started browser and remove its profile folder. */
function endBrowser(started) {
  // The whole tree ends at once, while its first process still lives: no process of the browser
  // is left to write into the profile.
  killTree(started.child.pid);
  removeProfile(started.profile, { tries: 4 });
  leftover.add(started.profile);
  release(started);
}

async function startBrowser(browser, { noSandbox }) {
  const profile = mkdtempSync(join(tmpdir(), 'sdlc-check-'));
  const args = [
    ...(browser.kind === 'chromium' ? ['--headless=new'] : []),
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--no-default-browser-check', '--mute-audio', '--force-device-scale-factor=1', '--allow-file-access-from-files',
    // Under some sandboxes (Codex on Windows) Chromium crashes at start without this flag. It
    // turns off the renderer sandbox, so only the local screen pages are ever opened.
    ...(noSandbox ? ['--no-sandbox'] : []),
    'about:blank',
  ];
  let child;
  try { child = spawn(browser.path, args, { stdio: 'ignore', windowsHide: true, detached: platform() !== 'win32' }); } catch { removeProfile(profile); return null; }
  const started = { child, profile, noSandbox };
  hold(started);
  let exited = false;
  child.on('exit', () => { exited = true; });
  child.on('error', () => { exited = true; });
  const portFile = join(profile, 'DevToolsActivePort');
  const until = Date.now() + START_MS;
  while (Date.now() < until && !exited) {
    if (existsSync(portFile)) {
      const [port, path] = readFileSync(portFile, 'utf8').split(/\r?\n/);
      if (port && path) return { ...started, url: `ws://127.0.0.1:${port}${path}`, release: () => endBrowser(started) };
    }
    await new Promise((ok) => setTimeout(ok, 100));
  }
  endBrowser(started);
  return null;
}

/** The DevTools connection to one browser. Exported for the tests. */
export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.calls = new Map();
    this.waits = [];
    this.listeners = [];
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(typeof e.data === 'string' ? e.data : Buffer.from(e.data).toString('utf8'));
      if (m.id && this.calls.has(m.id)) {
        const { ok, no } = this.calls.get(m.id);
        this.calls.delete(m.id);
        if (m.error) no(new Error(m.error.message)); else ok(m.result);
        return;
      }
      for (const l of this.listeners) l(m);
      this.waits = this.waits.filter((w) => !(w.method === m.method && w.session === m.sessionId && (w.ok(m.params), true)));
    });
    // A browser that dies ends every call that waits on it: the checks and the audit never hang.
    const fail = () => {
      this.closed = true;
      for (const { no } of this.calls.values()) no(new Error('the browser closed'));
      this.calls.clear();
    };
    ws.addEventListener('close', fail);
    ws.addEventListener('error', fail);
  }
  send(method, params = {}, sessionId = undefined, ms = STEP_MS * 2) {
    const id = ++this.id;
    return new Promise((ok, no) => {
      const t = setTimeout(() => { this.calls.delete(id); no(new Error(`no answer to ${method} in ${ms} ms`)); }, ms);
      this.calls.set(id, { ok: (v) => { clearTimeout(t); ok(v); }, no: (e) => { clearTimeout(t); no(e); } });
      try { this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); } catch (e) { clearTimeout(t); this.calls.delete(id); no(e); }
    });
  }
  /** The next event `method` of a session: resolves with its params, or with null when none comes in `ms`. It never rejects. */
  once(method, session, ms = STEP_MS) {
    return new Promise((ok) => {
      const w = { method, session, ok: (p) => { clearTimeout(t); ok(p ?? {}); } };
      const t = setTimeout(() => { this.waits = this.waits.filter((x) => x !== w); ok(null); }, ms);
      this.waits.push(w);
    });
  }
}

/** Connect to the DevTools socket of a started browser, or null when it does not answer in time. */
function connect(url, ms = CONNECT_MS) {
  return new Promise((done) => {
    let ws;
    try { ws = new WebSocket(url); } catch { done(null); return; }
    const t = setTimeout(() => { try { ws.close(); } catch { /* closed */ } done(null); }, ms);
    ws.addEventListener('open', () => { clearTimeout(t); done(ws); }, { once: true });
    ws.addEventListener('error', () => { clearTimeout(t); done(null); }, { once: true });
  });
}

let swept = false;

/**
 * Open a browser for the checks. Returns `{ open(url, viewport), evaluate, screenshot, errors,
 * pages, close }`, or null when no browser starts. `open` and the others drive the first page;
 * `pages` holds it and up to `pages - 1` more, each with the same functions, for loads side by
 * side. With no `browser`, each browser of this computer is tried in turn; `browser: null` opens none.
 */
export async function openBrowser(root, { browser = undefined, pages = 1 } = {}) {
  const candidates = browser === undefined ? checkBrowsers(root) : browser ? [browser] : [];
  // The profile folders that a killed run left: once for each process.
  if (!swept) { swept = true; sweepProfiles(); }
  for (const candidate of candidates) {
    if (!existsSync(candidate.path)) continue;
    for (const noSandbox of [false, true]) {
      const started = await startBrowser(candidate, { noSandbox });
      if (!started) continue;
      const ws = await connect(started.url);
      if (!ws) { started.release(); continue; }
      try { return await drive(candidate, started, ws, pages); } catch { /* the next way to start it */ }
    }
  }
  return null;
}

/** The pages of one connected browser. A browser that cannot make its first page is closed, and the error goes on. */
async function drive(browser, started, ws, pages) {
  const cdp = new Cdp(ws);
  const close = async () => {
    try { ws.close(); } catch { /* closed */ }
    started.release();
  };
  const page = async ({ newWindow }) => {
    // A page in its own window is in front, so the browser does not slow its timers as it does for a background tab.
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank', ...(newWindow ? { newWindow: true } : {}) })
      .catch(() => cdp.send('Target.createTarget', { url: 'about:blank' }));
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId).catch(() => {});
    const evaluate = async (expression) => {
      // The checks of a page run in one evaluate: it gets more time than one step.
      const r = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId, STEP_MS * 4);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text); /* defect */
      return r.result.value;
    };
    // Since the last open: the errors of the page's own scripts (uncaught exceptions and
    // console.error), the files that did not load, the dialogs that the page opened, and the
    // requests that still wait.
    let errors = [];
    let failed = [];
    let dialogs = [];
    const waiting = new Map();
    cdp.listeners.push((m) => {
      if (m.sessionId !== sessionId) return;
      const p = m.params ?? {};
      if (m.method === 'Runtime.exceptionThrown') {
        const d = p.exceptionDetails;
        errors.push(String(d.exception?.description ?? d.text ?? 'an uncaught exception').split('\n')[0].slice(0, 300));
      } else if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') {
        errors.push(p.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300) || 'console.error');
      } else if (m.method === 'Network.requestWillBeSent') {
        waiting.set(p.requestId, { url: p.request?.url ?? '', type: p.type ?? '' });
      } else if (m.method === 'Network.loadingFinished') {
        waiting.delete(p.requestId);
      } else if (m.method === 'Network.responseReceived') {
        if ((p.response?.status ?? 0) >= 400 && p.type !== 'Document') failed.push({ url: p.response.url, why: `HTTP ${p.response.status}` });
      } else if (m.method === 'Network.loadingFailed') {
        const req = waiting.get(p.requestId);
        waiting.delete(p.requestId);
        if (req && !p.canceled && req.type !== 'Document') failed.push({ url: req.url, why: String(p.errorText ?? 'it did not load').replace(/^net::ERR_/, '').toLowerCase().replace(/_/g, ' ') });
      } else if (m.method === 'Page.javascriptDialogOpening') {
        // A dialog stops the page until someone answers it.
        dialogs.push(String(p.message ?? '').slice(0, 200) || p.type || 'a dialog');
        cdp.send('Page.handleJavaScriptDialog', { accept: true }, sessionId).catch(() => {});
      }
    });
    return {
      errors: () => errors.slice(),
      failedLoads: () => failed.slice(),
      dialogs: () => dialogs.slice(),
      /** Open a page. Returns `{ ok }`, with `waiting` (the requests it still waits for) when the page does not finish loading in time. */
      async open(url, { width, height }, ms = STEP_MS) {
        errors = []; failed = []; dialogs = []; waiting.clear();
        await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 768 }, sessionId);
        const loaded = cdp.once('Page.loadEventFired', sessionId, ms);
        await cdp.send('Page.navigate', { url }, sessionId);
        if (!(await loaded)) {
          const still = [...waiting.values()].map((r) => r.url).filter((u) => u && u !== url);
          await cdp.send('Page.stopLoading', {}, sessionId).catch(() => {});
          return { ok: false, waiting: still.slice(0, 3) }; /* internal */
        }
        await evaluate('document.fonts ? Promise.race([document.fonts.ready, new Promise((ok) => setTimeout(ok, 3000))]).then(() => true) : true');
        return { ok: true };
      },
      evaluate,
      send: (method, params = {}) => cdp.send(method, params, sessionId),
      async screenshot() {
        const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
        return Buffer.from(data, 'base64');
      },
    };
  };
  const all = [];
  try {
    all.push(await page({ newWindow: false }));
    // A page that the browser cannot make leaves a smaller pool, never a failed run.
    for (let i = 1; i < pages; i += 1) {
      try { all.push(await page({ newWindow: true })); } catch { break; }
    }
  } catch (e) { await close(); throw e; }
  return { browser, ...all[0], pages: all, close, closed: () => cdp.closed === true };
}

/* ───────────────────────── the run ───────────────────────── */

/** The viewports of the surface: `[{ name, width, height }]`. */
export function surfaceViewports(root) {
  return Object.entries(readManifest(root).viewports).map(([name, v]) => ({ name, ...parseViewport(v) })).filter((v) => v.width && v.height);
}

/** Run `job(page, item)` for each item over the pages of the pool. The results keep the order of the items. */
export async function overPool(pages, items, job) {
  const out = new Array(items.length);
  let next = 0;
  let failed = false;
  const worker = async (page) => {
    while (!failed && next < items.length) {
      const i = next++;
      try { out[i] = await job(page, items[i]); } catch (e) { failed = true; throw e; }
    }
  };
  await Promise.all(pages.map(worker));
  return out;
}

/**
 * The failures of one screen under the caps. One fault that repeats is one cause: each load
 * (a viewport and a state) keeps MAX_PLACES places of a cause, and a screen keeps MAX_CAUSES
 * causes of one check. The caps count by check, so a check with many failures never takes the
 * room of another. Returns `{ kept, truncated }`; `truncated` counts what was cut, by check.
 */
export function capFailures(failures) {
  const kept = [];
  const truncated = {};
  const causes = new Map();
  const places = new Map();
  for (const f of failures) {
    const cause = f.cause ?? f.message;
    if (!causes.has(f.check)) causes.set(f.check, new Set());
    const known = causes.get(f.check);
    const load = `${f.check}|${cause}|${f.viewport}|${f.state}`;
    const n = places.get(load) ?? 0;
    if ((!known.has(cause) && known.size >= MAX_CAUSES) || n >= MAX_PLACES) { truncated[f.check] = (truncated[f.check] ?? 0) + 1; continue; }
    known.add(cause);
    places.set(load, n + 1);
    kept.push(f);
  }
  return { kept, truncated };
}

/** A URL of a file of the surface as a path inside `.ai/design/`; any other URL as it is. */
const shortUrl = (root, url) => {
  const base = pathToFileURL(surfaceDir(root)).href.replace(/\/?$/, '/');
  return String(url).startsWith(base) ? decodeURIComponent(String(url).slice(base.length)) : String(url).slice(0, 120);
};

/**
 * Check the screens. `keys` limits the run; `workflow` checks the screens of one workflow.
 * The stored result keeps the failures of the screens that this run did not check and that the
 * manifest still lists. Returns the stored result with `ok` (no failure in this run), `checked`,
 * `new` (the failures of this run) and `kept` (the number of failures of other screens).
 */
export async function runChecks(root, { keys = null, workflow = null, now = new Date(), browser = undefined, loadMs = STEP_MS } = {}) {
  // A page that the migration made from an old board has no states: it is checked as it is, in one
  // state, and the missing states are no failure of it.
  const all = listScreens(root, { withHtml: true });
  let screens = all.filter((s) => !workflow || (s.workflows ?? []).includes(workflow)).map(({ html, ...x }) => {
    const legacy = x.legacy === true || /<meta\s+name=["']wf:(?:legacy|migrated-from)["']/i.test(html ?? '');
    return legacy ? { ...x, legacy: true, states: x.states.length ? x.states : ['default'] } : x;
  });
  const names = (list) => (list.length ? `The screens: ${list.map((s) => s.key).slice(0, 30).join(', ')}.` : 'The surface has no screen: add one with design screen add.');
  if (keys?.length) {
    const unknown = keys.filter((k) => !screens.some((s) => s.key === k));
    if (unknown.length) throw refuse(`no screen ${unknown.join(', ')}${workflow ? ` in the workflow ${workflow}` : ''}`, agentFix(`Run the check again with the key of a screen. ${names(screens.length ? screens : all)}`));
    screens = screens.filter((s) => keys.includes(s.key));
  }
  if (!screens.length) {
    throw refuse(workflow ? `no screen of the workflow ${workflow} is on the surface` : 'no screen to check',
      agentFix(workflow ? `Add each screen of the workflow with design screen add <root> <key> --workflow ${workflow}, or run the check with no --workflow. ${names(all)}` : names(all)));
  }
  const failures = [];
  const fail = (f) => failures.push({ viewport: null, state: null, rect: null, selector: null, ...f, ...routed(f) });
  for (const s of screens) {
    const missing = STATES.filter((st) => !s.states.includes(st));
    if (!s.exists) fail({ screen: s.key, check: 'states', message: 'The screen page is missing' });
    else if (missing.length && !s.legacy) fail({ screen: s.key, check: 'states', message: `The page has no ${missing.join(', ')} state` });
  }
  for (const d of versionDrift(root, screens.map((s) => s.key))) {
    fail({ screen: d.screen, check: 'version', message: `The page differs from ${d.version} of ${d.workflow}, and no round holds the change`, do: `Save the change as a round: run design round <root> ${d.workflow}. To drop the change, run design restore <root> ${d.workflow} ${d.version}.` });
  }
  const b = await openBrowser(root, { browser, pages: PAGES });
  if (!b) {
    const reason = noBrowserReason(root, process.env, browser === undefined ? checkBrowsers(root) : []);
    return { ok: false, at: now.toISOString(), ran: false, reason, fix: personFix('Install Chrome, Edge or Chromium on this computer, or set SDLC_BROWSER to the path of one. Then run the check again.'), passed: false, screens: screens.map((s) => s.key), failures, checked: [], new: failures, kept: 0, truncated: {}, notices: [] };
  }
  // The color tokens of the token sheet. The token check runs once for each screen, in the
  // default state of the first viewport: it reads every rule of the page's sheets, also a rule
  // whose elements show only in another state or viewport.
  let tokens = [];
  try { tokens = tokensOf(readFileSync(join(surfaceDir(root), TOKENS_FILE), 'utf8')); } catch { tokens = []; }
  let componentsCss = '';
  try { componentsCss = readFileSync(join(surfaceDir(root), COMPONENTS_FILE), 'utf8'); } catch { componentsCss = ''; }
  const library = Object.keys(readManifest(root).components);
  const truncated = {};
  const notices = [];
  const cut = (check, n) => { if (n > 0) truncated[check] = (truncated[check] ?? 0) + n; };
  try {
    // Each page script gets the box and the kit of shared helpers in its scope.
    // pageKit is defined inside the wrapper, so that it closes over pageBox.
    const kit = (fn) => `((pageBox) => { const pageKit = ${pageKit.toString()}; return (${fn.toString()}); })(${pageBox.toString()})`;
    const script = kit(pageChecks);
    const vps = surfaceViewports(root);
    // One job is one screen in one viewport: its states load one after the other on one page, so
    // a later state knows the controls that the default state measured.
    const jobs = screens.filter((x) => x.exists).flatMap((s) => vps.map((vp, n) => ({ s, vp, first: n === 0 })));
    const results = await overPool(b.pages ?? [b], jobs, async (page, { s, vp, first }) => {
      const loads = [];
      let seen = [];
      for (const state of s.states) {
        const scan = first && state === 'default';
        const load = { state, found: [], notices: [], errors: [], resources: [], dialogs: [], cut: 0 };
        loads.push(load);
        try {
          const opened = await page.open(screenUrl(root, s.key, state), vp, loadMs);
          load.dialogs = page.dialogs?.() ?? [];
          if (opened && opened.ok === false) {
            load.found.push({ check: 'load', cause: 'load', message: `The page did not finish loading in ${loadMs / 1000} s${opened.waiting?.length ? `: it waits for ${opened.waiting.map((u) => shortUrl(root, u)).join(', ')}` : ''}`, rect: null, selector: null });
            break;
          }
          const r = await page.evaluate(`${script}(${MIN_TARGET}, ${JSON.stringify({ worst: state === 'worst', scanTokens: scan, tokens: scan ? tokens : [], componentsCss: scan ? componentsCss : '', components: first ? library : [], restyle: scan })})`) ?? {};
          load.found.push(...(r.found ?? []));
          load.notices = r.notices ?? [];
          const broken = new Set(r.brokenImages ?? []);
          load.resources = (page.failedLoads?.() ?? []).filter((x) => !broken.has(x.url));
          // The interaction states, in each viewport: every control of the default state, and in
          // another state the controls that the default state does not show.
          if (page.send) {
            const i = await interactionChecks(page, kit, seen);
            load.found.push(...i.found);
            load.cut = i.cut;
            seen = [...seen, ...i.marks];
          }
          load.errors = page.errors?.() ?? [];
        } catch (e) {
          if (b.closed?.() || /the browser closed/.test(String(e?.message))) throw e;
          load.found.push({ check: 'load', cause: 'load', message: `The page could not be measured: ${String(e?.message ?? e).split('\n')[0].slice(0, 200)}`, rect: null, selector: null });
          break;
        }
      }
      return loads;
    });
    // By screen: the failures of its loads under the caps. A script error, a file that does not
    // load and a dialog are one failure of the screen, at the first viewport and state that shows it.
    const byScreen = new Map();
    const once = new Map();
    jobs.forEach(({ s, vp }, i) => {
      if (!byScreen.has(s.key)) { byScreen.set(s.key, []); once.set(s.key, new Set()); }
      const list = byScreen.get(s.key);
      const seen = once.get(s.key);
      const one = (check, message) => {
        if (seen.has(`${check}|${message}`)) return null;
        seen.add(`${check}|${message}`);
        return { check, message, cause: message, rect: null, selector: null };
      };
      for (const load of results[i]) {
        const extra = [
          ...load.errors.map((m) => one('script', `The page script fails: ${m}`)),
          ...load.dialogs.map((m) => one('script', `The page opens a dialog at load: "${m}". The check closed it`)),
          ...load.resources.map((r) => one('resource', `The file ${shortUrl(root, r.url)} does not load (${r.why})`)),
        ].filter(Boolean);
        for (const f of [...load.found, ...extra]) list.push({ screen: s.key, viewport: vp.name, state: load.state, ...f, ...routed(f) });
        cut('interaction', load.cut);
        for (const n of load.notices) {
          const had = notices.find((x) => x.kind === n.kind && x.screen === s.key);
          if (had) had.count = Math.max(had.count, n.count); else notices.push({ kind: n.kind, screen: s.key, count: n.count, message: n.message });
        }
      }
    });
    for (const list of byScreen.values()) {
      const capped = capFailures(list);
      failures.push(...capped.kept);
      for (const [check, n] of Object.entries(capped.truncated)) cut(check, n);
    }
  } catch (e) {
    await b.close();
    return { ok: false, at: now.toISOString(), ran: false, reason: `the browser stopped during the checks (${String(e?.message ?? e).split('\n')[0]})`, fix: agentFix('Run the check again. When it stops again, run design doctor to see which browser the check uses.'), passed: false, screens: screens.map((s) => s.key), failures, checked: [], new: failures, kept: 0, truncated: {}, notices: [] };
  }
  await b.close();
  const checked = new Set(screens.map((s) => s.key));
  // The failures of a screen that left the manifest go with it.
  const listed = new Set(all.map((s) => s.key));
  const before = readChecks(root);
  const kept = (before?.failures ?? []).filter((f) => !checked.has(f.screen) && listed.has(f.screen));
  const result = {
    at: now.toISOString(), ran: true, browser: b.browser.path,
    screens: [...new Set([...(before?.screens ?? []).filter((k) => listed.has(k)), ...checked])].sort(),
    passed: failures.length + kept.length === 0,
    failures: [...kept, ...failures],
    truncated, notices,
  };
  writeChecks(root, result);
  return { ok: failures.length === 0, ...result, checked: [...checked], new: failures, kept: kept.length };
}

/** One picture per screen, in the default state at one viewport. Returns `{ key: Buffer }`, or null with no browser. */
export async function captureScreens(root, keys, { viewport = null, browser = undefined } = {}) {
  const vps = surfaceViewports(root);
  const vp = vps.find((v) => v.name === viewport) ?? vps.find((v) => v.name === 'desktop') ?? vps[0];
  const b = await openBrowser(root, { browser });
  // A browser that the caller named and that did not start is a failure; a computer with no browser is not.
  if (!b && browser) throw refuse(`the browser ${browser.path} did not start`, personFix('The browser of this computer did not start. Install Chrome or Edge, or set SDLC_BROWSER to the path of a Chromium browser.'));
  if (!b) return null;
  const out = {};
  try {
    for (const key of keys) {
      await b.open(screenUrl(root, key, 'default'), vp);
      out[key] = await b.screenshot();
    }
  } finally { await b.close(); }
  return out;
}

/** The failures grouped by cause, each with its move, or the `do` sentence when it has no move. */
export function failureGroups(failures) {
  return groupFailures(failures).map((g) => {
    const one = (failures ?? []).find((f) => f.check === g.check && (f.cause ?? f.message) === g.cause);
    return { ...g, move: g.move ?? null, do: g.move ? null : one?.do ?? CHECK_DO[g.check] ?? null };
  });
}

/** The failures as lines for a person: one per cause (`groupFailures`), with its places and its move or what to do. */
export function failureLines(failures) {
  return failureGroups(failures).map((g) => `${g.screens.join(', ')}${g.viewports.length ? ` (${g.viewports.join(', ')}; ${g.states.join(', ')})` : ''}: ${g.check}: ${g.message}${g.places > 1 ? ` (${g.places} places)` : ''}${g.move ? ` — move: ${g.move}` : g.do ? ` — do: ${g.do}` : ''}`);
}

/** The lines of what the caps cut and of what the run could not measure. */
export function partialLines({ truncated = {}, notices = [] } = {}) {
  const cutLines = Object.entries(truncated).map(([check, n]) => (check === 'interaction'
    ? `not shown: ${n} control(s) over the cap of ${MAX_CONTROLS} for a load had no hover, press and focus check`
    : `not shown: ${n} more ${check} failure(s) of causes that the list already names, or over ${MAX_CAUSES} causes for a screen`));
  const byKind = new Map();
  for (const n of notices) byKind.set(n.kind, [...(byKind.get(n.kind) ?? []), n]);
  const noteLines = [...byKind.values()].map((list) => `${list[0].message.replace(/\(\d+ element\(s\)\)/, `(${list.reduce((a, n) => a + n.count, 0)} element(s))`)} — ${list.map((n) => n.screen).filter(Boolean).join(', ')}`);
  return [...cutLines, ...noteLines];
}
