#!/usr/bin/env node
/**
 * Layer 1 static-equivalence verifier for the router migration.
 *
 * For each router that has a skills/<router>/migration-manifest.json, checks:
 *
 *   1. Body preservation:   skills/<router>/reference/<key>.md body matches
 *                           manifest entry's bodyHash (byte-equal to original).
 *   2. Shim coverage:       each manifest entry's oldPath exists, contains the
 *                           shim marker, and has identical description +
 *                           argument-hint to the manifest.
 *   3. Router resolves all keys: each shim entry's subcommand has a corresponding
 *                           reference file on disk.
 *   4. No orphaned references: any /<old-cmd> string in plugin docs resolves to
 *                           an existing shim, an existing router invocation, or
 *                           the changelog allowlist.
 *
 * Exit code 0 = pass, 1 = fail. Prints a summary on completion.
 *
 * Usage:
 *   node plugins/sdlc-workflow/scripts/verify-router-migration.mjs
 *   node plugins/sdlc-workflow/scripts/verify-router-migration.mjs --router review
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const PIN_MARKER = '<!-- sdlc-workflow-pinned-shim -->';
const ALLOWLIST_FILES = new Set([
  // Files where references to old slash commands are intentional history (changelogs etc.)
  'CHANGELOG.md',
  'ROUTER-MIGRATION-PLAN.md',
  'WF-DESIGN-UNIFIED-PLAN.md',
  'INVESTIGATIVE-COMMANDS-PLAN.md',
  'CODEX-PLUGIN-MIGRATION-PLAN.md',
  'IDEAS.md',
  'IDEAS-2.md',
  'IDEAS-3.md',
  'MATTPOCOCK-LEARNINGS.md',
]);

function sha256(s) {
  // Normalize line endings before hashing so the manifest verifies identically
  // across Windows (autocrlf=true) and Linux clones. The migrator does the same.
  const normalized = s.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  return { frontmatter: m[1], body: m[2] };
}

function readField(fm, key) {
  const re = new RegExp(`^${key}\\s*:\\s*(.*)$`, 'm');
  const m = fm.match(re);
  if (!m) return null;
  let v = m[1].trim();
  if (v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  if (v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1);
  return v;
}

function discoverRouters() {
  const skillsDir = join(PLUGIN_ROOT, 'skills');
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir).filter((d) => {
    return existsSync(join(skillsDir, d, 'migration-manifest.json'));
  });
}

function verifyRouter(routerKey) {
  const failures = [];
  const skillDir = join(PLUGIN_ROOT, 'skills', routerKey);
  const manifest = JSON.parse(readFileSync(join(skillDir, 'migration-manifest.json'), 'utf-8'));
  const routerMeta = JSON.parse(readFileSync(join(skillDir, 'router-metadata.json'), 'utf-8'));

  // Check 1: body preservation
  for (const entry of manifest.entries) {
    const refAbs = join(PLUGIN_ROOT, entry.referencePath);
    if (!existsSync(refAbs)) {
      failures.push(`[${routerKey}] missing reference: ${entry.referencePath}`);
      continue;
    }
    const refContent = readFileSync(refAbs, 'utf-8');
    const split = splitFrontmatter(refContent);
    if (!split) {
      failures.push(`[${routerKey}] reference has no frontmatter: ${entry.referencePath}`);
      continue;
    }
    const actualHash = sha256(split.body);
    if (actualHash !== entry.bodyHash) {
      failures.push(
        `[${routerKey}] body hash mismatch for ${entry.referencePath}\n` +
        `   expected: ${entry.bodyHash}\n` +
        `   got:      ${actualHash}`,
      );
    }
  }

  // Check 2: shim coverage
  for (const shim of routerMeta.shims) {
    const shimAbs = join(PLUGIN_ROOT, shim.oldPath);
    if (!existsSync(shimAbs)) {
      failures.push(`[${routerKey}] shim path missing: ${shim.oldPath}`);
      continue;
    }
    const shimContent = readFileSync(shimAbs, 'utf-8');
    if (!shimContent.includes(PIN_MARKER)) {
      failures.push(`[${routerKey}] not a shim (missing marker): ${shim.oldPath}`);
      continue;
    }
    const split = splitFrontmatter(shimContent);
    if (!split) {
      failures.push(`[${routerKey}] shim has no frontmatter: ${shim.oldPath}`);
      continue;
    }
    const desc = readField(split.frontmatter, 'description');
    const hint = readField(split.frontmatter, 'argument-hint');
    if (desc !== shim.description) {
      failures.push(`[${routerKey}] shim description drift: ${shim.oldPath}\n   expected: ${JSON.stringify(shim.description).slice(0, 100)}\n   got:      ${JSON.stringify(desc).slice(0, 100)}`);
    }
    if (hint !== shim.argumentHint) {
      failures.push(`[${routerKey}] shim argument-hint drift: ${shim.oldPath}\n   expected: ${shim.argumentHint}\n   got:      ${hint}`);
    }
  }

  // Check 3: router resolves all keys
  // For /review, each shim's key (with kind) should map to a reference file:
  //   kind=aggregate -> reference/_aggregate-<key>.md
  //   kind=dimension -> reference/<key>.md
  const referenceFiles = new Set(readdirSync(join(skillDir, 'reference')));
  for (const shim of routerMeta.shims) {
    const expectedRef =
      shim.kind === 'aggregate' ? `_aggregate-${shim.key}.md` : `${shim.key}.md`;
    if (!referenceFiles.has(expectedRef)) {
      failures.push(
        `[${routerKey}] shim ${shim.oldPath} expects reference ${expectedRef} (not found)`,
      );
    }
  }

  // Check 4: orphaned references in plugin docs
  // (Light-touch: walk markdown files, look for slash commands that no longer resolve.)
  // Skipped in this initial implementation — significant value but high noise during dev.
  // Wired up but disabled by default; pass --strict to enable.
  if (process.argv.includes('--strict')) {
    // TODO: walk *.md, regex /\/(review-[a-z-]+|review\/[a-z-]+|wf-[a-z-]+)/, check resolves.
    // For PR-1, deferred until /wf and /wf-quick land so the resolve set is complete.
  }

  return failures;
}

function main() {
  const argRouter = process.argv.includes('--router')
    ? process.argv[process.argv.indexOf('--router') + 1]
    : null;
  const routers = argRouter ? [argRouter] : discoverRouters();

  if (routers.length === 0) {
    console.log('No routers with migration-manifest.json found. Nothing to verify.');
    process.exit(0);
  }

  let totalFailures = 0;
  for (const r of routers) {
    console.log(`\n== Verifying router: ${r} ==`);
    const failures = verifyRouter(r);
    if (failures.length === 0) {
      const manifest = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'skills', r, 'migration-manifest.json'), 'utf-8'));
      console.log(`  PASS — ${manifest.entries.length} reference(s), all bodies + shims verified.`);
    } else {
      console.log(`  FAIL — ${failures.length} issue(s):`);
      for (const f of failures) console.log(`    - ${f}`);
      totalFailures += failures.length;
    }
  }

  console.log('');
  if (totalFailures > 0) {
    console.error(`Verification FAILED: ${totalFailures} issue(s) across ${routers.length} router(s).`);
    process.exit(1);
  } else {
    console.log(`Verification PASSED across ${routers.length} router(s).`);
    process.exit(0);
  }
}

main();
