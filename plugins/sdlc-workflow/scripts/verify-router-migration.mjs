#!/usr/bin/env node
/**
 * Layer 1 static-equivalence verifier for the /review skill (v9.0.0-alpha.1+).
 *
 * For each router/skill that has a skills/<key>/migration-manifest.json, checks:
 *
 *   1. Body integrity:        skills/<key>/reference/<dim>.md body matches
 *                             manifest entry's bodyHash. Catches silent drift.
 *   2. Composition validity:  every aggregate listed in router-metadata.json
 *                             references only dimensions that exist as a
 *                             reference file. Sweeps cannot dispatch to a
 *                             missing dimension key.
 *   3. No orphaned references: any /<old-cmd> string in plugin docs resolves
 *                             to a documented invocation, or to the changelog
 *                             allowlist. Flags legacy /review-X, /review:X,
 *                             and /review pass X usage.
 *
 * Exit code 0 = pass, 1 = fail.
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

const ALLOWLIST_FILES = new Set([
  // Files where references to old slash commands are intentional history.
  'CHANGELOG.md',
  'ROUTER-MIGRATION-PLAN.md',
  'WF-DESIGN-UNIFIED-PLAN.md',
  'INVESTIGATIVE-COMMANDS-PLAN.md',
  'CODEX-PLUGIN-MIGRATION-PLAN.md',
  'IDEAS.md',
  'IDEAS-2.md',
  'IDEAS-3.md',
  'MATTPOCOCK-LEARNINGS.md',
  // Skill manifests are descriptive documentation, not callsites: they
  // legitimately reference their own slash invocation in prose. The orphan
  // scan's job is to catch *callers* of removed commands, which by
  // definition are not skill files.
  'SKILL.md',
]);

function sha256(s) {
  const normalized = s.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized, 'utf-8').digest('hex');
}

function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  return { frontmatter: m[1], body: m[2] };
}

function discoverRouters() {
  const skillsDir = join(PLUGIN_ROOT, 'skills');
  if (!existsSync(skillsDir)) return [];
  return readdirSync(skillsDir).filter((d) =>
    existsSync(join(skillsDir, d, 'migration-manifest.json'))
  );
}

function verifyRouter(routerKey) {
  const failures = [];
  const skillDir = join(PLUGIN_ROOT, 'skills', routerKey);
  const manifest = JSON.parse(readFileSync(join(skillDir, 'migration-manifest.json'), 'utf-8'));
  const routerMeta = JSON.parse(readFileSync(join(skillDir, 'router-metadata.json'), 'utf-8'));

  // Check 1: body integrity
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
        `   got:      ${actualHash}\n` +
        `   (re-run scripts/migrate-router.mjs --router ${routerKey} if the body change was intentional)`,
      );
    }
  }

  // Check 2: composition validity — every aggregate references known dimensions
  const dimSet = new Set(routerMeta.dimensions || []);
  for (const [agg, composition] of Object.entries(routerMeta.aggregates || {})) {
    if (!Array.isArray(composition)) {
      failures.push(`[${routerKey}] aggregate "${agg}" composition is not an array`);
      continue;
    }
    if (composition.length === 0) {
      failures.push(`[${routerKey}] aggregate "${agg}" composition is empty`);
      continue;
    }
    for (const d of composition) {
      if (!dimSet.has(d)) {
        failures.push(`[${routerKey}] aggregate "${agg}" references unknown dimension "${d}"`);
      }
    }
  }

  // Check 3: leftover legacy aggregate reference files
  const refFiles = readdirSync(join(skillDir, 'reference'));
  for (const f of refFiles) {
    if (f.startsWith('_aggregate-')) {
      failures.push(`[${routerKey}] legacy aggregate reference present: ${f} (v9.0.0-alpha.1 removed these; delete and re-run migrator)`);
    }
  }

  return failures;
}

function findOrphanedReferences() {
  // Walks all *.md files under the plugin tree and flags any references to
  // legacy slash commands or keywords that no longer have a target.
  const failures = [];
  const legacyPatterns = [
    // /review-<aggregate> with hyphen (pre-v8.32). Path-boundary lookbehind
    // and tighter trailing lookahead so legitimate filename substrings like
    // `reviews/review-infra-security-<date>.md` don't false-positive — those
    // are pre-v9 review artifact paths, not legacy callsites.
    /(?<![A-Za-z0-9_/-])\/review-(?:all|architecture|infra|pre-merge|quick|security|ux)(?![A-Za-z0-9_-])/g,
    // /review:<dimension> with colon (pre-v8.32). Same tightening.
    /(?<![A-Za-z0-9_/-])\/review:[a-z][a-z-]*/g,
    // /review pass <aggregate> (v8.32 syntax, replaced by /review sweep in v9.0.0-alpha.1)
    /(?<![A-Za-z0-9_/-])\/review pass (?:all|architecture|infra|pre-merge|quick|security|ux)(?![A-Za-z0-9_-])/g,
    // /wf-* legacy commands removed by v9.0.0-alpha.2 PR-2 (rolled into /wf-quick).
    // Two negative lookaheads protect against false positives:
    //   - [A-Za-z0-9_-]: keeps the match from extending into legitimate names
    //                    like /wf-quickly (no such command, but defensive).
    //   - /:             keeps the match from firing inside path strings such
    //                    as skills/wf-quick/reference/.
    // Note: `quick` is intentionally NOT in this alternation — /wf-quick is
    // the v9 router name (still valid). The legacy /wf-quick command lives on
    // as /wf-quick quick. The orphan scan only flags the genuinely-removed
    // /wf-rca, /wf-investigate, /wf-discover, etc.
    /\/wf-(?:rca|investigate|discover|hotfix|update-deps|docs|refactor|ideate|intake)(?![A-Za-z0-9_/-])/g,
    // /wf-* legacy commands removed by v9.0.0-alpha.3 PR-3 (rolled into /wf-meta).
    // /wf-meta is the v9 router (no collision with this alternation), so we
    // do NOT need a second negative lookahead — every match is genuinely
    // legacy. Earlier versions had a `(?!\s+KEYS)` lookahead which falsely
    // hid /wf-how callsites whose question payload began with "how".
    /\/wf-(?:next|status|resume|sync|amend|extend|skip|close|how|announce)(?![A-Za-z0-9_/-])/g,
    // /wf-* legacy commands removed by v9.0.0-alpha.4 PR-4 (rolled into /wf).
    // /wf is the v9 router (no collision with this alternation, since the
    // dispatch form is `/wf <key>` with a space, not `/wf-<key>` with a
    // hyphen). The /wf-design exclusion is implicit — `design` is not in the
    // alternation, so /wf-design slips past untouched (it remains its own
    // router).
    /\/wf-(?:shape|slice|plan|implement|verify|review|handoff|ship|retro|instrument|experiment|benchmark|profile)(?![A-Za-z0-9_/-])/g,
  ];

  function walk(dir) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.isDirectory()) {
        if (name.name === 'node_modules' || name.name === '.git' || name.name === '.codex-generated') continue;
        walk(join(dir, name.name));
      } else if (name.isFile() && name.name.endsWith('.md')) {
        if (ALLOWLIST_FILES.has(name.name)) continue;
        const path = join(dir, name.name);
        const text = readFileSync(path, 'utf-8');
        for (const re of legacyPatterns) {
          re.lastIndex = 0;
          let match;
          while ((match = re.exec(text)) !== null) {
            failures.push(`[orphan] ${path.replace(PLUGIN_ROOT, '<plugin>')}: "${match[0]}"`);
          }
        }
      }
    }
  }
  walk(PLUGIN_ROOT);
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
      const meta = JSON.parse(readFileSync(join(PLUGIN_ROOT, 'skills', r, 'router-metadata.json'), 'utf-8'));
      console.log(`  PASS — ${manifest.entries.length} dimension reference(s), ${Object.keys(meta.aggregates || {}).length} aggregate(s), all bodies + compositions verified.`);
    } else {
      console.log(`  FAIL — ${failures.length} issue(s):`);
      for (const f of failures) console.log(`    - ${f}`);
      totalFailures += failures.length;
    }
  }

  console.log(`\n== Orphan reference scan ==`);
  const orphans = findOrphanedReferences();
  if (orphans.length === 0) {
    console.log(`  PASS — no legacy /review-X, /review:X, or /review pass X references outside allowlist.`);
  } else {
    console.log(`  FAIL — ${orphans.length} orphan(s):`);
    for (const f of orphans) console.log(`    - ${f}`);
    totalFailures += orphans.length;
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
