// `wf.mjs design migrate`: move the design boards of a repo onto the design surface, once.
//
// A workflow from before the surface keeps its drawings in `<workflow>/design/`: the working
// manifest `boards.json`, and one frozen copy per confirmed revision, `r<N>/boards.json`. The
// migration turns each board into a screen of `.ai/design/`:
//   - an HTML board becomes a screen page;
//   - a PNG-only board becomes a legacy frame: a screen page that shows the picture, which is
//     copied to `.ai/design/legacy/<key>.png`;
//   - the boards of one surface and state in several viewports become one screen: each board
//     stays a page of its own, `screens/<key>/<viewport>.html`, and the screen page opens the
//     page whose viewport is nearest to its own width;
//   - each revision becomes one commit of the product repo, in order, and the working boards one
//     more commit when they changed after the last revision;
//   - the contract `02c-craft.md` gets `screens:` and the commit of the revision it confirmed;
//   - the verify captures are copied to the records, under the screen keys.
// `.ai/design/migrated.json` maps each old board key to its screen key. The old files stay where
// they are, so the old paths keep working. A board that has no file but a claude.ai link must be
// exported first: the migration lists it and does not migrate that workflow.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { commitSurface } from './design-approve.mjs';
import { boardsRef, isInsidePath, parseBoardKey, readManifest as readBoards } from './design-boards.mjs';
import { capturePicture } from './design-records.mjs';
import { KEY_RE, MANIFEST_FILE, SURFACE_REL, SCREENS_DIR, initSurface, readManifest, screenFile, screenRel, surfaceDir, writeManifest } from './design-surface.mjs';
import { frontmatterOfDoc, setFields } from './records.mjs';
import { workflowDir, workflowsRoot } from './records-root.mjs';

export const LEGACY_DIR = 'legacy';
export const MIGRATED_FILE = 'migrated.json';
export const MIGRATED_SCHEMA = 'sdlc/design-migrated/v1';
const CONTRACT = '02c-craft.md';

const posix = (p) => String(p).split('\\').join('/');
const nowIso = (d) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const legacyRel = (key) => `${SURFACE_REL}/${LEGACY_DIR}/${key}.png`;
const migratedPath = (root) => join(surfaceDir(root), MIGRATED_FILE);

function readJson(file, fallback) {
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return fallback; }
}

/** The map of the earlier migrations: `{ schema, workflows: { slug: {...} } }`. */
export function readMigrated(root) {
  const j = readJson(migratedPath(root), null);
  return j && typeof j === 'object' && j.workflows ? j : { schema: MIGRATED_SCHEMA, workflows: {} };
}

/**
 * The screen key of a board key: the surface and the state joined by one dash, with the state
 * `default` and the viewport left out. `home--default` → `home`, `home--error--phone` → `home-error`.
 */
export function screenKeyOf(boardKey) {
  const p = parseBoardKey(boardKey);
  if (!p) return null;
  return [p.surface, ...(p.state === 'default' ? [] : [p.state])].join('-');
}

/** The surface and state of a board key, without the viewport: the boards of one screen share it. */
const groupOf = (boardKey) => {
  const p = parseBoardKey(boardKey);
  return p ? `${p.surface}--${p.state}` : boardKey;
};

/**
 * The screen keys of all board keys of one workflow. The boards of one surface and state share
 * one screen key. Two groups that give one screen key, or a screen key that a screen of another
 * workflow already holds, get the surface and state in full, and then the slug in front.
 */
export function keyMap(boardKeys, slug, taken = new Map()) {
  const groups = [...new Set(boardKeys.map(groupOf))].sort();
  const short = new Map();
  for (const g of groups) short.set(screenKeyOf(g), [...(short.get(screenKeyOf(g)) ?? []), g]);
  const used = new Set();
  const byGroup = {};
  for (const g of groups) {
    const free = (key) => key && KEY_RE.test(key) && !used.has(key) && (!taken.has(key) || taken.get(key).includes(slug));
    const candidates = [short.get(screenKeyOf(g)).length === 1 ? screenKeyOf(g) : null, g.replace(/--/g, '-'), `${slug}-${g.replace(/--/g, '-')}`];
    const key = candidates.find(free);
    if (!key) throw new Error(`no free screen key for the board ${g} of ${slug}`);
    used.add(key);
    byGroup[g] = key;
  }
  return Object.fromEntries([...new Set(boardKeys)].sort().map((k) => [k, byGroup[groupOf(k)]]));
}

