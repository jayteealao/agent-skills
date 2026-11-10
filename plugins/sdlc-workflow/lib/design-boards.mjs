// lib/design-boards.mjs — the design boards of a workflow.
//
// Every workflow keeps its drawings in one folder, `.ai/workflows/<slug>/design/`:
//   boards.json                                   the manifest (schema sdlc/design-boards/v1)
//   boards/<surface>--<state>[--<viewport>].html|png
//   source/  sketches/  captures/<slice>/<key>.png
//   r<N>/                                         revision N, frozen at confirmation
// `02c-craft.md` names the frozen manifest in `boards:` (`design/r<N>/boards.json`).
// These helpers hold the key and path rules and the `check` result. They read the
// file system only in `readManifest` and `missingBoardFiles`, so the pre-write hook,
// the board script, the migration and the campaign script share one rule. The design stage
// now draws screens (lib/design-surface.mjs); `wf.mjs design migrate` turns boards into screens.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { agentFix, refuse } from './fix.mjs';

/** `1280x800` → `{ width: 1280, height: 800 }`, or null. The same rule as the viewports of the screens. */
export function parseViewport(text) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(String(text ?? '').trim());
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

export const BOARDS_SCHEMA = 'sdlc/design-boards/v1';
export const DESIGN_DIR = 'design';
export const MANIFEST = 'boards.json';
export const METHODS = Object.freeze(['html', 'capture', 'import', 'canvas-export']);
/** The ux-impact values whose design needs pictures. */
const NEEDS_PICTURES = new Set(['visual', 'new-surface']);

const PART = '[a-z0-9]+(?:-[a-z0-9]+)*';
const KEY_RE = new RegExp(`^(${PART})--(${PART})(?:--(${PART}))?$`);

export const posix = (p) => String(p).split('\\').join('/');

/** The parts of a board key, or null when the text is not a board key. */
export function parseBoardKey(key) {
  const m = KEY_RE.exec(String(key ?? ''));
  return m ? { surface: m[1], state: m[2], viewport: m[3] ?? null } : null;
}

export const isBoardKey = (key) => parseBoardKey(key) !== null;

/** Does this ux-impact need pictures before the design is settled? */
export function needsPictures(index) {
  return NEEDS_PICTURES.has(String(index?.['ux-impact'] ?? '').trim());
}

/** True when `rel` stays inside its folder: no absolute path, no `..` step. */
export function isInsidePath(rel) {
  const p = posix(rel);
  // A scheme (javascript:, data:, a drive letter) is never a path inside the folder.
  if (!p || isAbsolute(p) || /^[a-z][a-z0-9+.-]*:/i.test(p)) return false;
  return !p.split('/').includes('..');
}

/**
 * The problems of a manifest object, as sentences. An empty list means it is valid.
 * Paths in a board entry are relative to the folder of the manifest.
 */
export function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== 'object' || Array.isArray(m)) return ['the manifest is not a JSON object'];
  if (m.schema !== BOARDS_SCHEMA) errors.push(`schema must be '${BOARDS_SCHEMA}'`);
  if (typeof m.slug !== 'string' || !m.slug) errors.push('slug is missing');
  if (!Number.isInteger(m.revision) || m.revision < 0) errors.push('revision must be an integer, 0 or more');
  if (m.method !== undefined && !METHODS.includes(m.method)) errors.push(`method must be one of ${METHODS.join(', ')}`);
  const viewports = m.viewports ?? {};
  if (typeof viewports !== 'object' || Array.isArray(viewports)) errors.push('viewports must be an object');
  else for (const [name, size] of Object.entries(viewports)) {
    if (!parseViewport(size)) errors.push(`viewport '${name}' must be <width>x<height>, not '${size}'`);
  }
  if (!Array.isArray(m.boards)) errors.push('boards must be a list');
  else {
    const seen = new Set();
    m.boards.forEach((b, i) => {
      const at = `boards[${i}]`;
      if (!b || typeof b !== 'object') { errors.push(`${at} is not an object`); return; }
      for (const f of ['surface', 'state']) if (typeof b[f] !== 'string' || !b[f]) errors.push(`${at}.${f} is missing`);
      if (!isBoardKey(b.key)) errors.push(`${at}.key '${b.key}' is not <surface>--<state>[--<viewport>]`);
      else if (seen.has(b.key)) errors.push(`${at}.key '${b.key}' is listed twice`);
      seen.add(b.key);
      if (!b.html && !b.png) errors.push(`${at} (${b.key}) has neither html nor png`);
      for (const f of ['html', 'png', 'source']) {
        if (b[f] && !isInsidePath(b[f])) errors.push(`${at}.${f} '${b[f]}' leaves the design folder`);
      }
      if (b.viewport && viewports && typeof viewports === 'object' && !viewports[b.viewport]) {
        errors.push(`${at}.viewport '${b.viewport}' is not in viewports`);
      }
      if (b.canvas !== undefined && b.canvas !== null) errors.push(...canvasErrors(b.canvas, `${at}.canvas`));
    });
  }
  if (m.confirmed !== undefined && !Array.isArray(m.confirmed)) errors.push('confirmed must be a list');
  return errors;
}

