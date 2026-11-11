// The design surface of a product repo: one folder, `.ai/design/`, tracked in the repo.
//
// Each screen is one interactive HTML page with mock data, in `screens/<key>.html`. It has the
// five named states (default, empty, loading, error, worst) and links to the screens that follow
// it in a flow. One token stylesheet, `tokens.css`, comes from the token roles of DESIGN.md. The
// component library (lib/design-components.mjs) is `components/<key>.html` and `components.css`.
// `screens.json` is the manifest: the screens with their product area, flow and order, the
// workflows and slices that changed them, and their approvals. Only scripts write the manifest.
// The canvas lays the screens out from it, and `layout.json` keeps the positions that the person
// dragged.
//
// The comments and the approval pictures do not live here: a product repo can be public. They
// live in the records (lib/design-records.mjs).
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { writeFileAtomic } from './atomic-write.mjs';
import { withLock } from './file-lock.mjs';
import { agentFix, refuse } from './fix.mjs';
import { sdlcHomeDir } from './home.mjs';
import { boardsRef, missingBoardFiles } from './design-boards.mjs';
import { approvalProblems } from './design-versions.mjs';
import { INDEX_NAME, frontmatterOfDoc } from './records.mjs';
import { dtcgFiles } from './design-dtcg.mjs';
import { GENERATED_MARK, TOKENS_SCHEMA, layoutCss, modelFromCss, parseTokenTables, platformFileOf, platformTokens, tokensCss, tokensJson } from './design-tokens.mjs';

export const SURFACE_REL = '.ai/design';
export const SCREENS_DIR = 'screens';
export const EXPLORE_DIR = 'explore';
export const MANIFEST_FILE = 'screens.json';
export const LAYOUT_FILE = 'layout.json';
export const REFERENCES_FILE = 'references.json';
export const TOKENS_FILE = 'tokens.css';
/** The machine-readable token model that `design tokens` writes beside the sheet. */
export const TOKENS_JSON = 'tokens.json';
/** The layout primitives that `design tokens` writes from the space scale. */
export const LAYOUT_SHEET = 'layout.css';
/** The W3C design token files that `design tokens` writes, one per theme. */
export const DTCG_DIR = 'dtcg';
export const COMPONENTS_DIR = 'components';
export const COMPONENTS_FILE = 'components.css';
export const SCREENS_SCHEMA = 'sdlc/design-screens/v1';
export const STATES = Object.freeze(['default', 'empty', 'loading', 'error', 'worst']);
export const DEFAULT_VIEWPORTS = Object.freeze({ phone: '375x812', tablet: '768x1024', desktop: '1280x800' });
export const KEY_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
export const surfaceDir = (root) => join(root, ...SURFACE_REL.split('/'));
export const screenFile = (root, key) => join(surfaceDir(root), SCREENS_DIR, `${key}.html`);
export const screenRel = (key) => `${SURFACE_REL}/${SCREENS_DIR}/${key}.html`;
/** The file URL of a screen page in one state, as the browser of the checks opens it. */
export const screenUrl = (root, key, state) => `${pathToFileURL(screenFile(root, key)).href}?state=${state}`;

/** Write a JSON file whole: to a temporary file first, then a rename. The folder is made when it is missing. */
export function writeJson(file, value) {
  writeFileAtomic(file, `${JSON.stringify(value, null, 2)}\n`);
}

/**
 * The lock of one design file or folder. The lock file is in the SDLC home, never beside the file:
 * the surface is a tracked folder of the product repo, and the design server watches it.
 */
export const designLockPath = (target) => join(sdlcHomeDir(), 'locks',
  `design-${createHash('sha1').update(process.platform === 'win32' ? resolve(target).toLowerCase() : resolve(target)).digest('hex').slice(0, 20)}.lock`);

/**
 * Run `fn` while this process holds the lock of `target`, for one read-modify-write. The hold is
 * short: `fn` reads, changes and writes files, and starts no git and no network call.
 */
export function withDesignLock(target, fn, { waitMs = 10_000 } = {}) {
  return withLock(designLockPath(target), fn, {
    waitMs,
    busy: () => refuse('another design command writes the same file now', agentFix('Wait a moment, then run the command again.')),
  });
}
function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

