// The data of the canvas: one JSON object that the design server serves and a published
// snapshot inlines. The canvas reads nothing else.
//
// It holds the screens with their states, links, approvals, history, open comments and check
// failures; the versions of each workflow; the positions of the layout; the explore sketches; the references with their check;
// the token model with its themes; the components with their specs and tokens; the design decisions of the workflows; and one design card per slice.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { liveDecisions, readDecisions } from './decisions.mjs';
import { capturesIndex, designRecordsDir, groupFailures, readComments, readChecks } from './design-records.mjs';
import { versionsOf } from './design-versions.mjs';
import { componentFile, componentSpec, componentsUsed, listComponents, specProblems } from './design-components.mjs';
import { COMPONENTS_FILE, LAYOUT_FILE, LAYOUT_SHEET, SCREENS_DIR, STATES, SURFACE_REL, TOKENS_FILE, linksOf, listExplore, readManifest, readTokenModel, screenFile, screenRel, statesOf, surfaceDir, tokensOf } from './design-surface.mjs';
import { mountLogic, pageFacts, sheetFileOf, sheetReasons } from './design-embed.mjs';

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
 * each page costs a walk of the whole history for each page. Null when git gave no answer.
 */
function historyAll(root, limit = 20) {
  reads.git += 1;
  // --relative: the paths start at the root, which may be a folder inside its git repo.
  const r = spawnSync('git', ['-C', root, 'log', '--relative', '--format=%x1e%H%x09%cI%x09%s', '--name-only', '--', `${SURFACE_REL}/${SCREENS_DIR}`],
    { encoding: 'utf8', windowsHide: true, maxBuffer: 256 * 1024 * 1024 });
  const out = new Map();
  if (r.status !== 0) return null;
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

/**
 * The screen pages that differ from the last commit: one git status for every page. `prefix` is
 * the folder of the root inside its git repo. Null when git gave no answer.
 */
function dirtyPages(root, prefix) {
  reads.git += 1;
  // The status takes no lock and writes no index: it runs beside the git commands of a person.
  const r = spawnSync('git', ['-C', root, '--no-optional-locks', 'status', '--porcelain', '--untracked-files=all', '--', `${SURFACE_REL}/${SCREENS_DIR}`], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) return null;
  // git status names paths from the top of the git repo: take off the folder of the root.
  return new Set(r.stdout.split('\n').filter(Boolean).map((l) => l.slice(3).replace(/^"|"$/g, ''))
    .map((p) => (prefix && p.startsWith(prefix) ? p.slice(prefix.length) : p)));
}

/**
 * The approval picture that a screen can show: the approval commit is the newest commit of the
 * page, and the picture is there. The screen shows it only while its page has no change since
 * that commit (`dirtyOf`). The board shows it in place of a live page when it is zoomed far out.
 * The approval takes it in the default state at one viewport.
 */
function approvedPicture(s, history, records, seen) {
  const a = (s.approvals ?? []).at(-1);
  if (!a?.commit || history[0]?.commit !== a.commit) return null;
  const file = records.picture(a.commit, s.key);
  return (seen ? seen.of(file) !== 'missing' : existsSync(file)) ? `approvals/${a.commit}/${s.key}.png` : null;
}
/**
 * The files of the design records of one build: the comments of a screen and an approval picture.
 * The folder of the records is found once for the build, not once for each screen. The places are
 * those of design-records.mjs (commentsPath, approvalPicture).
 */
function recordFiles(root) {
  const dir = designRecordsDir(root);
  return { comments: (key) => join(dir, 'comments', `${key}.json`), picture: (sha, key) => join(dir, 'approvals', sha, `${key}.png`) };
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
/** The count of the failures of one screen for each check (`{ token: 12, layout: 7 }`): the Review view names the causes with them. */
function failureChecks(failures) {
  const counts = {};
  for (const f of failures) if (f.check) counts[f.check] = (counts[f.check] ?? 0) + 1;
  return counts;
}

/* ───────────────────────── git, asked once ───────────────────────── */

/** The folders from `dir` up to the top of the disk. */
function foldersUp(dir) {
  const out = [];
  for (let d = resolve(dir); ; d = dirname(d)) {
    out.push(d);
    if (dirname(d) === d) break;
  }
  return out;
}
/**
 * Where git finds the repo of a folder: for each folder up to the top of the disk, whether it
 * holds `.git` (g) or a `HEAD` of its own (h). The answer of git for the folder stays the same
 * while this text stays the same.
 */
const repoMarks = (root) => foldersUp(root).map((d) => (existsSync(join(d, '.git')) ? 'g' : existsSync(join(d, 'HEAD')) ? 'h' : '-')).join('');

// The git folder of each root, and the folder of the root inside its repo.
const gits = new Map();
/**
 * The git repo of a root: `{ dir, prefix }`, or null for a folder that is no git repo. Git is asked
 * once. It is asked again when a `.git` comes or goes in the folder or in a folder above it, so a
 * folder that becomes a repo while the server runs is seen. A folder with no repo above it costs
 * no git call after the first one.
 */
function gitOf(root) {
  const marks = repoMarks(root);
  const held = gits.get(root);
  if (held?.marks === marks && (!held.dir || existsSync(join(held.dir, 'HEAD')))) return held.dir ? held : null;
  reads.git += 1;
  const r = spawnSync('git', ['-C', root, 'rev-parse', '--absolute-git-dir', '--show-prefix'], { encoding: 'utf8', windowsHide: true });
  if (r.status !== 0) {
    // No folder up to the top holds a repo: the answer is kept. Any other failure (a repo that
    // git refuses, a git that did not start) is asked again each time.
    if (!/[gh]/.test(marks) && !process.env.GIT_DIR) gits.set(root, { marks, dir: null, prefix: '' });
    else gits.delete(root);
    return null;
  }
  const [dir, prefix = ''] = r.stdout.split('\n').map((l) => l.trim());
  const g = { marks, dir, prefix };
  gits.set(root, g);
  return g;
}
/** The git folder that holds the refs and the config: the one of the main worktree. */
function commonDirOf(dir) {
  try { return resolve(dir, readFileSync(join(dir, 'commondir'), 'utf8').trim()); } catch { return dir; }
}
/**
 * The files that hold the commit of HEAD: `HEAD` and its reflog, the file of the branch that HEAD
 * names, the packed refs, and the table list of a reftable repo. A commit, a checkout, a reset or a
 * pull writes one of them, so the history of the pages is the same while they are the same.
 */
function headFiles(dir) {
  const common = commonDirOf(dir);
  const out = [join(dir, 'HEAD'), join(dir, 'logs', 'HEAD'), join(common, 'packed-refs'), join(common, 'reftable', 'tables.list')];
  let ref = null;
  try { ref = /^ref:\s*(\S+)/.exec(readFileSync(join(dir, 'HEAD'), 'utf8'))?.[1] ?? null; } catch { ref = null; }
  if (ref && /^refs\/[A-Za-z0-9._\/-]+$/.test(ref) && !ref.includes('..')) {
    out.push(join(common, ...ref.split('/')));
    if (common !== dir) out.push(join(dir, ...ref.split('/')));
  }
  return out;
}
/**
 * The files that can change the answer of `git status` for a page with no change of the page: the
 * index, the config of the repo, and the ignore and attribute rules from the top of the repo down
 * to the screens. The config of the person and of the computer is not among them.
 */
function statusFiles(root, git) {
  const common = commonDirOf(git.dir);
  const out = [join(git.dir, 'index'), join(common, 'config'), join(git.dir, 'config.worktree'), join(common, 'info', 'exclude'), join(common, 'info', 'attributes')];
  const top = resolve(root, ...git.prefix.split('/').filter(Boolean).map(() => '..'));
  for (const d of foldersUp(join(surfaceDir(root), SCREENS_DIR))) {
    out.push(join(d, '.gitignore'), join(d, '.gitattributes'));
    if (d === top) break;
  }
  return out;
}

/* ───────────────────────── what a build keeps ───────────────────────── */

// A build of the design server keeps what it read from each file (`reuse`): its worker thread
// stays between the builds (design-state-worker.mjs). The next build reads only the files that
// changed. Each kept value has a key: the size and the time of each file that it came from. A
// file system can give two writes the same time, so a value is trusted only when its files were
// older than RACY_MS at the read: a later write then gets a later time. A value from a newer file
// is read again by the next build. The size and time are taken before the file is read, so a
// write during the read gives a key that the next build does not match.
const RACY_MS = 3000;
const keptStates = new Map();
function keptOf(root) {
  if (!keptStates.has(root)) keptStates.set(root, { logic: null, pages: new Map(), parts: new Map(), threads: new Map(), sheets: new Map(), tokens: null, history: null, dirty: null });
  return keptStates.get(root);
}
// What the builds of this process read: a test counts them.
const reads = { pages: 0, parts: 0, threads: 0, git: 0 };
/** The counts of what the state builds of this process read: screen pages, component pages, comment files, git calls. */
export const stateReads = () => ({ ...reads });

const statText = (p) => { try { const st = statSync(p); return `${st.size}\t${st.mtimeMs}`; } catch { return 'missing'; } };
/**
 * The files of one build: `of(path)` is the size and time of a file, from `files` (stateFiles) or
 * from the disk, and `key(paths)` is the key of a value that came from these files, with `settled`
 * true when each file is old enough to trust. `at` is the time before `files` was read.
 */
function seenFiles(files, at) {
  const own = new Map();
  const of = (p) => {
    let v = files.get(p) ?? own.get(p);
    if (v === undefined) { v = statText(p); own.set(p, v); }
    return v;
  };
  const settled = (v) => v === 'missing' || Number(v.slice(v.indexOf('\t') + 1)) < at - RACY_MS;
  const key = (paths) => {
    let ok = true;
    const parts = paths.map((p) => { const v = of(p); ok &&= settled(v); return `${p}\t${v}`; });
    return { key: parts.join('\n'), settled: ok };
  };
  return { of, settled, key };
}
/** A kept value while its key is the same and its files were settled, else a new one from `make`. With no `map`, nothing is kept. */
function kept(map, id, keyOf, make) {
  if (!map) return make();
  const k = keyOf();
  const e = map.get(id);
  if (e?.settled && e.key === k.key) return e.value;
  const value = make();
  map.set(id, { ...k, value });
  return value;
}
/** Drop the kept values of the things that are gone. */
function prune(map, ids) {
  for (const id of map.keys()) if (!ids.has(id)) map.delete(id);
}
/**
 * The files inside the folder of each screen (`screens/<key>/`), as one key for each folder: a Map
 * from the key of the screen, in lower case, to `{ key, settled }`. The fingerprint of a page reads them.
 */
function screenFolders(root, files, seen) {
  const dir = `${join(surfaceDir(root), SCREENS_DIR)}${sep}`;
  const lists = new Map();
  for (const [p, v] of files) {
    if (!p.startsWith(dir)) continue;
    const rest = p.slice(dir.length);
    const cut = rest.indexOf(sep);
    if (cut <= 0) continue;
    const k = rest.slice(0, cut).toLowerCase();
    if (!lists.has(k)) lists.set(k, []);
    lists.get(k).push([rest, v]);
  }
  const out = new Map();
  for (const [k, list] of lists) out.set(k, { key: list.map(([rest, v]) => `${rest}\t${v}`).sort().join('\n'), settled: list.every(([, v]) => seen.settled(v)) });
  return out;
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
  const git = gitOf(root);
  if (git) {
    for (const g of headFiles(git.dir)) {
      try { const st = statSync(g); out.set(g, `${st.size}\t${st.mtimeMs}`); } catch { /* no such file in this repo */ }
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

/** The tokens of a screen page: its own (`own`), those its custom properties of the component sheet read, and those of its components. */
function screenTokens(own, components, aliases, known, tokensOfComponent) {
  return [...new Set([...own, ...resolveNames(own, aliases, known), ...(components ?? []).flatMap((k) => tokensOfComponent[k] ?? [])])].sort();
}

/**
 * What the state takes from the text of one screen page: its states and links, its fingerprint,
 * its tokens and components, and what the page says about a frame (`embed`, design-embed.mjs
 * pageFacts). It depends on the page and on the files of its folder only.
 */
function readPage(root, key, logic) {
  reads.pages += 1;
  let html = '';
  try { html = readFileSync(screenFile(root, key), 'utf8'); } catch { html = ''; }
  const embed = html && logic ? embedOf(root, screenFile(root, key), html, logic) : null;
  return { exists: Boolean(html), states: statesOf(html), links: linksOf(html), fingerprint: pageFingerprint(root, key, html), own: tokensUsed(html), used: componentsUsed(html), embed };
}
/** What the state takes from the text of one component page: its spec, and what the page says about a frame. */
function readPart(root, key, logic) {
  reads.parts += 1;
  let html = null;
  try { html = readFileSync(componentFile(root, key), 'utf8'); } catch { html = null; }
  let spec = null;
  try { spec = html === null ? null : componentSpec(html); } catch { spec = null; }
  return { spec, embed: html && logic ? embedOf(root, componentFile(root, key), html, logic) : null };
}
/**
 * What a page says about a frame: `own`, true when its own text keeps it in a frame, and `sheets`,
 * the files of the surface that it links as sheets, each `{ file, media }`. Null when the rules
 * cannot read the page: then the state says nothing about its frame.
 */
function embedOf(root, file, html, logic) {
  try {
    const facts = pageFacts(html, logic, { first: true });
    const sheets = facts.sheets.map(({ href, media }) => ({ file: sheetFileOf(surfaceDir(root), file, href), media })).filter((s) => s.file);
    return { own: facts.reasons.length > 0, sheets };
  } catch { return null; }
}

// The order of the screens, as listScreens gives it (design-surface.mjs): the area, the flow, the order in the flow, the key.
const byPlace = (a, b) => String(a.area ?? '').localeCompare(String(b.area ?? '')) || String(a.flow ?? '').localeCompare(String(b.flow ?? '')) || (a.order ?? 999) - (b.order ?? 999) || a.key.localeCompare(b.key);

/**
 * A component of the library as the canvas shows it: its kind, its spec without the cells (the
 * count of the cells stands for them), what the spec lacks, and the tokens it reads. `framed` is
 * there when the canvas must draw the page in a frame.
 */
function componentEntry(c, spec, themes, tokens, framed) {
  const problems = spec ? specProblems(spec, { themes }) : [{ cause: 'no-page', message: 'The component has no page' }];
  return {
    ...c,
    kind: spec?.kind ?? 'component',
    spec: spec ? { declared: spec.declared, variants: spec.variants, states: spec.states, themes: spec.themes, interactive: spec.interactive, cells: spec.cells.length } : null,
    problems,
    tokens,
    ...(framed ? { framed: true } : {}),
  };
}

/**
 * The pages among `keys` that differ from the last commit, as their paths from the root. Git is
 * asked only when a screen can show an approval picture. With `memo`, the answer is kept while
 * the commit of HEAD, the index, the rules of the repo and each of these pages are the same.
 */
function dirtyOf(root, git, keys, memo, seen) {
  if (!git || !keys.length) return new Set();
  const rels = keys.map((k) => screenRel(k));
  const ask = () => { const all = dirtyPages(root, git.prefix); return all ? new Set(rels.filter((r) => all.has(r))) : null; };
  if (!memo) return ask() ?? new Set();
  const index = join(git.dir, 'index');
  const k = seen.key([...headFiles(git.dir), ...statusFiles(root, git), ...keys.map((x) => screenFile(root, x))]);
  if (memo.dirty?.settled && memo.dirty.key === k.key) return memo.dirty.value;
  const value = ask();
  // A failed answer is not kept. An index that changed while git read it is not kept either.
  memo.dirty = value && statText(index) === seen.of(index) ? { ...k, value } : null;
  return value ?? new Set();
}

/**
 * The whole canvas state of a repo. The design server asks for it with `full: false`: then a screen
 * carries the counts of its failures, not the failures and their groups, which the server serves
 * for one screen at `failures/<key>.json` (`screenFailures`). The CLI and a published snapshot keep
 * the failures.
 *
 * A screen or a component whose page the canvas must draw in a frame carries `framed: true`
 * (design-embed.mjs); any other has no such field.
 *
 * With `reuse`, the build keeps what it read from each file for the next build of this process,
 * and reads again only what changed ("what a build keeps", above). The values that it keeps go
 * into the state as they are: a caller that asks with `reuse` must not change the state. `files`
 * is the result of `stateFiles` for this root, when the caller has it, and `at` the time before
 * the caller read it.
 */
export function canvasState(root, { repo = null, writable = true, full = true, reuse = false, files = null, at = null } = {}) {
  const memo = reuse ? keptOf(root) : null;
  if (memo && !files) { at = Date.now(); files = stateFiles(root); }
  const seen = memo ? seenFiles(files, at ?? 0) : null;
  const surface = surfaceDir(root);
  const m = readManifest(root);
  const checks = readChecks(root);
  const layout = readJson(join(surface, LAYOUT_FILE), {});
  const model = readTokenModel(root);
  const known = model.tokens.length ? new Set(model.tokens.map((t) => t.name)) : null;
  const themeNames = (model.themes ?? []).map((t) => t.name);
  // A sheet that is there but does not read fails the build: the server sends the change once it reads.
  const componentsCss = existsSync(join(surface, COMPONENTS_FILE)) ? readFileSync(join(surface, COMPONENTS_FILE), 'utf8') : '';
  const componentKeys = Object.keys(m.components ?? {});
  // The tokens of the component sheet are kept while its text, the components and the token names are the same.
  const sheetKey = `${componentKeys.join('\n')}\n\n${known ? [...known].join('\n') : '-'}`;
  let sheet = memo?.tokens;
  if (!sheet || sheet.css !== componentsCss || sheet.key !== sheetKey) {
    sheet = { css: componentsCss, key: sheetKey, aliases: sheetAliases(noComments(componentsCss)), tokensOfComponent: componentTokens(componentsCss, componentKeys, known) };
    if (memo) memo.tokens = sheet;
  }
  const { aliases, tokensOfComponent } = sheet;

  // The rules of the canvas mount say which pages stay in a frame. Without them no page says so, and the canvas finds out by itself.
  let logic = null;
  try { logic = mountLogic(); } catch { logic = null; }
  if (memo && memo.logic !== logic) {
    memo.pages.clear();
    memo.parts.clear();
    memo.sheets.clear();
    memo.logic = logic;
  }
  // A linked sheet is read once for each build, and its media queries are translated again only when its text changed.
  const sheets = memo?.sheets ?? new Map();
  const sheetTexts = new Map();
  const sheetFrames = (file, media) => {
    if (!sheetTexts.has(file)) { let text = null; try { text = readFileSync(file, 'utf8'); } catch { text = null; } sheetTexts.set(file, text); }
    const text = sheetTexts.get(file);
    if (text == null) return false;
    const id = `${file}\n${media ?? ''}`;
    let e = sheets.get(id);
    if (!e || e.text !== text) { e = { text, framed: sheetReasons(text, media, logic).length > 0 }; sheets.set(id, e); }
    e.used = sheetTexts;
    return e.framed;
  };
  const framedOf = (embed) => Boolean(embed) && (embed.own || embed.sheets.some(({ file, media }) => sheetFrames(file, media)));
  const records = recordFiles(root);

  const git = gitOf(root);
  let history = new Map();
  if (git && !memo) history = historyAll(root) ?? history;
  else if (git) {
    const k = seen.key(headFiles(git.dir));
    if (!(memo.history?.settled && memo.history.key === k.key)) { const value = historyAll(root); memo.history = value ? { ...k, value } : null; }
    history = memo.history?.value ?? history;
  }
  const captures = capturesIndex(root);
  const failuresOf = new Map();
  for (const f of checks?.failures ?? []) {
    if (!failuresOf.has(f.screen)) failuresOf.set(f.screen, []);
    failuresOf.get(f.screen).push(f);
  }
  // Each page is read once: for its states and links, its fingerprint, its tokens, its components and its frame.
  const folders = memo ? screenFolders(root, files, seen) : null;
  const pageKey = (key) => {
    const k = seen.key([screenFile(root, key)]);
    const inner = folders.get(key.toLowerCase());
    return inner ? { key: `${k.key}\n${inner.key}`, settled: k.settled && inner.settled } : k;
  };
  const listed = Object.entries(m.screens).map(([key, s]) => {
    const page = kept(memo?.pages, key, () => pageKey(key), () => readPage(root, key, logic));
    return { page, screen: { key, ...s, exists: page.exists, states: page.states, links: page.links } };
  }).sort((a, b) => byPlace(a.screen, b.screen));
  // The pictures first: git status runs only for the screens that can show one.
  const pictures = new Map();
  for (const { screen: s } of listed) {
    const picture = approvedPicture(s, history.get(screenRel(s.key)) ?? [], records, seen);
    if (picture) pictures.set(s.key, picture);
  }
  const dirty = dirtyOf(root, git, [...pictures.keys()].sort(), memo, seen);
  const screens = listed.map(({ page, screen: s }) => {
    const threads = kept(memo?.threads, s.key, () => seen.key([records.comments(s.key)]), () => { reads.threads += 1; return readComments(root, s.key).threads; });
    const failures = failuresOf.get(s.key) ?? [];
    return {
      ...s,
      fingerprint: page.fingerprint,
      // The tokens of the page, the tokens that its custom properties of the component sheet read,
      // and the tokens of each component that it uses.
      tokens: screenTokens(page.own, page.used, aliases, known, tokensOfComponent),
      components: page.used,
      history: history.get(screenRel(s.key)) ?? [],
      picture: dirty.has(screenRel(s.key)) ? null : pictures.get(s.key) ?? null,
      threads,
      openComments: threads.filter((t) => t.open).length,
      // One entry for each cause, with its places: the canvas lists these, the CLI prints the same groups.
      ...(full ? { failures, failureGroups: groupFailures(failures) } : {}),
      failureCounts: failureCounts(failures),
      failureChecks: failureChecks(failures),
      failureTotal: failures.length,
      position: layout.positions?.[s.key] ?? null,
      captures: captures.get(s.key) ?? [],
      ...(framedOf(page.embed) ? { framed: true } : {}),
    };
  });
  const workflows = [...new Set(screens.flatMap((s) => s.workflows ?? []))].sort();
  const components = listComponents(root, { uses: listed.map(({ page, screen: s }) => ({ key: s.key, components: page.used })) }).map((c) => {
    const part = kept(memo?.parts, c.key, () => seen.key([componentFile(root, c.key)]), () => readPart(root, c.key, logic));
    return componentEntry(c, part.spec, themeNames, tokensOfComponent[c.key] ?? [], framedOf(part.embed));
  });
  if (memo) {
    const keys = new Set(Object.keys(m.screens));
    prune(memo.pages, keys);
    prune(memo.threads, keys);
    prune(memo.parts, new Set(componentKeys));
    for (const [id, e] of memo.sheets) if (e.used !== sheetTexts) memo.sheets.delete(id);
  }
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
    components,
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
