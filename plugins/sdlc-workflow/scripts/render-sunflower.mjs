#!/usr/bin/env node
/**
 * scripts/render-sunflower.mjs — orchestrator
 *
 * Walks .ai/workflows/, dispatches each artifact to its per-type renderer
 * under renderers/<type>.mjs, emits an HTML site under .ai/_view/.
 *
 * Modes:
 *   --clean       Wipe view slugs first, then render everything.
 *   --only <glob> Render only artifacts whose storage path matches <glob>.
 *   (default)     Additive — render only artifacts whose storage inputs are
 *                 newer than their view counterpart.
 *
 * Flags:
 *   --storage <path>     Default ".ai/workflows"
 *   --view <path>        Default ".ai/_view"
 *   --simplify <path>    Default ".ai/simplify"
 *   --profiles <path>    Default ".ai/profiles"
 *   --docs <path>        Default ".ai/docs"
 *   --asset-base <path>  Override asset URL prefix (default: depth-relative path)
 *   --plugin-root <path> Default plugin install dir (auto-detected)
 *   --schema <path>      Default <plugin-root>/tests/frontmatter.schema.json
 */

import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
  statSync, rmSync, copyFileSync, renameSync, appendFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, resolve, join, relative, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadArtifact } from '../renderers/_yaml.mjs';
import { validateFrontmatter, renderWarnBanner } from '../renderers/_validator.mjs';
import { resolveViewPath, siblingPaths, breadcrumbFromView } from '../renderers/_paths.mjs';
import { buildPathMap, rewriteBodyLinks } from '../renderers/_link-graph.mjs';
import { workSetFilter } from '../renderers/_mtime.mjs';
import { loadHistory } from '../renderers/_history.mjs';
import { renderShell, PLUGIN_VERSION } from '../renderers/_shell.mjs';
import { expand as expandSnippets } from '../components/_components.mjs';
import { loadConfigWithMeta, configHash as computeConfigHash } from '../lib/config.mjs';
import { ensureServeLifecycle } from '../lib/serve-lifecycle.mjs';
import { ensureHubLifecycle } from '../lib/hub-lifecycle.mjs';
import { pidFileStatus, removePidFile, writePidFile } from '../lib/pid-file.mjs';
import { latestMtimeMs, latestTreeMtimeMs, classifyRenderState, viewMtimeForSlug } from '../lib/render-state.mjs';
import { activeWorkflowIndexes, scanWorkflowIndexes } from '../lib/workflow-index.mjs';
import { upsertRegistryEntry } from '../lib/registry.mjs';
import { resolveProjectRoot } from '../lib/project-root.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT_DEFAULT = resolve(__dirname, '..');
// True when the engine runs from a built bundle (dist/render-sunflower.mjs).
// Drives loadRenderer to the dep-inlined dist/renderers in prod while keeping
// source-spawned tests (e2e) and dev on source renderers. See loadRenderer.
const RUNNING_FROM_DIST = basename(__dirname) === 'dist';

// `.ai/_view/<bucket>/` subdir per off-pipeline artifact kind. Single source of
// truth shared by the work-set match path (so `--only <bucket>/**` can target a
// bucket) and the bootstrap freshness scan (which schedules `--only <bucket>/**`
// jobs). The two MUST agree on the bucket string or the job matches nothing —
// the original off-pipeline-never-renders bug. Mirrors renderers/_paths.mjs
// resolveViewPath() (note: `profile` → `profiles`, `deps` → `dep-updates`).
const OFF_PIPELINE_BUCKET = {
  simplify: 'simplify',
  profile:  'profiles',
  deps:     'dep-updates',
  ideation: 'ideation',
};

/* ───────────────────────── CLI parsing ───────────────────────── */

function parseArgs(argv) {
  const args = {
    storage:    '.ai/workflows',
    view:       '.ai/_view',
    simplify:   '.ai/simplify',
    profiles:   '.ai/profiles',
    docs:       '.ai/docs',
    depUpdates: '.ai/dep-updates',
    ideation:   '.ai/ideation',
    assetBase:  null,
    pluginRoot: PLUGIN_ROOT_DEFAULT,
    schema:     null,
    mode:       'additive',
    onlyGlob:   null,
    bootstrap:  false,
    dryRun:     false,
    diag:       false,
    includeProjectContext: true,
    concurrency: null,
    sharedOutput: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--clean')             args.mode = 'clean';
    else if (a === '--only')         args.onlyGlob = argv[++i];
    else if (a === '--bootstrap')    args.bootstrap = true;
    else if (a === '--dry-run')      args.dryRun = true;
    else if (a === '--diag')         args.diag = true;
    else if (a === '--concurrency')  args.concurrency = Number(argv[++i]);
    else if (a === '--include-project-context') args.includeProjectContext = true;
    else if (a === '--no-include-project-context') args.includeProjectContext = false;
    else if (a === '--storage')      args.storage = argv[++i];
    else if (a === '--view')         args.view = argv[++i];
    else if (a === '--simplify')     args.simplify = argv[++i];
    else if (a === '--profiles')     args.profiles = argv[++i];
    else if (a === '--docs')         args.docs = argv[++i];
    else if (a === '--dep-updates')  args.depUpdates = argv[++i];
    else if (a === '--ideation')     args.ideation = argv[++i];
    else if (a === '--asset-base')   args.assetBase = argv[++i];
    else if (a === '--plugin-root')  args.pluginRoot = resolve(argv[++i]);
    else if (a === '--schema')       args.schema = resolve(argv[++i]);
    else if (a === '--no-shared-output') args.sharedOutput = false;
  }
  args.schema ??= join(args.pluginRoot, 'tests', 'frontmatter.schema.json');
  return args;
}

