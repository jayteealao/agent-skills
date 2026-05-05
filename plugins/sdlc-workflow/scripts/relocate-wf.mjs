#!/usr/bin/env node
/**
 * One-shot relocator for the v9.0.0-alpha.4 wf skill bundle.
 *
 * Moves the 13 lifecycle commands (wf-shape, wf-slice, wf-plan, wf-implement,
 * wf-verify, wf-review, wf-handoff, wf-ship, wf-retro, wf-instrument,
 * wf-experiment, wf-benchmark, wf-profile) into skills/wf/reference/<key>.md,
 * applying the cross-reference rewrite that retargets PR-4 family invocations
 * onto the new dispatcher (e.g. /wf-shape → /wf shape, /wf-implement → /wf
 * implement).
 *
 * The rewrite intentionally also runs on the rest of the plugin tree so that
 * external commands referencing these slash commands stay functional after the
 * originals are deleted. References to commands NOT in the wf bundle (e.g.
 * /wf-design, /wf-quick X, /wf-meta X) are left alone — those are either
 * already-migrated routers or out-of-scope for PR-4.
 *
 *   node plugins/sdlc-workflow/scripts/relocate-wf.mjs
 *
 * Idempotent: running twice is a no-op once the references exist. After the
 * relocation pass, run scripts/migrate-router.mjs --router wf to rebuild the
 * manifest with the new body hashes.
 *
 * Kept in tree post-PR-4 as the audit trail (mirrors relocate-wf-meta.mjs and
 * relocate-wf-quick.mjs).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

// The 13 commands rolling under /wf. Each command's basename strips the wf-
// prefix to produce the sub-key (so /wf-shape becomes /wf shape).
const RELOCATIONS = [
  { src: 'wf-shape.md',      key: 'shape' },
  { src: 'wf-slice.md',      key: 'slice' },
  { src: 'wf-plan.md',       key: 'plan' },
  { src: 'wf-implement.md',  key: 'implement' },
  { src: 'wf-verify.md',     key: 'verify' },
  { src: 'wf-review.md',     key: 'review' },
  { src: 'wf-handoff.md',    key: 'handoff' },
  { src: 'wf-ship.md',       key: 'ship' },
  { src: 'wf-retro.md',      key: 'retro' },
  { src: 'wf-instrument.md', key: 'instrument' },
  { src: 'wf-experiment.md', key: 'experiment' },
  { src: 'wf-benchmark.md',  key: 'benchmark' },
  { src: 'wf-profile.md',    key: 'profile' },
];

const REF_DIR = join(PLUGIN_ROOT, 'skills', 'wf', 'reference');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');

// Cross-reference rewrites. Order matters: longer source patterns first to
// avoid /wf-instrument being shadowed by a hypothetical /wf-inst rule.
// The destination form mirrors PR-2/PR-3: /wf-X <args> becomes /wf X <args>.
const REWRITES = RELOCATIONS
  .map(({ src, key }) => ({ from: `/${src.replace(/\.md$/, '')}`, to: `/wf ${key}` }))
  .sort((a, b) => b.from.length - a.from.length);

function splitFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!m) return null;
  return { frontmatter: m[1], body: m[2] };
}

const KNOWN_KEYS = RELOCATIONS.map((r) => r.key);

function rewriteBody(text) {
  let out = text;
  let count = 0;
  for (const { from, to } of REWRITES) {
    // Four-part guard (same scheme as relocate-wf-meta.mjs):
    //   (1) escape regex metacharacters in the source slash command.
    //   (2) negative LOOKBEHIND for path-component characters — keeps
    //       /wf-shape from matching inside paths like
    //       `skills/wf/reference/shape.md` where the preceding char is `s`.
    //   (3) negative LOOKAHEAD for an identifier character — keeps /wf-shape
    //       from matching inside /wf-shapes or /wf-shape-something.
    //   (4) negative lookahead for whitespace + an already-rewritten
    //       sub-command key — makes the rewrite idempotent. Without this,
    //       running the rewriter twice would turn /wf-shape into /wf shape
    //       into /wf shape shape.
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
  const { out: rewrittenText, count } = rewriteBody(text);
  const split = splitFrontmatter(rewrittenText);
  if (!split) {
    console.warn(`  ! ${src}: no frontmatter found`);
    return { error: true };
  }

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
  unlinkSync(srcAbs);
  console.log(`  + ${src} -> reference/${key}.md  (${count} cross-ref rewrite(s); source deleted)`);
  return { written: true };
}

function rewriteExternalDocs() {
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

  // Skip the wf skill directory in phase 2: phase 1 already rewrote the
  // reference bodies during relocation, and SKILL.md is hand-authored.
  const skillDirAbs = join(PLUGIN_ROOT, 'skills', 'wf');

  let changed = 0;
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
  mkdirSync(REF_DIR, { recursive: true });
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

  console.log('\nDone. Next: run scripts/migrate-router.mjs --router wf to build the manifest.');
}

main();