/** The page of a legacy frame: the picture of a PNG-only board, at its own size. */
export function legacyPage(key, title, from, src = `../${LEGACY_DIR}/${key}.png`) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="wf:screen" content="${key}">
<meta name="wf:legacy" content="${esc(from)}">
<title>${esc(title)}</title>
<style>body { margin: 0; } img { display: block; max-width: 100%; height: auto; }</style>
</head>
<body>
<main><img src="${esc(src)}" alt="${esc(title)}"></main>
</body>
</html>
`;
}

/** An HTML board as a screen page: the same page, with the screen meta tags in its head. */
export function screenFromBoard(html, key, from) {
  const tags = `<meta name="wf:screen" content="${key}">\n<meta name="wf:migrated-from" content="${esc(from)}">\n`;
  const text = String(html).replace(/<meta\s+name=["']wf:(?:screen|migrated-from)["'][^>]*>\s*/gi, '');
  const head = /<head[^>]*>/i.exec(text);
  return head ? `${text.slice(0, head.index + head[0].length)}\n${tags}${text.slice(head.index + head[0].length)}` : `${tags}${text}`;
}

/**
 * The screen page of a surface and state that has a board for each of several viewports: it opens
 * the page whose viewport width is nearest to its own width, with the same query string. The canvas
 * and the checks give the page the width of the viewport, so each viewport shows its own board.
 */
export function viewportPage(key, title, from, variants) {
  const list = JSON.stringify(variants.map((v) => ({ w: v.width, href: `${key}/${v.name}.html` })));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="wf:screen" content="${key}">
<meta name="wf:migrated-from" content="${esc(from)}">
<title>${esc(title)}</title>
<script>
  // A migrated board had one page per viewport. Open the page nearest to this width.
  (function () {
    var pages = ${list};
    var w = window.innerWidth || 1280;
    var best = pages[0];
    for (var i = 1; i < pages.length; i += 1) if (Math.abs(pages[i].w - w) < Math.abs(best.w - w)) best = pages[i];
    location.replace(best.href + location.search);
  })();
</script>
</head>
<body></body>
</html>
`;
}

