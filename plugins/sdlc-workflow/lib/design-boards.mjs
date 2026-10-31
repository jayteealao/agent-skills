// lib/design-boards.mjs — the design boards of a workflow.
//
// Every workflow keeps its drawings in one folder, `.ai/workflows/<slug>/design/`:
//   boards.json                                   the manifest (schema sdlc/design-boards/v1)
//   index.html                                    the contact sheet (generated)
//   boards/<surface>--<state>[--<viewport>].html|png
//   source/  sketches/  captures/<slice>/<key>.png
//   r<N>/                                         revision N, frozen at confirmation
// `02c-craft.md` names the frozen manifest in `boards:` (`design/r<N>/boards.json`).
// These helpers hold the key and path rules and the `check` result. They read the
// file system only in `readManifest` and `missingBoardFiles`, so the pre-write hook,
// the board script and the campaign script share one rule.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';

export const BOARDS_SCHEMA = 'sdlc/design-boards/v1';
export const DESIGN_DIR = 'design';
export const MANIFEST = 'boards.json';
export const SHEET = 'index.html';
export const METHODS = Object.freeze(['html', 'capture', 'import', 'canvas-export']);
/** The ux-impact values whose design needs pictures. */
const NEEDS_PICTURES = new Set(['visual', 'new-surface']);
/** `freeze` warns when one revision is larger than this (section 9, repo size). */
export const REVISION_WARN_BYTES = 5 * 1024 * 1024;

const PART = '[a-z0-9]+(?:-[a-z0-9]+)*';
const KEY_RE = new RegExp(`^(${PART})--(${PART})(?:--(${PART}))?$`);
const VIEWPORT_RE = /^(\d{2,5})x(\d{2,5})$/;

const posix = (p) => String(p).split('\\').join('/');

