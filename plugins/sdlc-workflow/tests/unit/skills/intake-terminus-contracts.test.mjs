// INTAKE-MODES-REPAIR W0 — the caller-contract guard.
//
// The 2026-07-30 audit found five intake modes with hard dead-ends on their own
// documented happy path. Every dead-end was a cross-file contract violation:
// the mode was validated as an AUTHOR (its artifacts render, its tests pass)
// but never traced as a CALLER into its successor command's preconditions.
// This test is that trace. For every intake mode it asserts the terminus the
// mode writes against the named successor's precondition set: stack presence,
// handoff requirement, valid dispatcher grammar, schema-legal enums in every
// fenced yaml template, and coherent next-command/next-invocation pairs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const codexRoot = path.resolve(pluginRoot, '..', 'sdlc-workflow-codex');

const trees = [
  { name: 'main', root: pluginRoot },
  { name: 'codex', root: codexRoot },
].filter((t) => existsSync(path.join(t.root, 'skills')));

function intakeDir(root) {
  return path.join(root, 'skills', 'wf', 'reference', 'intake');
}

function readMode(root, file) {
  return readFileSync(path.join(intakeDir(root), file), 'utf8');
}

// Every fenced ```yaml block in a skill file, as raw text.
function yamlBlocks(src) {
  const blocks = [];
  const re = /```yaml\r?\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(src)) !== null) blocks.push(m[1]);
  return blocks;
}

const MODE_FILES = [
  'default.md', 'fix.md', 'hotfix.md', 'refactor.md', 'update-deps.md',
  'rca.md', 'discover.md', 'ideate.md', 'investigate.md', 'extend.md',
  'adopt.md', 'amend.md', 'modernize.md',
];

const SLICE_STATUS_ENUM = new Set(['defined', 'in-progress', 'complete', 'skipped']);

test('every slices[] roster status in every fenced template is schema-legal', () => {
  for (const { name, root } of trees) {
    for (const file of MODE_FILES) {
      const src = readMode(root, file);
      for (const block of yamlBlocks(src)) {
        if (!/^slices:/m.test(block)) continue;
        // roster entries: lines like "    status: defined" inside the slices list
        const rosterRe = /^ {2,}-? ?slug: .*\r?\n(?: {2,}.*\r?\n)*?/gm;
        void rosterRe;
        const statusRe = /^ {4}status: ([^\r\n]+)$/gm;
        let sm;
        while ((sm = statusRe.exec(block)) !== null) {
          const v = sm[1].trim();
          if (v.startsWith('<')) continue; // placeholder
          assert.ok(
            SLICE_STATUS_ENUM.has(v),
            `${name}: ${file} fenced template writes slices[].status: ${v} — not in the schema enum ` +
            `{defined,in-progress,complete,skipped}; post-write-verify Ajv-blocks the write`,
          );
        }
      }
    }
  }
});

// verify.md STOPs when 00-index.md has no stack: block, and plan.md reads an
// ABSENT review-scope-confirmed as "already asked". Every mode that writes a
// type:index overview must therefore carry the full default.md required set.
// The four change-modes share ONE template in _change-mode-tail.md (S5 dedup);
// adopt keeps its own reverse-entry template but owes the same field set.

test('the shared change-mode index template carries the full required set', () => {
  for (const { name, root } of trees) {
    const tail = readFileSync(path.join(intakeDir(root), '_change-mode-tail.md'), 'utf8');
    const idx = yamlBlocks(tail).filter((b) => /^type: index$/m.test(b));
    assert.ok(idx.length >= 1, `${name}: _change-mode-tail.md has no fenced type:index template`);
    for (const block of idx) {
      for (const key of ['stack:', 'review-scope-confirmed:', 'appetite:', 'title:', 'open-questions:', 'origin-investigate:']) {
        assert.ok(
          block.includes(key),
          `${name}: shared index template omits \`${key}\` — verify/plan STOP or misread on its absence`,
        );
      }
    }
    for (const file of ['fix.md', 'hotfix.md', 'refactor.md', 'update-deps.md']) {
      const own = yamlBlocks(readMode(root, file)).filter((b) => /^type: index$/m.test(b));
      assert.equal(
        own.length, 0,
        `${name}: ${file} carries its own type:index template — the shared one in _change-mode-tail.md is the single source`,
      );
    }
    const adopt = yamlBlocks(readMode(root, 'adopt.md')).filter((b) => /^type: index$/m.test(b));
    assert.ok(adopt.length >= 1, `${name}: adopt.md has no fenced type:index template`);
    for (const key of ['stack:', 'review-scope-confirmed:', 'appetite:']) {
      assert.ok(
        adopt.some((b) => b.includes(key)),
        `${name}: adopt.md type:index template omits \`${key}\``,
      );
    }
  }
});