/**
 * Compute a depth-relative asset base for a rendered HTML file.
 * The _assets/ directory always lives at the view root, so the prefix is
 * purely a function of how many directory levels separate fileAbs from viewRoot.
 *
 *   viewRoot/INDEX.html             → '_assets'
 *   viewRoot/slug/INDEX.html        → '../_assets'
 *   viewRoot/slug/stage/INDEX.html  → '../../_assets'
 */
function relativeAssetBase(fileAbs, viewRoot) {
  const up = relative(dirname(fileAbs), viewRoot);
  return up ? `${up.replace(/\\/g, '/')}/_assets` : '_assets';
}

/* ───────────────────────── Storage walk ───────────────────────── */

const STORAGE_EXTS = new Set(['.md', '.yaml', '.html.fragment']);

function* walkStorage(root) {
  if (!existsSync(root)) return;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const abs = join(dir, e.name);
      if (e.isDirectory()) {
        // Skip view tree, dotfiles, node_modules
        if (e.name.startsWith('.') && e.name !== '.ai') continue;
        if (e.name === 'node_modules') continue;
        stack.push(abs);
      } else if (e.isFile()) {
        if (abs.endsWith('.md') || abs.endsWith('.yaml') || abs.endsWith('.html.fragment')) {
          yield abs;
        }
      }
    }
  }
}

/* ───────────────────────── Artifact discovery ───────────────────────── */

function discoverArtifacts({ storageRoot, simplifyRoot, profilesRoot, docsRoot, depUpdatesRoot, ideationRoot, projectRoot, includeProjectContext = true }) {
  const artifacts = [];
  // Workflow tree — bucket .md files (other extensions handled as siblings)
  for (const abs of walkStorage(storageRoot)) {
    if (!abs.endsWith('.md')) continue;
    const rel = relative(storageRoot, abs).replace(/\\/g, '/');
    // The first path segment is the slug. Skip top-level non-slug files.
    const slugParts = rel.split('/');
    if (slugParts.length < 2) continue;
    const slug = slugParts[0];
    const storageRel = slugParts.slice(1).join('/');
    artifacts.push({
      mdAbs: abs,
      slug,
      storageRel,
      kind: 'workflow',
    });
  }
  // Simplify (off-pipeline)
  if (existsSync(simplifyRoot)) {
    for (const abs of walkStorage(simplifyRoot)) {
      if (!abs.endsWith('.md')) continue;
      const rel = relative(simplifyRoot, abs).replace(/\\/g, '/');
      artifacts.push({
        mdAbs: abs,
        slug: '__simplify__',
        storageRel: rel,
        kind: 'simplify',
      });
    }
  }
  // Profiles
  if (existsSync(profilesRoot)) {
    for (const abs of walkStorage(profilesRoot)) {
      if (!abs.endsWith('.md')) continue;
      const rel = relative(profilesRoot, abs).replace(/\\/g, '/');
      artifacts.push({
        mdAbs: abs,
        slug: '__profiles__',
        storageRel: rel,
        kind: 'profile',
      });
    }
  }
  // Documentation run indexes. The wf-docs orchestrator writes audit/generate
  // scratch artifacts under .ai/docs/<run-id>/ as well, but the view only owns
  // the compact docs-index artifact.
  // Dependency-update runs (/wf-quick update-deps) under .ai/dep-updates/<run-id>/.
  if (depUpdatesRoot && existsSync(depUpdatesRoot)) {
    for (const abs of walkStorage(depUpdatesRoot)) {
      if (!abs.endsWith('.md')) continue;
      const rel = relative(depUpdatesRoot, abs).replace(/\\/g, '/');
      artifacts.push({ mdAbs: abs, slug: '__deps__', storageRel: rel, kind: 'deps' });
    }
  }
  // Ideation runs (/wf-quick ideate) under .ai/ideation/.
  if (ideationRoot && existsSync(ideationRoot)) {
    for (const abs of walkStorage(ideationRoot)) {
      if (!abs.endsWith('.md')) continue;
      const rel = relative(ideationRoot, abs).replace(/\\/g, '/');
      artifacts.push({ mdAbs: abs, slug: '__ideation__', storageRel: rel, kind: 'ideation' });
    }
  }
  artifacts.push(...discoverDocsArtifacts({ docsRoot }));
  if (includeProjectContext) {
    artifacts.push(...discoverProjectArtifacts({ projectRoot }));
  }
  return artifacts;
}

function discoverDocsArtifacts({ docsRoot }) {
  const out = [];
  if (!existsSync(docsRoot)) return out;
  for (const abs of walkStorage(docsRoot)) {
    if (!abs.endsWith('.md')) continue;
    const rel = relative(docsRoot, abs).replace(/\\/g, '/');
    out.push({
      mdAbs: abs,
      slug: '__docs__',
      storageRel: rel,
      kind: 'docs',
      siblingRoot: docsRoot,
    });
  }
  return out;
}

function discoverProjectArtifacts({ projectRoot }) {
  const out = [];
  const candidates = [
    { rel: 'PRODUCT.md', type: 'project-context', title: 'Product context', siblingRoot: projectRoot },
    { rel: 'DESIGN.md', type: 'project-context', title: 'Design context', siblingRoot: projectRoot },
    { rel: '.ai/ship-plan.md', type: 'ship-plan', title: 'Ship plan', siblingRoot: projectRoot },
  ];
  for (const candidate of candidates) {
    const mdAbs = join(projectRoot, candidate.rel);
    if (!existsSync(mdAbs)) continue;
    out.push({
      mdAbs,
      slug: '__project__',
      storageRel: candidate.rel.replace(/\\/g, '/'),
      kind: 'project',
      siblingRoot: candidate.siblingRoot,
      syntheticType: candidate.type,
      syntheticTitle: candidate.title,
    });
  }
  return out;
}

/* ───────────────────────── Renderer load ───────────────────────── */

