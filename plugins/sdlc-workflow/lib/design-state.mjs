// The data of the canvas: one JSON object that the design server serves and a published
// snapshot inlines. The canvas reads nothing else.
//
// It holds the screens with their states, links, approvals, history, open comments and check
// failures; the versions of each workflow; the positions of the layout; the explore sketches; the references with their check;
// the token model with its themes; the components with their specs and tokens; the design decisions of the workflows; and one design card per slice.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { liveDecisions, readDecisions } from './decisions.mjs';
import { approvalPicture, capturesIndex, designRecordsDir, groupFailures, readComments, readChecks } from './design-records.mjs';
import { versionsOf } from './design-versions.mjs';
import { componentFile, componentSpec, componentsUsed, listComponents, specProblems } from './design-components.mjs';
import { COMPONENTS_FILE, LAYOUT_FILE, LAYOUT_SHEET, SCREENS_DIR, STATES, SURFACE_REL, TOKENS_FILE, listExplore, listScreens, readManifest, readTokenModel, screenFile, screenRel, surfaceDir, tokensOf } from './design-surface.mjs';

export { tokensOf };
import { checkReferences } from './design-references.mjs';
import { readDoc } from './records.mjs';
import { workflowDir } from './records-root.mjs';

export const STATE_SCHEMA = 'sdlc/design-canvas/v1';

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

/** The tokens that a screen page uses: each `var(--name)`. */
export function tokensUsed(html) {
  return [...new Set([...String(html ?? '').matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]))].sort();
}

const varsOf = (text) => [...String(text ?? '').matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]);
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const noComments = (css) => String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The custom properties that a component sheet sets, each with the custom properties that its
 * value reads: a Map from `--name` to the names of its `var()`s.
 */
function sheetAliases(css) {
  const out = new Map();
  for (const m of noComments(css).matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/gi)) {
    if (!out.has(m[1])) out.set(m[1], new Set());
    for (const v of varsOf(m[2])) out.get(m[1]).add(v);
  }
  return out;
}

/**
 * The names that `names` read, through the custom properties of the component sheet: a name that
 * the sheet sets stands for the names its value reads, at any depth. `known` keeps the names of
 * the token model; without it the names that the sheet sets drop out.
 */
function resolveNames(names, aliases, known) {
  const out = new Set();
  const seen = new Set();
  const walk = (n) => {
    if (seen.has(n)) return;
    seen.add(n);
    if (known ? known.has(n) : !aliases.has(n)) out.add(n);
    for (const v of aliases.get(n) ?? []) walk(v);
  };
  for (const n of names) walk(n);
  return [...out].sort();
}

/**
 * The tokens that each component reads in the component sheet: `{ key: ['--name'] }`. A rule
 * belongs to a component when its selector names the class `.<key>` or `[data-component="<key>"]`.
 * A custom property of the sheet whose value reads a token stands for that token. `known` (a Set of
 * the token names of the model) keeps only those names.
 */
export function componentTokens(componentsCss, keys, known = null) {
  const css = noComments(componentsCss);
  const aliases = sheetAliases(css);
  // The innermost rules: the selector of a rule inside @media is the text after the brace of the @media.
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1], body: m[2] }));
  const out = {};
  for (const key of keys) {
    const k = escapeRe(key);
    const mine = new RegExp(`\\.${k}(?![A-Za-z0-9_-])|\\[data-component\\s*=\\s*["']?${k}["']?\\s*\\]`);
    const names = rules.filter((r) => mine.test(r.selector)).flatMap((r) => varsOf(r.body));
    out[key] = resolveNames(names, aliases, known);
  }
  return out;
}

/**
 * The commits that changed each screen page, newest first, `limit` for each page: a Map from the
 * page path to `[{ commit, at, subject }]`. One git log covers every page, because one log for
 * each page costs a walk of the whole history for each page.
 */
