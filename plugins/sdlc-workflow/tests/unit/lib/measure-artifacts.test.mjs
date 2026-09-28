// Tests for scripts/measure-artifacts.mjs — the artifact meter (ARTIFACT-SPLIT-PLAN W0).
// Every section counts over small synthetic transcripts and slug folders in a temp dir.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  classifyPath,
  compareHeadlines,
  isRefused,
  isSpilled,
  measure,
  parseArgs,
  parseTranscriptLine,
  quantile,
  readsOf,
  writesOf,
  yoloStageOf,
} from '../../../scripts/measure-artifacts.mjs';

// --- transcript line builders ------------------------------------------------

const user = (content) => JSON.stringify({ type: 'user', timestamp: '2026-09-01T10:00:00Z', message: { role: 'user', content } });
let msg = 0;
const use = (name, input, id) =>
  JSON.stringify({
    type: 'assistant',
    message: { id: `m${++msg}`, role: 'assistant', content: [{ type: 'tool_use', id, name, input }], usage: { output_tokens: 100 } },
  });
const result = (id, text) => user([{ type: 'tool_result', tool_use_id: id, content: text }]);

const yoloPrompt = (stage, root) =>
  `Execute the SDLC '${stage}' stage for slug 'demo', slice 'auth', FULLY AUTONOMOUSLY (no human in the loop).\n\n` +
  `Read /plugin/skills/wf/reference/${stage}.md IN FULL and write its artifact(s) under ${root}/.ai/workflows/demo/.`;

// --- pure helpers ------------------------------------------------------------