const rendererCache = new Map();
async function loadRenderer(type, pluginRoot) {
  if (rendererCache.has(type)) return rendererCache.get(type);
  // From dist, load the dep-inlined bundled renderers (dist/renderers/<type>);
  // from source, load source renderers. Keying off the engine's own location
  // (RUNNING_FROM_DIST) keeps source-spawned tests/dev on source and prod on
  // bundles — no env flag, no stale-bundle footgun.
  const rendererDir = RUNNING_FROM_DIST
    ? join(pluginRoot, 'dist', 'renderers')
    : join(pluginRoot, 'renderers');
  const path = join(rendererDir, `${type}.mjs`);
  if (!existsSync(path)) {
    rendererCache.set(type, null);
    return null;
  }
  try {
    const mod = await import(pathToFileURL(path).href);
    rendererCache.set(type, mod);
    return mod;
  } catch (err) {
    console.warn(`[renderer] failed to load ${type}: ${err.message}`);
    rendererCache.set(type, null);
    return null;
  }
}

/* ───────────────────────── Asset copy ───────────────────────── */

function copyAssets(pluginRoot, viewRoot) {
  const src = join(pluginRoot, 'assets');
  const dst = join(viewRoot, '_assets');
  if (!existsSync(src)) return;
  copyDirResilient(src, dst);
}

// Copy a directory tree file-by-file, skipping any file whose destination is
// already up to date (same size, dest mtime ≥ src mtime). This avoids the
// wholesale unlink+rewrite that `cpSync({ force: true })` performs on every
// render: an unchanged asset (favicon, css, js, fonts) is never touched, so a
// destination held open by the serve daemon or a browser tab on Windows can't
// trip EBUSY. A file that genuinely changed but is momentarily locked is
// logged and skipped rather than aborting the entire render job.
function copyDirResilient(srcDir, dstDir) {
  mkdirSync(dstDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const s = join(srcDir, entry.name);
    const d = join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirResilient(s, d);
    } else if (entry.isFile()) {
      try {
        if (assetUpToDate(s, d)) continue;
        copyFileSync(s, d);
      } catch (err) {
        console.warn(`[assets] skipped ${entry.name}: ${err.code ?? err.message}`);
      }
    }
  }
}

function assetUpToDate(src, dst) {
  if (!existsSync(dst)) return false;
  try {
    if (statSync(src).size !== statSync(dst).size) return false;
    // Sizes match — compare bytes to catch same-size edits an mtime heuristic
    // misses (e.g. a git checkout that preserves timestamps). Assets are few and
    // small, so a full read is cheap and exact; identical files are skipped, so
    // an open browser/serve handle never trips an unlink (EBUSY).
    return readFileSync(src).equals(readFileSync(dst));
  } catch {
    return false;
  }
}

// Atomic write: write a sibling .tmp then rename into place, so a crash or
// ENOSPC mid-write can never leave a torn/zero-byte file that the mtime check
// would later treat as fresh. Mirrors lib/pid-file.mjs. On failure the temp
// file is removed and the error re-thrown for the caller to handle.
function writeFileAtomic(absPath, content) {
  const tmp = `${absPath}.tmp`;
  writeFileSync(tmp, content, 'utf-8');
  try {
    renameSync(tmp, absPath);
  } catch (err) {
    try { rmSync(tmp, { force: true }); } catch { /* ignore */ }
    throw err;
  }
}

// Yield every INDEX.html under a directory tree (used for orphan cleanup).
function* walkViewIndexes(dir) {
  if (!existsSync(dir)) return;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try { entries = readdirSync(d, { withFileTypes: true }); }
    catch { continue; }
    for (const e of entries) {
      const abs = join(d, e.name);
      if (e.isDirectory()) stack.push(abs);
      else if (e.isFile() && e.name === 'INDEX.html') yield abs;
    }
  }
}

/* ───────────────────────── Generic fallback renderer ───────────────────────── */

import { md2html } from '../renderers/_markdown.mjs';

function fallbackRender(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const headerHtml = `<header class="artifact-header">
    <h1 class="sdlc-h1">${escape(fm.title ?? fm.type ?? artifact.path)}</h1>
    <div class="sdlc-crumb">${escape(artifact.path)}</div>
  </header>`;
  // Render BOTH the fragment and the markdown prose. A typed renderer that
  // throws lands here; if we kept only the fragment (the old XOR), the author's
  // prose would silently vanish. The fragment owns rich structure; the prose is
  // the source of record — never drop it on a render failure.
  const bodyHtml = [
    artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : '',
    artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : '',
  ].join('');
  return { headerHtml, bodyHtml, links: [], children: [] };
}

function escape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

function synthesizeProjectFrontmatter(artifact, frontmatter) {
  const fm = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
  if (fm.schema && fm.type) return fm;
  return {
    schema: 'sdlc/v1',
    type: artifact.syntheticType,
    title: fm.title ?? artifact.syntheticTitle ?? basename(artifact.storageRel, '.md'),
    status: fm.status ?? 'active',
    source: artifact.storageRel,
    ...fm,
  };
}

/* ───────────────────────── Main render loop ───────────────────────── */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.bootstrap) {
    await bootstrapMain(args);
    return;
  }
  await renderMain(args);
}