function historyAll(root, limit = 20) {
  // --relative: the paths start at the root, which may be a folder inside its git repo.
  const r = spawnSync('git', ['-C', root, 'log', '--relative', '--format=%x1e%H%x09%cI%x09%s', '--name-only', '--', `${SURFACE_REL}/${SCREENS_DIR}`],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  const out = new Map();
  if (r.status !== 0) return out;
  for (const block of r.stdout.split('\x1e').slice(1)) {
    const [head, ...files] = block.split('\n');
    const [commit, at, ...subject] = head.split('\t');
    for (const f of files) {
      if (!f) continue;
      if (!out.has(f)) out.set(f, []);
      const list = out.get(f);
      if (list.length < limit) list.push({ commit, at, subject: subject.join('\t') });
    }
  }
  return out;
}

/** The screen pages that differ from the last commit: one git status for every page. */
function dirtyPages(root) {
  const r = spawnSync('git', ['-C', root, 'status', '--porcelain', '--untracked-files=all', '--', `${SURFACE_REL}/${SCREENS_DIR}`], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return new Set();
  // git status names paths from the top of the git repo: take off the folder of the root.
  const prefix = spawnSync('git', ['-C', root, 'rev-parse', '--show-prefix'], { encoding: 'utf8', windowsHide: true }).stdout?.trim() ?? '';
  return new Set(r.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''))
    .map((p) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p)));
}

/**
 * The approval picture of a screen when it still shows the page: the approval commit is the newest
 * commit of the page, and the page has no change since. The board shows it in place of a live
 * page when it is zoomed far out. The approval takes it in the default state at one viewport.
 */
function currentPicture(root, s, history, dirty) {
  const a = (s.approvals ?? []).at(-1);
  if (!a?.commit || history[0]?.commit !== a.commit || dirty.has(screenRel(s.key))) return null;
  return existsSync(approvalPicture(root, a.commit, s.key)) ? `approvals/${a.commit}/${s.key}.png` : null;
}

/**
 * The check failures of one screen, as the board needs them: the count for each viewport and state
 * (`"<viewport>|<state>"`), and the total. The canvas reads the failures themselves only for the
 * screen that it opens.
 */
function failureCounts(failures) {
  const counts = {};
  for (const f of failures) if (f.viewport && f.state) counts[`${f.viewport}|${f.state}`] = (counts[`${f.viewport}|${f.state}`] ?? 0) + 1;
  return counts;
}

// The git folder of each repo, found once: a commit changes its `HEAD` reflog.
const gitDirs = new Map();
function gitDirOf(root) {
  if (!gitDirs.has(root)) {
    const r = spawnSync('git', ['-C', root, 'rev-parse', '--absolute-git-dir'], { encoding: 'utf8', windowsHide: true });
    // A folder that is no git repo yet is asked again: it can become one while the server runs.
    if (r.status !== 0) return null;
    gitDirs.set(root, r.stdout.trim());
  }
  return gitDirs.get(root);
}
function statsOf(dir, recursive, out) {
  let names = [];
  try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const d of names) {
    const p = join(dir, d.name);
    if (d.isDirectory()) { if (recursive) statsOf(p, true, out); continue; }
    try { const st = statSync(p); out.set(p, `${st.size}\t${st.mtimeMs}`); } catch { /* it went away */ }
  }
}
/**
 * Every file that the canvas state reads, with its size and time: the surface, the design records,
 * the files of each workflow of the screens, the references, and the git history. A Map from the
 * path to `"<size>\t<mtime>"`. It stats files and reads none, so it costs milliseconds where a
 * build costs seconds. The design server compares two of these to find the pages that changed.
 */
export function stateFiles(root) {
  const out = new Map();
  statsOf(surfaceDir(root), true, out);
  statsOf(designRecordsDir(root), true, out);
  const m = readManifest(root);
  for (const w of new Set(Object.values(m.screens).flatMap((x) => x.workflows ?? []))) statsOf(workflowDir(root, w), false, out);
  for (const r of readJson(join(surfaceDir(root), 'references.json'), {}).references ?? []) {
    if (!r?.file) continue;
    const p = resolve(root, r.file);
    try { const st = statSync(p); out.set(p, `${st.size}\t${st.mtimeMs}`); } catch { out.set(p, 'missing'); }
  }
  const git = gitDirOf(root);
  if (git) {
    for (const g of ['HEAD', join('logs', 'HEAD')]) {
      try { const st = statSync(join(git, g)); out.set(join(git, g), `${st.size}\t${st.mtimeMs}`); } catch { /* no reflog */ }
    }
  }
  return out;
}
/**
 * The stamp of the files that the canvas state reads. The state is the same while the stamp is the
 * same, so the design server keeps one state for each stamp.
 */
