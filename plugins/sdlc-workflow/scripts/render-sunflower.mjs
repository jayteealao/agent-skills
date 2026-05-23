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
 *   --asset-base <path>  Default "/sdlc/_assets"
 *   --plugin-root <path> Default plugin install dir (auto-detected)
 *   --schema <path>      Default <plugin-root>/tests/frontmatter.schema.json
 */

import {
  existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync,
  statSync, rmSync, cpSync,
} from 'node:fs';
import { dirname, resolve, join, relative, basename } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { loadArtifact } from '../renderers/_yaml.mjs';
import { validateFrontmatter, renderWarnBanner } from '../renderers/_validator.mjs';
import { resolveViewPath, siblingPaths, breadcrumbFromView } from '../renderers/_paths.mjs';
import { buildPathMap } from '../renderers/_link-graph.mjs';
import { workSetFilter } from '../renderers/_mtime.mjs';
import { loadHistory } from '../renderers/_history.mjs';
import { renderShell } from '../renderers/_shell.mjs';
import { expand as expandSnippets } from '../components/_components.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT_DEFAULT = resolve(__dirname, '..');

/* ───────────────────────── CLI parsing ───────────────────────── */

function parseArgs(argv) {
  const args = {
    storage:    '.ai/workflows',
    view:       '.ai/_view',
    simplify:   '.ai/simplify',
    profiles:   '.ai/profiles',
    assetBase:  '/sdlc/_assets',
    pluginRoot: PLUGIN_ROOT_DEFAULT,
    schema:     null,
    mode:       'additive',
    onlyGlob:   null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--clean')             args.mode = 'clean';
    else if (a === '--only')         args.onlyGlob = argv[++i];
    else if (a === '--storage')      args.storage = argv[++i];
    else if (a === '--view')         args.view = argv[++i];
    else if (a === '--simplify')     args.simplify = argv[++i];
    else if (a === '--profiles')     args.profiles = argv[++i];
    else if (a === '--asset-base')   args.assetBase = argv[++i];
    else if (a === '--plugin-root')  args.pluginRoot = resolve(argv[++i]);
    else if (a === '--schema')       args.schema = resolve(argv[++i]);
  }
  args.schema ??= join(args.pluginRoot, 'tests', 'frontmatter.schema.json');
  return args;
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

function discoverArtifacts({ storageRoot, simplifyRoot, profilesRoot }) {
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
  return artifacts;
}

/* ───────────────────────── Renderer load ───────────────────────── */

const rendererCache = new Map();
async function loadRenderer(type, pluginRoot) {
  if (rendererCache.has(type)) return rendererCache.get(type);
  const path = join(pluginRoot, 'renderers', `${type}.mjs`);
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
  mkdirSync(dst, { recursive: true });
  cpSync(src, dst, { recursive: true });
}

/* ───────────────────────── Generic fallback renderer ───────────────────────── */

import { md2html } from '../renderers/_markdown.mjs';

function fallbackRender(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const headerHtml = `<header class="artifact-header">
    <h1 class="sdlc-h1">${escape(fm.title ?? fm.type ?? artifact.path)}</h1>
    <div class="sdlc-crumb">${escape(artifact.path)}</div>
  </header>`;
  const bodyHtml = artifact.fragment
    ? `<div class="fragment">${artifact.fragment}</div>`
    : `<div class="prose">${md2html(artifact.body)}</div>`;
  return { headerHtml, bodyHtml, links: [], children: [] };
}

function escape(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ───────────────────────── Main render loop ───────────────────────── */

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cwd = process.cwd();
  const storageRoot  = resolve(cwd, args.storage);
  const viewRoot     = resolve(cwd, args.view);
  const simplifyRoot = resolve(cwd, args.simplify);
  const profilesRoot = resolve(cwd, args.profiles);

  // 1. ensure viewRoot exists; --clean wipes slug folders
  mkdirSync(viewRoot, { recursive: true });
  if (args.mode === 'clean') {
    for (const entry of readdirSync(viewRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name !== '_assets') {
        rmSync(join(viewRoot, entry.name), { recursive: true, force: true });
      }
    }
  }

  // 2. copy assets
  copyAssets(args.pluginRoot, viewRoot);

  // 3. discover artifacts
  const artifacts = discoverArtifacts({ storageRoot, simplifyRoot, profilesRoot });

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
  for (const a of parsed) {
    // v9.23.0 (S2.2) — resolveViewPath now handles off-pipeline kinds
    // when given the kind hint. Drops the prior inline ternary.
    const r = resolveViewPath(a.storageRel, { kind: a.kind });
    if (!r) continue;
    const viewRel = r.viewRel;
    const viewAbs = a.kind === 'workflow'
      ? join(viewRoot, a.slug, viewRel)
      : join(viewRoot, viewRel);
    const storageInputs = [a.mdAbs, a.siblingPaths.yaml, a.siblingPaths.fragment].filter(Boolean);
    a.viewRel = viewRel;
    a.viewAbs = viewAbs;
    a.storageInputs = storageInputs;
    if (!slugArtifacts.has(a.slug)) slugArtifacts.set(a.slug, []);
    slugArtifacts.get(a.slug).push(a);
    if (filter({ storagePath: a.storageRel, storageInputs, viewOutput: viewAbs })) {
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

    const ctx = {
      slug: a.slug,
      slugRoot: a.kind === 'workflow' ? join(storageRoot, a.slug) : null,
      viewRoot: a.kind === 'workflow' ? join(viewRoot, a.slug) : viewRoot,
      assetBase: args.assetBase,
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

    const breadcrumbs = breadcrumbFromView(a.viewRel, a.slug);
    const html = renderShell({
      title:     a.frontmatter?.title ?? `${a.slug} · ${type}`,
      type,
      slug:      a.slug,
      status:    a.frontmatter?.status ?? '',
      breadcrumbs,
      assetBase: args.assetBase,
      headerHtml: result.headerHtml ?? '',
      bodyHtml:   result.bodyHtml ?? '',
      warnBanner,
      storageHref: relative(dirname(a.viewAbs), a.mdAbs).replace(/\\/g, '/'),
      updatedAt:   a.frontmatter?.['updated-at'] ?? '',
    });

    mkdirSync(dirname(a.viewAbs), { recursive: true });
    writeFileSync(a.viewAbs, html, 'utf-8');
    renderedCount++;

    // Drain children (sub-blooms)
    if (result.children?.length) {
      for (const child of result.children) {
        if (child.viewRel && child.html) {
          const childAbs = join(viewRoot, a.slug, child.viewRel);
          mkdirSync(dirname(childAbs), { recursive: true });
          writeFileSync(childAbs, child.html, 'utf-8');
          renderedCount++;
        }
      }
    }
  }

  // 8. dashboard pass — always re-render (one file)
  const dashboardMod = await loadRenderer('dashboard', args.pluginRoot);
  if (dashboardMod?.render) {
    try {
      const slugsSummary = [];
      for (const [slug, list] of slugArtifacts) {
        const indexArt = list.find((x) => x.frontmatter?.type === 'index');
        if (indexArt) slugsSummary.push({ slug, frontmatter: indexArt.frontmatter });
      }
      const result = dashboardMod.render(
        { type: 'dashboard', frontmatter: { title: 'sdlc dashboard' }, body: '', siblingYaml: null, history: [], fragment: null, path: '__dashboard__' },
        { slug: '', viewRoot, assetBase: args.assetBase, allArtifacts: { __summary__: slugsSummary } },
      );
      const html = renderShell({
        title: 'sdlc · dashboard',
        type:  'dashboard',
        slug:  '',
        status: '',
        breadcrumbs: [{ label: 'sdlc', href: './' }],
        assetBase: args.assetBase,
        headerHtml: result.headerHtml ?? '',
        bodyHtml:   result.bodyHtml ?? '',
        upHref: './',
      });
      writeFileSync(join(viewRoot, 'INDEX.html'), html, 'utf-8');
      renderedCount++;
    } catch (err) {
      console.warn(`[dashboard] ${err.message}`);
    }
  }

  // 9. manifest pass
  const manifest = {
    version:     '9.24.0',
    generatedAt: new Date().toISOString(),
    slugs: [...slugArtifacts.keys()].map((slug) => ({
      slug,
      artifacts: (slugArtifacts.get(slug) ?? []).length,
    })),
  };
  writeFileSync(join(viewRoot, 'INDEX.yaml'), `# sdlc view manifest\n${toYaml(manifest)}`, 'utf-8');

  // 10. report
  console.log(`[render] ${slugArtifacts.size} slug${slugArtifacts.size === 1 ? '' : 's'} · ${renderedCount} files written · ${parsed.length - workSet.length} skipped · ${schemaWarnings} schema warnings`);
  if (missingRenderers.size) {
    console.log(`[render] no renderer for: ${[...missingRenderers].join(', ')}`);
  }
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
