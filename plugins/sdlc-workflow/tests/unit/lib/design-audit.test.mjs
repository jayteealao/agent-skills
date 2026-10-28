// The design audit of the canvas: the read-only argv of the agent, its prompt, the parse and the
// clean-up of its answer, and a run that writes one report under the SDLC home and no record.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addScreen, initSurface } from '../../../lib/design-surface.mjs';
import { writeChecks } from '../../../lib/design-records.mjs';
import { AUDIT_MODEL, auditPath, auditPrompt, buildAuditArgs, normalizeAudit, parseAuditAnswer, readAudit, startAudit } from '../../../lib/design-audit.mjs';

function repo() {
  const top = mkdtempSync(join(tmpdir(), 'design-audit-'));
  const root = join(top, 'Shop');
  mkdirSync(root);
  execFileSync('git', ['init', '-q', root]);
  const saved = process.env.SDLC_HOME;
  process.env.SDLC_HOME = join(top, 'home');
  initSurface(root);
  addScreen(root, 'basket', { title: 'Basket', workflow: 'w1' });
  return { root, top, done: () => { if (saved === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = saved; rmSync(top, { recursive: true, force: true }); } };
}

test('the agent is Sonnet 5.5 with read tools only, no MCP server and the plan permission mode', () => {
  const args = buildAuditArgs();
  const at = (flag) => args[args.indexOf(flag) + 1];
  assert.equal(at('--model'), AUDIT_MODEL);
  assert.equal(AUDIT_MODEL, 'claude-sonnet-5-5');
  assert.equal(at('--tools'), 'Read,Glob,Grep');
  assert.equal(at('--permission-mode'), 'plan');
  assert.ok(args.includes('--strict-mcp-config'));
  assert.ok(!args.some((a) => /Edit|Write|Bash/.test(a)), 'no write tool');
});

test('the prompt names the screens, carries the audit rules and the platform map, and asks for JSON', () => {
  const { root, done } = repo();
  try {
    assert.doesNotMatch(auditPrompt(root, { workflow: 'w1' }), /## The measured checks/, 'no section with no check run');
    writeChecks(root, { at: '2026-10-28T10:00:00Z', passed: false, failures: [{ screen: 'basket', check: 'token', viewport: 'phone', state: 'default', message: 'The color #1a74e8 of .total is not a token', rect: null, move: 'colorize' }] });
    const p = auditPrompt(root, { workflow: 'w1' });
    assert.match(p, /`basket` \(Basket\): `\.ai\/design\/screens\/basket\.html`/);
    assert.match(p, /## The measured checks[\s\S]*basket \(phone, default\): token: The color #1a74e8/);
    assert.match(p, /`Color\(0xFF…\)` in Compose/);
    assert.match(p, /`undefined`, `null`, `NaN`/);
    assert.match(p, /## Diagnostic Scan/);
    assert.match(p, /platform map/);
    assert.match(p, /```json/);
    assert.match(p, /Write no file/);
  } finally { done(); }
});

test('the answer: the last json block, else the whole text, else nothing', () => {
  assert.deepEqual(parseAuditAnswer('notes\n```json\n{"a":1}\n```\nmore\n```json\n{"b":2}\n```'), { b: 2 });
  assert.deepEqual(parseAuditAnswer('{"c":3}'), { c: 3 });
  assert.equal(parseAuditAnswer('no report'), null);
});

test('the clean-up keeps known screens and states, safe files, and sorts by severity', () => {
  const { root, done } = repo();
  try {
    const r = normalizeAudit(root, {
      platform: 'android',
      scores: { theming: 2, responsive: 9, integrity: '3' },
      findings: [
        { severity: 'low', message: 'gap', screen: 'basket', state: 'nope', selector: '.total' },
        { severity: 'odd', message: 'raw hex', screen: 'ghost', selector: '.x', file: 'app/src/Color.kt', line: 12 },
        { severity: 'high', message: 'small target', file: '../outside.kt', line: 3 },
        { severity: 'blocker' },
      ],
    });
    assert.equal(r.platform, 'android');
    assert.deepEqual(r.scores, { accessibility: null, performance: null, theming: 2, responsive: null, integrity: 3 });
    assert.deepEqual(r.findings.map((f) => f.severity), ['high', 'medium', 'low'], 'a finding with no message is dropped');
    assert.deepEqual([r.findings[0].file, r.findings[0].line], [null, null], 'a path out of the repo is dropped');
    assert.deepEqual([r.findings[1].screen, r.findings[1].selector, r.findings[1].file], [null, null, 'app/src/Color.kt']);
    assert.deepEqual([r.findings[2].screen, r.findings[2].state, r.findings[2].selector], ['basket', 'default', '.total']);
  } finally { done(); }
});

test('a run writes one report under the SDLC home, refuses a second run, and writes no record', async () => {
  const { root, top, done } = repo();
  try {
    let release;
    const gate = new Promise((ok) => { release = ok; });
    const run = async () => { await gate; return { ok: true, costUsd: 0.42, text: '```json\n{"summary":"ok","scores":{"theming":3},"findings":[{"severity":"high","message":"raw","screen":"basket","selector":"h1"}]}\n```' }; };
    const rects = async (_, findings) => { for (const f of findings) f.rects = { phone: { x: 1, y: 2, width: 3, height: 4 } }; };
    const first = startAudit(root, { workflow: 'w1', repo: 'shop', run, rects });
    assert.equal(first.started, true);
    assert.equal(readAudit(root).status, 'running');
    assert.ok(auditPath(root).startsWith(join(top, 'home')));
    assert.deepEqual(startAudit(root, { run, rects }), { started: false, reason: 'an audit of this repo runs now' });
    release();
    const report = await first.done;
    assert.equal(report.status, 'done');
    assert.equal(readAudit(root).findings[0].rects.phone.width, 3);
    assert.equal(readAudit(root).costUsd, 0.42);
    assert.equal(existsSync(join(root, '.ai', 'workflows')), false, 'no workflow record');
    const failed = await startAudit(root, { run: async () => ({ ok: false, error: 'not logged in' }), rects }).done;
    assert.deepEqual([failed.status, failed.error], ['failed', 'not logged in']);
    assert.deepEqual(startAudit(root, { workflow: '../x' }), { started: false, reason: 'a bad workflow' });
  } finally { done(); }
});