export function stateStamp(root, files = stateFiles(root)) {
  return createHash('sha1').update([...files].map(([p, v]) => `${p}\t${v}`).join('\n')).digest('hex').slice(0, 20);
}

/** The check failures of one screen and their groups, for the screen that the canvas opens. */
export function screenFailures(root, key) {
  const failures = (readChecks(root)?.failures ?? []).filter((f) => f.screen === key);
  return { failures, failureGroups: groupFailures(failures) };
}

/** The lines of a `## <heading>` section of a record body. */
function sectionLines(body, heading) {
  const lines = String(body ?? '').split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (at < 0) return [];
  const out = [];
  for (const l of lines.slice(at + 1)) {
    if (/^##\s/.test(l)) break;
    const m = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(l);
    if (m) out.push(m[1].trim());
  }
  return out;
}

/**
 * The design card of each slice: the tokens of its screens, the rules of the visual contract
 * that apply to it, its screens with their states, the newest approval and check result of
 * its screens, and its open comments.
 */
export function designCards(root, screens, checks) {
  const bySlice = new Map();
  for (const s of screens) {
    for (const w of s.workflows ?? []) {
      const slices = (s.slices ?? []).length ? s.slices : ['(whole workflow)'];
      for (const slice of slices) {
        const k = `${w}\u0000${slice}`;
        if (!bySlice.has(k)) bySlice.set(k, { workflow: w, slice, screens: [] });
        bySlice.get(k).screens.push(s);
      }
    }
  }
  const contracts = new Map();
  const contractOf = (w) => {
    if (!contracts.has(w)) contracts.set(w, existsSync(workflowDir(root, w)) ? readDoc(workflowDir(root, w), '02c-craft.md') : null);
    return contracts.get(w);
  };
  return [...bySlice.values()].map(({ workflow, slice, screens: list }) => {
    const contract = contractOf(workflow);
    const keys = list.map((s) => s.key);
    const inventory = sectionLines(contract?.body, 'Mock fidelity inventory').filter((l) => keys.some((k) => l.includes(k)));
    const avoid = sectionLines(contract?.body, 'Anti-patterns to avoid');
    const approvals = list.flatMap((s) => (s.approvals ?? []).map((a) => ({ ...a, screen: s.key }))).sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const failures = (checks?.failures ?? []).filter((f) => keys.includes(f.screen));
    return {
      workflow, slice,
      tokens: [...new Set(list.flatMap((s) => s.tokens ?? []))].sort(),
      rules: [...inventory, ...avoid.map((a) => `Avoid: ${a}`)],
      screens: list.map((s) => ({ key: s.key, title: s.title, states: s.states })),
      approval: approvals[0] ?? null,
      checks: checks ? { at: checks.at, failures: failures.length, passed: failures.length === 0 } : null,
      openComments: list.reduce((n, s) => n + (s.openComments ?? 0), 0),
    };
  });
}

/** The design decisions of the workflows that changed a screen. */
function designDecisions(root, workflows) {
  const out = [];
  for (const w of workflows) {
    const dir = workflowDir(root, w);
    if (!existsSync(dir)) continue;
    for (const d of liveDecisions(readDecisions(dir))) {
      if (d.stage === 'design' || d.kind === 'design') out.push({ workflow: w, id: d.id, question: d.question ?? d.key ?? null, answer: d.answer ?? null, by: d.by ?? null, at: d.at ?? null });
    }
  }
  return out;
}

/**
 * The fingerprint of what a screen shows: its page and the files of its folder `screens/<key>/`.
 * The canvas keeps the fingerprint of each page that a person saw, and marks a page as changed
 * when its fingerprint differs.
 */
export function pageFingerprint(root, key, html) {
  const hash = createHash('sha1').update(html);
  const walk = (dir) => {
    let names = [];
    try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const d of names.sort((x, y) => x.name.localeCompare(y.name))) {
      const p = join(dir, d.name);
      if (d.isDirectory()) walk(p);
      else { try { hash.update(`\n${d.name}\n`).update(readFileSync(p)); } catch { /* it went away */ } }
    }
  };
  walk(join(surfaceDir(root), SCREENS_DIR, key));
  return hash.digest('hex').slice(0, 16);
}