/** `WxH` → { width, height }, or null. */
export function parseViewport(text) {
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(String(text ?? ''));
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

export const emptyManifest = () => ({ schema: SCREENS_SCHEMA, viewports: { ...DEFAULT_VIEWPORTS }, areas: [], screens: {}, explore: {}, components: {} });

/** The manifest, or an empty one. */
export function readManifest(root) {
  const m = readJson(join(surfaceDir(root), MANIFEST_FILE), null);
  if (!m || typeof m !== 'object' || Array.isArray(m)) return emptyManifest();
  // An entry that is no object (a hand edit, a bad merge) is left out, so no reader fails on it.
  const entries = (v) => Object.fromEntries(Object.entries(v && typeof v === 'object' && !Array.isArray(v) ? v : {}).filter(([, x]) => x && typeof x === 'object' && !Array.isArray(x)));
  const strings = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
  const screens = Object.fromEntries(Object.entries(entries(m.screens)).map(([k, sc]) => [k, {
    ...sc,
    ...(Object.hasOwn(sc, 'workflows') ? { workflows: strings(sc.workflows) } : {}),
    ...(Object.hasOwn(sc, 'slices') ? { slices: strings(sc.slices) } : {}),
    ...(Object.hasOwn(sc, 'approvals') ? { approvals: (Array.isArray(sc.approvals) ? sc.approvals : []).filter((a) => a && typeof a === 'object') } : {}),
  }]));
  return { ...emptyManifest(), ...m, areas: strings(m.areas), screens, explore: entries(m.explore), components: entries(m.components) };
}
/**
 * Why the manifest on disk cannot be read, or null. A missing file is no fault. `readManifest`
 * gives an empty manifest for a file that is not JSON (a bad merge, a cut write), so that no
 * reader fails; a caller that writes or reports asks this first.
 */
export function manifestFault(root) {
  let text;
  try { text = readFileSync(join(surfaceDir(root), MANIFEST_FILE), 'utf8'); } catch { return null; }
  try {
    const m = JSON.parse(text);
    return m && typeof m === 'object' && !Array.isArray(m) ? null : `${SURFACE_REL}/${MANIFEST_FILE} holds no JSON object`;
  } catch (e) {
    return `${SURFACE_REL}/${MANIFEST_FILE} is not JSON${/<<<<<<<|>>>>>>>/.test(text) ? ' (it holds the marks of a merge conflict)' : ''}: ${e.message}`;
  }
}
/** The refusal of a command that needs a manifest that reads. */
export function manifestRefusal(root) {
  const fault = manifestFault(root);
  return fault ? refuse(`${fault}. Nothing was changed`, agentFix(`Repair ${SURFACE_REL}/${MANIFEST_FILE} by hand: resolve the conflict or restore the file from git (git log -- ${SURFACE_REL}/${MANIFEST_FILE}). Then run the command again.`)) : null;
}
export function writeManifest(root, m) {
  mkdirSync(surfaceDir(root), { recursive: true });
  writeJson(join(surfaceDir(root), MANIFEST_FILE), m);
}

/**
 * One read-modify-write of the manifest, under its lock: `change(m)` gets the manifest as it is
 * on disk now and changes it; a return of `false` writes nothing. Returns the manifest.
 */
export function updateManifest(root, change) {
  return withDesignLock(join(surfaceDir(root), MANIFEST_FILE), () => {
    // A manifest that does not read is never written over: its screens would be lost.
    const refusal = manifestRefusal(root);
    if (refusal) throw refusal;
    const m = readManifest(root);
    if (change(m) !== false) writeManifest(root, m);
    return m;
  });
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

/** The custom properties of a token sheet: `[{ name, value }]`. */
export function tokensOf(css) {
  return [...String(css ?? '').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/gi)].map((m) => ({ name: m[1], value: m[2].trim() }));
}

/**
 * The token tables of DESIGN.md as typed rows (lib/design-tokens.mjs → parseTokenTables): each row
 * has its role, kind, default value and a value for each theme. The rows carry `themes`,
 * `skipped`, `problems` and `ignored`.
 */
export function tokensFromDesign(text) {
  return parseTokenTables(text);
}

/** The places of DESIGN.md, in the order they are read: the root, `.agents/context/`, `docs/`. */
export const DESIGN_MD_PLACES = ['DESIGN.md', '.agents/context/DESIGN.md', 'docs/DESIGN.md'];

/** The DESIGN.md of a repo: the first place that holds one, or null. */
export function designMdOf(root) {
  for (const p of DESIGN_MD_PLACES) if (existsSync(join(root, p))) return join(root, p);
  return null;
}

/**
 * Write tokens.css from DESIGN.md (see designMdOf). Returns the token rows, with `file` (the
 * DESIGN.md read, or null) and `skipped` (the Role cells that name no single role).
 */
export function writeTokens(root, { keep = false } = {}) {
  const design = designMdOf(root);
  const text = design ? readFileSync(design, 'utf8') : '';
  const rows = design ? tokensFromDesign(text) : Object.defineProperties([], { skipped: { value: [] }, problems: { value: [] }, ignored: { value: [] }, themes: { value: [] } });
  Object.defineProperty(rows, 'file', { value: design });
  const dir = surfaceDir(root);
  const sheet = join(dir, TOKENS_FILE);
  if (!rows.length) {
    // A sheet with no role would take the colors from every screen. `keep` (init) leaves the
    // sheet as it is, and makes an empty one only when there is none.
    if (keep) {
      if (!existsSync(sheet)) writeFileAtomic(sheet, `/* From the token tables of DESIGN.md. ${GENERATED_MARK}; do not edit it. */
:root {
}
`);
      if (!existsSync(join(dir, LAYOUT_SHEET))) writeFileAtomic(join(dir, LAYOUT_SHEET), layoutCss(rows));
      return rows;
    }
    const place = DESIGN_MD_PLACES.find((p) => join(root, p) === design);
    throw refuse(design ? `${place} has no token role: tokens.css stays as it is` : `no DESIGN.md at ${DESIGN_MD_PLACES.join(', ')}: tokens.css stays as it is`,
      agentFix(design
        ? `Add a "| Role | Value | Used for |" table with one row for each role under "## Colors" of ${place} (a column per theme, such as "| Role | Light | Dark |", for themes), then run the command again.`
        : 'Write DESIGN.md with a "| Role | Value | Used for |" table under "## Colors", then run the command again.'));
  }
  const rel = design ? relative(root, design).split(sep).join('/') : null;
  writeFileAtomic(sheet, tokensCss(rows));
  writeJson(join(dir, TOKENS_JSON), tokensJson(rows, rel));
  writeFileAtomic(join(dir, LAYOUT_SHEET), layoutCss(rows));
  // The W3C token files, one per theme, for Figma variables, Penpot and Tokens Studio.
  for (const [name, doc] of Object.entries(dtcgFiles(readTokenModel(root)))) writeJson(join(dir, DTCG_DIR, name), doc);
  Object.defineProperty(rows, 'platform', { value: writePlatformTokens(root, text, readTokenModel(root)) });
  return rows;
}

/**
 * The token file of the product code that DESIGN.md names (`Token file: <path>` in its Overview).
 * The file is written when it is missing or when this command wrote it; a file that a person wrote
 * stays, and the result says so. Returns null when DESIGN.md names no file.
 */
export function writePlatformTokens(root, designText, model) {
  const file = platformFileOf(designText);
  if (!file) return null;
  const abs = resolve(root, file);
  if (!abs.startsWith(resolve(root))) return { file, written: false, reason: 'the path leaves the repo' };
  // The sheets of the surface are written above; the token file is the one of the product code.
  if (resolve(abs).startsWith(resolve(surfaceDir(root)))) return { file, written: false, reason: 'it names a file of .ai/design/; name the token file of the product code (for example src/theme/tokens.ts or a DesignTokens.kt)' };
  if (file.endsWith('.css')) {
    if (existsSync(abs) && !readFileSync(abs, 'utf8').includes(GENERATED_MARK)) return { file, written: false, reason: 'a person wrote this file: it stays. Import the tokens from it, or remove it so the command writes it' };
    mkdirSync(dirname(abs), { recursive: true });
    writeFileAtomic(abs, readFileSync(join(surfaceDir(root), TOKENS_FILE), 'utf8'));
    return { file, written: true };
  }
  const text = platformTokens(model, file);
  if (text == null) return { file, written: false, reason: 'the generator writes Kotlin, Swift, TypeScript, JavaScript and CSS token files only' };
  if (existsSync(abs) && !readFileSync(abs, 'utf8').includes(GENERATED_MARK)) return { file, written: false, reason: 'a person wrote this file: it stays. Remove it, or name another file in "Token file:", so the command writes it' };
  mkdirSync(dirname(abs), { recursive: true });
  writeFileAtomic(abs, text);
  return { file, written: true };
}

/**
 * The token model of the surface: tokens.json when `design tokens` wrote it, else a model read from
 * tokens.css with the kinds from the names (`legacy: true`). Each token: `{ name, role, kind, value,
 * values, usedFor, alias }`.
 */
export function readTokenModel(root) {
  const dir = surfaceDir(root);
  try {
    const j = JSON.parse(readFileSync(join(dir, TOKENS_JSON), 'utf8'));
    if (j?.schema === TOKENS_SCHEMA && Array.isArray(j.tokens)) return j;
  } catch { /* no model yet */ }
  let css = '';
  try { css = readFileSync(join(dir, TOKENS_FILE), 'utf8'); } catch { css = ''; }
  return modelFromCss(css);
}

// ---------------------------------------------------------------- screens

/** The page of a new screen: the five states, the token and component sheets, and the state switch. */
export function screenTemplate(key, title) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="wf:screen" content="${key}">
<title>${title}</title>
<link rel="stylesheet" href="../${TOKENS_FILE}">
<link rel="stylesheet" href="../${LAYOUT_SHEET}">
<link rel="stylesheet" href="../${COMPONENTS_FILE}">
<style>
  /* Placement only: arrange with the l-* primitives of layout.css and the components; every value is a token. */
  body { margin: 0; font-family: var(--font-body); background: var(--ground); color: var(--text); }
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

/** Set the viewports of the surface: `{ name: 'WxH' }`. Each name is kebab-case and each size is WxH. */
export function setViewports(root, viewports) {
  const entries = Object.entries(viewports ?? {});
  if (!entries.length) throw refuse('name at least one viewport, as name=WxH', agentFix('Run the command again with at least one name=WxH pair.'));
  for (const [name, size] of entries) {
    if (!KEY_RE.test(name)) throw refuse(`the viewport name ${name} is not kebab-case`, agentFix('Name each viewport in lower case with hyphens, as name=WxH, then run the command again.'));
    if (!parseViewport(size)) throw refuse(`the viewport ${name}=${size} is not WxH`, agentFix('Give each viewport a size as WIDTHxHEIGHT, for example phone=375x812, then run the command again.'));
  }
  return updateManifest(root, (m) => { m.viewports = Object.fromEntries(entries); }).viewports;
}

/**
 * Set the order of the areas: the order of the product's main navigation. The canvas shows its
 * columns in this order. An area that a screen uses and the list leaves out goes after the list.
 */
export function setAreas(root, areas) {
  const list = [...new Set((areas ?? []).map((a) => String(a).trim()).filter(Boolean))];
  if (!list.length) throw refuse('name at least one area, in the order of the navigation', agentFix('Run the command again with the areas in the order of the navigation.'));
  return updateManifest(root, (m) => {
    const used = Object.values(m.screens).map((s) => s.area).filter(Boolean);
    m.areas = [...list, ...[...new Set([...(m.areas ?? []), ...used])].filter((a) => !list.includes(a))];
  }).areas;
}

/** The screens that `02c-craft.md` `screens:` approves but that have no page on the surface. */
export function missingScreens(root, contract) {
  const keys = Array.isArray(contract?.screens) ? contract.screens : [];
  return keys.filter((k) => !KEY_RE.test(String(k)) || !existsSync(screenFile(root, String(k)))).map((k) => `${SURFACE_REL}/${SCREENS_DIR}/${k}.html`);
}

/**
 * What stops the design of a contract from being settled, read from the disk: a list of lines,
 * empty when nothing does.
 *
 * - A contract that names `screens:`: the screen pages that are missing, and each way in which
 *   the records and the manifest do not hold the approval that the contract claims
 *   (lib/design-versions.mjs approvalProblems).
 * - A contract from before the surface that names `boards:`: the board files that are missing.
 * - A contract that names neither: nothing in a repo with no design surface, where the rule
 *   from before the surface holds. In a repo with a surface, an open workflow must name its
 *   approved screens, so the line says that.
 */
export function missingDesignFiles(root, workflowDir, contract) {
  if (!contract) return null;
  if (Array.isArray(contract.screens) && contract.screens.length) {
    const missing = missingScreens(root, contract);
    return [...missing, ...approvalProblems(root, basename(workflowDir), contract).filter((p) => !missing.includes(p))];
  }
  if (boardsRef(contract)) return missingBoardFiles(workflowDir, contract);
  const closed = frontmatterOfDoc(workflowDir, INDEX_NAME)?.status === 'closed';
  if (!closed && existsSync(join(surfaceDir(root), MANIFEST_FILE))) {
    return ['02c-craft.md names no screens, and this repo has a design surface: the screens of the workflow need an approval (wf.mjs design approve)'];
  }
  return missingBoardFiles(workflowDir, contract);
}

/** The states that a screen page declares with `data-state`. */
export function statesOf(html) {
  const found = new Set();
  // Only an element declares a state. A selector of a style sheet or a string of a script does not.
  const markup = String(html).replace(/<(style|script)\b[\s\S]*?<\/\1\s*>/gi, '').replace(/<!--[\s\S]*?-->/g, '');
  for (const m of markup.matchAll(/<[a-zA-Z][^<>]*?\sdata-state=["']([^"']+)["']/g)) for (const s of m[1].split(/\s+/)) if (STATES.includes(s)) found.add(s);
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
  if (!KEY_RE.test(String(key ?? ''))) throw refuse(`the screen key ${key} must be kebab-case`, agentFix('Name the screen in lower case with hyphens, for example order-list, then run the command again.'));
  let out = null;
  updateManifest(root, (m) => { out = addScreenTo(root, m, key, { title, area, flow, order, workflow, slice, now }); });
  return out;
}

function addScreenTo(root, m, key, { title, area, flow, order, workflow, slice, now }) {
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
  return { key, created, screen: s, file };
}

/**
 * The screens, with their states and links read from the pages; `workflow` filters to one workflow.
 * With `withHtml`, each screen also carries its page text, so a caller reads each page once.
 */
export function listScreens(root, { workflow = null, withHtml = false } = {}) {
  const m = readManifest(root);
  return Object.entries(m.screens)
    .filter(([, s]) => !workflow || (s.workflows ?? []).includes(workflow))
    .map(([key, s]) => {
      const file = screenFile(root, key);
      const html = existsSync(file) ? readFileSync(file, 'utf8') : '';
      return { key, ...s, exists: Boolean(html), states: statesOf(html), links: linksOf(html), ...(withHtml ? { html } : {}) };
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
  if (!KEY_RE.test(String(key ?? ''))) throw refuse(`the explore key ${key} must be kebab-case`, agentFix('Name the sketch in lower case with hyphens, then run the command again.'));
  mkdirSync(join(surfaceDir(root), EXPLORE_DIR), { recursive: true });
  const m = updateManifest(root, (x) => {
    x.explore[key] = { ...(x.explore[key] ?? {}), title: title ?? x.explore[key]?.title ?? key, link: link ?? x.explore[key]?.link ?? null, 'updated-at': nowIso(now) };
  });
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
  writeFileAtomic(file, out);
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
  const same = (a, b) => (process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b);
  return withDesignLock(designReposPath(), () => {
    const repos = readDesignRepos();
    const hit = repos.find((r) => same(resolve(r.root), abs));
    if (hit) return { ...hit, added: false };
    const base = basename(abs).toLowerCase().replace(/[^a-z0-9._-]+/g, '-') || 'repo';
    let name = base;
    for (let n = 2; repos.some((r) => r.name === name); n += 1) name = `${base}-${n}`;
    repos.push({ name, root: abs });
    writeJson(designReposPath(), { repos });
    return { name, root: abs, added: true };
  });
}

/** Make the surface: the folders, the manifest, the token and component sheets, the git rule and the repo entry. */
export function initSurface(root) {
  const dir = surfaceDir(root);
  const created = !existsSync(join(dir, MANIFEST_FILE));
  mkdirSync(join(dir, SCREENS_DIR), { recursive: true });
  mkdirSync(join(dir, EXPLORE_DIR), { recursive: true });
  mkdirSync(join(dir, COMPONENTS_DIR), { recursive: true });
  if (!existsSync(join(dir, COMPONENTS_FILE))) writeFileSync(join(dir, COMPONENTS_FILE), '/* The style of each component of the library. Use tokens only. */\n');
  if (created) writeManifest(root, emptyManifest());
  if (!existsSync(join(dir, REFERENCES_FILE))) writeJson(join(dir, REFERENCES_FILE), { references: [] });
  const tokens = writeTokens(root, { keep: true });
  const track = trackSurface(root);
  const repo = registerRepo(root);
  return { created, tokens: tokens.length, track, repo };
}
