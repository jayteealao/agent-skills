#!/usr/bin/env node
/**
 * scripts/stamp-version.mjs — stamp every version carrier from package.json
 * (WIDE-VIEW-REPAIR-PLAN §9.2).
 *
 * package.json is the one source. `npm version <level>` bumps it and then runs
 * the `version` lifecycle script, which calls this stamp, rebuilds
 * (runtime-manifest.json runtimeVersion + dist/), runs verify:versions, and
 * stages each carrier by path.
 *
 * Stamped carriers:
 *   .claude-plugin/plugin.json                 version
 *   .codex-plugin/plugin.json                  version
 *   package-lock.json                          version + packages[""].version
 *   docs/site/nav.html                         brand line `plugin docs · vX.Y.Z`
 *   <repo>/.claude-plugin/marketplace.json     plugins[name=sdlc-workflow].version
 *
 * Derived, NOT stamped here: runtime-manifest.json (scripts/build.mjs writes it)
 * and the rendered page stamp (renderers/_shell.mjs reads runtimeVersion at run
 * time). The catalog's own top-level `version` is the marketplace release line,
 * which the operator bumps; it is not a plugin carrier.
 *
 * Idempotent: a carrier that already holds the version is left untouched. Edits
 * are textual replacements of the one `"version": "…"` token after an anchor,
 * so file formatting (indent, `—` escapes, line endings) survives.
 *
 *   node scripts/stamp-version.mjs            # stamp from package.json
 *   node scripts/stamp-version.mjs --check    # exit 1 when a carrier would change
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PLUGIN_ROOT, '..', '..');

const VERSION_TOKEN = /"version":\s*"[^"]*"/;

/** Replace the first `"version": "…"` token that follows `anchor` (a regex or null = file start). */
function replaceVersionAfter(text, anchor, version) {
  let from = 0;
  if (anchor) {
    const m = anchor.exec(text);
    if (!m) return null;
    from = m.index + m[0].length;
  }
  const rest = text.slice(from);
  const t = VERSION_TOKEN.exec(rest);
  if (!t) return null;
  const replaced = `"version": "${version}"`;
  return text.slice(0, from) + rest.slice(0, t.index) + replaced + rest.slice(t.index + t[0].length);
}

/**
 * Stamp `version` into every carrier under `pluginRoot` / `repoRoot`.
 *
 * @returns {{ version:string, changed:string[], unchanged:string[], missing:string[] }}
 *   paths are relative to `pluginRoot`.
 */
export function stampVersion({ pluginRoot = PLUGIN_ROOT, repoRoot = REPO_ROOT, version, dryRun = false } = {}) {
  const v = version ?? JSON.parse(readFileSync(path.join(pluginRoot, 'package.json'), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(v ?? '')) {
    throw new Error(`stamp-version: package.json version "${v}" is not a semver string`);
  }

  // [absolute path, (text) => text|null] — null means the anchor was not found.
  const carriers = [
    [path.join(pluginRoot, '.claude-plugin', 'plugin.json'), (t) => replaceVersionAfter(t, null, v)],
    [path.join(pluginRoot, '.codex-plugin', 'plugin.json'), (t) => replaceVersionAfter(t, null, v)],
    [path.join(pluginRoot, 'package-lock.json'), (t) => {
      const root = replaceVersionAfter(t, null, v);
      if (root === null) return null;
      // packages[""] is the workspace-root package record: `"": {` directly under `"packages": {`.
      const pkgRoot = replaceVersionAfter(root, /"packages":\s*\{\s*"":\s*\{/, v);
      return pkgRoot ?? root;
    }],
    [path.join(pluginRoot, 'docs', 'site', 'nav.html'), (t) => (
      /plugin docs · v\d+\.\d+\.\d+/.test(t) ? t.replace(/plugin docs · v\d+\.\d+\.\d+/, `plugin docs · v${v}`) : null
    )],
    [path.join(repoRoot, '.claude-plugin', 'marketplace.json'), (t) => replaceVersionAfter(t, /"name":\s*"sdlc-workflow"/, v)],
  ];

  const result = { version: v, changed: [], unchanged: [], missing: [] };
  for (const [abs, stamp] of carriers) {
    const rel = path.relative(pluginRoot, abs).split(path.sep).join('/');
    if (!existsSync(abs)) { result.missing.push(rel); continue; }
    const before = readFileSync(abs, 'utf8');
    const after = stamp(before);
    if (after === null) throw new Error(`stamp-version: no version token found in ${rel}`);
    if (after === before) { result.unchanged.push(rel); continue; }
    if (!dryRun) writeFileSync(abs, after, 'utf8');
    result.changed.push(rel);
  }
  return result;
}

function main() {
  const check = process.argv.includes('--check');
  const r = stampVersion({ dryRun: check });
  for (const p of r.missing) console.warn(`[stamp-version] missing carrier: ${p}`);
  if (check) {
    if (r.changed.length) {
      console.error(`[stamp-version] ${r.changed.length} carrier(s) do not carry v${r.version}:`);
      for (const p of r.changed) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(`[stamp-version] OK — every carrier holds v${r.version}`);
    return;
  }
  for (const p of r.changed) console.log(`[stamp-version] stamped v${r.version} → ${p}`);
  console.log(`[stamp-version] v${r.version}: ${r.changed.length} stamped, ${r.unchanged.length} already current`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
