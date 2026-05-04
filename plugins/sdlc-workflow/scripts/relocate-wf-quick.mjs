#!/usr/bin/env node
/**
 * One-shot relocator for the v9.0.0-alpha.2 wf-quick skill bundle.
 *
 * Moves the 10 standalone command bodies under commands/wf-{quick,rca,…}.md
 * into skills/wf-quick/reference/<key>.md, applying the cross-reference
 * rewrite that retargets PR-2 family invocations onto the new dispatcher
 * (e.g. /wf-rca → /wf-quick rca, /wf-intake → /wf-quick intake).
 *
 * The rewrite intentionally also runs on the rest of the plugin tree so that
 * external commands that reference these slash commands stay functional after
 * the originals are deleted. References to commands NOT in the wf-quick
 * bundle (e.g. /wf-implement, /wf-design) are left alone — those are PR-3/PR-4
 * scope.
 *
 *   node plugins/sdlc-workflow/scripts/relocate-wf-quick.mjs
 *
 * Idempotent: running twice is a no-op once the references exist. After the
 * relocation pass, run scripts/migrate-router.mjs --router wf-quick to rebuild
 * the manifest with the new body hashes.
 *
 * Kept in tree post-PR-2 as the audit trail (mirrors rewrite-review-refs.mjs).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

// The 10 commands rolling under /wf-quick. Map source filename -> destination
// reference key. The original /wf-quick command's body becomes reference/quick.md
// (the skill is named wf-quick; the original wf-quick is a sub-command of it).
const RELOCATIONS = [
  { src: 'wf-quick.md',       key: 'quick' },
  { src: 'wf-rca.md',         key: 'rca' },
  { src: 'wf-investigate.md', key: 'investigate' },
  { src: 'wf-discover.md',    key: 'discover' },
  { src: 'wf-hotfix.md',      key: 'hotfix' },
  { src: 'wf-update-deps.md', key: 'update-deps' },
  { src: 'wf-docs.md',        key: 'docs' },
  { src: 'wf-refactor.md',    key: 'refactor' },
  { src: 'wf-ideate.md',      key: 'ideate' },
  { src: 'wf-intake.md',      key: 'intake' },
];

const REF_DIR = join(PLUGIN_ROOT, 'skills', 'wf-quick', 'reference');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');

// Cross-reference rewrites. Order matters: longer source patterns first to
// avoid /wf-update-deps being shadowed by a hypothetical /wf-update rule.
// The destination form mirrors the v9 review pattern: /wf-X <args> becomes
// /wf-quick X <args>.
const REWRITES = RELOCATIONS
  .map(({ src, key }) => ({ from: `/${src.replace(/\.md$/, '')}`, to: `/wf-quick ${key}` }))
  .sort((a, b) => b.from.length - a.from.length);

function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  return { frontmatter: m[1], body: m[2] };
}

// Set of all known destination sub-command keys, used in the idempotency
// guard below. Computed once.
const KNOWN_KEYS = RELOCATIONS.map((r) => r.key);

function rewriteBody(text) {
  let out = text;
  let count = 0;
  for (const { from, to } of REWRITES) {
    // Four-part guard:
    //   (1) escape regex metacharacters in the source slash command.
    //   (2) negative LOOKBEHIND for path-component characters — keeps
    //       /wf-quick from matching inside paths like
    //       `skills/wf-quick/reference/...` where the preceding char is `s`.
    //       A genuine slash-command invocation is preceded by whitespace,
    //       a backtick, or start-of-line — never an identifier or `/`.
    //   (3) negative LOOKAHEAD for an identifier character — keeps /wf-quick
    //       from matching inside /wf-quickly etc.
    //   (4) negative lookahead for whitespace + an already-rewritten
    //       sub-command key — makes the rewrite idempotent. Without this,
    //       running the rewriter twice would turn /wf-quick into
    //       /wf-quick quick into /wf-quick quick quick.
    const escaped = from.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const pathBoundary = `(?<![A-Za-z0-9_/-])`;
    const wordBoundary = `(?![A-Za-z0-9_-])`;
    const idempotencyGuard = `(?!\\s+(?:${KNOWN_KEYS.join('|')})\\b)`;
    const re = new RegExp(`${pathBoundary}${escaped}${wordBoundary}${idempotencyGuard}`, 'g');
    const before = out;
    out = out.replace(re, to);
    if (before !== out) count++;
  }
  return { out, count };
}

function relocateOne({ src, key }) {
  const srcAbs = join(COMMANDS_DIR, src);
  const dstAbs = join(REF_DIR, `${key}.md`);

  if (!existsSync(srcAbs)) {
    if (existsSync(dstAbs)) {
      console.log(`  = ${src} already relocated to reference/${key}.md`);
      return { skipped: true };
    }
    console.warn(`  ! source missing and no destination: ${src}`);
    return { error: true };
  }

  const text = readFileSync(srcAbs, 'utf-8');
  // Rewrite the whole file (frontmatter + body) up front so the description
  // field doesn't keep a stale `/wf-rca for small fixes` reference. The
  // path-boundary + idempotency guards on the rewrite regex make this safe
  // for the YAML frontmatter too.
  const { out: rewrittenText, count } = rewriteBody(text);
  const split = splitFrontmatter(rewrittenText);
  if (!split) {
    console.warn(`  ! ${src}: no frontmatter found`);
    return { error: true };
  }

  // Reference frontmatter keeps description and argument-hint; drops name +
  // disable-model-invocation (no longer addressable as a slash command).
  const fm = split.frontmatter;
  const keptLines = fm.split(/\r?\n/).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return true;
    if (/^name\s*:/.test(trimmed)) return false;
    if (/^disable-model-invocation\s*:/.test(trimmed)) return false;
    return true;
  });
  const newFrontmatter = keptLines.join('\n').replace(/^\n+|\n+$/g, '');

  const refContent = `---\n${newFrontmatter}\n---\n${split.body}`;
  writeFileSync(dstAbs, refContent, 'utf-8');
  console.log(`  + ${src} -> reference/${key}.md  (${count} cross-ref rewrite(s))`);
  return { written: true };
}

function rewriteExternalDocs() {
  // Rewrite wf-quick-family slash references inside other plugin docs (other
  // commands, README, skill bodies, etc.). Skips:
  //   - the source commands we're relocating (they're handled in relocateOne)
  //   - .codex-generated/* (those mirror the old surface and are deleted in
  //     the same PR; rewriting them would just churn deleted files)
  //   - non-markdown files
  //   - allowlisted history files (CHANGELOG, plan docs)
  const skip = new Set(RELOCATIONS.map((r) => join(COMMANDS_DIR, r.src)));
  const allowlist = new Set([
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

  let changed = 0;
  // Skip the wf-quick skill directory in phase 2: phase 1 already rewrote the
  // reference bodies during relocation, and SKILL.md is hand-authored — it
  // mentions /wf-quick/<key> in prose and shouldn't be programmatically rewritten.
  const skillDirAbs = join(PLUGIN_ROOT, 'skills', 'wf-quick');

  function walk(dir) {
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      if (name.isDirectory()) {
        if (name.name === 'node_modules' || name.name === '.git' || name.name === '.codex-generated') continue;
        const sub = join(dir, name.name);
        if (sub === skillDirAbs) continue;
        walk(sub);
      } else if (name.isFile() && name.name.endsWith('.md')) {
        if (allowlist.has(name.name)) continue;
        const path = join(dir, name.name);
        if (skip.has(path)) continue;
        const text = readFileSync(path, 'utf-8');
        const { out, count } = rewriteBody(text);
        if (count > 0) {
          writeFileSync(path, out, 'utf-8');
          console.log(`  ~ ${path.replace(PLUGIN_ROOT, '<plugin>')}  (${count} pattern(s) hit)`);
          changed++;
        }
      }
    }
  }
  walk(PLUGIN_ROOT);
  return changed;
}

function main() {
  console.log('== Phase 1: relocate command bodies into reference/ ==');
  let written = 0;
  for (const r of RELOCATIONS) {
    const result = relocateOne(r);
    if (result.written) written++;
  }
  console.log(`Relocated ${written}/${RELOCATIONS.length} reference(s).`);

  console.log('\n== Phase 2: rewrite external doc cross-refs ==');
  const externals = rewriteExternalDocs();
  console.log(`Rewrote ${externals} external doc(s).`);

  console.log('\nDone. Next: run scripts/migrate-router.mjs --router wf-quick to build the manifest.');
}

main();