async function renderMain(args) {
  // Climb from the raw cwd to the project root (git toplevel / nearest
  // `.ai/workflows` owner) so a render triggered from a repo subfolder can't
  // emit a second `.ai/_view` tree there. Relative path flags resolve against
  // the project root, not the invocation dir, by design.
  const cwd = resolveProjectRoot();
  const storageRoot  = resolve(cwd, args.storage);
  const viewRoot     = resolve(cwd, args.view);
  const simplifyRoot = resolve(cwd, args.simplify);
  const profilesRoot = resolve(cwd, args.profiles);
  const docsRoot     = resolve(cwd, args.docs);
  const depUpdatesRoot = resolve(cwd, args.depUpdates);
  const ideationRoot   = resolve(cwd, args.ideation);
  const configMeta = await loadConfigWithMeta(cwd);
  const config = configMeta.config;
  const liveReload = config.view?.serve?.enabled === true && config.view?.serve?.liveReload !== false;

  // 1. ensure viewRoot exists; --clean wipes slug folders
  mkdirSync(viewRoot, { recursive: true });

  // Template/version gate. The additive work-set keys ONLY on source-vs-output
  // mtime (see renderers/_mtime.mjs#isDirty), so a renderer/shell/CSS change
  // that bumps PLUGIN_VERSION without touching any artifact leaves every
  // already-rendered page frozen at its old chrome — while the unconditionally
  // recopied assets race ahead, producing split-brain pages (current CSS over
  // stale markup). When the recorded render version differs from the running
  // plugin version, force a clean pass so the new template reaches every page.
  // A missing/unparseable record means a first render (already exhaustive) or a
  // prior clean — either way additive is correct, so we never force a clean
  // loop on absence.
  if (args.mode !== 'clean') {
    try {
      const prior = JSON.parse(readFileSync(join(viewRoot, '.last-render'), 'utf8'));
      if (prior?.version && prior.version !== PLUGIN_VERSION) {
        console.log(`[render] plugin ${prior.version} → ${PLUGIN_VERSION}: template/version changed, forcing clean re-render`);
        args.mode = 'clean';
      }
    } catch { /* no prior record — additive is correct */ }
  }

  if (args.mode === 'clean') {
    for (const entry of readdirSync(viewRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== '_assets') {
        rmSync(join(viewRoot, entry.name), { recursive: true, force: true });
      }
    }
    // Also drop root-level outputs so a stale dashboard/manifest can't survive a
    // --clean (especially when paired with --no-shared-output).
    for (const f of ['INDEX.html', 'INDEX.yaml', '.last-render']) {
      rmSync(join(viewRoot, f), { force: true });
    }
  }

  // 2. copy assets
  copyAssets(args.pluginRoot, viewRoot);

  // 3. discover artifacts
  const artifacts = discoverArtifacts({
    storageRoot,
    simplifyRoot,
    profilesRoot,
    docsRoot,
    depUpdatesRoot,
    ideationRoot,
    projectRoot: cwd,
    includeProjectContext: args.includeProjectContext,
  });
  if (args.diag) {
    console.log(`[render:diag] discovered ${artifacts.length} artifact candidate${artifacts.length === 1 ? '' : 's'}`);
  }
  // Surface config-load warnings on every run (not only --diag) so a malformed
  // sdlc config is never silently ignored. Mirrors bootstrapMain.
  for (const warning of configMeta.warnings) console.warn(`[render] config warning: ${warning}`);

  // 4. parse + bucket per slug
  const parsed = [];
  for (const a of artifacts) {
    const siblings = siblingPaths(a.storageRel);
    // Phase 3 (v9.22.0) — sibling YAML / fragment discovery now spans the
    // three artifact kinds: workflow (rooted at storageRoot/slug), simplify
    // (rooted at simplifyRoot), and profile (rooted at profilesRoot). Prior
    // to this, off-pipeline kinds always passed `null` siblings, so
    // simplify-run + profile renderers never received their siblingYaml.
    const siblingRoot =
      a.kind === 'workflow' ? join(storageRoot, a.slug) :
      a.kind === 'simplify' ? simplifyRoot :
      a.kind === 'profile'  ? profilesRoot :
      a.kind === 'docs'     ? a.siblingRoot :
      a.kind === 'project'  ? a.siblingRoot :
      a.kind === 'deps'     ? depUpdatesRoot :
      a.kind === 'ideation' ? ideationRoot :
      null;
    const yamlAbs     = siblingRoot ? join(siblingRoot, siblings.yaml)     : null;
    const fragmentAbs = siblingRoot ? join(siblingRoot, siblings.fragment) : null;
    let loaded;
    try {
      loaded = loadArtifact(a.mdAbs, yamlAbs);
    } catch (err) {
      console.warn(`[parse] ${a.mdAbs}: ${err.message}`);
      continue;
    }
    if (a.kind === 'project') {
      loaded.frontmatter = synthesizeProjectFrontmatter(a, loaded.frontmatter);
    }
    let fragmentHtml = fragmentAbs && existsSync(fragmentAbs)
      ? readFileSync(fragmentAbs, 'utf-8')
      : null;
    // v9.20.1 — expand `<!-- @include … -->` snippet tokens. Runs after
    // verify-fragment.mjs (Check 7) and before _shell.mjs wraps the doc.
    if (fragmentHtml) {
      try {
        fragmentHtml = expandSnippets(fragmentHtml, {
          componentsRoot: join(args.pluginRoot, 'components'),
          maxDepth: 4,
        });
      } catch (err) {
        console.warn(`[expand] ${fragmentAbs}: ${err.message}`);
      }
    }
    const history = loadHistory(a.mdAbs);
    parsed.push({
      ...a,
      ...loaded,
      fragment: fragmentHtml,
      history,
      siblingPaths: { yaml: yamlAbs, fragment: fragmentAbs },
    });
  }

  // 5. compute work-set (additive default)
  const filter = workSetFilter({ mode: args.mode, onlyGlob: args.onlyGlob });
  const slugArtifacts = new Map();   // slug → all parsed artifacts (for context)
  const workSet = [];
  const viewAbsSeen = new Map();     // viewAbs → "slug/storageRel" (collision guard)
  for (const a of parsed) {
    // v9.23.0 (S2.2) — resolveViewPath now handles off-pipeline kinds
    // when given the kind hint. Drops the prior inline ternary.
    const r = resolveViewPath(a.storageRel, { kind: a.kind });
    if (!r) continue;
    const viewRel = r.viewRel;
    const viewAbs = a.kind === 'workflow'
      ? join(viewRoot, a.slug, viewRel)
      : join(viewRoot, viewRel);
    // Two source artifacts that resolve to the same view path (e.g. the nested
    // slices/<s>/04-plan.md and the flat 04-plan-<s>.md conventions) would
    // silently overwrite each other. Keep the first, warn, and skip the rest.
    if (viewAbsSeen.has(viewAbs)) {
      console.warn(`[render] path collision: ${a.slug}/${a.storageRel} and ${viewAbsSeen.get(viewAbs)} both map to ${viewRel} — keeping the first`);
      continue;
    }
    viewAbsSeen.set(viewAbs, `${a.slug}/${a.storageRel}`);
    const storageInputs = [a.mdAbs, a.siblingPaths.yaml, a.siblingPaths.fragment].filter(Boolean);
    // Namespace the work-set match path so `--only <bucket>/**` can target a
    // bucket. Off-pipeline kinds (simplify/profile/deps/ideation) previously
    // fell through to a bare storageRel with NO prefix, so a bootstrap
    // `--only simplify/**` job could never match them — the root cause of
    // off-pipeline artifacts never rendering on the bootstrap path. The full
    // additive pass (no --only) ignores this string, so the change is targeting-
    // only and never alters which artifacts a no-filter render touches.
    const filterStoragePath =
      a.kind === 'workflow' ? `${a.slug}/${a.storageRel}` :
      a.kind === 'project'  ? `project/${a.storageRel}` :
      a.kind === 'docs'     ? `docs/${a.storageRel}` :
      OFF_PIPELINE_BUCKET[a.kind] ? `${OFF_PIPELINE_BUCKET[a.kind]}/${a.storageRel}` :
      a.storageRel;
    a.viewRel = viewRel;
    a.viewAbs = viewAbs;
    a.storageInputs = storageInputs;
    a.filterStoragePath = filterStoragePath;
    if (!slugArtifacts.has(a.slug)) slugArtifacts.set(a.slug, []);
    slugArtifacts.get(a.slug).push(a);
    if (filter({ storagePath: filterStoragePath, storageInputs, viewOutput: viewAbs })) {
      workSet.push(a);
    }
  }

  // 6. build link-graph pathMap across ALL artifacts (per slug). Pass `kind`
  //    so buildPathMap can route off-pipeline artifacts through the matching
  //    resolveViewPath branch.
  const pathMaps = new Map();
  for (const [slug, list] of slugArtifacts) {
    pathMaps.set(slug, buildPathMap(list.map((x) => ({ path: x.storageRel, kind: x.kind }))));
  }

  // 7. render pass
  let renderedCount = 0;
  let schemaWarnings = 0;
  let missingRenderers = new Set();
  for (const a of workSet) {
    const type = a.frontmatter?.type ?? 'unknown';
    const renderer = await loadRenderer(type, args.pluginRoot);
    if (!renderer) missingRenderers.add(type);

    // Validate frontmatter (warn-banner on failure)
    const validation = validateFrontmatter(a.frontmatter, args.schema);
    const warnBanner = validation.valid ? '' : renderWarnBanner(validation.errors);
    if (!validation.valid) schemaWarnings++;

    const allArtifacts = (slugArtifacts.get(a.slug) ?? []).reduce((acc, x) => {
      const k = x.frontmatter?.type ?? 'unknown';
      (acc[k] ??= []).push(x);
      return acc;
    }, {});

    const displaySlug = a.kind === 'docs' ? 'docs' : a.slug;
    const effectiveAssetBase = args.assetBase ?? relativeAssetBase(a.viewAbs, viewRoot);
    const ctx = {
      slug: displaySlug,
      slugRoot: a.kind === 'workflow' ? join(storageRoot, a.slug) : null,
      viewRoot: a.kind === 'workflow' ? join(viewRoot, a.slug) : viewRoot,
      assetBase: effectiveAssetBase,
      allArtifacts,
      pathMap: pathMaps.get(a.slug),
      mode: args.mode,
    };

    let result;
    try {
      const fn = renderer?.render ?? fallbackRender;
      result = fn({
        type,
        frontmatter: a.frontmatter,
        body: a.body,
        siblingYaml: a.siblingYaml,
        history: a.history,
        fragment: a.fragment,
        path: a.storageRel,
      }, ctx);
    } catch (err) {
      console.warn(`[render] ${a.storageRel}: ${err.stack ?? err.message}`);
      result = fallbackRender({ ...a, type, path: a.storageRel }, ctx);
    }

    // Rewrite inline body links that reference sibling source `.md` files to
    // their rendered view pages (e.g. a plan summary's prose → plan/<slice>/).
    // Central pass so every renderer benefits, not just the ones that opt in.
    result.bodyHtml = rewriteBodyLinks(result.bodyHtml ?? '', {
      pathMap: pathMaps.get(a.slug),
      fromStorageRel: a.storageRel,
      fromViewRel: a.viewRel,
    });

    const breadcrumbs = breadcrumbFromView(a.viewRel, displaySlug);
    const html = renderShell({
      title:     a.frontmatter?.title ?? `${a.slug} · ${type}`,
      type,
      slug:      displaySlug,
      status:    a.frontmatter?.status ?? '',
      breadcrumbs,
      assetBase: effectiveAssetBase,
      headerHtml: result.headerHtml ?? '',
      bodyHtml:   result.bodyHtml ?? '',
      warnBanner,
      storageHref: relative(dirname(a.viewAbs), a.mdAbs).replace(/\\/g, '/'),
      updatedAt:   a.frontmatter?.['updated-at'] ?? '',
      liveReload,
    });

    try {
      mkdirSync(dirname(a.viewAbs), { recursive: true });
      writeFileAtomic(a.viewAbs, html);
      renderedCount++;

      // Drain children (sub-blooms)
      if (result.children?.length) {
        for (const child of result.children) {
          if (child.viewRel && child.html) {
            const childAbs = join(viewRoot, a.slug, child.viewRel);
            mkdirSync(dirname(childAbs), { recursive: true });
            writeFileAtomic(childAbs, child.html);
            renderedCount++;
          }
        }
      }
    } catch (err) {
      // A locked destination (EBUSY/EACCES on Windows when a browser tab or the
      // serve daemon holds the file) must not abort the whole render — warn and
      // move on, consistent with copyDirResilient.
      console.warn(`[render] write failed for ${a.viewRel}: ${err.code ?? err.message}`);
    }
  }

  // Orphan cleanup (additive only — clean mode already wiped). For each slug we
  // touched this run, remove view INDEX.html pages whose source artifact no
  // longer exists. slugArtifacts holds the full current artifact set per slug
  // (history snapshots parse as artifacts too), and no renderer emits child
  // pages, so anything on disk not in `expected` is a true orphan.
  if (args.mode !== 'clean') {
    const touchedSlugs = new Set(workSet.filter((a) => a.kind === 'workflow').map((a) => a.slug));
    for (const slug of touchedSlugs) {
      const expected = new Set((slugArtifacts.get(slug) ?? []).map((a) => a.viewAbs));
      for (const abs of walkViewIndexes(join(viewRoot, slug))) {
        if (!expected.has(abs)) {
          try { rmSync(abs, { force: true }); } catch { /* ignore */ }
        }
      }
    }
  }

  if (args.sharedOutput) {
    // 8. dashboard pass — always re-render (one file)
    const dashboardMod = await loadRenderer('dashboard', args.pluginRoot);
    if (dashboardMod?.render) {
      try {
        const slugsSummary = [];
        for (const [slug, list] of slugArtifacts) {
          if (slug.startsWith('__')) continue;
          // Both full pipeline workflows (type: index) and quick / investigative
          // workflows (type: workflow-index, from /wf-quick) own a 00-index.md
          // and must surface on the dashboard. Fall back to any 00-index.md so a
          // future index variant is never silently dropped — that omission is
          // what previously left workflow-index slug pages rendered-but-
          // unreachable (no dashboard link ever pointed at them).
          const indexArt =
            list.find((x) => x.frontmatter?.type === 'index' || x.frontmatter?.type === 'workflow-index')
            ?? list.find((x) => /(?:^|[\\/])00-index\.md$/.test(x.storageRel ?? ''));
          if (indexArt) slugsSummary.push({ slug, frontmatter: indexArt.frontmatter });
        }
        const projectSummary = (slugArtifacts.get('__project__') ?? []).map((x) => ({
          path: x.storageRel,
          viewRel: x.viewRel,
          frontmatter: x.frontmatter,
        }));
        const result = dashboardMod.render(
          { type: 'dashboard', frontmatter: { title: 'sdlc dashboard' }, body: '', siblingYaml: null, history: [], fragment: null, path: '__dashboard__' },
          { slug: '', viewRoot, assetBase: args.assetBase ?? relativeAssetBase(join(viewRoot, 'INDEX.html'), viewRoot), allArtifacts: { __summary__: slugsSummary, __project__: projectSummary } },
        );
        const html = renderShell({
          title: 'sdlc · dashboard',
          type:  'dashboard',
          slug:  '',
          status: '',
          breadcrumbs: [{ label: 'sdlc', href: './' }],
          assetBase: args.assetBase ?? relativeAssetBase(join(viewRoot, 'INDEX.html'), viewRoot),
          headerHtml: result.headerHtml ?? '',
          bodyHtml:   result.bodyHtml ?? '',
          upHref: './',
          liveReload,
        });
        writeFileAtomic(join(viewRoot, 'INDEX.html'), html);
        renderedCount++;
      } catch (err) {
        console.warn(`[dashboard] ${err.message}`);
      }
    }

    // 9. manifest pass
    const manifest = {
      version:     PLUGIN_VERSION,
      generatedAt: new Date().toISOString(),
      slugs: [...slugArtifacts.keys()]
        .filter((slug) => !slug.startsWith('__'))   // drop synthetic off-pipeline buckets
        .map((slug) => ({
          slug,
          artifacts: (slugArtifacts.get(slug) ?? []).length,
        })),
    };
    writeFileAtomic(join(viewRoot, 'INDEX.yaml'), `# sdlc view manifest\n${toYaml(manifest)}`);
    writeFileAtomic(join(viewRoot, '.last-render'), `${JSON.stringify({
      version: PLUGIN_VERSION,
      renderedAt: manifest.generatedAt,
      renderedCount,
      schemaWarnings,
      configHash: computeConfigHash(config),
    }, null, 2)}\n`);

    // Register this checkout in the machine-wide multi-repo registry, right
    // after the .last-render flush (the registry's freshness signal). This is
    // pure convention — no flag, no new gesture. Best-effort and idempotent:
    // upsertRegistryEntry never throws (the .catch is belt-and-braces), so a
    // registry write can never affect render success — the next render
    // re-registers. See MULTI-REPO-REGISTRY-PLAN §3.4.
    await upsertRegistryEntry({
      projectRoot: cwd,
      viewDir: viewRoot,
      configHash: computeConfigHash(config),
    }).catch(() => {});
  }

  // 10. report
  console.log(`[render] ${slugArtifacts.size} slug${slugArtifacts.size === 1 ? '' : 's'} · ${renderedCount} files written · ${parsed.length - workSet.length} skipped · ${schemaWarnings} schema warnings`);
  if (missingRenderers.size) {
    console.log(`[render] no renderer for: ${[...missingRenderers].join(', ')}`);
  }
}

