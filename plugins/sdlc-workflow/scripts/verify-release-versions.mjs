#!/usr/bin/env node
/**
 * scripts/verify-release-versions.mjs — the version-surface guard
 * (SINGLE-SOURCE-PLAN W6).
 *
 * Two surfaces, checked separately because they have different shapes:
 *
 *   1. THREE in-tree carriers must agree on one version:
 *        .claude-plugin/plugin.json · .codex-plugin/plugin.json · package.json
 *      (plus runtime-manifest.json's runtimeVersion, which the build derives
 *      from package.json, and renderers/_shell.mjs PLUGIN_VERSION, which the
 *      render version-gate keys on).
 *   2. The two REPO-ROOT catalogs, which resolve at a pinned commit SHA:
 *        .claude-plugin/marketplace.json pins the plugin version explicitly
 *          → a VERSION check;
 *        .agents/plugins/marketplace.json carries no version field
 *          → a NAME + PATH check (sdlc-workflow at ./plugins/sdlc-workflow).
 *
 * Before the single-source merge the codex tree carried two more manifests
 * that no gate covered; a bump could miss them silently. Now the bump surface
 * is one tree, and this guard fails the release when any carrier drifts.
 *
 *   node scripts/verify-release-versions.mjs          # exit 1 on drift
 *   node scripts/verify-release-versions.mjs --json
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(PLUGIN_ROOT, '..', '..');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

export function checkVersions({ pluginRoot = PLUGIN_ROOT, repoRoot = REPO_ROOT } = {}) {
  const problems = [];
  const carriers = {};

  const claude = path.join(pluginRoot, '.claude-plugin', 'plugin.json');
  const codex = path.join(pluginRoot, '.codex-plugin', 'plugin.json');
  const pkg = path.join(pluginRoot, 'package.json');
  for (const [name, p] of [['claude-plugin', claude], ['codex-plugin', codex], ['package.json', pkg]]) {
    if (!existsSync(p)) { problems.push(`missing carrier: ${path.relative(pluginRoot, p)}`); continue; }
    carriers[name] = readJson(p).version;
  }
  const version = carriers['claude-plugin'];
  for (const [name, v] of Object.entries(carriers)) {
    if (v !== version) problems.push(`${name} carries ${v}, .claude-plugin/plugin.json carries ${version}`);
  }

  // Derived carriers.
  const manifest = path.join(pluginRoot, 'runtime-manifest.json');
  if (existsSync(manifest)) {
    const rv = readJson(manifest).runtimeVersion;
    carriers['runtime-manifest'] = rv;
    if (rv !== version) problems.push(`runtime-manifest.json runtimeVersion ${rv} ≠ ${version} — run \`npm run build\``);
  }
  const shell = path.join(pluginRoot, 'renderers', '_shell.mjs');
  if (existsSync(shell)) {
    const m = /PLUGIN_VERSION = '([^']+)'/.exec(readFileSync(shell, 'utf8'));
    carriers['_shell.mjs'] = m?.[1];
    if (m?.[1] !== version) problems.push(`renderers/_shell.mjs PLUGIN_VERSION ${m?.[1]} ≠ ${version}`);
  }
  const codexName = existsSync(codex) ? readJson(codex).name : null;
  if (codexName !== 'sdlc-workflow') problems.push(`.codex-plugin/plugin.json name is ${codexName}, expected sdlc-workflow`);

  // Root catalogs.
  const claudeCatalog = path.join(repoRoot, '.claude-plugin', 'marketplace.json');
  if (existsSync(claudeCatalog)) {
    const entry = (readJson(claudeCatalog).plugins ?? []).find((p) => p.name === 'sdlc-workflow');
    if (!entry) problems.push('.claude-plugin/marketplace.json has no sdlc-workflow entry');
    else {
      carriers['claude-marketplace'] = entry.version;
      if (entry.version !== version) problems.push(`.claude-plugin/marketplace.json pins ${entry.version} ≠ ${version}`);
      if (entry.source !== './plugins/sdlc-workflow') problems.push(`.claude-plugin/marketplace.json source is ${entry.source}`);
    }
  } else problems.push('missing .claude-plugin/marketplace.json at the repo root');

  const codexCatalog = path.join(repoRoot, '.agents', 'plugins', 'marketplace.json');
  if (existsSync(codexCatalog)) {
    const plugins = readJson(codexCatalog).plugins ?? [];
    const entry = plugins.find((p) => p.name === 'sdlc-workflow');
    if (!entry) problems.push('.agents/plugins/marketplace.json has no sdlc-workflow entry');
    else if (entry.source?.path !== './plugins/sdlc-workflow') problems.push(`.agents/plugins/marketplace.json path is ${entry.source?.path}`);
    if (plugins.some((p) => p.name === 'sdlc-workflow-codex')) problems.push('.agents/plugins/marketplace.json still exposes sdlc-workflow-codex');
  } else problems.push('missing .agents/plugins/marketplace.json at the repo root');

  return { version, carriers, problems };
}

function main() {
  const result = checkVersions();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.problems.length) {
    console.error(`[release-versions] ${result.problems.length} problem(s):`);
    for (const p of result.problems) console.error(`  - ${p}`);
  } else {
    console.log(`[release-versions] OK — v${result.version} on ${Object.keys(result.carriers).length} carriers; both root catalogs point at ./plugins/sdlc-workflow`);
  }
  process.exit(result.problems.length ? 1 : 0);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