/** The fingerprint of the token, layout and component sheets together. A sheet that is missing counts as empty. */
export function sheetsFingerprint(root) {
  const hash = createHash('sha1');
  for (const f of [TOKENS_FILE, LAYOUT_SHEET, COMPONENTS_FILE]) {
    let text = '';
    // A checkout can change the line ends, and a change of line ends is no design change.
    try { text = readFileSync(join(surfaceDir(root), f), 'utf8').replace(/\r\n/g, '\n'); } catch { text = ''; }
    // A surface from before the layout sheet keeps the fingerprint it had.
    if (f === LAYOUT_SHEET && !text) continue;
    hash.update(`${f}:${text.length}:`).update(text);
  }
  return hash.digest('hex').slice(0, 16);
}

/** The tokens of a screen page: its own, those its custom properties of the component sheet read, and those of its components. */
function screenTokens(html, components, aliases, known, tokensOfComponent) {
  const own = tokensUsed(html);
  return [...new Set([...own, ...resolveNames(own, aliases, known), ...(components ?? []).flatMap((k) => tokensOfComponent[k] ?? [])])].sort();
}

/**
 * A component of the library as the canvas shows it: its kind, its spec without the cells (the
 * count of the cells stands for them), what the spec lacks, and the tokens it reads.
 */
function componentEntry(root, c, themes, tokens) {
  let spec = null;
  try { spec = componentSpec(readFileSync(componentFile(root, c.key), 'utf8')); } catch { spec = null; }
  const problems = spec ? specProblems(spec, { themes }) : [{ cause: 'no-page', message: 'The component has no page' }];
  return {
    ...c,
    kind: spec?.kind ?? 'component',
    spec: spec ? { declared: spec.declared, variants: spec.variants, states: spec.states, themes: spec.themes, interactive: spec.interactive, cells: spec.cells.length } : null,
    problems,
    tokens,
  };
}

/**
 * The whole canvas state of a repo. The design server asks for it with `full: false`: then a screen
 * carries the counts of its failures, not the failures and their groups, which the server serves
 * for one screen at `failures/<key>.json` (`screenFailures`). The CLI and a published snapshot keep
 * the failures.
 */
