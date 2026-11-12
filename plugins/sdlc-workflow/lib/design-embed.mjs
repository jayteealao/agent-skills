// Which pages of a surface the canvas draws in a frame, and why.
//
// The canvas draws a screen or a component page straight onto itself when it can, and in a frame
// when it cannot (skills/wf/canvas/canvas-mount.js). The rules are in that script, in
// `WF_CANVAS_MOUNT_LOGIC`: this module loads them from the file, so the canvas and the CLI decide
// with the same code. It reads the pages and the sheets of the surface and names each page that
// stays in a frame, with the reasons. A page in a frame still works. `design doctor` prints the
// list as a note, and `design check` reports each framed screen as a `frame` failure, which
// does not block an approval.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import vm from 'node:vm';
import { CANVAS_DIR } from './design-state.mjs';
import { COMPONENTS_DIR, readManifest, screenFile, surfaceDir } from './design-surface.mjs';

let logic = null;
let logicText = null;
/**
 * The rules of the canvas mount, read from the script of the canvas. The rules are made again
 * only when the text of the script changed, so a caller that keeps a result of the rules can
 * compare the rules it got: other rules are another object.
 */
export function mountLogic() {
  const text = readFileSync(join(CANVAS_DIR, 'canvas-mount.js'), 'utf8');
  if (!logic || text !== logicText) {
    const context = vm.createContext({ URL });
    vm.runInContext(text, context, { filename: 'canvas-mount.js' });
    logic = context.WF_CANVAS_MOUNT_LOGIC;
    logicText = text;
  }
  return logic;
}

const attr = (tag, name) => { const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag); return m ? m[1] ?? m[2] ?? m[3] ?? '' : null; };
const mediaReason = (query) => `a media query has no container form: ${query}`;
// The canvas wraps a sheet in the media of its tag, unless the media is all or screen.
const wrapped = (css, media) => (media && !/^(?:all|screen)?$/i.test(media.trim()) ? `@media ${media}{${css}}` : css);

/**
 * What one page says by itself: `reasons`, the reasons of its own text and of the media queries
 * of its inline styles, and `sheets`, the sheets that it links, each `{ href, media }`. It reads
 * the text of the page and nothing else, so a caller can keep it while the page does not change.
 * With `first`, it stops at the reasons of the page text when there is one: a caller that asks
 * only whether the page stays in a frame needs no more.
 */
export function pageFacts(html, L = mountLogic(), { first = false } = {}) {
  const text = String(html ?? '');
  const reasons = new Set(L.mountProblems(text));
  if (first && reasons.size) return { reasons: [...reasons], sheets: [] };
  const body = text.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of body.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi)) {
    for (const p of L.rewriteSheet(wrapped(m[2], attr(m[1], 'media'))).problems) reasons.add(mediaReason(p));
  }
  const sheets = [];
  for (const m of body.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').matchAll(/<link\b[^>]*>/gi)) {
    const href = attr(m[0], 'href');
    if (!href || !/(?:^|\s)stylesheet(?:\s|$)/i.test(attr(m[0], 'rel') ?? '')) continue;
    sheets.push({ href, media: attr(m[0], 'media') });
  }
  return { reasons: [...reasons], sheets };
}

/** The reasons of one linked sheet under the media of its tag: its media queries that the canvas cannot translate. */
export function sheetReasons(css, media = null, L = mountLogic()) {
  return Array.from(L.rewriteSheet(wrapped(css, media)).problems, mediaReason);
}