/** A name part of a board key: lower case, digits and single dashes. */
export function namePart(text) {
  return String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/** `<surface>--<state>`, plus `--<viewport>` when a surface has more than one viewport. */
export function boardKey({ surface, state, viewport = null }) {
  const parts = [namePart(surface), namePart(state)];
  if (viewport) parts.push(namePart(viewport));
  if (!parts[0] || !parts[1]) throw new Error('board key: a surface and a state are required');
  return parts.join('--');
}

/** The parts of a board key, or null when the text is not a board key. */
export function parseBoardKey(key) {
  const m = KEY_RE.exec(String(key ?? ''));
  return m ? { surface: m[1], state: m[2], viewport: m[3] ?? null } : null;
}

export const isBoardKey = (key) => parseBoardKey(key) !== null;

/** `1280x800` → `{ width: 1280, height: 800 }`, or null. */
export function parseViewport(text) {
  const m = VIEWPORT_RE.exec(String(text ?? '').trim());
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

export const revisionDir = (n) => `r${n}`;

/** The workflow-relative path of the frozen manifest of revision n. */
export const frozenManifestPath = (n) => `${DESIGN_DIR}/${revisionDir(n)}/${MANIFEST}`;

/** The verify capture of a board: `design/captures/<slice>/<key>.png`. */
export function capturePath(slice, key) {
  const s = namePart(slice);
  if (!s) throw new Error('capture path: a slice is required');
  if (!isBoardKey(key)) throw new Error(`capture path: '${key}' is not a board key (<surface>--<state>[--<viewport>])`);
  return `${DESIGN_DIR}/captures/${s}/${key}.png`;
}

/** Does this ux-impact need pictures before the design is settled? */
export function needsPictures(index) {
  return NEEDS_PICTURES.has(String(index?.['ux-impact'] ?? '').trim());
}

/** A manifest with no boards. */
export function emptyManifest(slug, { method = 'html', viewports = { desktop: '1280x800' } } = {}) {
  return { schema: BOARDS_SCHEMA, slug, revision: 0, method, viewports, boards: [], confirmed: [] };
}

/** True when `rel` stays inside its folder: no absolute path, no `..` step. */
export function isInsidePath(rel) {
  const p = posix(rel);
  if (!p || isAbsolute(p) || /^[a-zA-Z]:/.test(p)) return false;
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

/**
 * The frozen boards a contract page shows: each board of the
 * revision that `boards:` names, with the absolute path of its PNG. Boards without a
 * PNG on disk are left out. Null when the contract names no readable manifest.
 */
export function frozenBoardsOf(workflowDir, contract) {
  const ref = boardsRef(contract);
  if (!ref || !isInsidePath(ref)) return null;
  const file = join(workflowDir, ...ref.split('/'));
  const { manifest, errors } = readManifest(file);
  if (!manifest || errors.length) return null;
  const last = (manifest.confirmed ?? []).at(-1) ?? null;
  const boards = [];
  for (const b of manifest.boards) {
    if (!b.png || !isInsidePath(b.png)) continue;
    const abs = join(dirname(file), ...posix(b.png).split('/'));
    if (!existsSync(abs)) continue;
    boards.push({ key: b.key, surface: b.surface, state: b.state, viewport: b.viewport ?? null, caption: b.caption ?? b.key, abs, file: `${b.key}.png` });
  }
  return {
    ref, revision: manifest.revision, boards,
    canvas: last?.canvas ?? contract?.canvas ?? null, canvasVersion: last?.['canvas-version'] ?? null,
    confirmedBy: last?.by ?? contract?.['direction-confirmed-by'] ?? null, confirmedAt: last?.at ?? null,
  };
}

// ---------------------------------------------------------------- contact sheet

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** HTML-escape a text. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ENTITIES[c]);
/** An escaped href: an http(s) link or a path inside the folder, else `#`. */
export const safeHref = (s) => (/^https?:\/\//i.test(String(s ?? '')) || isInsidePath(s) ? esc(s) : '#');

/**
 * The contact sheet `design/index.html`: every board with its caption, grouped by
 * surface, the canvas link, and the confirmed revision. It needs no server: image
 * paths are relative to the folder of the manifest, so the frozen copy in r<N>/
 * works the same.
 */
/**
 * The direction sketches of the design stage: the files
 * `sketches/direction-<name>.html|png`, one entry per name, sorted. They are not boards,
 * so the manifest does not list them; the working contact sheet shows them.
 * @param {string[]} fileNames - the file names in `design/sketches/`
 */
export function directionSketches(fileNames) {
  const found = new Map();
  for (const file of fileNames ?? []) {
    const m = /^direction-([a-z0-9]+(?:-[a-z0-9]+)*)\.(html|png)$/i.exec(String(file));
    if (!m) continue;
    const name = m[1].toLowerCase();
    const rec = found.get(name) ?? { name, html: null, png: null };
    rec[m[2].toLowerCase()] = `sketches/${file}`;
    found.set(name, rec);
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** The style of the contact sheet. */
export const SHEET_CSS = `:root{color-scheme:light dark;--bg:#f6f6f4;--ink:#1c1d1f;--mute:#5f626a;--rule:#d9d9d4;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#141517;--ink:#e4e6ea;--mute:#a3a7ae;--rule:#2b2e33;--card:#1c1e21}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:20px 24px;border-bottom:1px solid var(--rule)}h1{margin:0 0 4px;font-size:20px}header p{margin:0;color:var(--mute)}
a{color:inherit}section{padding:8px 24px 24px}h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin:20px 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:16px}
figure{margin:0;background:var(--card);border:1px solid var(--rule);border-radius:8px;overflow:hidden}
figure img{display:block;width:100%;height:auto;border-bottom:1px solid var(--rule)}
.none{padding:40px 16px;color:var(--mute);text-align:center;border-bottom:1px solid var(--rule)}
figcaption{display:grid;gap:2px;padding:10px 12px}figcaption span{color:var(--mute);font-size:13px}figcaption code{font-size:12px;color:var(--mute)}
`;

export function renderSheet(m, { generatedAt = '', frozen = false, directions = [] } = {}) {
  const last = (m.confirmed ?? []).at(-1) ?? null;
  const groups = new Map();
  for (const b of m.boards ?? []) {
    if (!groups.has(b.surface)) groups.set(b.surface, []);
    groups.get(b.surface).push(b);
  }
  const board = (b) => {
    const pic = b.png
      ? `<a href="${safeHref(b.png)}"><img src="${safeHref(b.png)}" alt="${esc(b.caption ?? b.key)}" loading="lazy"></a>`
      : `<div class="none">No PNG${b.render ? `: ${esc(b.render)}` : ''}.${b.html ? ` Open <a href="${safeHref(b.html)}">${esc(b.html)}</a>.` : ''}</div>`;
    const meta = [b.state, b.viewport, b.sketch ? `from sketch ${b.sketch}` : null].filter(Boolean).map(esc).join(' · ');
    return `<figure id="${esc(b.key)}">${pic}<figcaption><b>${esc(b.caption ?? b.key)}</b><span>${meta}</span><code>${esc(b.key)}</code></figcaption></figure>`;
  };
  const direction = (d) => {
    const pic = d.png
      ? `<a href="${safeHref(d.png)}"><img src="${safeHref(d.png)}" alt="${esc(`direction ${d.name}`)}" loading="lazy"></a>`
      : `<div class="none">No PNG.${d.html ? ` Open <a href="${safeHref(d.html)}">${esc(d.html)}</a>.` : ''}</div>`;
    return `<figure id="direction-${esc(d.name)}">${pic}<figcaption><b>${esc(d.name)}</b><span>direction</span></figcaption></figure>`;
  };
  const directionSection = !frozen && directions.length
    ? `<section><h2>Directions</h2><div class="grid">${directions.map(direction).join('')}</div></section>\n`
    : '';
  const sections = directionSection + [...groups.entries()]
    .map(([s, list]) => `<section><h2>${esc(s)}</h2><div class="grid">${list.map(board).join('')}</div></section>`)
    .join('\n');
  const status = last
    ? `Revision ${esc(last.revision)} confirmed ${esc(last.at)} (${esc(last.by)})${frozen ? ' · frozen copy' : ''}`
    : 'Working boards · not confirmed yet';
  const canvas = last?.canvas ? ` · <a href="${safeHref(last.canvas)}">canvas</a>${last['canvas-version'] ? ` v${esc(last['canvas-version'])}` : ''}` : '';
  const viewports = Object.entries(m.viewports ?? {}).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(', ');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design boards · ${esc(m.slug)}</title>
<style>
${SHEET_CSS}</style></head><body>
<header><h1>Design boards · ${esc(m.slug)}</h1><p>${status}${canvas}</p><p>${esc((m.boards ?? []).length)} boards · method ${esc(m.method ?? 'html')} · viewports ${viewports || 'none'}${generatedAt ? ` · written ${esc(generatedAt)}` : ''}</p></header>
${sections || '<section><p>No boards yet.</p></section>'}
</body></html>
`;
}

// ---------------------------------------------------------------- tracking

const BLOCK_HEAD = '# sdlc-workflow design record: tracked although .ai/ is ignored';
const SKETCH_HEAD = '# sdlc-workflow design sketches: tracked, the file is the source';
// The sketches are tracked too: the tracked file is the only source.
// design/boards/ (the working boards) stays ignored; only r<N>/ and sketches/ are tracked.
const STAR_SKETCH = ['!.ai/workflows/*/design/sketches/'];
const GLOB_SKETCH = ['!.ai/workflows/*/design/sketches/', '!.ai/workflows/*/design/sketches/**'];
const STAR_BLOCK = [BLOCK_HEAD, '!.ai/design/', '!.ai/workflows/', '.ai/workflows/*', '!.ai/workflows/*/', '.ai/workflows/*/*',
  '!.ai/workflows/*/design/', '.ai/workflows/*/design/*', '!.ai/workflows/*/design/r*/', ...STAR_SKETCH];
const GLOB_BLOCK = [BLOCK_HEAD, '!.ai/design/', '!.ai/design/**', '!.ai/workflows/', '!.ai/workflows/*/', '!.ai/workflows/*/design/',
  '!.ai/workflows/*/design/r*/', '!.ai/workflows/*/design/r*/**', ...GLOB_SKETCH];

/** The probe paths of `track`: the design record, a frozen revision, and a sketch. */
export const TRACK_PROBES = Object.freeze({
  record: '.ai/design/current.md',
  frozen: '.ai/workflows/x/design/r1/boards.json',
  sketch: '.ai/workflows/x/design/sketches/x.html',
});

/**
 * How to keep `.ai/design/`, every `design/r<N>/` and every `design/sketches/` tracked
 * in a repo that ignores `.ai/`, from the pattern that ignores `.ai/design/current.md`.
 * A probe proved both blocks with git: the `.ai/*` style and the `.ai/` + `**` + `/*` style.
 * A bare `.ai/` must become `.ai/*`, because git does not look inside an ignored folder.
 * @param {string|null} pattern - the ignoring pattern, or null when nothing ignores it
 * @param {boolean} ignored - whether a design path is ignored at all
 */
export function ignoreAdvice(pattern, ignored = pattern !== null) {
  if (!ignored) return { change: false, style: 'tracked', block: '' };
  const p = String(pattern ?? '').trim().replace(/^\//, '');
  if (p === '.ai/*') return { change: true, style: 'star', block: `${STAR_BLOCK.join('\n')}\n` };
  if (p === '.ai/**/*' || p === '.ai/**') return { change: true, style: 'globstar', block: `${GLOB_BLOCK.join('\n')}\n` };
  if (p === '.ai/' || p === '.ai') return { change: true, style: 'folder', replace: '.ai/*', block: `${STAR_BLOCK.join('\n')}\n` };
  return { change: false, style: 'other', pattern: p, manual: `the pattern '${p}' ignores the design record; add exceptions for .ai/design/, .ai/workflows/*/design/r*/ and .ai/workflows/*/design/sketches/ by hand` };
}

/**
 * The upgrade of a repo that has the old design-record block, from before sketches were tracked: the design
 * record and the frozen revisions are tracked, but a sketch is still ignored. The advice
 * adds only the sketch lines, after the old block.
 * @param {string|null} pattern - the pattern that ignores the sketch probe, or null
 */
export function sketchAdvice(pattern) {
  if (pattern === null || pattern === undefined) return { change: false, style: 'tracked', block: '' };
  const p = String(pattern).trim().replace(/^\//, '');
  if (p === '.ai/workflows/*/design/*') return { change: true, style: 'star', upgrade: true, block: `${[SKETCH_HEAD, ...STAR_SKETCH].join('\n')}\n` };
  if (p === '.ai/**/*' || p === '.ai/**') return { change: true, style: 'globstar', upgrade: true, block: `${[SKETCH_HEAD, ...GLOB_SKETCH].join('\n')}\n` };
  return { change: false, style: 'other', pattern: p, manual: `the pattern '${p}' ignores the design sketches; add an exception for .ai/workflows/*/design/sketches/ by hand` };
}

// ---------------------------------------------------------------- canvas records

const SHA256_RE = /^[0-9a-f]{64}$/i;

/** A sketch or board path without its `#<artboard>` anchor, and the anchor. */
export function splitAnchor(path) {
  const text = String(path ?? '');
  const at = text.indexOf('#');
  return at < 0 ? { file: text, anchor: null } : { file: text.slice(0, at), anchor: text.slice(at + 1) || null };
}

/**
 * The problems of a `canvas` record `{ link, account, published-at, sha256, previous[] }`.
 * `link` and `sha256` are required: the hash is how `canvas-stale` sees a changed file.
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

/**
 * The `canvas-stale` result: each recorded canvas whose file changed since it was
 * published, whose file is missing, or whose account is not the given account.
 * @param {Array<{kind:string,key:string,where:string,path:string|null,canvas:object|null,sha256?:string|null}>} entries -
 *   `sha256` is the hash of the file now: null when the file is missing, undefined when the entry has no file
 * @param {{account?:string|null}} opts
 * @returns {Array<object>} the stale entries, each with `reasons` (`changed`, `missing-file`, `no-hash`, `account`)
 */
export function canvasStale(entries, { account = null } = {}) {
  const stale = [];
  for (const e of entries ?? []) {
    const c = e?.canvas;
    if (!c || typeof c !== 'object') continue;
    const reasons = [];
    if (e.sha256 === null) reasons.push('missing-file');
    else if (e.sha256 !== undefined) {
      if (!SHA256_RE.test(String(c.sha256 ?? ''))) reasons.push('no-hash');
      else if (String(c.sha256).toLowerCase() !== e.sha256) reasons.push('changed');
    }
    if (account && c.account !== account) reasons.push('account');
    if (!reasons.length) continue;
    stale.push({
      kind: e.kind, key: e.key, where: e.where, path: e.path ?? null, link: c.link ?? null,
      account: c.account ?? null, recorded: c.sha256 ?? null, sha256: e.sha256 ?? null, reasons,
    });
  }
  return stale;
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
    throw new Error(`unknown colour scheme '${scheme}': use ${Object.keys(ANSI_SCHEMES).join(' or ')}`);
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