describe('pure helpers', () => {
  test('quantile is nearest-rank and 0 for an empty list', () => {
    assert.equal(quantile([], 0.5), 0);
    assert.equal(quantile([5, 1, 3], 0.5), 3);
    assert.equal(quantile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9), 10);
  });

  test('classifyPath knows absolute, Windows and relative workflow paths', () => {
    assert.deepEqual(classifyPath('C:\\dev\\app\\.ai\\workflows\\demo\\02-shape.md'), {
      kind: 'artifact', slug: 'demo', name: '02-shape.md', stem: 'shape',
    });
    assert.deepEqual(classifyPath('02-shape.md'), { kind: 'artifact', slug: null, name: '02-shape.md', stem: 'shape' });
    assert.equal(classifyPath('po-answers.md').stem, 'po-answers');
    assert.equal(classifyPath('.ai/workflows/demo/04-plan-auth.explainer.html.fragment').stem, 'explainer');
    assert.equal(classifyPath('.ai/workflows/demo/04-plan-auth.yaml').stem, 'sibling-yaml');
    assert.deepEqual(classifyPath('/x/skills/wf/reference/verify/_artifact.md'), { kind: 'reference', ref: 'verify/_artifact.md' });
    assert.deepEqual(classifyPath('verify/_artifact.md'), { kind: 'reference', ref: 'verify/_artifact.md' });
    assert.deepEqual(classifyPath('_fix-loop.md'), { kind: 'reference', ref: '_fix-loop.md' });
    assert.equal(classifyPath('README.md'), null);
    assert.equal(classifyPath('docs/01-intro.md'), null);
  });

  test('readsOf counts Read, shell reads with a read verb, and drops writes', () => {
    assert.equal(readsOf('Read', { file_path: '/r/.ai/workflows/demo/02-shape.md', limit: 50 })[0].partial, true);
    assert.equal(readsOf('Bash', { command: 'cat .ai/workflows/demo/02-shape.md' })[0].cls.name, '02-shape.md');
    assert.equal(readsOf('PowerShell', { command: "Get-Content -Raw 'po-answers.md'" })[0].cls.stem, 'po-answers');
    assert.deepEqual(readsOf('Bash', { command: 'ls .ai/workflows/demo/02-shape.md' }), []);
    assert.deepEqual(readsOf('Bash', { command: 'cat > .ai/workflows/demo/02-shape.md <<EOF' }), []);
  });

  test('writesOf buckets stage md, view layer and explainer', () => {
    assert.equal(writesOf('Write', { file_path: '/r/.ai/workflows/d/04-plan-a.md', content: 'abcd' })[0].bucket, 'stage-md');
    assert.equal(writesOf('Write', { file_path: '/r/.ai/workflows/d/04-plan-a.yaml', content: 'x' })[0].bucket, 'view');
    assert.equal(writesOf('Edit', { file_path: '/r/.ai/workflows/d/04-plan-a.html.fragment', new_string: 'x' })[0].bucket, 'view');
    assert.equal(writesOf('Write', { file_path: '/r/.ai/workflows/d/04-plan-a.explainer.html.fragment', content: 'x' })[0].bucket, 'explainer');
    assert.equal(writesOf('MultiEdit', { file_path: '/r/.ai/workflows/d/02-shape.md', edits: [{ new_string: 'ab' }, { new_string: 'cd' }] })[0].chars, 4);
    assert.deepEqual(writesOf('Write', { file_path: '/r/src/app.ts', content: 'x' }), []);
  });

  test('parseTranscriptLine reads Claude and Codex lines', () => {
    const c = parseTranscriptLine(use('Read', { file_path: 'x' }, 't1'));
    assert.equal(c.uses[0].name, 'Read');
    assert.equal(c.usage.output, 100);
    const r = parseTranscriptLine(result('t1', 'body'));
    assert.deepEqual(r.results, [{ id: 't1', text: 'body' }]);
    const x = parseTranscriptLine(JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'shell', call_id: 'c1', arguments: '{"command":["cat","02-shape.md"]}' } }));
    assert.equal(x.uses[0].id, 'c1');
    assert.equal(readsOf(x.uses[0].name, x.uses[0].input).length, 1);
    assert.equal(parseTranscriptLine('not json'), null);
  });

  test('yoloStageOf reads the driver prompt and the slug root', () => {
    const y = yoloStageOf(yoloPrompt('verify', 'C:/dev/app'));
    assert.equal(y.stage, 'verify');
    assert.equal(y.slice, 'auth');
    assert.match(y.root.replace(/\\/g, '/'), /C:\/dev\/app\/\.ai\/workflows\/demo$/);
    assert.equal(yoloStageOf('Execute the SDLC \'ship\' stage for slug \'x\', FULLY AUTONOMOUSLY'), null);
    // The Workflow harness puts a notice line before the driver's prompt.
    assert.equal(yoloStageOf(`[Workflow harness — computed task] notice.\n\n${yoloPrompt('plan', '/r')}`).stage, 'plan');
    // A prompt that only quotes the driver text mid-line is not a stage agent.
    assert.equal(yoloStageOf("Audit it. It says Execute the SDLC 'plan' stage for slug 'x', FULLY AUTONOMOUSLY."), null);
  });

  test('refused and spilled results', () => {
    assert.equal(isRefused('File content (31000 tokens) exceeds maximum allowed tokens (25000).'), true);
    assert.equal(isRefused('ok'), false);
    assert.equal(isSpilled('<persisted-output>\nOutput too large (36KB). Full output saved to: x'), true);
  });

  test('parseArgs defaults since to 30 days ago and reads flags', () => {
    const a = parseArgs(['--since', '2026-07-01', '--json', '--baseline=b.json']);
    assert.equal(a.since, '2026-07-01');
    assert.equal(a.json, true);
    assert.equal(a.baseline, 'b.json');
    assert.match(parseArgs([]).since, /^\d{4}-\d{2}-\d{2}$/);
    assert.throws(() => parseArgs(['--since', 'soon']));
  });

  test('compareHeadlines gives deltas for shared keys', () => {
    assert.deepEqual(compareHeadlines({ a: 10, b: 1 }, { a: 12.5, c: 3 }), [
      { key: 'a', baseline: 10, now: 12.5, delta: 2.5 },
      { key: 'b', baseline: 1, now: null, delta: null },
      { key: 'c', baseline: null, now: 3, delta: null },
    ]);
  });
});

// --- the whole meter over a synthetic machine --------------------------------

