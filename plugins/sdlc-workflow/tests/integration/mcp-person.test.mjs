// The adversarial suite of the wf MCP server: no path of an agent records an answer, an approval,
// a rule or a consent in the name of the person. The server holds with no hook (a missing hook),
// and the hook holds for a sub-agent and a Workflow agent: wf_person, a spoofed `as`, an entry by
// the person, a checkout of another repo, and the effects that cannot be taken back.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { registry } from '../../lib/ops/registry.mjs';
import { callTool } from '../../mcp/tools.mjs';

const HOOK = join(import.meta.dirname, '..', '..', 'hooks', 'pre-tool-use-all.mjs');
const TOOL = (n) => `mcp__plugin_sdlc-workflow_wf__${n}`;

function project() {
  const root = mkdtempSync(join(tmpdir(), 'mcp-person-'));
  mkdirSync(join(root, '.ai', 'workflows', 'demo'), { recursive: true });
  execFileSync('git', ['init', '-q', root]);
  return { root, done: () => rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }) };
}

const decisionsOf = async (root) => (await callTool('wf_read', { slug: 'demo', items: [{ op: 'decide list', all: true }] }, { root })).data[0];

test('no tool but wf_person runs an operation of the person, whatever the caller says', async () => {
  const p = project();
  try {
    const person = [...registry().values()].filter((r) => r.tool === 'wf_person').map((r) => r.op);
    assert.ok(person.length >= 25, `the operations of the person: ${person.length}`);
    for (const tool of ['wf_query', 'wf_run', 'wf_step', 'wf_decide', 'wf_wait', 'wf_job', 'wf_act']) {
      for (const op of person) {
        const r = await callTool(tool, { op, slug: 'demo' }, { root: p.root, caller: 'person' });
        assert.equal(r.ok, false, `${tool} ran ${op}`);
        assert.match(r.error.message, /belongs to wf_person|no operation|is no operation/, `${tool} ${op}: ${r.error.message}`);
      }
    }
  } finally { p.done(); }
});

test('with no hook, an agent records no entry by the person, no steer and no approval', async () => {
  const p = project();
  // The caller says it is the person: outside wf_person that is an agent.
  const ctx = { root: p.root, caller: 'person' };
  try {
    const attempts = [
      ['wf_decide', { op: 'decide add', slug: 'demo', key: 'db', question: 'Which database?', answer: 'postgres', by: 'person' }],
      ['wf_decide', { op: 'decide add', slug: 'demo', key: 'go', answer: 'ship it', kind: 'steer' }],
      ['wf_decide', { op: 'decide add', slug: 'demo', key: 'ok', answer: 'approved', kind: 'approval' }],
      ['wf_decide', { op: 'add_many', slug: 'demo', entries: [{ key: 'a', question: 'q', answer: 'x', by: 'stage' }, { key: 'b', question: 'q', answer: 'y', by: 'person' }] }],
      ['wf_run', { slug: 'demo', code: "await wf.decisions.add({ key: 'db', question: 'Which database?', answer: 'postgres', by: 'person' }); return 1;" }],
      ['wf_run', { slug: 'demo', code: "await wf.decisions.addMany([{ key: 'db', question: 'q', answer: 'p', kind: 'approval' }]); return 1;" }],
      ['wf_run', { op: 'record put', slug: 'demo', records: { 'decisions.jsonl': '{"by":"person"}' } }],
    ];
    for (const [tool, args] of attempts) {
      const r = await callTool(tool, args, ctx);
      assert.equal(r.ok, false, `${tool} ${JSON.stringify(args).slice(0, 80)} was let through`);
      assert.match(r.error.message, /in the name of the person|is no record name/, `refused for another reason: ${r.error.message}`);
    }
    // The control: an agent's own entry goes through.
    const own = await callTool('wf_decide', { op: 'decide add', slug: 'demo', key: 'db2', question: 'Which?', answer: 'mine', by: 'stage' }, ctx);
    assert.equal(own.ok, true, JSON.stringify(own));
    const d = await decisionsOf(p.root);
    assert.equal(JSON.stringify(d.data ?? '').includes('postgres'), false, 'no entry was recorded');
  } finally { p.done(); }
});

test('a job runs as an agent too: an operation of the person never starts as a job', async () => {
  const p = project();
  try {
    const r = await callTool('wf_job', { op: 'consent grant', slug: 'demo' }, { root: p.root, caller: 'person' });
    assert.equal(r.ok, false);
    assert.match(r.error.message, /belongs to wf_person/);
    const jobs = join(p.root, '.ai', 'run', 'demo', 'jobs');
    assert.equal(existsSync(jobs) && readdirSync(jobs).length > 0, false, 'no job was started');
  } finally { p.done(); }
});

/** Run the PreToolUse hook on a payload: its exit, its reason, and its JSON answer. */
function hook(payload, cwd) {
  const r = spawnSync(process.execPath, [HOOK], { input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd, ...payload }), encoding: 'utf8', cwd, env: { ...process.env, CLAUDE_PROJECT_DIR: cwd } });
  let out = null;
  try { out = JSON.parse(r.stdout.trim().split('\n').at(-1)); } catch { /* no answer */ }
  return { exit: r.status, stderr: r.stderr, out };
}