// renderers/workflow-index.mjs silently drops a list-form progress: — the
// dashboard panel renders empty. Templates must author the object form, and
// terminal indexes must carry title/updated-at or the row is untitled/never-stale.
const TERMINAL_INDEX_AUTHORS = ['rca.md', 'discover.md', 'ideate.md', 'investigate.md'];

test('terminal workflow-index templates use object-form progress and carry title/updated-at', () => {
  for (const { name, root } of trees) {
    for (const file of TERMINAL_INDEX_AUTHORS) {
      const src = readMode(root, file);
      const idx = yamlBlocks(src).filter((b) => /^type: workflow-index$/m.test(b));
      assert.ok(idx.length >= 1, `${name}: ${file} has no fenced type:workflow-index template`);
      for (const block of idx) {
        assert.ok(block.includes('title:'), `${name}: ${file} workflow-index template omits title:`);
        assert.ok(block.includes('updated-at:'), `${name}: ${file} workflow-index template omits updated-at:`);
        const pm = block.match(/^progress:\r?\n([ \t]*)(- )?/m);
        if (pm) {
          assert.ok(
            pm[2] !== '- ',
            `${name}: ${file} authors progress: as a YAML list — workflow-index.mjs drops it; use the stage: status object form`,
          );
        }
      }
    }
  }
});

test('no mode recommends the malformed `intake <mode> <slug>` route grammar', () => {
  // `/wf intake fix <slug>` parses <slug> as a description → standalone branch →
  // collision-WARN-stop. The lawful forwarding grammar is `… from <slug>`.
  // (update-deps is exempt: its Step 0 defines the bare slug token as resume.)
  const bad = /[/$]wf intake (?:fix|hotfix|refactor) <slug>/;
  for (const { name, root } of trees) {
    for (const file of MODE_FILES) {
      const src = readMode(root, file);
      assert.ok(
        !bad.test(src),
        `${name}: ${file} recommends the malformed \`intake <mode> <slug>\` grammar — use \`… from <slug>\``,
      );
    }
  }
});