/* ───────────────────────── Bootstrap render loop ───────────────────────── */

async function bootstrapMain(args) {
  // Same project-root anchoring as renderMain — the SessionStart spawn already
  // passes a resolved root as cwd, so this guards direct CLI invocations.
  const cwd = resolveProjectRoot();
  const storageRoot = resolve(cwd, args.storage);
  const viewRoot = resolve(cwd, args.view);
  const docsRoot = resolve(cwd, args.docs);
  const simplifyRoot   = resolve(cwd, args.simplify);
  const profilesRoot   = resolve(cwd, args.profiles);
  const depUpdatesRoot = resolve(cwd, args.depUpdates);
  const ideationRoot   = resolve(cwd, args.ideation);
  const configMeta = await loadConfigWithMeta(cwd);
  const config = configMeta.config;
  const hash = computeConfigHash(config);
  const logPath = join(viewRoot, '.bootstrap.log');

  mkdirSync(viewRoot, { recursive: true });
  const log = (line) => logBootstrap(logPath, line);
  for (const warning of configMeta.warnings) log(`[config] ${warning}`);

  if (config.view?.bootstrap?.enabled === false) {
    log('[bootstrap] disabled by config');
    return;
  }

  if (existsSync(join(viewRoot, '.render-suppress'))) {
    log('[bootstrap] skipped: .render-suppress present');
    return;
  }

  const pidPath = join(viewRoot, '.bootstrap.pid');
  const status = await pidFileStatus(pidPath);
  if (status.alive) {
    log(`[bootstrap] skipped: already running pid ${status.record.pid}`);
    return;
  }
  if (status.stale) await removePidFile(pidPath);
  await writePidFile(pidPath, { pid: process.pid, kind: 'bootstrap', configHash: hash });

  try {
    const bootstrapConfig = config.view?.bootstrap ?? {};
    const workflows = await scanWorkflowIndexes({ projectRoot: cwd, workflowsRoot: storageRoot });
    const active = activeWorkflowIndexes(workflows);
    for (const invalid of workflows.filter((workflow) => workflow.classification === 'invalid')) {
      log(`[bootstrap] invalid workflow skipped: ${invalid.directorySlug}${invalid.invalidReason ? ` (${invalid.invalidReason})` : ''}`);
    }

    const jobs = [];
    for (const workflow of active) {
      const viewMtime = await viewMtimeForSlug(viewRoot, workflow.directorySlug);
      const state = classifyRenderState({
        latestArtifactMtime: workflow.latestArtifactMtime,
        viewMtime,
        renderMissing: bootstrapConfig.renderMissing !== false,
        renderStale: bootstrapConfig.renderStale !== false,
      });
      log(`[bootstrap] ${state.action} ${workflow.slug} (${state.reason})`);
      if (state.action === 'render') {
        jobs.push({ label: workflow.directorySlug, only: `${workflow.directorySlug}/**`, reason: state.reason });
      }
    }

    if (args.includeProjectContext) {
      const projectArtifacts = discoverProjectArtifacts({ projectRoot: cwd });
      if (projectArtifacts.length) {
        const latestProjectMtime = await latestMtimeMs(projectArtifactInputs(projectArtifacts));
        const projectViewMtime = await latestTreeMtimeMs(join(viewRoot, 'project'));
        const projectState = classifyRenderState({
          latestArtifactMtime: latestProjectMtime,
          viewMtime: projectViewMtime,
          renderMissing: bootstrapConfig.renderMissing !== false,
          renderStale: bootstrapConfig.renderStale !== false,
        });
        log(`[bootstrap] ${projectState.action} project (${projectState.reason})`);
        if (projectState.action === 'render') {
          jobs.push({ label: 'project', only: 'project/**', reason: projectState.reason });
        }
      }
    }

    const docsArtifacts = discoverDocsArtifacts({ docsRoot });
    if (docsArtifacts.length) {
      const latestDocsMtime = await latestMtimeMs(artifactInputs(docsArtifacts));
      const docsViewMtime = await latestTreeMtimeMs(join(viewRoot, 'docs'));
      const docsState = classifyRenderState({
        latestArtifactMtime: latestDocsMtime,
        viewMtime: docsViewMtime,
        renderMissing: bootstrapConfig.renderMissing !== false,
        renderStale: bootstrapConfig.renderStale !== false,
      });
      log(`[bootstrap] ${docsState.action} docs (${docsState.reason})`);
      if (docsState.action === 'render') {
        jobs.push({ label: 'docs', only: 'docs/**', reason: docsState.reason });
      }
    }

    // Off-pipeline artifact roots (simplify, profiles, dep-updates, ideation).
    // The PostToolUse render hook (hooks/render-on-artifact-write.mjs) skips
    // these writes ON PURPOSE and defers to "the next bootstrap render" — so if
    // the bootstrap does not freshness-scan them here, they render NOWHERE and
    // the hook's documented contract is unfulfilled (the simplify-never-renders
    // bug). Each kind owns its `.ai/_view/<bucket>/` tree and a matching
    // `--only <bucket>/**` job; the work-set match path is namespaced with the
    // same bucket (see OFF_PIPELINE_BUCKET + filterStoragePath above).
    for (const [kind, bucket] of Object.entries(OFF_PIPELINE_BUCKET)) {
      const root = { simplify: simplifyRoot, profile: profilesRoot, deps: depUpdatesRoot, ideation: ideationRoot }[kind];
      if (!root || !existsSync(root)) continue;
      const mdFiles = [...walkStorage(root)].filter((p) => p.endsWith('.md'));
      if (!mdFiles.length) continue;
      const latestArtifactMtime = await latestMtimeMs(offPipelineInputs(root, mdFiles));
      const offViewMtime = await latestTreeMtimeMs(join(viewRoot, bucket));
      const offState = classifyRenderState({
        latestArtifactMtime,
        viewMtime: offViewMtime,
        renderMissing: bootstrapConfig.renderMissing !== false,
        renderStale: bootstrapConfig.renderStale !== false,
      });
      log(`[bootstrap] ${offState.action} ${bucket} (${offState.reason})`);
      if (offState.action === 'render') {
        jobs.push({ label: bucket, only: `${bucket}/**`, reason: offState.reason });
      }
    }

    if (args.dryRun) {
      log(`[bootstrap] dry-run complete: ${jobs.length} render job${jobs.length === 1 ? '' : 's'}`);
      return;
    }

    const concurrency = normalizeConcurrency(
      args.concurrency ?? config.view?.render?.concurrency ?? 4,
    );
    const failedJobs = await runRenderJobs(jobs, { args, cwd, concurrency, log });
    if (jobs.length) {
      const sharedCode = await runRenderJob(
        { label: 'shared outputs', only: '__sdlc_shared__/**', reason: 'finalize' },
        { args, cwd, log, sharedOutput: true },
      );
      if (sharedCode) log(`[bootstrap] shared-output pass failed: exit ${sharedCode}`);
    }
    if (failedJobs) {
      log(`[bootstrap] ${failedJobs} render job${failedJobs === 1 ? '' : 's'} failed — see entries above`);
      process.exitCode = 1;
    }
    // Multi-repo hub: when this repo opts in (view.hub.enabled), start the
    // single machine-wide hub. It is PRIMARY on 4173 (Q4 resolved), so it starts
    // BEFORE ensureServeLifecycle — that way the per-repo daemon's hub guard
    // sees a live hub and yields (returns hub-active, or binds 4174 if the user
    // force-enabled a direct daemon too). This refines the plan's "after
    // ensureServeLifecycle" wording so the 4173-collision resolution actually
    // fires on a cold start. The per-repo render already wrote this repo's shard,
    // so the hub picks it up when it merges shards at startup. Lazy supervision
    // (§11.7): a stale/dead hub is healed here on the next bootstrap at no cost.
    if (config.view?.hub?.enabled === true) {
      await ensureHubLifecycle({ pluginRoot: args.pluginRoot, log });
    }
    await ensureServeLifecycle({
      projectRoot: cwd,
      pluginRoot: args.pluginRoot,
      viewRoot,
      config,
      configHash: hash,
      log,
    });
    log(`[bootstrap] complete: ${jobs.length} render job${jobs.length === 1 ? '' : 's'}`);
  } finally {
    await removePidFile(pidPath);
  }
}