/** Read and parse a manifest file. Returns `{ manifest, errors }`; a missing file gives `manifest: null`. */
export function readManifest(file) {
  if (!existsSync(file)) return { manifest: null, errors: [`${posix(file)} does not exist`] };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    return { manifest: null, errors: [`${posix(file)} is not valid JSON: ${e.message}`] };
  }
  return { manifest, errors: validateManifest(manifest) };
}

/** The files a board shows the person: the PNG, or the HTML when the board has no PNG. */
export function boardFiles(board) {
  if (board?.png) return [board.png];
  if (board?.html) return [board.html];
  return [];
}

/**
 * The `boards:` path of a contract, relative to the workflow folder, or null when
 * the contract has none (a contract written before the boards release).
 */
export function boardsRef(contract) {
  const ref = String(contract?.boards ?? '').trim();
  return ref ? posix(ref).replace(/^\.\//, '') : null;
}

/**
 * The `check` result: the files that `02c-craft.md` `boards:` promises but that are
 * not on disk, as paths relative to the workflow folder. An empty list means every
 * board exists. A contract without `boards:` returns an empty list (the old rule).
 * @param {string} workflowDir - absolute path of `.ai/workflows/<slug>/`
 * @param {object|null} contract - `02c-craft.md` frontmatter
 */
export function missingBoardFiles(workflowDir, contract) {
  const ref = boardsRef(contract);
  if (!ref) return [];
  if (!isInsidePath(ref)) return [`${ref} (the boards path leaves the workflow folder)`];
  const file = join(workflowDir, ...ref.split('/'));
  const { manifest, errors } = readManifest(file);
  if (!manifest) return [ref];
  if (errors.length) return [`${ref} (${errors[0]})`];
  if (!manifest.boards.length) return [`${ref} (the manifest lists no board)`];
  const base = posix(dirname(ref));
  const missing = [];
  for (const b of manifest.boards) {
    for (const f of boardFiles(b)) {
      if (!existsSync(join(dirname(file), ...posix(f).split('/')))) missing.push(`${base}/${posix(f)}`);
    }
  }
  return missing;
}

// ---------------------------------------------------------------- text and links

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** HTML-escape a text. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
/** An escaped href: an http(s) link or a path inside the folder, else `#`. */
export const safeHref = (s) => (/^https?:\/\//i.test(String(s ?? '')) || isInsidePath(s) ? esc(s) : '#');

const SHA256_RE = /^[0-9a-f]{64}$/i;

/**
 * The problems of a `canvas` record `{ link, account, published-at, sha256, previous[] }`.
 * `link` and `sha256` are required: the hash names the file that was published.
 */
export function canvasErrors(c, at = 'canvas') {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [`${at} is not an object`];
  const errors = [];
  if (typeof c.link !== 'string' || !c.link) errors.push(`${at}.link is missing`);
  if (!SHA256_RE.test(String(c.sha256 ?? ''))) errors.push(`${at}.sha256 must be 64 hex characters`);
  if (c.account !== undefined && c.account !== null && typeof c.account !== 'string') errors.push(`${at}.account must be a string`);
  if (c['published-at'] !== undefined && c['published-at'] !== null && typeof c['published-at'] !== 'string') errors.push(`${at}.published-at must be a string`);
  if (c.previous !== undefined && !Array.isArray(c.previous)) errors.push(`${at}.previous must be a list`);
  return errors;
}

// ---------------------------------------------------------------- design modes

/** The four design modes. A surface has one; `02c-craft.md` `surface-modes:` maps each surface to it. */
export const DESIGN_MODES = Object.freeze(['persuade', 'operate', 'read', 'experience']);
/** The deprecated `register` read as a design mode. */
export const REGISTER_DESIGN_MODE = Object.freeze({ brand: 'persuade', product: 'operate' });

/**
 * The design modes of a design artifact's frontmatter, in this order: `surface-modes`
 * (surface → design mode), then `design-mode` (one for the artifact), then the
 * deprecated `register` (brand → persuade, product → operate).
 * @returns {{ modes: Array<{surface:string|null, mode:string}>, from: string|null, register: string|null }}
 */
export function designModesOf(fm) {
  const register = typeof fm?.register === 'string' ? fm.register : null;
  const map = fm?.['surface-modes'];
  if (map && typeof map === 'object' && !Array.isArray(map)) {
    const modes = Object.entries(map).map(([surface, mode]) => ({ surface, mode: String(mode) }));
    if (modes.length) return { modes, from: 'surface-modes', register };
  }
  if (typeof fm?.['design-mode'] === 'string' && fm['design-mode']) return { modes: [{ surface: null, mode: fm['design-mode'] }], from: 'design-mode', register };
  if (register && REGISTER_DESIGN_MODE[register]) return { modes: [{ surface: null, mode: REGISTER_DESIGN_MODE[register] }], from: 'register', register };
  return { modes: [], from: null, register };
}

// ---------------------------------------------------------------- terminal capture

const palette = (...hex) => Object.freeze(hex);
/**
 * Two named colour schemes for terminal boards: one dark and one light. The values are
 * the Windows Terminal built-in schemes of the same name.
 */
export const ANSI_SCHEMES = Object.freeze({
  campbell: Object.freeze({
    name: 'Campbell', theme: 'dark', background: '#0c0c0c', foreground: '#cccccc',
    palette: palette('#0c0c0c', '#c50f1f', '#13a10e', '#c19c00', '#0037da', '#881798', '#3a96dd', '#cccccc',
      '#767676', '#e74856', '#16c60c', '#f9f1a5', '#3b78ff', '#b4009e', '#61d6d6', '#f2f2f2'),
  }),
  'solarized-light': Object.freeze({
    name: 'Solarized Light', theme: 'light', background: '#fdf6e3', foreground: '#657b83',
    palette: palette('#002b36', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5',
      '#073642', '#cb4b16', '#586e75', '#657b83', '#839496', '#6c71c4', '#93a1a1', '#fdf6e3'),
  }),
});

const hex2 = (n) => n.toString(16).padStart(2, '0');

/** An xterm 256-colour index as a palette index (0-15) or a `#rrggbb` colour. */
function xterm256(n) {
  if (!Number.isInteger(n) || n < 0 || n > 255) return null;
  if (n < 16) return n;
  if (n >= 232) { const g = 8 + 10 * (n - 232); return `#${hex2(g)}${hex2(g)}${hex2(g)}`; }
  const levels = [0, 95, 135, 175, 215, 255];
  const i = n - 16;
  return `#${hex2(levels[Math.floor(i / 36)])}${hex2(levels[Math.floor(i / 6) % 6])}${hex2(levels[i % 6])}`;
}

const PLAIN = Object.freeze({ fg: null, bg: null, bold: false, dim: false, italic: false, underline: false, inverse: false, strike: false });

/** Apply one SGR parameter list to a style. */
function applySgr(style, paramText) {
  const p = paramText === '' ? [0] : paramText.split(/[;:]/).map((x) => (x === '' ? 0 : Number(x)));
  let s = { ...style };
  for (let i = 0; i < p.length; i++) {
    const n = p[i];
    if (n === 0) s = { ...PLAIN };
    else if (n === 1) s.bold = true;
    else if (n === 2) s.dim = true;
    else if (n === 3) s.italic = true;
    else if (n === 4) s.underline = true;
    else if (n === 7) s.inverse = true;
    else if (n === 9) s.strike = true;
    else if (n === 21 || n === 22) { s.bold = false; s.dim = false; }
    else if (n === 23) s.italic = false;
    else if (n === 24) s.underline = false;
    else if (n === 27) s.inverse = false;
    else if (n === 29) s.strike = false;
    else if (n >= 30 && n <= 37) s.fg = n - 30;
    else if (n === 39) s.fg = null;
    else if (n >= 40 && n <= 47) s.bg = n - 40;
    else if (n === 49) s.bg = null;
    else if (n >= 90 && n <= 97) s.fg = n - 90 + 8;
    else if (n >= 100 && n <= 107) s.bg = n - 100 + 8;
    else if (n === 38 || n === 48) {
      const key = n === 38 ? 'fg' : 'bg';
      if (p[i + 1] === 5) { s[key] = xterm256(p[i + 2]); i += 2; }
      else if (p[i + 1] === 2) {
        const [r, g, b] = [p[i + 2], p[i + 3], p[i + 4]].map((v) => Math.max(0, Math.min(255, Number(v) || 0)));
        s[key] = `#${hex2(r)}${hex2(g)}${hex2(b)}`;
        i += 4;
      }
    }
  }
  return s;
}

/** The inline CSS of a style under a scheme, or '' for the plain style. */
function styleCss(s, scheme) {
  const colour = (c) => (c === null ? null : typeof c === 'number' ? scheme.palette[c] : c);
  let fg = colour(s.fg);
  let bg = colour(s.bg);
  if (s.inverse) [fg, bg] = [bg ?? scheme.background, fg ?? scheme.foreground];
  const css = [];
  if (fg) css.push(`color:${fg}`);
  if (bg) css.push(`background:${bg}`);
  if (s.bold) css.push('font-weight:bold');
  if (s.dim) css.push('opacity:.7');
  if (s.italic) css.push('font-style:italic');
  const lines = [s.underline && 'underline', s.strike && 'line-through'].filter(Boolean);
  if (lines.length) css.push(`text-decoration:${lines.join(' ')}`);
  return css.join(';');
}

// CSI sequences (SGR and the rest), OSC strings, and two-byte escapes.
const ESCAPE_RE = /\x1b\[([0-9;:?<=>]*)[ -/]*([@-~])|\x1b\][\s\S]*?(?:\x07|\x1b\\)|\x1b[@-Z\\-_]/g;

/**
 * Render terminal output with ANSI SGR colours as one HTML page in a named colour scheme
 * The 16 SGR colours (30-37, 90-97, 40-47, 100-107) take the
 * scheme's palette, so a board shows how yellow (33) and bright black (90) read on it.
 * 256-colour and true-colour codes keep their own value. Other escapes are dropped.
 * @param {string} text - the captured output
 * @param {string|object} scheme - `campbell`, `solarized-light`, or a scheme object
 * @param {{title?:string}} [opts]
 */
export function renderAnsi(text, scheme = 'campbell', { title = null } = {}) {
  const sc = typeof scheme === 'string' ? ANSI_SCHEMES[scheme] : scheme;
  if (!sc || !Array.isArray(sc.palette) || sc.palette.length < 16) {
    throw refuse(`unknown colour scheme '${scheme}'`, agentFix(`Run the command again with --scheme ${Object.keys(ANSI_SCHEMES).join(' or --scheme ')}.`));
  }
  const src = String(text ?? '').replace(/\r\n/g, '\n').replace(/[^\n]*\r(?!\n)/g, '');
  let style = { ...PLAIN };
  let out = '';
  let last = 0;
  const emit = (chunk) => {
    if (!chunk) return;
    const css = styleCss(style, sc);
    out += css ? `<span style="${css}">${esc(chunk)}</span>` : esc(chunk);
  };
  for (const m of src.matchAll(ESCAPE_RE)) {
    emit(src.slice(last, m.index));
    last = m.index + m[0].length;
    if (m[2] === 'm' && !/[?<=>]/.test(m[1] ?? '')) style = applySgr(style, m[1] ?? '');
  }
  emit(src.slice(last));
  const heading = title ?? `Terminal · ${sc.name ?? 'scheme'}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(heading)}</title>
<style>
html,body{margin:0;background:${sc.background};color:${sc.foreground}}
pre{margin:0;padding:12px 14px;font:14px/1.3 "Cascadia Mono","Cascadia Code",Consolas,"DejaVu Sans Mono",Menlo,monospace;white-space:pre;tab-size:8}
</style></head><body>
<pre data-scheme="${esc(sc.name ?? '')}" data-theme="${esc(sc.theme ?? '')}">${out}</pre>
</body></html>
`;
}