test('every change-mode pipeline reaches handoff and retro', () => {
  // ship.md STOPs without 08-handoff.md readiness-verdict: ready, and
  // retro.md's incident consult auto-triggers exactly for hotfixes.
  for (const { name, root } of trees) {
    for (const file of ['fix.md', 'hotfix.md', 'refactor.md', 'update-deps.md']) {
      const src = readMode(root, file);
      const pipeline = src.match(/^# Pipeline\r?\n([^\r\n]+)/m);
      assert.ok(pipeline, `${name}: ${file} lost its # Pipeline line`);
      for (const stage of ['handoff', 'retro']) {
        assert.ok(
          pipeline[1].includes(stage),
          `${name}: ${file} pipeline line skips ${stage} — the successor STOPs or the incident retro never fires`,
        );
      }
    }
  }
});

test('hotfix produces acceptance criteria', () => {
  // verify.md and review/_stage.md read acceptance criteria from the lead.
  for (const { name, root } of trees) {
    const src = readMode(root, 'hotfix.md');
    assert.ok(
      src.includes('## Acceptance Criteria'),
      `${name}: hotfix.md writes no acceptance criteria — verify and review read them from the lead`,
    );
  }
});

test('update-deps has a lawful audit-only terminus and self-reports to the index', () => {
  for (const { name, root } of trees) {
    const src = readMode(root, 'update-deps.md');
    assert.ok(
      /[/$]wf close <slug> deferred/.test(src),
      `${name}: update-deps.md audit-only branch lacks the lawful terminus \`wf close <slug> deferred\``,
    );
    assert.ok(
      src.includes('self-report to `00-index.md`'),
      `${name}: update-deps.md Steps 7/8 never update the index — completed work reads as unimplemented forever`,
    );
    const hint = src.match(/^argument-hint: ([^\r\n]+)/m);
    assert.ok(hint && hint[1].includes('slug'), `${name}: update-deps.md argument-hint documents no resume grammar`);
  }
});

test('fix mode uses the trailing design token, not a dispatcher-unknown flag', () => {
  for (const { name, root } of trees) {
    const src = readMode(root, 'fix.md');
    assert.ok(!src.includes('--design'), `${name}: fix.md still uses --design — the dispatcher tokenizer knows no flags`);
  }
});

test('the decision-lifecycle closure sections exist family-wide', () => {
  for (const { name, root } of trees) {
    assert.ok(
      readMode(root, 'rca.md').includes('# Route — decision closure'),
      `${name}: rca.md has no route-closure section — the diagnosis dies in chat and the slug parks in Active forever`,
    );
    assert.ok(
      readMode(root, 'ideate.md').includes('# Pick — decision closure'),
      `${name}: ideate.md has no pick-closure section`,
    );
    assert.ok(
      readMode(root, 'discover.md').includes('close-reason: verdict-recorded'),
      `${name}: discover.md never closes — a verdict is terminal by construction, so closure happens at write time`,
    );
  }
});

test('provenance is the generalized intake contract, consumed family-wide', () => {
  for (const { name, root } of trees) {
    const dir = intakeDir(root);
    assert.ok(
      existsSync(path.join(dir, '_intake-provenance.md')),
      `${name}: missing _intake-provenance.md (the widened provenance contract)`,
    );
    assert.ok(
      !existsSync(path.join(dir, '_investigate-provenance.md')),
      `${name}: _investigate-provenance.md still exists — it was renamed/widened to _intake-provenance.md`,
    );
    for (const consumer of ['default.md', 'fix.md', 'hotfix.md', 'refactor.md', 'update-deps.md', 'rca.md', 'discover.md', 'investigate.md']) {
      assert.ok(
        readMode(root, consumer).includes('_intake-provenance.md'),
        `${name}: ${consumer} does not cite _intake-provenance.md — inherited evidence dies in the source artifact`,
      );
    }
  }
});

test('the change-mode tail is shared, not four drifted copies', () => {
  for (const { name, root } of trees) {
    const tail = path.join(intakeDir(root), '_change-mode-tail.md');
    assert.ok(existsSync(tail), `${name}: missing _change-mode-tail.md`);
    const tailSrc = readFileSync(tail, 'utf8');
    for (const fp of ['close-reason: superseded', 'Tripwire', 'INDEX.md']) {
      assert.ok(tailSrc.includes(fp), `${name}: _change-mode-tail.md lost its "${fp}" content`);
    }
    for (const file of ['fix.md', 'hotfix.md', 'refactor.md', 'update-deps.md']) {
      assert.ok(
        readMode(root, file).includes('_change-mode-tail.md'),
        `${name}: ${file} does not cite _change-mode-tail.md`,
      );
    }
  }
});

test('next-command / next-invocation pairs agree inside every fenced template', () => {
  for (const { name, root } of trees) {
    for (const file of MODE_FILES) {
      const src = readMode(root, file);
      for (const block of yamlBlocks(src)) {
        const nc = block.match(/^next-command: (\S+)/m);
        const ni = block.match(/^next-invocation: ([^\r\n]+)/m);
        if (!nc || !ni) continue;
        const cmd = nc[1].trim();
        if (cmd.startsWith('<') || cmd === 'none' || cmd === 'user-picks') continue;
        const key = cmd.replace(/^wf-/, '');
        assert.ok(
          ni[1].includes(`wf ${key}`) || ni[1].includes(`wf intake ${key}`),
          `${name}: ${file} template pairs next-command: ${cmd} with next-invocation: ${ni[1].trim()} — the two contradict`,
        );
      }
    }
  }
});

test('rca cites no retired command and no phantom slice', () => {
  for (const { name, root } of trees) {
    const src = readMode(root, 'rca.md');
    assert.ok(!src.includes('wf-how'), `${name}: rca.md still cites the retired wf-how`);
    const idx = yamlBlocks(src).filter((b) => /^type: workflow-index$/m.test(b));
    for (const block of idx) {
      assert.ok(
        !/^selected-slice:/m.test(block),
        `${name}: rca.md index template names a selected-slice that never exists`,
      );
    }
  }
});

test('discover offers only executable stall rungs', () => {
  for (const { name, root } of trees) {
    const src = readMode(root, 'discover.md');
    assert.ok(
      !/[/$]wf probe <area>/.test(src),
      `${name}: discover.md recommends \`wf probe <area>\` — probe takes a slug, the invocation is invalid`,
    );
  }
});
