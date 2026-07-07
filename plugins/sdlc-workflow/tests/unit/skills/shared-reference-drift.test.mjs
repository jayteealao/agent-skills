// Drift guards for the wf shared single-source references introduced by the
// progressive-disclosure optimization: _fix-loop.md, _chat-return.md, and
// _pr-ci-handoff.md. Same pattern as output-boundary.test.mjs — the rule body
// may exist ONLY in the canonical file of each tree; every other skill file
// must cite it by link. This is the "single source or fail CI" discipline that
// ended the EOB drift (21 inlined copies, 4 divergent versions).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

// One distinctive full sentence per canonical file. If a copy of the rule body
// reappears anywhere else, its fingerprint travels with it.
const SHARED = [
  {
    file: '_fix-loop.md',
    fingerprint: 'must not silently inherit the parent session',
    citation: /\[_fix-loop\.md\]\(([^)]+)\)/,
  },
  {
    file: '_chat-return.md',
    fingerprint: 'never waives the narrative',
    citation: /\[_chat-return\.md\]\(([^)]+)\)/,
  },
  {
    file: '_pr-ci-handoff.md',
    fingerprint: 'bounded poll loop** that drives the PR',
    citation: /\[_pr-ci-handoff\.md\]\(([^)]+)\)/,
  },
  {
    file: '_additive-write.md',
    fingerprint: 'narrates the evolution in-place',
    citation: /\[_additive-write\.md\]\(([^)]+)\)/,
  },
];

function* walk(dir, exts) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p, exts);
    else if (exts.some((e) => p.endsWith(e))) yield p;
  }
}

const trees = [
  { name: 'main', root: pluginRoot },
  { name: 'codex', root: codexRoot },
].filter((t) => existsSync(path.join(t.root, 'skills')));

test('review split holds: entry file loads the stage body, stage body exists', () => {
  for (const { name, root } of trees) {
    const entry = path.join(root, 'skills', 'wf', 'reference', 'review.md');
    const stage = path.join(root, 'skills', 'wf', 'reference', 'review', '_stage.md');
    assert.ok(existsSync(stage), `${name}: missing review/_stage.md`);
    const src = readFileSync(entry, 'utf8');
    assert.ok(
      /_stage\.md`? in full/.test(src),
      `${name}: review.md lost the "read review/_stage.md in full" load instruction`,
    );
    const stageSrc = readFileSync(stage, 'utf8');
    for (const heading of ['# TRIAGE MODE', '# Step 0 — Orient', '# Adaptive routing']) {
      assert.ok(stageSrc.includes(heading), `${name}: review/_stage.md lost "${heading}"`);
    }
  }
});

test('each shared reference exists in every tree and kept its rule body', () => {
  for (const { name, root } of trees) {
    for (const { file, fingerprint } of SHARED) {
      const canonical = path.join(root, 'skills', 'wf', 'reference', file);
      assert.ok(existsSync(canonical), `${name}: missing ${file}`);
      const body = readFileSync(canonical, 'utf8');
      assert.ok(
        body.includes(fingerprint),
        `${name}: ${file} lost its fingerprint sentence — rule body rewritten or emptied`,
      );
    }
  }
});

test('shared rule bodies appear nowhere except their canonical file', () => {
  for (const { name, root } of trees) {
    const scanRoots = [path.join(root, 'skills'), path.join(root, 'commands')].filter(existsSync);
    for (const scanRoot of scanRoots) {
      for (const f of walk(scanRoot, ['.md'])) {
        const src = readFileSync(f, 'utf8');
        for (const { file, fingerprint } of SHARED) {
          if (path.basename(f) === file) continue;
          assert.ok(
            !src.includes(fingerprint),
            `${name}: inlined ${file} body in ${path.relative(root, f)} — cite the shared file instead`,
          );
        }
      }
    }
  }
});

test('every citation link to a shared reference resolves', () => {
  for (const { name, root } of trees) {
    const scanRoots = [path.join(root, 'skills'), path.join(root, 'commands')].filter(existsSync);
    const citationCounts = Object.fromEntries(SHARED.map((s) => [s.file, 0]));
    for (const scanRoot of scanRoots) {
      for (const f of walk(scanRoot, ['.md'])) {
        const src = readFileSync(f, 'utf8');
        for (const { file, citation } of SHARED) {
          if (path.basename(f) === file) continue;
          const m = src.match(citation);
          if (!m) continue;
          citationCounts[file]++;
          const target = path.resolve(path.dirname(f), m[1]);
          assert.ok(
            existsSync(target),
            `${name}: broken ${file} link in ${path.relative(root, f)} -> ${m[1]}`,
          );
          assert.equal(
            path.basename(target),
            file,
            `${name}: citation in ${path.relative(root, f)} points at the wrong file`,
          );
        }
      }
    }
    // Each shared file must actually be cited — an orphaned single source means
    // the consumers were rewritten without it and drift is back.
    for (const { file } of SHARED) {
      assert.ok(
        citationCounts[file] >= 1,
        `${name}: ${file} has zero citations — consumers no longer point at the single source`,
      );
    }
  }
});
