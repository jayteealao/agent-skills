// scripts/orchestrate.mjs: the contract and its one approval, each refusal of the script, the
// light path from a builder to a measured pass, the full path with confirmed failures and the
// round limit, a contract change, the holdout, and the evidence page. No test starts an agent:
// every dispatch goes to a subagent of the host, which the script only records.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run } from '../../scripts/orchestrate.mjs';

const S = 'demo';
const B = 'host:claude-sonnet-5-5';
const A = 'host:claude-opus-5-5';

function makeRoot() {
  const root = mkdtempSync(path.join(os.tmpdir(), 'orch-cli-'));
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { stdio: 'ignore' });
  git('init', '-q');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'init');
  mkdirSync(path.join(root, '.ai', 'workflows', S), { recursive: true });
  process.env.SDLC_HOME = path.join(root, '.home');
  run(['agents', 'allow', root, S, '--ids', 'host:claude-sonnet-5-5,host:claude-opus-5-5', '--words', 'these two']);
  return root;
}
const commit = (root) => execFileSync('git', ['-C', root, '-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'work'], { stdio: 'ignore' });
const file = (root, name, value) => {
  const p = path.join(root, name);
  writeFileSync(p, typeof value === 'string' ? value : JSON.stringify(value));
  return p;
};
const o = (root, cmd, ...rest) => (['contract', 'change'].includes(cmd) ? run([cmd, rest[0], root, S, ...rest.slice(1)]) : run([cmd, root, S, ...rest]));
const ok = (r) => { assert.equal(r.ok, true, JSON.stringify(r)); return r; };
const refused = (r, re) => { assert.equal(r.ok, false, JSON.stringify(r)); assert.match(r.error, re); assert.ok(r.fix?.do, 'a refusal names its fix'); return r; };

const PASS = 'node -e "process.exit(0)"';
const measure = (id, command = PASS) => ({ id, says: `${id} holds.`, kind: 'measure', proof: { command }, source: 'interview' });
const behaviour = (id) => ({ id, says: `${id} holds.`, kind: 'behaviour', proof: { surface: 'the command line', evidence: 'the output' }, source: 'interview' });

function approved(root, outcomes, approve = []) {
  ok(o(root, 'contract', 'put', file(root, 'c.json', { source: { kind: 'instruction' }, commands: { tests: PASS, ci: 'none' }, outcomes })));
  return ok(o(root, 'contract', 'approve', '--words', 'yes, go', ...approve));
}
/** Add a unit, dispatch it to a host subagent, and record its result. */
function unit(root, spec, result, agent = B) {
  const u = ok(o(root, 'unit', file(root, 'u.json', spec)));
  ok(o(root, 'dispatch', String(u.unit), '--agent', agent, '--task', file(root, 't.md', 'the task'), '--host', 'claude'));
  return result === undefined ? u.unit : { n: u.unit, r: o(root, 'result', String(u.unit), file(root, 'r.json', result)) };
}
const built = { status: 'done', did: 'the work', commands: [{ command: 'node x', code: 0 }], commits: ['abc'] };
const verdict = (outcome, v, set = 'working') => ({ verdicts: [{ outcome, verdict: v, set, observed: 'a user ran it and saw the result' }] });
const stateOf = (root, id) => o(root, 'state').outcomes.find((x) => x.id === id);

test('the contract: checked at put, approved once with the words of the person, then closed to edits', () => {
  const root = makeRoot();
  try {
    assert.equal(o(root, 'state').contract, null);
    refused(o(root, 'contract', 'put', file(root, 'bad.json', { commands: { tests: PASS }, outcomes: [{ id: 'nope', says: 'x', kind: 'measure', proof: {} }] })), /error/);
    refused(o(root, 'contract', 'put', file(root, 'bad2.json', { commands: {}, outcomes: [measure('OUT-A-001')] })), /test command/);
    refused(o(root, 'contract', 'put', file(root, 'c2.json', { commands: { tests: PASS, ci: 'none' }, outcomes: [{ ...measure('OUT-A-002'), state: 'passed' }] })), /passed only when/);
    refused(o(root, 'unit', file(root, 'u.json', { role: 'builder', serves: [] })), /no contract|not approved/);
    ok(o(root, 'contract', 'put', file(root, 'c.json', { source: { kind: 'instruction' }, commands: { tests: PASS, ci: 'none' }, outcomes: [measure('OUT-A-001')] })));
    refused(o(root, 'contract', 'approve'), /words/);
    refused(o(root, 'unit', file(root, 'u.json', { role: 'builder', serves: ['OUT-A-001'] })), /not approved/);
    const a = ok(o(root, 'contract', 'approve', '--words', 'yes', '--one-unit', 'yes', '--reason', 'one file'));
    assert.equal(a.path, 'light');
    assert.deepEqual(a.standing, ['OUT-STAND-TESTS'], 'no CI and no rules command: the light path gets the tests outcome only');
    refused(o(root, 'contract', 'put', file(root, 'c.json', { commands: { tests: PASS }, outcomes: [measure('OUT-A-009')] })), /approved/);
    const decisions = readFileSync(path.join(root, '.ai', 'workflows', S, 'decisions.yaml'), 'utf8');
    assert.match(decisions, /orchestrate-contract/, 'the approval is a decision of the person');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the size: more than two outcomes, or a design outcome, is the full path; the person outranks the check', () => {
  const root = makeRoot();
  try {
    assert.equal(approved(root, [measure('OUT-A-001'), measure('OUT-A-002'), measure('OUT-A-003')], ['--one-unit', 'yes', '--reason', 'r']).path, 'full');
  } finally { rmSync(root, { recursive: true, force: true }); }
  const root2 = makeRoot();
  try {
    assert.equal(approved(root2, [measure('OUT-A-001')]).path, 'full', 'with no word of the lead on one unit, the contract is full');
  } finally { rmSync(root2, { recursive: true, force: true }); }
  const root3 = makeRoot();
  try {
    assert.equal(approved(root3, [measure('OUT-A-001')], ['--path', 'light']).path, 'light');
    refused(o(root3, 'holdout', 'init'), /no holdout/);
    refused(o(root3, 'milestones', file(root3, 'm.json', { milestones: [] })), /no milestones/);
    refused(o(root3, 'unit', file(root3, 'u.json', { role: 'scenario', serves: [] })), /no scenario agent/);
    assert.equal(ok(o(root3, 'path', 'up', '--reason', 'larger than one unit')).path, 'full');
    ok(o(root3, 'holdout', 'init'));
  } finally { rmSync(root3, { recursive: true, force: true }); }
});

test('the light path: a builder, then the measure judge makes the outcomes passed; a builder result never does', () => {
  const root = makeRoot();
  try {
    approved(root, [measure('OUT-A-001')], ['--one-unit', 'yes', '--reason', 'one file']);
    const b = unit(root, { role: 'builder', title: 'do it', serves: ['OUT-A-001'], files: ['a.js'] }, built);
    ok(b.r);
    assert.equal(stateOf(root, 'OUT-A-001').state, 'open', 'the result of a builder proves nothing');
    refused(o(root, 'result', String(b.n), file(root, 'r.json', { status: 'done' })), /did|commands/);
    const m = ok(o(root, 'measure'));
    assert.deepEqual(m.outcomes.map((x) => x.state), ['passed', 'passed']);
    assert.equal(o(root, 'state').finished, true);
    commit(root);
    const later = o(root, 'state');
    assert.equal(later.finished, false, 'a pass of an older commit does not prove the current one');
    assert.deepEqual(later['passed-at-an-older-commit'].sort(), ['OUT-A-001', 'OUT-STAND-TESTS']);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the dispatch refuses: a Fable-class model, a low tier, a judge-only builder, the holdout in a builder task', () => {
  const root = makeRoot();
  try {
    approved(root, [behaviour('OUT-A-001'), measure('OUT-A-002'), measure('OUT-A-003')]);
    ok(o(root, 'holdout', 'init'));
    const hp = ok(o(root, 'holdout', 'path', '--role', 'scenario')).path;
    refused(o(root, 'holdout', 'path', '--role', 'builder'), /does not get the path/);
    const u = ok(o(root, 'unit', file(root, 'u.json', { role: 'builder', title: 'b', serves: ['OUT-A-001'], files: ['a.js'] }))).unit;
    const task = file(root, 't.md', 'the task');
    const d = (agent, t = task) => o(root, 'dispatch', String(u), '--agent', agent, '--task', t, '--host', 'claude');
    refused(d('claude:claude-fable-5-2'), /Fable-class/);
    refused(d('host:gpt-6-astra'), /judge|only/i);
    refused(d('codex:gpt-6-luna'), /tier/i);
    refused(d('host:no-such-model'), /tier|roster/i);
    refused(d(B, file(root, 'leak.md', `read ${hp}/working/OUT-A-001-1.md`)), /hidden scenarios/);
    const v = ok(o(root, 'unit', file(root, 'v.json', { role: 'product-validator', title: 'v', serves: ['OUT-A-001'] }))).unit;
    refused(o(root, 'dispatch', String(v), '--agent', B, '--task', task, '--host', 'claude'), /tier/i);
    ok(d(B));
    refused(d(B), /live agent/);
    refused(o(root, 'dispatch', String(v), '--agent', A, '--task', task, '--host', 'claude'), /cannot start now/);
    const u2 = ok(o(root, 'unit', file(root, 'u2.json', { role: 'builder', title: 'b2', serves: ['OUT-A-002'], files: ['a.js'] }))).unit;
    refused(o(root, 'dispatch', String(u2), '--agent', B, '--task', task, '--host', 'claude'), /cannot start now/);
    const u3 = ok(o(root, 'unit', file(root, 'u3.json', { role: 'builder', title: 'b3', serves: ['OUT-A-003'], files: ['other/b.js'] }))).unit;
    ok(o(root, 'dispatch', String(u3), '--agent', B, '--task', task, '--host', 'claude'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('validation: one fail is not a round, two of three decide, and three confirmed rounds hold the outcome', () => {
  const root = makeRoot();
  try {
    approved(root, [behaviour('OUT-A-001'), measure('OUT-A-002'), measure('OUT-A-003')]);
    ok(o(root, 'milestones', file(root, 'm.json', { milestones: [{ key: 'm1', title: 'all', outcomes: ['OUT-A-001', 'OUT-A-002', 'OUT-A-003'] }] })));
    refused(o(root, 'milestones', file(root, 'm.json', { milestones: [{ key: 'm1', title: 'all', outcomes: ['OUT-A-001'] }] })), /no milestone holds/);
    const v = (r) => unit(root, { role: 'product-validator', title: 'v', milestone: 'm1', serves: ['OUT-A-001'] }, r, A).r;

    refused(v({ status: 'done', did: 'x', commands: [] }), /verdicts/);
    let r = ok(v(verdict('OUT-A-001', 'fail')));
    assert.equal(r.outcomes[0].rounds, 0, 'one fail is not confirmed');
    assert.ok(r.outcomes[0].need, 'the script asks for one more validator');
    r = ok(v(verdict('OUT-A-001', 'pass')));
    assert.ok(r.outcomes[0].need, 'a pass and a fail need a third run');
    r = ok(v(verdict('OUT-A-001', 'pass')));
    assert.equal(r.outcomes[0].state, 'passed');
    assert.equal(r.outcomes[0].flaky, true, 'a pass after a failed run of the same commit is flaky');

    // A fail after a pass at the same commit is not confirmed yet, and it still takes the pass back.
    commit(root);
    assert.equal(ok(v(verdict('OUT-A-001', 'pass'))).outcomes[0].state, 'passed');
    r = ok(v(verdict('OUT-A-001', 'fail', 'reserve')));
    assert.equal(r.outcomes[0].state, 'open', 'an outcome with a pending failure is not shown as passed');
    assert.ok(r.outcomes[0].need);
    assert.equal(o(root, 'state').finished, false);
    assert.equal(ok(v(verdict('OUT-A-001', 'pass'))).outcomes[0].state, 'passed', 'two of three decide');

    for (let round = 1; round <= 3; round++) {
      commit(root);
      ok(v(verdict('OUT-A-001', 'fail')));
      r = ok(v(verdict('OUT-A-001', 'fail')));
      assert.equal(r.outcomes[0].rounds, round);
    }
    assert.equal(r.outcomes[0].state, 'held', 'three confirmed rounds make a contract question');
    assert.ok(r.outcomes[0].question);

    ok(o(root, 'scenario-wrong', 'OUT-A-001', '--reason', 'it asked for a thing the contract does not say'));
    assert.equal(stateOf(root, 'OUT-A-001').state, 'open', 'a void round takes the outcome back under the limit');
    assert.equal(stateOf(root, 'OUT-A-001').rounds, 2);

    ok(o(root, 'hold', 'OUT-A-001', '--question', 'Is this possible?', '--evidence', 'three tries'));
    refused(o(root, 'answer', 'OUT-A-001'), /words/);
    ok(o(root, 'answer', 'OUT-A-001', '--words', 'try once more'));
    const after = stateOf(root, 'OUT-A-001');
    assert.equal(after.state, 'open');
    assert.equal(after.rounds ?? 0, 0, 'an answer of the person starts the rounds again');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a code validator cannot pass or fail an outcome, except a breach of a written rule', () => {
  const root = makeRoot();
  try {
    approved(root, [behaviour('OUT-A-001'), measure('OUT-A-002'), measure('OUT-A-003')]);
    const finding = (rule) => ({ key: 'k1', dimension: 'correctness', severity: 'HIGH', file: 'a.js', issue: 'an issue', fix: 'a fix', rule });
    const r1 = ok(unit(root, { role: 'code-validator', title: 'cv', serves: [] }, { status: 'done', did: 'r', commands: [], findings: [finding(false)] }).r);
    assert.equal(r1.findings.count, 1);
    assert.match(r1.findings.command, /findings add/);
    assert.equal(r1.outcomes.find((x) => x.id === 'OUT-STAND-RULES').state, 'passed');
    assert.equal(stateOf(root, 'OUT-A-001').state, 'open');
    const r2 = ok(unit(root, { role: 'code-validator', title: 'cv', serves: [] }, { status: 'done', did: 'r', commands: [], findings: [finding(true)] }).r);
    assert.equal(r2.outcomes.find((x) => x.id === 'OUT-STAND-RULES').state, 'open', 'a rule breach quotes the rule, so it decides with no second validator');
    assert.equal(stateOf(root, 'OUT-A-001').state, 'open');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a contract change: proposed, then the person approves; a rewrite opens a passed outcome again', () => {
  const root = makeRoot();
  try {
    approved(root, [measure('OUT-A-001')], ['--one-unit', 'yes', '--reason', 'one file']);
    ok(o(root, 'measure'));
    assert.equal(stateOf(root, 'OUT-A-001').state, 'passed');
    const changes = { changes: [{ kind: 'rewrite', outcome: measure('OUT-A-001', 'node -e "process.exit(1)"') }, { kind: 'add', outcome: measure('OUT-A-002') }, { kind: 'add', outcome: measure('OUT-A-003') }] };
    refused(o(root, 'change', 'propose', file(root, 'ch.json', changes)), /why/);
    ok(o(root, 'change', 'propose', file(root, 'ch.json', changes), '--why', 'the person asked for more'));
    assert.equal(stateOf(root, 'OUT-A-001').state, 'passed', 'the contract stays as it was until the person answers');
    assert.equal(o(root, 'state').proposal.changes.length, 3);
    refused(o(root, 'change', 'propose', file(root, 'ch.json', changes), '--why', 'again'), /open proposal/);
    refused(o(root, 'change', 'approve'), /words/);
    const a = ok(o(root, 'change', 'approve', '--words', 'yes'));
    assert.equal(a.path, 'full', 'more than two outcomes moves a light contract to the full path');
    assert.equal(stateOf(root, 'OUT-A-001').state, 'open');
    assert.ok(stateOf(root, 'OUT-A-002'));

    ok(o(root, 'change', 'propose', file(root, 'ch2.json', { changes: [{ kind: 'drop', id: 'OUT-A-003' }] }), '--why', 'not needed'));
    ok(o(root, 'change', 'refuse', '--words', 'no, keep it'));
    assert.equal(stateOf(root, 'OUT-A-003').state, 'open');

    const m = ok(o(root, 'measure', 'OUT-A-001'));
    assert.equal(m.measured[0].runs.length, 2, 'a failed measure runs a second time to confirm');
    assert.equal(m.outcomes[0].rounds, 1);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('unproven needs the probe, and the evidence page shows each state and no secret', () => {
  const root = makeRoot();
  try {
    approved(root, [behaviour('OUT-A-001'), measure('OUT-A-002'), measure('OUT-A-003')]);
    refused(o(root, 'unproven', 'OUT-A-001', '--why', 'no device'), /command|output/);
    ok(o(root, 'unproven', 'OUT-A-001', '--command', 'adb devices', '--output', 'no devices', '--why', 'this machine has no phone'));
    ok(o(root, 'measure'));
    const e = ok(o(root, 'evidence'));
    assert.deepEqual(e.unproven, ['OUT-A-001']);
    assert.ok(!o(root, 'state').outcomes.some((x) => x.id === 'OUT-A-001' && x.state === 'passed'), 'an unproven outcome is never shown as passed');
    const html = readFileSync(e.page, 'utf8');
    assert.match(html, /OUT-A-001/);
    assert.match(html, /unproven/i);
    assert.ok(e.page.replace(/\\/g, '/').includes(`/.ai/workflows/${S}/orchestrate/evidence.html`), 'the page is a record of the workflow');

    const log = file(root, 'run.log', 'start\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz012345\nexport API_KEY=sk-live-0123456789abcdef0123\nend\n');
    const s = ok(o(root, 'scrub', log));
    assert.ok(s.removed >= 1);
    const clean = readFileSync(log, 'utf8');
    assert.ok(!clean.includes('abcdefghijklmnopqrstuvwxyz012345') && !clean.includes('sk-live-0123456789abcdef0123'));
    assert.match(clean, /start[\s\S]*end/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a design outcome needs the approved design with its checklist before the contract is approved', () => {
  const root = makeRoot();
  try {
    const design = { id: 'OUT-UI-001', says: 'The squad screen looks as designed.', kind: 'design', proof: { record: 'squad', screens: ['squad'] }, source: 'interview' };
    ok(o(root, 'contract', 'put', file(root, 'c.json', { commands: { tests: PASS, ci: 'none' }, outcomes: [design] })));
    refused(o(root, 'contract', 'approve', '--words', 'yes'), /design/);
    const du = ok(o(root, 'unit', file(root, 'u.json', { role: 'design', title: 'design the squad screen', serves: ['OUT-UI-001'] })));
    ok(o(root, 'dispatch', String(du.unit), '--agent', A, '--task', file(root, 't.md', 'design it'), '--host', 'claude'));
    refused(o(root, 'contract', 'design', 'OUT-UI-001', '--checklist', file(root, 'k.json', { checklist: ['the list has three columns'] })), /words/);
    ok(o(root, 'contract', 'design', 'OUT-UI-001', '--checklist', file(root, 'k.json', { checklist: ['the list has three columns'] }), '--words', 'I like it'));
    assert.equal(ok(o(root, 'contract', 'approve', '--words', 'yes', '--one-unit', 'yes', '--reason', 'r')).path, 'full', 'a design outcome is never the light path');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('the holdout is outside the repo and outside the records', () => {
  const root = makeRoot();
  try {
    approved(root, [behaviour('OUT-A-001'), measure('OUT-A-002'), measure('OUT-A-003')]);
    const init = ok(o(root, 'holdout', 'init'));
    assert.equal(init.path, undefined, 'init does not print the path');
    const p = ok(o(root, 'holdout', 'path', '--role', 'product-validator'));
    assert.ok(existsSync(p.working) && existsSync(p.reserve));
    const rel = path.relative(path.join(root, '.ai'), p.path);
    assert.ok(rel.startsWith('..'), 'not under .ai');
    assert.ok(p.path.replace(/\\/g, '/').includes('/.home/holdout/'), 'under the machine folder of the plugin');
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('a usage error returns null, and an unknown slug form is refused', () => {
  assert.equal(run([]), null);
  assert.equal(run(['state']), null);
  assert.equal(run(['no-such-command', '.', 'demo']), null);
  assert.equal(run(['state', '.', 'Not A Slug']).ok, false);
  assert.equal(run(['contract', '.', 'demo']), null, 'a command with actions needs one');
});

test('the person says which agents a run may use, and a dispatch to another agent is refused', () => {
  const root = makeRoot();
  try {
    approved(root, [measure('OUT-A-001')], ['--one-unit', 'yes', '--reason', 'one file']);
    rmSync(path.join(root, '.ai', 'workflows', S, 'orchestrate', 'run.yaml'));
    assert.equal(ok(o(root, 'agents', 'get')).allowed, null);
    const u = ok(o(root, 'unit', file(root, 'u.json', { role: 'builder', title: 'b', serves: ['OUT-A-001'], files: ['a.js'] }))).unit;
    const d = (agent) => o(root, 'dispatch', String(u), '--agent', agent, '--task', file(root, 't.md', 'task'), '--host', 'claude');
    refused(d(B), /has not said which agents/);
    refused(o(root, 'agents', 'allow', '--ids', B), /words/);
    refused(o(root, 'agents', 'allow', '--ids', 'host:claude-fable-5-2', '--words', 'x'), /Fable-class/);
    refused(o(root, 'agents', 'allow', '--ids', 'host:nothing', '--words', 'x'), /not an id of the roster/);
    const a = ok(o(root, 'agents', 'allow', '--ids', B, '--words', 'only sonnet'));
    assert.match(a.warning, /tier A/);
    refused(d(A), /not an agent that the person allowed/);
    ok(d(B));
    assert.deepEqual(o(root, 'state').agents, [B]);
    assert.match(readFileSync(path.join(root, '.ai', 'workflows', S, 'decisions.yaml'), 'utf8'), /orchestrate-agents/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('an action word is accepted before the root or after the slug', () => {
  const root = makeRoot();
  try {
    const c = file(root, 'c.json', { commands: { tests: PASS, ci: 'none' }, outcomes: [behaviour('OUT-A-001'), measure('OUT-A-002'), measure('OUT-A-003')] });
    ok(run(['contract', root, S, 'put', c]));
    ok(run(['contract', 'approve', root, S, '--words', 'yes']));
    ok(run(['holdout', 'init', root, S]));
    ok(run(['holdout', root, S, 'path', '--role', 'scenario']));
    assert.equal(ok(run(['contract', root, S, 'get'])).contract.status, 'approved');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
