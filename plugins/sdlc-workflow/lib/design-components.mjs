// The component library of the design surface: the parts that every screen reuses.
//
// `screens.json` lists each component. A component that the product code already has names its
// file and its name in the code. A new component has no code yet: the build must make it, and
// `component link` records where. `components/<key>.html` shows each variant and state of a
// component, and `components.css` holds its style. A screen marks each use with
// `data-component="<key>"`, so a script can tell which components a screen needs.
//
// The foundation is the tokens and the library. A new screen waits for it.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { COMPONENTS_DIR, COMPONENTS_FILE, KEY_RE, SURFACE_REL, TOKENS_FILE, listScreens, readManifest, screenFile, surfaceDir, tokensOf, writeManifest } from './design-surface.mjs';

const nowIso = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
export const componentFile = (root, key) => join(surfaceDir(root), COMPONENTS_DIR, `${key}.html`);
export const componentRel = (key) => `${SURFACE_REL}/${COMPONENTS_DIR}/${key}.html`;

/** The page of a new component: one block for each variant and state. */
export function componentTemplate(key, title) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="wf:component" content="${key}">
<title>${title}</title>
<link rel="stylesheet" href="../${TOKENS_FILE}">
<link rel="stylesheet" href="../${COMPONENTS_FILE}">
<style>
  body { margin: 0; padding: 16px; font: 16px/1.5 system-ui, sans-serif; background: var(--ground, #fff); color: var(--text, #111); }
  section { margin-bottom: 16px; }
  h2 { margin: 0 0 8px; font: inherit; font-weight: 600; }
</style>
</head>
<body>
<section><h2>Default</h2><div data-component="${key}"></div></section>
</body>
</html>
`;
}

/** The keys of the components that a page uses. */
export function componentsUsed(html) {
  return [...new Set([...String(html ?? '').matchAll(/data-component=["']([^"']+)["']/g)].map((m) => m[1]))].sort();
}

/** The code of a component as the manifest keeps it. A path stays inside the repo. */
function codeOf(root, code, name) {
  if (!code || !name) throw new Error('a component in the code needs --code <file> and --name <its name in the code>');
  const file = resolve(root, code);
  const rel = relative(root, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw new Error(`${code} is not a file of this repo`);
  if (!existsSync(file)) throw new Error(`the file ${code} does not exist`);
  return { code: rel.replace(/\\/g, '/'), name: String(name) };
}

/**
 * Add a component, or change its fields. With `code` and `name`, it is a component that the code
 * has. Without them, it is new, and the build must make it. A new component gets its page from the
 * template. A workflow is added to the list of the component, never replaced.
 */
export function addComponent(root, key, { title = null, code = null, name = null, workflow = null, now = new Date() } = {}) {
  if (!KEY_RE.test(String(key ?? ''))) throw new Error(`the component key ${key} must be kebab-case`);
  const inCode = code || name ? codeOf(root, code, name) : null;
  const m = readManifest(root);
  const was = m.components[key];
  m.components[key] = { title: title ?? was?.title ?? key, code: inCode?.code ?? was?.code ?? null, name: inCode?.name ?? was?.name ?? null,
    workflows: [...new Set([...(was?.workflows ?? []), ...(workflow ? [workflow] : [])])],
    'created-at': was?.['created-at'] ?? nowIso(now), 'updated-at': nowIso(now) };
  delete m['no-components'];
  const file = componentFile(root, key);
  mkdirSync(join(surfaceDir(root), COMPONENTS_DIR), { recursive: true });
  const created = !existsSync(file);
  if (created) writeFileSync(file, componentTemplate(key, m.components[key].title));
  writeManifest(root, m);
  return { key, created, component: m.components[key], file };
}

/** Record where the code has a component. The build runs this for each new component that it makes. */
export function linkComponent(root, key, { code = null, name = null, now = new Date() } = {}) {
  const m = readManifest(root);
  if (!m.components[key]) throw new Error(`no component ${key}`);
  m.components[key] = { ...m.components[key], ...codeOf(root, code, name), 'updated-at': nowIso(now) };
  writeManifest(root, m);
  return { key, component: m.components[key] };
}

/** Record that the product has no reusable parts, for example a terminal surface. */
export function setNoComponents(root, reason) {
  const text = String(reason ?? '').trim();
  if (!text) throw new Error('design components none needs --reason');
  const m = readManifest(root);
  if (Object.keys(m.components).length) throw new Error('the library has components');
  m['no-components'] = text;
  writeManifest(root, m);
  return { reason: text };
}

/** The screens with the components that their pages use. */
function usesOf(root, { workflow = null } = {}) {
  return listScreens(root, { workflow }).map((s) => ({ key: s.key, slices: s.slices ?? [],
    components: s.exists ? componentsUsed(readFileSync(screenFile(root, s.key), 'utf8')) : [] }));
}

/**
 * The components, each with the screens that use it. `workflow` keeps the components of one
 * workflow. A caller that read the screen pages passes `uses`, `[{ key, components }]`.
 */
export function listComponents(root, { workflow = null, uses = null } = {}) {
  uses ??= usesOf(root);
  const of = workflow ? new Set(usesOf(root, { workflow }).flatMap((s) => s.components)) : null;
  return Object.entries(readManifest(root).components)
    .filter(([key, c]) => !of || of.has(key) || (c.workflows ?? []).includes(workflow))
    .map(([key, c]) => ({ key, ...c, status: c.code ? 'in code' : 'to build', screens: uses.filter((s) => s.components.includes(key)).map((s) => s.key) }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** The tokens and the library. `ok` is false until a new screen can be drawn from them. */
export function foundation(root) {
  const m = readManifest(root);
  let tokens = 0;
  try { tokens = tokensOf(readFileSync(join(surfaceDir(root), TOKENS_FILE), 'utf8')).length; } catch { tokens = 0; }
  const components = Object.keys(m.components).length;
  const none = m['no-components'] ?? null;
  const missing = [...(tokens ? [] : ['no tokens: write the token roles in DESIGN.md, then run design tokens']),
    ...(components || none ? [] : ['no components: run design component add for each part that the screens need'])];
  return { ok: !missing.length, tokens, components, none, missing };
}

/** The approved screens of a workflow name these components; the contract lists those to build. */
export function workflowComponents(root, keys) {
  const m = readManifest(root);
  const wanted = new Set(keys);
  const used = [...new Set(usesOf(root).filter((s) => wanted.has(s.key)).flatMap((s) => s.components))].sort();
  return { used, toBuild: used.filter((k) => !m.components[k]?.code) };
}

/** True when a file of the repo, other than the component's own file, names the component. */
function usedInCode(root, c) {
  const r = spawnSync('git', ['-C', root, 'grep', '-l', '-w', '-F', '-e', c.name, '--', '.', ':(exclude).ai'], { encoding: 'utf8', windowsHide: true });
  if (r.status === null || r.status > 1) return null;
  return r.stdout.split(/\r?\n/).some((f) => f && f !== c.code);
}

/**
 * The code must use the library: each component of the screens of a workflow, or of one slice,
 * has its file, and another file of the repo names it. `problems` is empty when the code does.
 */
export function verifyComponents(root, slug, { slice = null } = {}) {
  const m = readManifest(root);
  const screens = usesOf(root, { workflow: slug }).filter((s) => !slice || s.slices.includes(slice));
  const used = [...new Set(screens.flatMap((s) => s.components))].sort();
  const problems = [];
  for (const key of used) {
    const c = m.components[key];
    const on = screens.filter((s) => s.components.includes(key)).map((s) => s.key).join(', ');
    if (!c) problems.push(`${key}: the library has no such component (${on})`);
    else if (!c.code) problems.push(`${key}: not built: make it, then run design component link (${on})`);
    else if (!existsSync(join(root, c.code))) problems.push(`${key}: the file ${c.code} does not exist (${on})`);
    else if (usedInCode(root, c) === false) problems.push(`${key}: no file uses ${c.name} from ${c.code} (${on})`);
  }
  return { ok: !problems.length, used, problems };
}

/* ───────────────────────── the scan of the code ───────────────────────── */

// The files that can hold a component, and the names that each kind of file exports. A file of a
// shadcn UI folder or a Storybook story names its component even when the export does not match.
const SCAN_EXT = /\.(?:[jt]sx|vue|svelte|kt|swift)$/;
const SCAN_SKIP = /(^|\/)(?:node_modules|dist|build|out|\.next|\.ai|\.git|coverage|vendor|Pods)\//;
const SCAN_TEST = /\.(?:test|spec)\.[jt]sx?$|(^|\/)(?:__tests__|test|tests)\//;
const MAX_SCAN = 200;
const NOT_A_PART = /(?:Screen|Page|NavHost|NavGraph|Route|App|Activity|Preview)$/;
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const pascal = (base) => base.replace(/(^|[-_.\s]+)([a-z0-9])/gi, (_, __, c) => c.toUpperCase());

/** The names of the components that one file of the code exports. */
export function componentNames(file, text) {
  const ext = file.slice(file.lastIndexOf('.'));
  const base = file.slice(file.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  if (ext === '.vue' || ext === '.svelte') return /^[A-Z]/.test(base) || /(^|\/)components?\//.test(file) ? [pascal(base)] : [];
  const names = new Set();
  const re = ext === '.kt' ? /@Composable\s+(?:(?:public|internal|private)\s+)?fun\s+([A-Z]\w*)\s*\(/g
    : ext === '.swift' ? /struct\s+([A-Z]\w*)\s*:\s*(?:[\w.]+\s*,\s*)*View\b/g
      : /export\s+(?:default\s+)?(?:function|const|class)\s+([A-Z]\w*)/g;
  // A whole screen, a navigation host or a preview is not a reusable part.
  for (const m of String(text).matchAll(re)) if (!NOT_A_PART.test(m[1])) names.add(m[1]);
  return [...names];
}

/** The folder of the shadcn UI components, from `components.json`, or null. */
function shadcnDir(root) {
  let alias = null;
  try { alias = JSON.parse(readFileSync(join(root, 'components.json'), 'utf8'))?.aliases?.ui ?? null; } catch { return null; }
  if (!alias) return null;
  const rel = String(alias).replace(/^[@~]\//, '');
  return [`src/${rel}`, rel].find((d) => existsSync(join(root, d))) ?? null;
}

/**
 * The components of the product code: a candidate for each part that the screens can draw with the
 * library. It reads the shadcn UI folder, the Storybook stories, and the component files of React,
 * Vue, Svelte, Jetpack Compose and SwiftUI that git tracks. Each candidate says whether the library
 * has it. The scan reads files and never runs code.
 */
export function scanComponents(root) {
  const r = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  const files = r.status === 0 ? r.stdout.split('\0').filter(Boolean) : [];
  const ui = shadcnDir(root);
  const library = new Map(Object.entries(readManifest(root).components).filter(([, c]) => c.code && c.name).map(([key, c]) => [`${c.code}#${c.name}`, key]));
  const stories = new Set(files.filter((f) => /\.stories\.(?:[jt]sx?|mdx)$/.test(f)).map((f) => f.replace(/\.stories\.(?:[jt]sx?|mdx)$/, '')));
  const out = [];
  for (const file of files) {
    if (!SCAN_EXT.test(file) || SCAN_SKIP.test(file) || SCAN_TEST.test(file) || /\.stories\./.test(file)) continue;
    const stem = file.replace(/\.[^.]+$/, '');
    const source = ui && file.startsWith(`${ui}/`) ? 'shadcn' : stories.has(stem) ? 'storybook' : 'code';
    if (source === 'code' && !/(^|\/)(?:components?|ui|widgets?|views?|design-?system)\//i.test(file) && !/\.(?:kt|swift)$/.test(file)) continue;
    let text = '';
    try { text = readFileSync(join(root, file), 'utf8'); } catch { continue; }
    for (const name of componentNames(file, text)) {
      const inLibrary = library.get(`${file}#${name}`) ?? null;
      out.push({ key: inLibrary ?? kebab(name), name, code: file, source, inLibrary: Boolean(inLibrary) });
    }
    if (out.length >= MAX_SCAN) break;
  }
  const rank = { shadcn: 0, storybook: 1, code: 2 };
  return out.sort((a, b) => Number(a.inLibrary) - Number(b.inLibrary) || rank[a.source] - rank[b.source] || a.code.localeCompare(b.code));
}
