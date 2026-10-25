// The design surface of a product repo: one folder, `.ai/design/`, tracked in the repo.
//
// Each screen is one interactive HTML page with mock data, in `screens/<key>.html`. It has the
// five named states (default, empty, loading, error, worst) and links to the screens that follow
// it in a flow. One token stylesheet, `tokens.css`, comes from the token roles of DESIGN.md.
// `screens.json` is the manifest: the screens with their product area, flow and order, the
// workflows and slices that changed them, and their approvals. Only scripts write the manifest.
// The canvas lays the screens out from it, and `layout.json` keeps the positions that the person
// dragged.
//
// The comments and the approval pictures do not live here: a product repo can be public. They
// live in the records (lib/design-records.mjs).
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { sdlcHomeDir } from './home.mjs';
import { missingBoardFiles } from './design-boards.mjs';

export const SURFACE_REL = '.ai/design';
export const SCREENS_DIR = 'screens';
export const EXPLORE_DIR = 'explore';
export const MANIFEST_FILE = 'screens.json';
export const LAYOUT_FILE = 'layout.json';
export const REFERENCES_FILE = 'references.json';
export const TOKENS_FILE = 'tokens.css';
export const SCREENS_SCHEMA = 'sdlc/design-screens/v1';
export const STATES = Object.freeze(['default', 'empty', 'loading', 'error', 'worst']);
export const DEFAULT_VIEWPORTS = Object.freeze({ phone: '375x812', tablet: '768x1024', desktop: '1280x800' });
export const KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
export const surfaceDir = (root) => join(root, ...SURFACE_REL.split('/'));
export const screenFile = (root, key) => join(surfaceDir(root), SCREENS_DIR, `${key}.html`);
export const screenRel = (key) => `${SURFACE_REL}/${SCREENS_DIR}/${key}.html`;

function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}
function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

/** `WxH` → { width, height }, or null. */
export function parseViewport(text) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(String(text ?? ''));
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

export const emptyManifest = () => ({ schema: SCREENS_SCHEMA, viewports: { ...DEFAULT_VIEWPORTS }, areas: [], screens: {}, explore: {} });

/** The manifest, or an empty one. */
export function readManifest(root) {
  const m = readJson(join(surfaceDir(root), MANIFEST_FILE), null);
  if (!m || typeof m !== 'object') return emptyManifest();
  return { ...emptyManifest(), ...m, screens: m.screens ?? {}, explore: m.explore ?? {} };
}
export function writeManifest(root, m) {
  mkdirSync(surfaceDir(root), { recursive: true });
  writeJson(join(surfaceDir(root), MANIFEST_FILE), m);
}

/** The problems of a manifest; an empty list is a good one. */
export function manifestProblems(m, root = null) {
  const out = [];
  if (m?.schema !== SCREENS_SCHEMA) out.push(`schema is not ${SCREENS_SCHEMA}`);
  for (const [name, v] of Object.entries(m?.viewports ?? {})) if (!parseViewport(v)) out.push(`viewport ${name}: ${v} is not WxH`);
  for (const [key, s] of Object.entries(m?.screens ?? {})) {
    if (!KEY_RE.test(key)) out.push(`screen key ${key} is not kebab-case`);
    if (root && !existsSync(screenFile(root, key))) out.push(`screen ${key} has no file ${screenRel(key)}`);
    if (s.area && !(m.areas ?? []).includes(s.area)) out.push(`screen ${key}: area ${s.area} is not in areas`);
  }
  return out;
}

// ---------------------------------------------------------------- tokens

/**
 * The token stylesheet from DESIGN.md: each row of a `| Role | Token | Value |` table under
 * `## Colors` gives `--<role>: <value>`, and the token name, when it is one, an alias.
 */