/** The relative links of a page that point outside it: they break when the page moves. */
export function relativeLinks(html) {
  const out = new Set();
  for (const m of String(html).matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']|url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    const v = (m[1] ?? m[2]).trim();
    if (!v || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/)/i.test(v) || /^(?:\.\/)?[a-z0-9]+(?:-[a-z0-9]+)*\.html(?:[?#].*)?$/.test(v)) continue;
    out.add(v);
  }
  return [...out];
}

/** The revisions of a workflow, in order: `[{ n, rel, dir, manifest }]`, and the working one last as n = null. */
function revisionsOf(designDir) {
  const out = [];
  if (!existsSync(designDir)) return out;
  for (const name of readdirSync(designDir)) {
    const m = /^r(\d+)$/.exec(name);
    if (!m || !statSync(join(designDir, name)).isDirectory()) continue;
    const { manifest, errors } = readBoards(join(designDir, name, 'boards.json'));
    if (manifest && !errors.length) out.push({ n: Number(m[1]), rel: `design/${name}/boards.json`, dir: join(designDir, name), manifest });
  }
  out.sort((a, b) => a.n - b.n);
  const working = readBoards(join(designDir, 'boards.json'));
  if (working.manifest && !working.errors.length && working.manifest.boards.length) out.push({ n: null, rel: 'design/boards.json', dir: designDir, manifest: working.manifest });
  return out;
}

/** The file of a board inside its revision folder, or null. */
function boardSource(dir, board) {
  for (const [kind, rel] of [['html', board.html], ['png', board.png]]) {
    if (!rel || !isInsidePath(rel)) continue;
    const abs = join(dir, ...posix(rel).split('/'));
    if (existsSync(abs)) return { kind, abs, rel: posix(rel) };
  }
  return null;
}

/**
 * The plan of one workflow: what the migration writes, or why it cannot run. Reads only.
 * `taken` maps the screen keys already on the surface to their workflows.
 */
export function planWorkflow(root, slug, taken = new Map()) {
  const dir = workflowDir(root, slug);
  const revisions = revisionsOf(join(dir, 'design'));
  if (!revisions.length) return { slug, skip: 'no boards' };
  const exports = [];
  const missing = [];
  for (const r of revisions) {
    for (const b of r.manifest.boards) {
      if (boardSource(r.dir, b)) continue;
      const where = `${r.rel.replace(/boards\.json$/, '')}${b.html ?? b.png ?? b.key}`;
      if (b.canvas?.link) exports.push({ key: b.key, revision: r.n, file: where, canvas: b.canvas.link });
      else missing.push(where);
    }
  }
  const contract = frontmatterOfDoc(dir, CONTRACT);
  const map = keyMap(revisions.flatMap((r) => r.manifest.boards.map((b) => b.key)), slug, taken);
  const ref = boardsRef(contract);
  const confirmed = ref ? revisions.find((r) => r.rel === ref) ?? null : null;
  return { slug, revisions, map, contract, confirmed, exports, missing, ...(exports.length || missing.length ? { blocked: true } : {}) };
}

/** Write the screens of one revision onto the surface. Returns the paths written and the link warnings. */
function writeRevision(root, slug, rev, map, now) {
  const m = readManifest(root);
  const paths = [];
  const warnings = [];
  const fromOf = (src) => `${slug}/${rev.rel.replace(/boards\.json$/, '')}${src.rel}`;
  const warn = (key, html) => {
    const links = relativeLinks(html);
    if (links.length) warnings.push(`${key}: the board links to ${links.slice(0, 3).join(', ')}${links.length > 3 ? ` and ${links.length - 3} more` : ''}; copy these files and fix the links`);
  };
  const groups = new Map();
  for (const b of rev.manifest.boards) groups.set(map[b.key], [...(groups.get(map[b.key]) ?? []), b]);
  mkdirSync(join(surfaceDir(root), SCREENS_DIR), { recursive: true });
  for (const [key, boards] of groups) {
    const first = boards[0];
    const title = first.caption ?? first.key;
    const legacy = boards.every((b) => boardSource(rev.dir, b).kind === 'png');
    if (boards.length === 1) {
      const src = boardSource(rev.dir, first);
      if (src.kind === 'html') {
        const html = readFileSync(src.abs, 'utf8');
        writeFileSync(screenFile(root, key), screenFromBoard(html, key, fromOf(src)));
        warn(key, html);
      } else {
        mkdirSync(join(surfaceDir(root), LEGACY_DIR), { recursive: true });
        copyFileSync(src.abs, join(surfaceDir(root), LEGACY_DIR, `${key}.png`));
        writeFileSync(screenFile(root, key), legacyPage(key, title, fromOf(src)));
        paths.push(legacyRel(key));
      }
    } else {
      // One page per viewport, and a screen page that opens the nearest one.
      const variants = [];
      for (const b of boards) {
        const src = boardSource(rev.dir, b);
        const name = b.viewport || parseBoardKey(b.key)?.viewport || `v${variants.length + 1}`;
        const width = Number(String(rev.manifest.viewports?.[name] ?? '').split('x')[0]) || 1280;
        const pageRel = `${SURFACE_REL}/${SCREENS_DIR}/${key}/${name}.html`;
        mkdirSync(join(surfaceDir(root), SCREENS_DIR, key), { recursive: true });
        if (src.kind === 'html') {
          const html = readFileSync(src.abs, 'utf8');
          writeFileSync(join(surfaceDir(root), SCREENS_DIR, key, `${name}.html`), screenFromBoard(html, key, fromOf(src)));
          warn(`${key} (${name})`, html);
        } else {
          mkdirSync(join(surfaceDir(root), LEGACY_DIR, key), { recursive: true });
          copyFileSync(src.abs, join(surfaceDir(root), LEGACY_DIR, key, `${name}.png`));
          writeFileSync(join(surfaceDir(root), SCREENS_DIR, key, `${name}.html`), legacyPage(key, title, fromOf(src), `../../${LEGACY_DIR}/${key}/${name}.png`));
          paths.push(`${SURFACE_REL}/${LEGACY_DIR}/${key}/${name}.png`);
        }
        paths.push(pageRel);
        variants.push({ name, width });
      }
      writeFileSync(screenFile(root, key), viewportPage(key, title, `${slug}/${rev.rel}`, variants));
    }
    const was = m.screens[key];
    m.screens[key] = {
      title: was?.title ?? title, area: was?.area ?? null, flow: was?.flow ?? parseBoardKey(first.key).surface, order: was?.order ?? null,
      workflows: [...new Set([...(was?.workflows ?? []), slug])], slices: was?.slices ?? [],
      'created-at': was?.['created-at'] ?? nowIso(now), 'updated-at': nowIso(now), approvals: was?.approvals ?? [],
      ...(legacy ? { legacy: true } : {}),
    };
    for (const b of boards) if (b.viewport && rev.manifest.viewports?.[b.viewport] && !m.viewports[b.viewport]) m.viewports[b.viewport] = rev.manifest.viewports[b.viewport];
    paths.push(screenRel(key));
  }
  writeManifest(root, m);
  return { paths: [...paths, `${SURFACE_REL}/${MANIFEST_FILE}`], warnings };
}

/** Copy the verify captures `design/captures/<slice>/<board>.png` to the records, under the screen keys. */
function copyCaptures(root, slug, map) {
  const dir = join(workflowDir(root, slug), 'design', 'captures');
  let n = 0;
  if (!existsSync(dir)) return n;
  for (const slice of readdirSync(dir)) {
    if (!statSync(join(dir, slice)).isDirectory()) continue;
    for (const f of readdirSync(join(dir, slice))) {
      const board = f.replace(/\.png$/i, '');
      const key = map[board];
      if (!key || !/\.png$/i.test(f)) continue;
      // A capture of one viewport of a screen keeps its viewport in the name.
      const vp = parseBoardKey(board)?.viewport;
      const to = capturePicture(root, slug, slice, vp ? `${key}--${vp}` : key);
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(join(dir, slice, f), to);
      n += 1;
    }
  }
  return n;
}

/** The workflows of the repo whose folder holds design boards. */
export function boardWorkflows(root) {
  const base = workflowsRoot(root);
  if (!existsSync(base)) return [];
  return readdirSync(base).filter((s) => !s.startsWith('_') && !s.startsWith('.') && existsSync(join(base, s, 'design'))).sort();
}

/**
 * Migrate the boards of the repo, or of the given workflows. With `write: false` it only plans.
 * A workflow that is migrated already, or that waits for an export, is left as it is.
 */
export function migrateDesign(root, { slugs = null, write = true, now = new Date() } = {}) {
  const done = readMigrated(root);
  const taken = new Map(Object.entries(readManifest(root).screens).map(([k, s]) => [k, s.workflows ?? []]));
  const results = [];
  let surface = null;
  for (const slug of slugs?.length ? slugs : boardWorkflows(root)) {
    if (done.workflows[slug]) { results.push({ slug, skip: 'migrated already' }); continue; }
    const plan = planWorkflow(root, slug, taken);
    if (plan.skip || plan.blocked || !write) {
      results.push({ slug, ...(plan.skip ? { skip: plan.skip } : {}), ...(plan.blocked ? { blocked: true, exports: plan.exports, missing: plan.missing } : {}),
        ...(plan.map ? { keys: plan.map, revisions: plan.revisions.map((r) => r.n), confirmed: plan.confirmed?.n ?? null } : {}) });
      continue;
    }
    // The surface before the first write: a repo that ignores `.ai/` gets the git rule for `.ai/design/`.
    if (!surface) {
      surface = initSurface(root);
      if (!surface.track.tracked) throw new Error(`.ai/design/ is not tracked in git: ${surface.track.manual}`);
    }
    const commits = {};
    const warnings = new Set();
    for (const rev of plan.revisions) {
      const w = writeRevision(root, slug, rev, plan.map, now);
      w.warnings.forEach((x) => warnings.add(x));
      const label = rev.n === null ? 'the working boards' : `revision ${rev.n}`;
      const c = commitSurface(root, w.paths, `design: ${label} of ${slug}, from its boards`);
      commits[rev.n === null ? 'working' : `r${rev.n}`] = c.commit;
    }
    const approved = plan.confirmed ? commits[`r${plan.confirmed.n}`] : null;
    const screens = plan.confirmed ? [...new Set(plan.confirmed.manifest.boards.map((b) => plan.map[b.key]))] : [];
    const m = readManifest(root);
    if (approved) {
      const at = plan.confirmed.manifest.confirmed?.at(-1)?.at ?? plan.contract?.['confirmed-at'] ?? nowIso(now);
      for (const key of screens) m.screens[key].approvals = [...(m.screens[key].approvals ?? []), { commit: approved, at, workflow: slug, migrated: true }];
      writeManifest(root, m);
    }
    done.workflows[slug] = { at: nowIso(now), commits, keys: plan.map, ...(approved ? { approved: `r${plan.confirmed.n}` } : {}) };
    writeFileSync(migratedPath(root), `${JSON.stringify(done, null, 2)}\n`);
    const last = commitSurface(root, [`${SURFACE_REL}/${MANIFEST_FILE}`, `${SURFACE_REL}/${MIGRATED_FILE}`], `design: map the boards of ${slug} to screens`);
    if (approved && plan.contract) {
      setFields(workflowDir(root, slug), CONTRACT, {
        screens, 'approval-commit': approved, 'direction-confirmed-by': 'migrated', 'migrated-from': plan.confirmed.rel,
      });
    }
    const captures = copyCaptures(root, slug, plan.map);
    for (const k of screens) taken.set(k, [...(taken.get(k) ?? []), slug]);
    for (const k of Object.values(plan.map)) if (!taken.has(k)) taken.set(k, [slug]);
    results.push({ slug, migrated: true, keys: plan.map, commits, mapCommit: last.commit, approved, screens, captures, warnings: [...warnings] });
  }
  return { results };
}