function projectArtifactInputs(projectArtifacts) {
  return artifactInputs(projectArtifacts);
}

function artifactInputs(artifacts) {
  const inputs = [];
  for (const artifact of artifacts) {
    inputs.push(artifact.mdAbs);
    const siblings = siblingPaths(artifact.storageRel);
    inputs.push(join(artifact.siblingRoot, siblings.yaml));
    inputs.push(join(artifact.siblingRoot, siblings.fragment));
  }
  return inputs;
}

// Freshness inputs for an off-pipeline root: each .md plus its sibling .yaml and
// .html.fragment (a yaml-only edit must still mark the artifact stale). The
// siblingRoot is the off-pipeline root itself, so paths resolve relative to it.
function offPipelineInputs(root, mdAbsList) {
  const inputs = [];
  for (const mdAbs of mdAbsList) {
    inputs.push(mdAbs);
    const siblings = siblingPaths(relative(root, mdAbs).replace(/\\/g, '/'));
    inputs.push(join(root, siblings.yaml));
    inputs.push(join(root, siblings.fragment));
  }
  return inputs;
}

function normalizeConcurrency(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(Math.floor(n), 16);
}

async function runRenderJobs(jobs, { args, cwd, concurrency, log }) {
  if (!jobs.length) return 0;
  let next = 0;
  let failed = 0;
  const workers = Array.from({ length: Math.min(concurrency, jobs.length) }, async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const code = await runRenderJob(job, { args, cwd, log, sharedOutput: false });
      if (code) failed++;
    }
  });
  await Promise.all(workers);
  return failed;
}

