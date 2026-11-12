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
/** The rules of the canvas mount, read from the script of the canvas once. */
export function mountLogic() {
  if (!logic) {
    const context = vm.createContext({ URL });
    vm.runInContext(readFileSync(join(CANVAS_DIR, 'canvas-mount.js'), 'utf8'), context, { filename: 'canvas-mount.js' });
    logic = context.WF_CANVAS_MOUNT_LOGIC;
  }
  return logic;
}

const attr = (tag, name) => { const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(tag); return m ? m[1] ?? m[2] ?? m[3] ?? '' : null; };
const mediaReason = (query) => `a media query has no container form: ${query}`;
// The canvas wraps a sheet in the media of its tag, unless the media is all or screen.
const wrapped = (css, media) => (media && !/^(?:all|screen)?$/i.test(media.trim()) ? `@media ${media}{${css}}` : css);

/**
 * Why the canvas draws one page in a frame, as a list of plain reasons: empty when it draws the
 * page with no frame. The reasons are those of the page itself, then the media queries of its
 * inline styles and of its sheets that the canvas cannot translate. `sheet(href)` gives the text
 * of a linked sheet, or null for a sheet that is not a file of the surface.
 */
export function pageReasons(html, { sheet = () => null } = {}) {
  const L = mountLogic();
  const text = String(html ?? '');
  const out = new Set(L.mountProblems(text));
  const body = text.replace(/<!--[\s\S]*?-->/g, '');
  for (const m of body.matchAll(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi)) {
    for (const p of L.rewriteSheet(wrapped(m[2], attr(m[1], 'media'))).problems) out.add(mediaReason(p));
  }
  for (const m of body.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '').matchAll(/<link\b[^>]*>/gi)) {
    const href = attr(m[0], 'href');
    if (!href || !/(?:^|\s)stylesheet(?:\s|$)/i.test(attr(m[0], 'rel') ?? '')) continue;
    const css = sheet(href);
    if (css == null) continue;
    for (const p of L.rewriteSheet(wrapped(css, attr(m[0], 'media'))).problems) out.add(mediaReason(p));
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
  const sheets = new Map();
  // A linked sheet is read once, and only when it is a file inside the surface.
  const sheetFrom = (page) => (href) => {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return null;
    const file = resolve(dirname(page), href.split(/[?#]/)[0]);
    const rel = relative(dir, file);
    if (!rel || rel.startsWith('..') || rel.includes(`..${sep}`)) return null;
    if (!sheets.has(file)) sheets.set(file, existsSync(file) ? readFileSync(file, 'utf8') : null);
    return sheets.get(file);
  };
  const out = [];
  const read = (kind, key, file) => {
    if (!existsSync(file)) return;
    const reasons = pageReasons(readFileSync(file, 'utf8'), { sheet: sheetFrom(file) });
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