export function canvasState(root, { repo = null, writable = true, full = true } = {}) {
  const m = readManifest(root);
  const checks = readChecks(root);
  const layout = readJson(join(surfaceDir(root), LAYOUT_FILE), {});
  const model = readTokenModel(root);
  const known = model.tokens.length ? new Set(model.tokens.map((t) => t.name)) : null;
  const themeNames = (model.themes ?? []).map((t) => t.name);
  // A sheet that is there but does not read fails the build: the server sends the change once it reads.
  const componentsCss = existsSync(join(surfaceDir(root), COMPONENTS_FILE)) ? readFileSync(join(surfaceDir(root), COMPONENTS_FILE), 'utf8') : '';
  const aliases = sheetAliases(noComments(componentsCss));
  const componentKeys = Object.keys(m.components ?? {});
  const tokensOfComponent = componentTokens(componentsCss, componentKeys, known);
  const history = historyAll(root);
  const dirty = dirtyPages(root);
  const captures = capturesIndex(root);
  const failuresOf = new Map();
  for (const f of checks?.failures ?? []) {
    if (!failuresOf.has(f.screen)) failuresOf.set(f.screen, []);
    failuresOf.get(f.screen).push(f);
  }
  // Each page is read once: for its states and links, its tokens, and its components.
  const listed = listScreens(root, { withHtml: true });
  const used = new Map(listed.map((s) => [s.key, componentsUsed(s.html)]));
  const screens = listed.map(({ html, ...s }) => {
    const threads = readComments(root, s.key).threads;
    const failures = failuresOf.get(s.key) ?? [];
    const changes = history.get(screenRel(s.key)) ?? [];
    return {
      ...s,
      fingerprint: pageFingerprint(root, s.key, html),
      // The tokens of the page, the tokens that its custom properties of the component sheet read,
      // and the tokens of each component that it uses.
      tokens: screenTokens(html, used.get(s.key), aliases, known, tokensOfComponent),
      components: used.get(s.key),
      history: changes,
      picture: currentPicture(root, s, changes, dirty),
      threads,
      openComments: threads.filter((t) => t.open).length,
      // One entry for each cause, with its places: the canvas lists these, the CLI prints the same groups.
      ...(full ? { failures, failureGroups: groupFailures(failures) } : {}),
      failureCounts: failureCounts(failures),
      failureTotal: failures.length,
      position: layout.positions?.[s.key] ?? null,
      captures: captures.get(s.key) ?? [],
    };
  });
  const workflows = [...new Set(screens.flatMap((s) => s.workflows ?? []))].sort();
  return {
    schema: STATE_SCHEMA,
    repo,
    writable,
    viewports: m.viewports,
    // The viewport of the approval pictures (design-check.mjs captureScreens).
    pictureViewport: m.viewports?.desktop ? 'desktop' : Object.keys(m.viewports ?? {})[0] ?? null,
    states: STATES,
    areas: m.areas,
    workflows,
    screens,
    versions: versionsOf(root, workflows),
    explore: listExplore(root),
    references: checkReferences(root).references,
    // The sheets that every page links: when this changes, every page shows another design.
    sheets: { fingerprint: sheetsFingerprint(root) },
    // The token model: each token with its kind, its value in each theme and what it is for.
    tokens: model.tokens.map((t) => ({ name: t.name, role: t.role ?? t.name.slice(2), kind: t.kind ?? 'other', value: t.value, values: t.values ?? {}, usedFor: t.usedFor ?? null, alias: t.alias ?? null })),
    themes: model.themes ?? [],
    defaultTheme: model.default ?? themeNames[0] ?? null,
    tokensLegacy: Boolean(model.legacy),
    components: listComponents(root, { uses: listed.map((s) => ({ key: s.key, components: used.get(s.key) })) })
      .map((c) => componentEntry(root, c, themeNames, tokensOfComponent[c.key] ?? [])),
    noComponents: m['no-components'] ?? null,
    decisions: designDecisions(root, workflows),
    cards: designCards(root, screens, checks),
    checks: checks ? { at: checks.at, passed: checks.passed, failures: checks.failures?.length ?? 0 } : null,
  };
}

/** The folder of the canvas page, its style and its script. */
export const CANVAS_DIR = fileURLToPath(new URL('../skills/wf/canvas/', import.meta.url));

/** JSON that is safe inside a script element. */
const scriptJson = (v) => JSON.stringify(v).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');

/**
 * One self-contained page of the canvas: the state, the screen pages and the token sheet inline,
 * with no write route. A comment or a layout change needs the design server.
 */
export function snapshotHtml(root, { repo = null } = {}) {
  const state = canvasState(root, { repo, writable: false });
  const screens = Object.fromEntries(state.screens.filter((s) => existsSync(screenFile(root, s.key))).map((s) => [s.key, readFileSync(screenFile(root, s.key), 'utf8')]));
  const tokens = [TOKENS_FILE, LAYOUT_SHEET, COMPONENTS_FILE].map((f) => join(surfaceDir(root), f)).filter(existsSync).map((f) => readFileSync(f, 'utf8')).join('\n');
  const page = readFileSync(join(CANVAS_DIR, 'index.html'), 'utf8');
  // Each sheet and script of the canvas goes inline; the state goes before the main script.
  const own = (name) => readFileSync(join(CANVAS_DIR, name), 'utf8');
  return page
    .replace(/<link rel="stylesheet" href="\/canvas\/([a-z][a-z0-9-]*\.css)">/g, (all, name) => `<style>\n${own(name)}</style>`)
    .replace(/<script src="\/canvas\/([a-z][a-z0-9-]*\.js)"><\/script>/g, (all, name) => {
      const js = own(name).replace(/<\/script/gi, '<\\/script');
      const first = name === 'canvas.js' ? `<script>window.WF_STATE = ${scriptJson(state)};\nwindow.WF_SNAPSHOT = ${scriptJson({ screens, tokens })};</script>\n` : '';
      return `${first}<script>\n${js}</script>`;
    });
}
