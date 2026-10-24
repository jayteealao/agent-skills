#!/usr/bin/env node
// The docs gate. The user docs are the README and one command page, docs/commands.html, which
// an agent writes and also publishes as an artifact. Three checks:
//   (a) COMMAND PAGE: the <meta name="wf:commands"> line of the page lists exactly the keys,
//       sub-keys and intake modes of skills/wf/keys.json. When the registry changes, an agent
//       updates the page, then the artifact is republished from it.
//   (b) README: at most 150 lines, names the three hosts, and names no retired surface.
//   (c) NO DELETED TREE: no live doc names the deleted plugins/sdlc-workflow-codex tree.
//
//   node scripts/verify-docs.mjs          exit 1 on a finding

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadRegistry } from '../lib/registry.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const COMMAND_PAGE = 'docs/commands.html';

/** Every command name of the registry: `intake`, `intake fix`, `loop goal` … sorted. */
export function registryCommands(reg) {
  const out = [];
  for (const k of reg.keys) {
    out.push(k.name);
    for (const m of k.modes ?? []) out.push(`${k.name} ${m.name}`);
    for (const s of k.subkeys ?? []) out.push(`${k.name} ${s.name}`);
  }
  return out.sort();
}

/** The command names that the page's <meta name="wf:commands"> line lists, or null. */
export function pageCommands(html) {
  const m = /<meta name="wf:commands" content="([^"]*)"/.exec(html);
  return m ? m[1].split(',').map((s) => s.trim()).filter(Boolean).sort() : null;
}

/** What the page and the registry disagree on: { missing, extra }, or null when the page is absent. */
export function commandPageDrift(root = ROOT) {
  const file = path.join(root, COMMAND_PAGE);
  if (!existsSync(file)) return null;
  const listed = pageCommands(readFileSync(file, 'utf8')) ?? [];
  const known = registryCommands(loadRegistry(root));
  return { missing: known.filter((c) => !listed.includes(c)), extra: listed.filter((c) => !known.includes(c)) };
}

export function verifyDocs(root = ROOT) {
  const errors = [];

  // (a) the command page
  const drift = commandPageDrift(root);
  if (!drift) errors.push(`${COMMAND_PAGE}: missing`);
  else {
    if (!pageCommands(readFileSync(path.join(root, COMMAND_PAGE), 'utf8'))) errors.push(`${COMMAND_PAGE}: no <meta name="wf:commands" content="…"> line`);
    if (drift.missing.length) errors.push(`${COMMAND_PAGE}: does not list ${drift.missing.join(', ')}; update the page and republish the artifact`);
    if (drift.extra.length) errors.push(`${COMMAND_PAGE}: lists ${drift.extra.join(', ')}, which the registry does not have`);
  }

  // (b) the README
  const readmePath = path.join(root, 'README.md');
  const readme = existsSync(readmePath) ? readFileSync(readmePath, 'utf8') : '';
  const lines = readme.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n').length;
  if (lines > 150) errors.push(`README.md: ${lines} lines; the cap is 150. Move detail to the command page and link it`);
  for (const forbidden of ['wf-meta', 'wf-quick', 'wf-design', 'wf-docs', 'two hosts', 'docs/site/']) {
    if (readme.includes(forbidden)) errors.push(`README.md: names the retired surface or stale phrase "${forbidden}"`);
  }
  for (const [host, re] of [['Claude Code', /Claude Code/], ['Codex', /\bCodex\b/], ['pi', /\bpi\b/]]) {
    if (!re.test(readme)) errors.push(`README.md: does not name the host ${host}`);
  }

  // (c) no live doc names the deleted tree. The cutover runbook must name it to remove it.
  const internal = path.join(root, 'docs', 'internal');
  const docs = [
    readmePath,
    path.join(root, COMMAND_PAGE),
    ...(existsSync(internal) ? readdirSync(internal).filter((n) => n.endsWith('.md') && !/^SINGLE-SOURCE-/.test(n)).map((n) => path.join(internal, n)) : []),
  ].filter((f) => existsSync(f));
  for (const f of docs) {
    if (/sdlc-workflow-codex/.test(readFileSync(f, 'utf8'))) {
      errors.push(`${path.relative(root, f).replace(/\\/g, '/')}: names the deleted plugins/sdlc-workflow-codex tree; rewrite it, or move a historical plan to docs/internal/archived/`);
    }
  }
  return errors;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const errors = verifyDocs();
  if (errors.length) {
    console.error(`✗ docs verification failed (${errors.length} issue(s)):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✓ docs OK — ${COMMAND_PAGE} lists every command of the registry; README rules hold.`);
}