describe('measure over synthetic data', () => {
  let root;
  let out;

  before(async () => {
    root = mkdtempSync(join(tmpdir(), 'measure-artifacts-'));
    const projects = join(root, 'projects');
    const codex = join(root, 'codex');
    const dev = join(root, 'dev');
    const app = join(dev, 'app');
    const slug = join(app, '.ai', 'workflows', 'demo');
    mkdirSync(join(projects, 'p', 's1', 'subagents'), { recursive: true });
    mkdirSync(codex, { recursive: true });
    mkdirSync(slug, { recursive: true });
    const appRoot = app.replace(/\\/g, '/');

    // Slug on disk: an index of 30 KB, one sibling plan older than the sessions.
    writeFileSync(join(slug, '00-index.md'), `---\ncurrent-stage: plan\n# a comment line of prose\n${'k: v\n'.repeat(6000)}---\nbody\n`);
    writeFileSync(join(slug, '04-plan-billing.md'), '---\ncreated-at: "2026-08-01T00:00:00Z"\n---\n');
    // A second slug with a small index.
    mkdirSync(join(app, '.ai', 'workflows', 'small'), { recursive: true });
    writeFileSync(join(app, '.ai', 'workflows', 'small', '00-index.md'), '---\nk: v\n---\n');
    // A fixture project the meter skips.
    mkdirSync(join(dev, 'wf-mod-fixture', '.ai', 'workflows', 'x'), { recursive: true });
    writeFileSync(join(dev, 'wf-mod-fixture', '.ai', 'workflows', 'x', '00-index.md'), 'x'.repeat(90000));
    // A read ledger: two verify checks (one complete), one review check.
    writeFileSync(
      join(slug, '.read-ledger.jsonl'),
      [
        { at: '2026-09-01T00:00:00Z', agentId: 'a1', stage: 'verify', artifact: '06-verify-auth.md', missing: [], partial: [], waiver: null },
        { at: '2026-09-01T00:00:00Z', agentId: 'a2', stage: 'verify', artifact: '06-verify-auth.md', missing: ['02-shape.md'], partial: [], waiver: null },
        { at: '2026-09-01T00:00:00Z', agentId: 'a3', stage: 'review', artifact: '07-review-auth.md', missing: [], partial: ['02-shape.md'], waiver: 'why' },
        { at: '2026-01-01T00:00:00Z', agentId: 'old', stage: 'review', artifact: '07-review-auth.md', missing: ['x'], partial: [], waiver: null },
      ].map((r) => JSON.stringify(r)).join('\n') + '\n',
    );

    // Yolo verify agent: reads its reference in part, the implement artifact by
    // absolute path, the shape by a shell `cat`, po-answers by a relative Read,
    // and its _artifact.md by a relative shell path. One index read is refused.
    writeFileSync(
      join(projects, 'p', 's1', 'subagents', 'agent-v.jsonl'),
      [
        user(yoloPrompt('verify', appRoot)),
        use('Read', { file_path: '/plugin/skills/wf/reference/verify.md', offset: 1, limit: 200 }, 'v1'),
        result('v1', 'reference text'),
        use('Read', { file_path: `${appRoot}/.ai/workflows/demo/05-implement-auth.md` }, 'v2'),
        result('v2', 'x'.repeat(400)),
        use('Bash', { command: 'cat .ai/workflows/x/02-shape.md' }, 'v3'),
        result('v3', 'y'.repeat(400)),
        use('Read', { file_path: 'po-answers.md' }, 'v4'),
        result('v4', 'z'.repeat(400)),
        use('PowerShell', { command: 'Get-Content verify/_artifact.md' }, 'v5'),
        result('v5', 'template'),
        use('Read', { file_path: `${appRoot}/.ai/workflows/demo/00-index.md` }, 'v6'),
        result('v6', 'File content (40000 tokens) exceeds maximum allowed tokens (25000).'),
        use('Write', { file_path: `${appRoot}/.ai/workflows/demo/06-verify-auth.md`, content: 'a'.repeat(800) }, 'v7'),
        use('Write', { file_path: `${appRoot}/.ai/workflows/demo/06-verify-auth.yaml`, content: 'b'.repeat(200) }, 'v8'),
        use('Write', { file_path: `${appRoot}/.ai/workflows/demo/06-verify-auth.explainer.html.fragment`, content: 'c'.repeat(200) }, 'v9'),
      ].join('\n') + '\n',
    );

    // Yolo plan agent: reads the slice and the one earlier sibling plan.
    writeFileSync(
      join(projects, 'p', 's1', 'subagents', 'agent-p.jsonl'),
      [
        user(yoloPrompt('plan', appRoot)),
        use('Read', { file_path: '/plugin/skills/wf/reference/plan.md' }, 'p1'),
        result('p1', 'ref'),
        use('Read', { file_path: `${appRoot}/.ai/workflows/demo/03-slice-auth.md` }, 'p2'),
        result('p2', 's'.repeat(40)),
        use('Bash', { command: `head -50 ${appRoot}/.ai/workflows/demo/04-plan-billing.md` }, 'p3'),
        result('p3', 'p'.repeat(40)),
        use('Read', { file_path: `${appRoot}/.ai/workflows/demo/04-plan-auth.md`, limit: 10 }, 'p4'),
        result('p4', 'q'.repeat(40)),
      ].join('\n') + '\n',
    );

    // A main session (not a yolo agent) that re-reads one file, and a sub-agent
    // with a non-yolo prompt that mentions the driver text later.
    writeFileSync(
      join(projects, 'p', 's1.jsonl'),
      [
        user('/wf status demo'),
        use('Read', { file_path: `${appRoot}/.ai/workflows/demo/02-shape.md` }, 'm1'),
        result('m1', 'a'.repeat(100)),
        use('Read', { file_path: `${appRoot}/.ai/workflows/demo/02-shape.md` }, 'm2'),
        result('m2', 'a'.repeat(100)),
        use('Bash', { command: `cat ${appRoot}/.ai/workflows/demo/04-plan-billing.md` }, 'm3'),
        result('m3', '<persisted-output>\nOutput too large (40KB). Full output saved to: x'),
      ].join('\n') + '\n',
    );
    writeFileSync(
      join(projects, 'p', 's1', 'subagents', 'agent-audit.jsonl'),
      [user("Audit the driver. It says Execute the SDLC 'verify' stage for slug 'x', FULLY AUTONOMOUSLY."), use('Read', { file_path: '02-shape.md' }, 'a1'), result('a1', 'x')].join('\n') + '\n',
    );

    // A Codex session with one shell read.
    writeFileSync(
      join(codex, 'rollout.jsonl'),
      [
        JSON.stringify({ type: 'response_item', payload: { type: 'function_call', name: 'shell', call_id: 'c1', arguments: JSON.stringify({ command: ['powershell', '-Command', "Get-Content '.ai\\workflows\\demo\\02-shape.md'"] }) } }),
        JSON.stringify({ type: 'response_item', payload: { type: 'function_call_output', call_id: 'c1', output: 'shape body' } }),
      ].join('\n') + '\n',
    );

    out = await measure({ since: '2026-01-02', projects, codex, dev });
  });

  after(() => rmSync(root, { recursive: true, force: true }));

  test('(a) yolo coverage counts shell, relative and absolute reads per stage', () => {
    const v = out.yolo.verify;
    assert.equal(v.n, 1, 'the audit sub-agent is not a yolo agent');
    assert.equal(v.own, 100);
    assert.equal(v.ownPartial, 1);
    assert.equal(v.adjacent, 100);
    assert.equal(v.shape, 100, 'shell cat of 02-shape.md counts');
    assert.equal(v.po, 100, 'relative Read of po-answers.md counts');
    assert.equal(v.template, 100, 'relative shell read of verify/_artifact.md counts');
    assert.equal(v.procedures['_fix-loop.md'], 0);
    assert.equal(v.artifactTokensP50, 300);
    const p = out.yolo.plan;
    assert.equal(p.n, 1);
    assert.equal(p.adjacent, 100);
    assert.equal(p.shape, 0);
    assert.deepEqual(out.yolo.siblingPlans, { agents: 1, meanAvailable: 1, readAny: 1, readAll: 1, medianShareRead: 100 });
  });

  test('(b) refused, spilled and partial reads, and reading sessions', () => {
    assert.equal(out.reads.refused, 1);
    assert.deepEqual(out.reads.refusedByStem, { index: 1 });
    assert.equal(out.reads.spilled, 1);
    assert.equal(out.reads.partial, 1, 'the plan agent Read with a limit');
    assert.equal(out.reads.readingSessions, 5);
    assert.equal(out.reads.subagentSessions, 3);
    assert.equal(out.reads.codexSessions, 1);
    assert.ok(out.reads.repeatShare > 0, 'the main session re-read 02-shape.md');
  });

  test('(c) index sizes skip fixture projects', () => {
    assert.equal(out.index.indexes, 2);
    assert.equal(out.index.projects, 1);
    assert.equal(out.index.maxKB, 29);
    assert.equal(out.index.over20KB, 1);
    assert.ok(out.index.commentShare > 0);
  });

  test('(d) write mix splits stage md, view layer and explainer', () => {
    assert.equal(out.writes.stageMdTokens, 200);
    assert.equal(out.writes.viewTokens, 50);
    assert.equal(out.writes.explainerTokens, 50);
    assert.equal(out.writes.viewShare, 16.7);
    assert.equal(out.writes.explainerShare, 16.7);
  });

  test('(e) read-ledger coverage per stage, rows before --since dropped', () => {
    assert.equal(out.ledger.ledgerFiles, 1);
    assert.equal(out.ledger.checks, 3);
    assert.equal(out.ledger.stages.verify.completeShare, 50);
    assert.equal(out.ledger.stages.review.completeShare, 100);
    assert.equal(out.ledger.stages.review.waived, 1);
    assert.equal(out.headline['ledger.verify.complete%'], 50);
  });
});
