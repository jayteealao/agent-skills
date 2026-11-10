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
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { COMPONENTS_DIR, COMPONENTS_FILE, KEY_RE, SURFACE_REL, TOKENS_FILE, listScreens, readManifest, screenFile, surfaceDir, tokensOf, updateManifest } from './design-surface.mjs';
import { agentFix, refuse } from './fix.mjs';

/** One read-modify-write of the manifest, under its lock. */
export function changeManifest(root, change) {
  return updateManifest(root, change);
}

/** An argument as a shell word of a fix command. */
export const word = (s) => (/^[A-Za-z0-9#._/:\\=,+-]+$/.test(String(s)) ? String(s).replace(/\\/g, '/') : JSON.stringify(String(s).replace(/\\/g, '/')));
/** The keys of the library, as the end of a fix sentence. */
const libraryKeys = (m) => (Object.keys(m.components).length ? `The components of the library: ${Object.keys(m.components).sort().join(', ')}.` : 'The library has no component yet.');

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

const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
const pascal = (base) => base.replace(/(^|[-_.\s]+)([a-z0-9])/gi, (_, __, c) => c.toUpperCase());
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The code of a component as the manifest keeps it. A path stays inside the repo, and the file holds the name. */
function codeOf(root, code, name) {
  const scan = `wf.mjs design components scan ${word(root)}`;
  if (!code || !name) throw refuse('a component in the code needs --code <file> and --name <its name in the code>', agentFix('Run the command again with both --code <a file of the repo> and --name <the name of the component in that file>. The scan lists each name with its file.', scan));
  const file = resolve(root, code);
  const rel = relative(root, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) throw refuse(`${code} is not a file of this repo`, agentFix('Run the command again with --code as a path inside the project root. The scan lists the component files.', scan));
  if (!existsSync(file)) throw refuse(`the file ${code} does not exist`, agentFix('Run the command again with --code as the path of the file that holds the component. The scan lists the component files.', scan));
  // A Vue or Svelte file names its component by its file name; any other file holds the name as a word.
  const base = pascal(rel.replace(/\\/g, '/').split('/').pop().replace(/\.[^.]+$/, ''));
  let text = '';
  try { text = readFileSync(file, 'utf8'); } catch { text = ''; }
  if (base !== String(name) && !new RegExp(`(^|[^A-Za-z0-9_$])${escapeRe(name)}($|[^A-Za-z0-9_$])`).test(text)) {
    throw refuse(`the file ${code} does not name ${name}`, agentFix(`Run the command again with --name as the name that ${code} gives the component, or with --code as the file that holds ${name}. The scan lists each name with its file.`, scan));
  }
  return { code: rel.replace(/\\/g, '/'), name: String(name) };
}

/**
 * Add a component, or change its fields. With `code` and `name`, it is a component that the code
 * has. Without them, it is new, and the build must make it. A new component gets its page from the
 * template. A workflow is added to the list of the component, never replaced.
 */
export function addComponent(root, key, { title = null, code = null, name = null, workflow = null, now = new Date() } = {}) {
  if (!KEY_RE.test(String(key ?? ''))) {
    throw refuse(`the component key ${key} must be kebab-case`, agentFix(`Run the command again with a key of lower-case letters, digits and single dashes${kebab(String(key ?? '')) ? `, for example ${kebab(String(key))}` : ''}.`));
  }
  const inCode = code || name ? codeOf(root, code, name) : null;
  let entry = null;
  changeManifest(root, (m) => {
    const was = m.components[key];
    entry = { title: title ?? was?.title ?? key, code: inCode?.code ?? was?.code ?? null, name: inCode?.name ?? was?.name ?? null,
      workflows: [...new Set([...(was?.workflows ?? []), ...(workflow ? [workflow] : [])])],
      'created-at': was?.['created-at'] ?? nowIso(now), 'updated-at': nowIso(now) };
    m.components[key] = entry;
    delete m['no-components'];
  });
  const file = componentFile(root, key);
  mkdirSync(join(surfaceDir(root), COMPONENTS_DIR), { recursive: true });
  const created = !existsSync(file);
  if (created) writeFileSync(file, componentTemplate(key, entry.title));
  return { ok: true, key, created, component: entry, file };
}

/** Record where the code has a component. The build runs this for each new component that it makes. */
export function linkComponent(root, key, { code = null, name = null, now = new Date() } = {}) {
  const had = readManifest(root);
  if (!had.components[key]) throw refuse(`no component ${key}`, agentFix(`Run the command again with the key of a component of the library. ${libraryKeys(had)}`));
  const inCode = codeOf(root, code, name);
  const m = changeManifest(root, (x) => {
    if (!x.components[key]) return false;
    x.components[key] = { ...x.components[key], ...inCode, 'updated-at': nowIso(now) };
    return true;
  });
  return { ok: true, key, component: m.components[key] };
}

/**
 * Remove a component from the library: its manifest entry and its page. A component that a
 * screen page uses stays, unless `force`: the screens then name a component that the library
 * does not have, and the check says so.
 */
export function removeComponent(root, key, { force = false } = {}) {
  const had = readManifest(root);
  if (!had.components[key]) throw refuse(`no component ${key}`, agentFix(`Run the command again with the key of a component of the library. ${libraryKeys(had)}`));
  const screens = usesOf(root).filter((s) => s.components.includes(key)).map((s) => s.key);
  if (screens.length && !force) {
    throw refuse(`the component ${key} is used on ${screens.join(', ')}`, agentFix(`Take data-component="${key}" out of each of these screen pages first, then run the command again. To remove it all the same, run it with --force: the check then reports each use.`, `wf.mjs design component remove ${word(root)} ${key} --force`));
  }
  changeManifest(root, (m) => { delete m.components[key]; });
  rmSync(componentFile(root, key), { force: true });
  return { ok: true, key, removed: true, screens, file: componentRel(key) };
}

/** Record that the product has no reusable parts, for example a terminal surface. */
export function setNoComponents(root, reason) {
  const text = String(reason ?? '').trim();
  if (!text) throw refuse('design components none needs --reason', agentFix('Run the command again with --reason and one sentence that says why the product has no reusable part.', `wf.mjs design components none ${word(root)} --reason "<why>"`));
  const had = readManifest(root);
  if (Object.keys(had.components).length) throw refuse('the library has components', agentFix(`A library with components cannot be marked as empty. ${libraryKeys(had)} Leave the library as it is, or remove each one with design component remove first.`));
  changeManifest(root, (m) => { m['no-components'] = text; });
  return { ok: true, reason: text };
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

/**
 * The tokens and the library. `ok` is false until a new screen can be drawn from them. `next`
 * holds one step for each missing part: what to do, and the command that does it.
 */
export function foundation(root) {
  const m = readManifest(root);
  let tokens = 0;
  try { tokens = tokensOf(readFileSync(join(surfaceDir(root), TOKENS_FILE), 'utf8')).length; } catch { tokens = 0; }
  const components = Object.keys(m.components).length;
  const none = m['no-components'] ?? null;
  const steps = [
    ...(tokens ? [] : [{ missing: 'no tokens: write the token roles in DESIGN.md, then run design tokens', do: 'Write the token roles in the "| Role | Token | Value |" table under "## Colors" of DESIGN.md, then write the token sheet.', command: `wf.mjs design tokens ${word(root)}` }]),
    ...(components || none ? [] : [{ missing: 'no components: run design component add for each part that the screens need', do: 'Find the parts that the code has, then add each part that the screens need. A product with no reusable part records that with design components none.', command: `wf.mjs design components scan ${word(root)}` }]),
  ];
  return { ok: !steps.length, tokens, components, none, missing: steps.map((s) => s.missing), next: steps.map(({ do: d, command }) => ({ do: d, command })) };
}

/** The approved screens of a workflow name these components; the contract lists those to build. */
export function workflowComponents(root, keys) {
  const m = readManifest(root);
  const wanted = new Set(keys);
  const used = [...new Set(usesOf(root).filter((s) => wanted.has(s.key)).flatMap((s) => s.components))].sort();
  return { used, toBuild: used.filter((k) => !m.components[k]?.code) };
}

// A file that names a component and does not use it in the product: prose, a story, a test.
const NOT_A_USE = [':(exclude).ai', ':(exclude,glob)**/*.md', ':(exclude,glob)**/*.mdx', ':(exclude,glob)**/*.stories.*', ':(exclude,glob)**/*.test.*', ':(exclude,glob)**/*.spec.*', ':(exclude,glob)**/__tests__/**'];

/** True when a code file of the repo, other than the component's own file, names the component. */
function usedInCode(root, c) {
  const r = spawnSync('git', ['-C', root, 'grep', '-l', '-w', '-F', '--untracked', '-e', c.name, '--', '.', ...NOT_A_USE], { encoding: 'utf8', windowsHide: true });
  if (r.status === null || r.status > 1) return null;
  return r.stdout.split(/\r?\n/).some((f) => f && f !== c.code);
}

/**
 * The code must use the library: each component of the screens of a workflow, or of one slice,
 * has its file, and another code file of the repo names it. `problems` is empty when the code does.
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
  return { ok: !problems.length, screens: screens.map((s) => s.key), used, problems };
}

/* ───────────────────────── the scan of the code ───────────────────────── */

// The files that can hold a component, and the names that each kind of file exports. A file of a
// shadcn UI folder or a Storybook story names its component by its file name when no export does.
const SCAN_EXT = /\.(?:[jt]sx|vue|svelte|kt|swift)$/;
const SCAN_SKIP = /(^|\/)(?:node_modules|dist|build|out|\.next|\.nuxt|\.svelte-kit|\.ai|\.git|coverage|vendor|Pods|DerivedData|storybook-static)\//;
const SCAN_TEST = /\.(?:test|spec)\.[jt]sx?$|(^|\/)(?:__tests__|test|tests|androidTest)\//;
/** The candidates that a scan lists. A scan that finds more says so with `truncated`. */
export const MAX_SCAN = 200;
const NOT_A_PART = /(?:Screen|Page|NavHost|NavGraph|Route|App|Activity|Preview)$/;
// A name that is a value of the code and no part of the screen: a constant, an error, a context, a type.
const NOT_A_COMPONENT = /(?:Context|Error|Exception|Schema|Props|Variants|Config|Store|Type|Types|Enum)$/;
const isPascal = (name) => /^[A-Z][A-Za-z0-9]*$/.test(name) && /[a-z]/.test(name);

/** True when the text declares `name` as a component of React: a function, a component class, or a value that makes one. */
function declaresComponent(text, name) {
  const n = escapeRe(name);
  if (new RegExp(`\\bfunction\\s+${n}\\b`).test(text)) return true;
  const cls = new RegExp(`\\bclass\\s+${n}\\b([^{]*)`).exec(text);
  if (cls) return /\bextends\s+(?:React\.)?(?:Pure)?Component\b/.test(cls[1]);
  const init = new RegExp(`\\b(?:const|let|var)\\s+${n}\\b[^=\\n]*=\\s*([^\\n]{0,120})`).exec(text);
  // A name that the file only passes on (`export { Button } from './button'`) counts.
  if (!init) return true;
  const v = init[1];
  if (/^(?:React\.)?(?:createContext|cva)\b|^cva\(|^[0-9'"`{[]|^new\b|^(?:true|false|null)\b/.test(v)) return false;
  return /^(?:React\.)?(?:forwardRef|memo|lazy)\b|^styled\b|^(?:async\s+)?(?:function\b|\(|<|[a-z_$][\w$]*\s*=>)|^[A-Z][\w$]*(?:\.[A-Z][\w$]*)+/.test(v);
}

/** The names of the components that one file of the code exports. */
export function componentNames(file, text) {
  const ext = file.slice(file.lastIndexOf('.'));
  const base = file.slice(file.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
  if (ext === '.vue' || ext === '.svelte') return /^[A-Z]/.test(base) || /(^|\/)components?\//.test(file) ? [pascal(base)] : [];
  const src = String(text);
  const names = new Set();
  if (ext === '.kt') {
    // A private composable is a detail of its file, no part of the library.
    for (const m of src.matchAll(/@Composable\s+(?:@\w+(?:\([^)]*\))?\s+)*(private\s+|internal\s+|public\s+)?fun\s+([A-Z]\w*)\s*\(/g)) if (!/^private/.test(m[1] ?? '')) names.add(m[2]);
  } else if (ext === '.swift') {
    for (const m of src.matchAll(/(?:^|\n)[ \t]*((?:public|internal|private|fileprivate)\s+)?struct\s+([A-Z]\w*)\s*:\s*(?:[\w.]+\s*,\s*)*View\b/g)) if (!/^(?:private|fileprivate)/.test(m[1] ?? '')) names.add(m[2]);
  } else {
    const exported = new Set();
    for (const m of src.matchAll(/export\s+(?:default\s+)?(?:async\s+)?(?:function|const|let|class)\s+([A-Za-z_$][\w$]*)/g)) exported.add(m[1]);
    // `export { Button, buttonVariants }`, `export { Root as Dialog }`, `export default Button`.
    for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
      for (const part of m[1].split(',')) {
        const [local, alias] = part.trim().split(/\s+as\s+/);
        const name = (alias ?? local ?? '').trim();
        if (name && name !== 'default') exported.add(name); else if (name === 'default' && local) exported.add(local.trim());
      }
    }
    for (const m of src.matchAll(/export\s+default\s+([A-Z][\w$]*)\s*;?\s*(?:\n|$)/g)) exported.add(m[1]);
    for (const name of exported) if (isPascal(name) && !NOT_A_COMPONENT.test(name) && declaresComponent(src, name)) names.add(name);
  }
  // A whole screen, a navigation host or a preview is not a reusable part.
  return [...names].filter((n) => !NOT_A_PART.test(n));
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
 * Vue, Svelte, Jetpack Compose and SwiftUI that git knows (tracked, or new and not ignored). Each
 * candidate says whether the library has it. The scan reads files and never runs code. Returns
 * `{ ok, components, total, truncated }`: the candidates that the library lacks come first, then
 * shadcn, the stories and the rest; `truncated` is true when more than MAX_SCAN were found.
 */
export function scanComponents(root) {
  const r = spawnSync('git', ['-C', root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], { encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) {
    throw refuse(r.status === null ? 'the file list of the repo is too large for the scan' : `${root.replace(/\\/g, '/')} is not a git repository`,
      agentFix('The scan reads the files that git knows. Run it at the root of the git repo of the product; in a folder with no git, add each part by hand with design component add --code <file> --name <name>.'));
  }
  const files = r.stdout.split('\0').filter(Boolean);
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
    let names = componentNames(file, text);
    // A file of the UI folder or with a story is a component by its place: its file name names it.
    // A hook file (use-toast) is no part.
    if (!names.length && source !== 'code' && /\.[jt]sx$/.test(file)) names = [pascal(stem.slice(stem.lastIndexOf('/') + 1))].filter((n) => isPascal(n) && !/^Index$/.test(n) && !/^Use[A-Z]/.test(n));
    for (const name of names) {
      const inLibrary = library.get(`${file}#${name}`) ?? null;
      out.push({ key: inLibrary ?? kebab(name), name, code: file, source, inLibrary: Boolean(inLibrary) });
    }
  }
  const rank = { shadcn: 0, storybook: 1, code: 2 };
  out.sort((a, b) => Number(a.inLibrary) - Number(b.inLibrary) || rank[a.source] - rank[b.source] || a.code.localeCompare(b.code));
  return { ok: true, components: out.slice(0, MAX_SCAN), total: out.length, truncated: out.length > MAX_SCAN };
}