function runRenderJob(job, { args, cwd, log, sharedOutput = true }) {
  return new Promise((resolveJob) => {
    log(`[bootstrap] rendering ${job.label} (${job.reason})`);
    const renderArgs = [
      fileURLToPath(import.meta.url),
      '--only', job.only,
      '--storage', args.storage,
      '--view', args.view,
      '--simplify', args.simplify,
      '--profiles', args.profiles,
      '--dep-updates', args.depUpdates,
      '--ideation', args.ideation,
      '--docs', args.docs,
      '--plugin-root', args.pluginRoot,
      '--schema', args.schema,
      ...(args.assetBase ? ['--asset-base', args.assetBase] : []),
      args.includeProjectContext ? '--include-project-context' : '--no-include-project-context',
      sharedOutput ? null : '--no-shared-output',
    ].filter(Boolean);
    const child = spawn(process.execPath, renderArgs, {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('close', (code) => {
      if (stdout.trim()) log(stdout.trim());
      if (stderr.trim()) log(stderr.trim());
      if (code !== 0) log(`[bootstrap] render failed for ${job.label}: exit ${code}`);
      resolveJob(code ?? 0);
    });
  });
}

function logBootstrap(logPath, line) {
  const entry = `[${new Date().toISOString()}] ${line}`;
  try {
    if (existsSync(logPath) && statSync(logPath).size > 1024 * 1024) {
      renameSync(logPath, `${logPath}.1`);   // 1 MB single-generation rotation
    }
  } catch { /* ignore rotation failure */ }
  try { appendFileSync(logPath, `${entry}\n`, 'utf-8'); } catch { /* ignore */ }
  console.log(entry);
}

/* ───────────────────────── Minimal YAML emitter ───────────────────────── */

function toYaml(obj, indent = 0) {
  const pad = '  '.repeat(indent);
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj === 'string') return JSON.stringify(obj);
  if (typeof obj === 'number' || typeof obj === 'boolean') return String(obj);
  if (Array.isArray(obj)) {
    if (!obj.length) return '[]';
    return obj.map((x) => `\n${pad}- ${toYaml(x, indent + 1).replace(/^\s+/, '')}`).join('');
  }
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (!keys.length) return '{}';
    return keys.map((k) => `\n${pad}${k}: ${toYaml(obj[k], indent + 1)}`).join('');
  }
  return String(obj);
}

main().catch((err) => {
  console.error('[render] fatal:', err.stack ?? err.message);
  process.exit(1);
});