/** The file of a sheet that a page links, or null when the sheet is no file inside the surface `dir`. */
export function sheetFileOf(dir, page, href) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return null;
  const file = resolve(dirname(page), href.split(/[?#]/)[0]);
  const rel = relative(dir, file);
  if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`)) return null;
  return file;
}

/**
 * Why the canvas draws one page in a frame, as a list of plain reasons: empty when it draws the
 * page with no frame. The reasons are those of the page itself, then the media queries of its
 * inline styles and of its sheets that the canvas cannot translate. `sheet(href)` gives the text
 * of a linked sheet, or null for a sheet that is not a file of the surface. `sheetWhy(href, media)`
 * gives the reasons of a linked sheet in its place, for a caller that keeps them.
 */
export function pageReasons(html, { sheet = () => null, sheetWhy = null, logic: L = mountLogic() } = {}) {
  const facts = pageFacts(html, L);
  const out = new Set(facts.reasons);
  for (const { href, media } of facts.sheets) {
    if (sheetWhy) { for (const r of sheetWhy(href, media) ?? []) out.add(r); continue; }
    const css = sheet(href);
    if (css == null) continue;
    for (const r of sheetReasons(css, media, L)) out.add(r);
  }
  return [...out];
}

/**
 * The pages of a surface that the canvas draws in a frame: `[{ kind, key, reasons }]`, where
 * `kind` is `screen` or `component`. `keys` limits the screens, and then no component is read.
 * A page with no file is left out: the check names it.
 */
export function framedPages(root, { keys = null } = {}) {
  const dir = surfaceDir(root);
  const m = readManifest(root);
  const L = mountLogic();
  // A linked sheet is read once and its media queries are translated once for each media: every
  // page links the same few sheets.
  const texts = new Map();
  const whys = new Map();
  const whyFrom = (page) => (href, media) => {
    const file = sheetFileOf(dir, page, href);
    if (!file) return null;
    const id = `${file}
${media ?? ''}`;
    if (!whys.has(id)) {
      if (!texts.has(file)) texts.set(file, existsSync(file) ? readFileSync(file, 'utf8') : null);
      whys.set(id, texts.get(file) == null ? null : sheetReasons(texts.get(file), media, L));
    }
    return whys.get(id);
  };
  const out = [];
  const read = (kind, key, file) => {
    if (!existsSync(file)) return;
    const reasons = pageReasons(readFileSync(file, 'utf8'), { sheetWhy: whyFrom(file), logic: L });
    if (reasons.length) out.push({ kind, key, reasons });
  };
  for (const key of Object.keys(m.screens).sort()) if (!keys || keys.includes(key)) read('screen', key, screenFile(root, key));
  if (!keys) for (const key of Object.keys(m.components ?? {}).sort()) read('component', key, join(dir, COMPONENTS_DIR, `${key}.html`));
  return out;
}

/** Where the agent reads the forms and the cases. */
const FRAME_RULES = 'design/_surface.md ("Pages that the canvas draws with no frame")';
const FRAME_FIXES = [
  [/^it has a script of its own/, `Move each click that the script wires to an inline handler of the forms of ${FRAME_RULES}, write what the script draws into the page, and delete the script.`],
  [/^it loads a script file/, 'Draw the page from the components with no script file.'],
  [/^it has an inline event handler/, `Write the handler in the forms of ${FRAME_RULES}: each statement changes a class, a data value or a state attribute of this, its parent or its closest ancestor.`],
  [/^it has a javascript: address/, 'Make the link a link to <key>.html, or make the control a button with an inline handler.'],
  [/^it has a base element/, 'Remove the base element, and write each address relative to the page.'],
  [/^a media query/, 'Write the query on the width or the height alone, with no `not` and no comma list that mixes the viewport with another feature.'],
];
/** What to change so that the canvas draws a page with no frame, for one reason of `pageReasons`. */
export function frameFix(reason) {
  const fix = FRAME_FIXES.find(([re]) => re.test(String(reason)))?.[1] ?? `Keep to the rules of ${FRAME_RULES}.`;
  return `${fix} design/system-migrate.md ("Pages off the frame") has each case. A page that needs its code stays in a frame: this failure does not block the approval.`;
}

/**
 * The `frame` failures of the screens `keys`: one for each reason that keeps a screen in a frame,
 * with what to change. The check of the screens reports them; they block no approval.
 */
export function frameFailures(root, keys) {
  if (!keys?.length) return [];
  return framedPages(root, { keys }).flatMap((p) => p.reasons.map((reason) => ({ screen: p.key, check: 'frame', message: `The canvas draws the page in a frame: ${reason}`, do: frameFix(reason) })));
}

const MAX_NAMED = 8;
/**
 * The note of the framed pages, as lines for the output of a command: empty when every page is
 * drawn with no frame. The first line counts and names the pages with their reasons; the second
 * says what to do.
 */
export function framedLines(pages) {
  if (!pages?.length) return [];
  const count = (kind, word) => { const n = pages.filter((p) => p.kind === kind).length; return n ? `${n} ${word}${n === 1 ? '' : 's'}` : null; };
  const named = pages.slice(0, MAX_NAMED).map((p) => `${p.key} (${p.reasons.join('; ')})`).join(', ');
  const more = pages.length - MAX_NAMED;
  return [
    `note: ${[count('screen', 'screen'), count('component', 'component page')].filter(Boolean).join(' and ')} ${pages.length === 1 ? 'is' : 'are'} drawn in a frame on the canvas: ${named}${more > 0 ? `, and ${more} more` : ''}`,
    '  a page in a frame still works, and a frame blocks no approval; a frame for each page makes a large board slow. To draw the page with no frame, keep to the rules of _surface.md ("Pages that the canvas draws with no frame"): the state script only, each change of a class, a data value or a state attribute as an inline handler, no `not` or mixed media query. design/system-migrate.md ("Pages off the frame") has each case.',
  ];
}