test('the hook: a sub-agent or a Workflow agent does not call wf_person, nor speak as the session or the person', () => {
  const p = project();
  try {
    const agents = [{ agent_id: 'a1', agent_type: 'general-purpose' }, { agent_id: 'w1', agent_type: 'workflow-subagent' }];
    for (const a of agents) {
      assert.equal(hook({ ...a, tool_name: TOOL('wf_person'), tool_input: { op: 'consent grant', slug: 'demo' } }, p.root).exit, 2, `${a.agent_type} called wf_person`);
      for (const as of ['session', 'person']) {
        const r = hook({ ...a, tool_name: TOOL('wf_run'), tool_input: { op: 'talk post', slug: 'demo', as, to: 'all', text: 'x' } }, p.root);
        assert.equal(r.exit, 2, `${a.agent_type} spoke as ${as}`);
      }
      assert.equal(hook({ ...a, tool_name: TOOL('wf_decide'), tool_input: { op: 'add_many', slug: 'demo', entries: [{ key: 'k', answer: 'a', by: 'person' }] } }, p.root).exit, 2);
      assert.equal(hook({ ...a, tool_name: TOOL('wf_decide'), tool_input: { op: 'decide add', slug: 'demo', key: 'k', answer: 'a', by: 'person' } }, p.root).exit, 2);
      // Its own name is fine.
      assert.equal(hook({ ...a, tool_name: TOOL('wf_run'), tool_input: { op: 'talk post', slug: 'demo', as: 'verify:api', to: 'all', text: 'x' } }, p.root).exit, 0);
    }
    // The session itself may call wf_person: the host asks the person.
    assert.equal(hook({ tool_name: TOOL('wf_person'), tool_input: { op: 'consent grant', slug: 'demo' } }, p.root).exit, 0);
  } finally { p.done(); }
});

test('the hook: a checkout of another repo is denied; a worktree of this repo is not', () => {
  const p = project();
  const other = project();
  try {
    execFileSync('git', ['-C', p.root, '-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-q', '--allow-empty', '-m', 'one']);
    const wt = join(p.root, '..', `${p.root.split(/[\\/]/).at(-1)}-wt`);
    execFileSync('git', ['-C', p.root, 'worktree', 'add', '-q', wt]);
    try {
      assert.equal(hook({ tool_name: TOOL('wf_step'), tool_input: { op: 'step start', slug: 'demo', slice: 'api', n: 1, checkout: other.root } }, p.root).exit, 2);
      assert.equal(hook({ tool_name: TOOL('wf_step'), tool_input: { op: 'step start', slug: 'demo', slice: 'api', n: 1, checkout: wt } }, p.root).exit, 0);
      assert.equal(hook({ tool_name: TOOL('wf_step'), tool_input: { op: 'step start', slug: 'demo', slice: 'api', n: 1, checkout: join(tmpdir(), 'no-such-folder-wf') } }, p.root).exit, 2);
    } finally { execFileSync('git', ['-C', p.root, 'worktree', 'remove', '--force', wt]); }
  } finally { p.done(); other.done(); }
});

test('the hook asks the person before an effect that cannot be taken back, and only then', () => {
  const p = project();
  try {
    const ask = (input) => hook({ tool_name: TOOL('wf_act'), tool_input: { slug: 'demo', ...input } }, p.root).out?.hookSpecificOutput?.permissionDecision ?? null;
    for (const op of ['ship merge', 'merge', 'gh flush', 'design server install', 'records migrate', 'campaign built']) assert.equal(ask({ op }), 'ask', op);
    assert.equal(ask({ op: 'campaign built', 'no-push': true }), null, 'a build with no push stays local');
    assert.equal(ask({ op: 'campaign migrate', 'dry-run': true }), null);
    assert.equal(ask({ op: 'worktree add' }), null);
    assert.equal(ask({ op: 'records sync' }), null, 'the records repo is the work of wf');
  } finally { p.done(); }
});

test('a call does not reach another project through root', async () => {
  const a = project();
  const b = project();
  try {
    const r = await callTool('wf_run', { op: 'talk post', slug: 'demo', as: 'driver', to: 'all', text: 'x', root: b.root }, { root: a.root, caller: 'driver' });
    assert.equal(r.ok, false);
    assert.match(r.error.message, /does not name another root/);
    assert.equal(existsSync(join(b.root, '.ai', 'workflows', 'demo', 'talk.jsonl')), false);
    const read = await callTool('wf_read', { slug: 'demo', items: [{ op: 'talk list', root: b.root }] }, { root: a.root });
    assert.equal(read.ok, false);
    const own = await callTool('wf_run', { op: 'talk post', slug: 'demo', as: 'driver', to: 'all', text: 'x', root: a.root }, { root: a.root, caller: 'driver' });
    assert.equal(own.ok, true, 'its own root is fine');
  } finally { a.done(); b.done(); }
});
