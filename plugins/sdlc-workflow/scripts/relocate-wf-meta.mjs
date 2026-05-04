#!/usr/bin/env node
/**
 * One-shot relocator for the v9.0.0-alpha.3 wf-meta skill bundle.
 *
 * Moves the 10 lifecycle-navigation commands (wf-next, wf-status, wf-resume,
 * wf-sync, wf-amend, wf-extend, wf-skip, wf-close, wf-how, wf-announce) into
 * skills/wf-meta/reference/<key>.md, applying the cross-reference rewrite
 * that retargets PR-3 family invocations onto the new dispatcher
 * (e.g. /wf-status → /wf-meta status, /wf-resume → /wf-meta resume).
 *
 * The rewrite intentionally also runs on the rest of the plugin tree so that
 * external commands referencing these slash commands stay functional after
 * the originals are deleted. References to commands NOT in the wf-meta
 * bundle (e.g. /wf-implement, /wf-design, /wf-quick X) are left alone —
 * those are PR-4 scope or already migrated.
 *
 *   node plugins/sdlc-workflow/scripts/relocate-wf-meta.mjs
 *
 * Idempotent: running twice is a no-op once the references exist. After the
 * relocation pass, run scripts/migrate-router.mjs --router wf-meta to rebuild
 * the manifest with the new body hashes.
 *
 * Kept in tree post-PR-3 as the audit trail (mirrors relocate-wf-quick.mjs
 * and rewrite-review-refs.mjs).
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

// The 10 commands rolling under /wf-meta. Each command's basename strips
// the wf- prefix to produce the sub-key (so /wf-status becomes /wf-meta status).
const RELOCATIONS = [
  { src: 'wf-next.md',     key: 'next' },
  { src: 'wf-status.md',   key: 'status' },
  { src: 'wf-resume.md',   key: 'resume' },
  { src: 'wf-sync.md',     key: 'sync' },
  { src: 'wf-amend.md',    key: 'amend' },
  { src: 'wf-extend.md',   key: 'extend' },
  { src: 'wf-skip.md',     key: 'skip' },
  { src: 'wf-close.md',    key: 'close' },
  { src: 'wf-how.md',      key: 'how' },
  { src: 'wf-announce.md', key: 'announce' },
];

const REF_DIR = join(PLUGIN_ROOT, 'skills', 'wf-meta', 'reference');
const COMMANDS_DIR = join(PLUGIN_ROOT, 'commands');

// Cross-reference rewrites. Order matters: longer source patterns first to
// avoid /wf-extend being shadowed by a hypothetical /wf-ext rule.
// The destination form mirrors PR-2's /wf-quick pattern: /wf-X <args> becomes
// /wf-meta X <args>.
const REWRITES = RELOCATIONS
  .map(({ src, key }) => ({ from: `/${src.replace(/\.md$/, '')}`, to: `/wf-meta ${key}` }))
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
    // Four-part guard (same scheme as relocate-wf-quick.mjs):
    //   (1) escape regex metacharacters in the source slash command.
    //   (2) negative LOOKBEHIND for path-component characters — keeps
    //       /wf-status from matching inside paths like
    //       `skills/wf-meta/reference/status.md` where the preceding char is `s`.
    //   (3) negative LOOKAHEAD for an identifier character — keeps /wf-status
    //       from matching inside /wf-statuses etc.
    //   (4) negative lookahead for whitespace + an already-rewritten
    //       sub-command key — makes the rewrite idempotent. Without this,
    //       running the rewriter twice would turn /wf-status into
    //       /wf-meta status into /wf-meta status status.
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
  console.log(`  + ${src} -> reference/${key}.md  (${count} cross-ref rewrite(s))`);
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

  // Skip the wf-meta skill directory in phase 2: phase 1 already rewrote the
  // reference bodies during relocation, and SKILL.md is hand-authored.
  const skillDirAbs = join(PLUGIN_ROOT, 'skills', 'wf-meta');

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

  console.log('\nDone. Next: run scripts/migrate-router.mjs --router wf-meta to build the manifest.');
}

main();