export function tokensFromDesign(text) {
  const lines = String(text ?? '').split(/\r?\n/);
  const at = lines.findIndex((l) => /^##\s+Colou?rs\b/i.test(l));
  if (at < 0) return [];
  const out = [];
  for (const l of lines.slice(at + 1)) {
    if (/^##\s/.test(l)) break;
    const cells = l.split('|').map((c) => c.trim());
    if (cells.length < 4 || /^-+$/.test(cells[1]) || /^role$/i.test(cells[1])) continue;
    const [, role, token, value] = cells;
    if (!role || !value || !/^[a-z][a-z0-9-]*$/i.test(role)) continue;
    out.push({ role: role.toLowerCase(), token: /^--[a-z0-9-]+$/i.test(token) ? token : null, value });
  }
  return out;
}

/** Write tokens.css from DESIGN.md. Returns the token rows. */
export function writeTokens(root) {
  const design = join(root, 'DESIGN.md');
  const rows = existsSync(design) ? tokensFromDesign(readFileSync(design, 'utf8')) : [];
  const body = rows.flatMap((r) => [`  --${r.role}: ${r.value};`, ...(r.token && r.token !== `--${r.role}` ? [`  ${r.token}: var(--${r.role});`] : [])]);
  mkdirSync(surfaceDir(root), { recursive: true });
  writeFileSync(join(surfaceDir(root), TOKENS_FILE), `/* From DESIGN.md, ## Colors. wf.mjs design tokens writes this file; do not edit it. */\n:root {\n${body.join('\n')}\n}\n`);
  return rows;
}

// ---------------------------------------------------------------- screens

/** The page of a new screen: the five states, the token sheet, and the state switch. */
export function screenTemplate(key, title) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="wf:screen" content="${key}">
<title>${title}</title>
<link rel="stylesheet" href="../${TOKENS_FILE}">
<style>
  body { margin: 0; font: 16px/1.5 system-ui, sans-serif; background: var(--ground, #fff); color: var(--text, #111); }
  body [data-state] { display: none; }
  html[data-state="default"] [data-state~="default"], html[data-state="empty"] [data-state~="empty"],
  html[data-state="loading"] [data-state~="loading"], html[data-state="error"] [data-state~="error"],
  html[data-state="worst"] [data-state~="worst"] { display: block; }
</style>
<script>
  // The canvas and the checks open a state with ?state=<name>.
  document.documentElement.dataset.state = new URLSearchParams(location.search).get('state') || 'default';
</script>
</head>
<body>
<main>
  <section data-state="default"><h1>${title}</h1></section>
  <section data-state="empty"><h1>${title}</h1><p>Nothing here yet.</p></section>
  <section data-state="loading"><h1>${title}</h1><p>Loading…</p></section>
  <section data-state="error"><h1>${title}</h1><p>Something went wrong.</p></section>
  <section data-state="worst"><h1>${title}</h1></section>
</main>
</body>
</html>
`;
}

/** The screens that `02c-craft.md` `screens:` approves but that have no page on the surface. */
export function missingScreens(root, contract) {
  const keys = Array.isArray(contract?.screens) ? contract.screens : [];
  return keys.filter((k) => !KEY_RE.test(String(k)) || !existsSync(screenFile(root, String(k)))).map((k) => `${SURFACE_REL}/${SCREENS_DIR}/${k}.html`);
}

/**
 * The design files that a contract names but that are not on disk: the screens of `screens:`,
 * or the board files of `boards:` for a contract from before the surface.
 */
export function missingDesignFiles(root, workflowDir, contract) {
  if (!contract) return null;
  return Array.isArray(contract.screens) && contract.screens.length ? missingScreens(root, contract) : missingBoardFiles(workflowDir, contract);
}

/** The states that a screen page declares with `data-state`. */
export function statesOf(html) {
  const found = new Set();
  for (const m of String(html).matchAll(/data-state=["']([^"']+)["']/g)) for (const s of m[1].split(/\s+/)) if (STATES.includes(s)) found.add(s);
  return STATES.filter((s) => found.has(s));
}

/** The keys of the screens that a screen page links to: the edges of its flows. */
export function linksOf(html) {
  const out = new Set();
  for (const m of String(html).matchAll(/href=["'](?:\.\/)?([a-z0-9]+(?:-[a-z0-9]+)*)\.html(?:[?#][^"']*)?["']/g)) out.add(m[1]);
  return [...out];
}

/**
 * Add a screen, or change its fields. A new screen gets its page from the template. A workflow
 * and a slice are added to the lists of the screen, never replaced.
 */
export function addScreen(root, key, { title = null, area = null, flow = null, order = null, workflow = null, slice = null, now = new Date() } = {}) {
  if (!KEY_RE.test(String(key ?? ''))) throw new Error(`the screen key ${key} must be kebab-case`);
  const m = readManifest(root);
  const was = m.screens[key];
  const s = { title: title ?? was?.title ?? key, area: area ?? was?.area ?? null, flow: flow ?? was?.flow ?? null, order: order == null ? was?.order ?? null : Number(order),
    workflows: [...new Set([...(was?.workflows ?? []), ...(workflow ? [workflow] : [])])],
    slices: [...new Set([...(was?.slices ?? []), ...(slice ? [slice] : [])])],
    'created-at': was?.['created-at'] ?? nowIso(now), 'updated-at': nowIso(now), approvals: was?.approvals ?? [] };
  if (s.area && !m.areas.includes(s.area)) m.areas.push(s.area);
  m.screens[key] = s;
  const file = screenFile(root, key);
  mkdirSync(join(surfaceDir(root), SCREENS_DIR), { recursive: true });
  const created = !existsSync(file);
  if (created) writeFileSync(file, screenTemplate(key, s.title));
  writeManifest(root, m);
  return { key, created, screen: s, file };
}

/** The screens, with their states and links read from the pages; `workflow` filters to one workflow. */
export function listScreens(root, { workflow = null } = {}) {
  const m = readManifest(root);
  return Object.entries(m.screens)
    .filter(([, s]) => !workflow || (s.workflows ?? []).includes(workflow))
    .map(([key, s]) => {
      const file = screenFile(root, key);
      const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
      return { key, ...s, exists: Boolean(html), states: statesOf(html), links: linksOf(html) };
    })
    .sort((a, b) => String(a.area ?? '').localeCompare(String(b.area ?? '')) || String(a.flow ?? '').localeCompare(String(b.flow ?? '')) || (a.order ?? 999) - (b.order ?? 999) || a.key.localeCompare(b.key));
}

/** The explore sketches: every file of `explore/`, with the manifest entry when it has one. */
export function listExplore(root) {
  const dir = join(surfaceDir(root), EXPLORE_DIR);
  const m = readManifest(root);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => /\.html?$/.test(f)).sort().map((f) => {
    const key = f.replace(/\.html?$/, '');
    return { key, file: `${SURFACE_REL}/${EXPLORE_DIR}/${f}`, ...(m.explore[key] ?? {}) };
  });
}

/** Record an explore sketch: its title and the brainstorm or intake that it belongs to. */
export function addExplore(root, key, { title = null, link = null, now = new Date() } = {}) {
  if (!KEY_RE.test(String(key ?? ''))) throw new Error(`the explore key ${key} must be kebab-case`);
  const m = readManifest(root);
  m.explore[key] = { ...(m.explore[key] ?? {}), title: title ?? m.explore[key]?.title ?? key, link: link ?? m.explore[key]?.link ?? null, 'updated-at': nowIso(now) };
  mkdirSync(join(surfaceDir(root), EXPLORE_DIR), { recursive: true });
  writeManifest(root, m);
  return { key, ...m.explore[key] };
}

// ---------------------------------------------------------------- git rule

const git = (root, args) => spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', windowsHide: true });
const PROBE = `${SURFACE_REL}/${MANIFEST_FILE}`;

/**
 * Keep `.ai/design/` tracked in the product repo. A repo that ignores `.ai/` gets `.ai/*` in
 * place of `.ai/` (git does not look inside an ignored folder) and the line `!.ai/design/`.
 * Returns `{ tracked, changed, manual }`.
 */
export function trackSurface(root, { write = true } = {}) {
  if (git(root, ['rev-parse', '--git-dir']).status !== 0) return { tracked: false, changed: false, manual: 'not a git repo' };
  const ignored = () => git(root, ['check-ignore', '-q', '--no-index', PROBE]).status === 0;
  if (!ignored()) return { tracked: true, changed: false };
  const file = join(root, '.gitignore');
  const text = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const lines = text.split(/\r?\n/);
  const folder = lines.findIndex((l) => /^\/?\.ai\/?\s*$/.test(l));
  if (!write) return { tracked: false, changed: false, would: [...(folder >= 0 ? ['.ai/ → .ai/*'] : []), '!.ai/design/'] };
  if (folder >= 0) lines[folder] = lines[folder].startsWith('/') ? '/.ai/*' : '.ai/*';
  let out = lines.join('\n');
  if (!/^!\/?\.ai\/design\/?\s*$/m.test(out)) out = `${out}${out && !out.endsWith('\n') ? '\n' : ''}!.ai/design/\n`;
  writeFileSync(file, out);
  const tracked = !ignored();
  return { tracked, changed: true, ...(tracked ? {} : { manual: 'another pattern (a global ignore or a parent folder) still ignores .ai/design/; add an exception by hand' }) };
}

// ---------------------------------------------------------------- the repos of this computer

export const designReposPath = () => join(sdlcHomeDir(), 'design-repos.json');

/** The repos that the design server shows: `[{ name, root }]`. */
export function readDesignRepos() {
  const j = readJson(designReposPath(), {});
  return Array.isArray(j.repos) ? j.repos.filter((r) => r && typeof r.name === 'string' && typeof r.root === 'string') : [];
}

/** Add a repo to the list of the design server. The name is the folder name, made unique. */
export function registerRepo(root) {
  const abs = resolve(root);
  const repos = readDesignRepos();
  const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  const hit = repos.find((r) => same(resolve(r.root), abs));
  if (hit) return { ...hit, added: false };
  const base = basename(abs).toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'repo';
  let name = base;
  for (let n = 2; repos.some((r) => r.name === name); n += 1) name = `${base}-${n}`;
  repos.push({ name, root: abs });
  mkdirSync(sdlcHomeDir(), { recursive: true });
  writeJson(designReposPath(), { repos });
  return { name, root: abs, added: true };
}

/** Make the surface: the folders, the manifest, the token sheet, the git rule and the repo entry. */
export function initSurface(root) {
  const dir = surfaceDir(root);
  const created = !existsSync(join(dir, MANIFEST_FILE));
  mkdirSync(join(dir, SCREENS_DIR), { recursive: true });
  mkdirSync(join(dir, EXPLORE_DIR), { recursive: true });
  if (created) writeManifest(root, emptyManifest());
  if (!existsSync(join(dir, REFERENCES_FILE))) writeJson(join(dir, REFERENCES_FILE), { references: [] });
  const tokens = writeTokens(root);
  const track = trackSurface(root);
  const repo = registerRepo(root);
  return { created, tokens: tokens.length, track, repo };
}
