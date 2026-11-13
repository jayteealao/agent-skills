// lib/orchestrate-runner.mjs: the command line of each agent program, the launch under hc and
// without it, the wait, and the rule that the run ends only its own terminals. Every test
// gives a fake `run`, so no test starts a program.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { checkDispatch, decide, filesMeet, scrubSecrets, startBlock } from '../../../lib/orchestrate.mjs';
import { RUN_LABEL, agentArgv, endTerminal, firstMessage, launch, rosterOf, sendText, terminalName, terminalsOf, waitFor } from '../../../lib/orchestrate-runner.mjs';

const TIERS = JSON.parse(readFileSync(new URL('../../../skills/wf/reference/orchestrate/tiers.json', import.meta.url), 'utf8'));
const okJson = (value) => ({ status: 0, stdout: JSON.stringify(value), stderr: '' });
const fail = { status: 1, stdout: '', stderr: 'not found', error: new Error('ENOENT') };

test('each agent writes inside the checkout with no prompt, and never with full access', () => {
  const message = firstMessage('C:/r/task-1.md');
  const codex = agentArgv({ program: 'codex', model: 'gpt-6.1-sol', message, interactive: true });
  assert.deepEqual(codex.slice(0, 2), ['codex', '--no-daemon'], 'an interactive Codex under hc runs with no daemon');
  assert.deepEqual(codex.slice(codex.indexOf('--sandbox'), codex.indexOf('--sandbox') + 2), ['--sandbox', 'workspace-write']);
  assert.deepEqual(codex.slice(codex.indexOf('--ask-for-approval'), codex.indexOf('--ask-for-approval') + 2), ['--ask-for-approval', 'never']);
  assert.equal(codex.at(-1), message);
  assert.deepEqual(agentArgv({ program: 'codex', model: 'm', message, interactive: false }).slice(0, 2), ['codex', 'exec']);

  const pi = agentArgv({ program: 'pi', model: 'glm-5.3', provider: 'zai', effort: 'medium', message, interactive: true });
  assert.deepEqual(pi, ['pi', '--provider', 'zai', '--model', 'glm-5.3', '--thinking', 'medium', message]);
  assert.ok(agentArgv({ program: 'pi', model: 'm', message, interactive: false }).includes('--print'));

  const claude = agentArgv({ program: 'claude', model: 'claude-sonnet-5-5', message, interactive: true });
  assert.deepEqual(claude, ['claude', '--model', 'claude-sonnet-5-5', '--permission-mode', 'auto', '--effort', 'high', message]);

  for (const argv of [codex, pi, claude]) {
    assert.ok(!argv.some((a) => /danger|bypass|yolo|full-access|skip-permissions|dontAsk/i.test(a)), argv.join(' '));
  }
  assert.throws(() => agentArgv({ program: 'gemini', model: 'm', message, interactive: true }), /not an agent program/);

  // The holdout is outside the checkout: only a role that uses it gets that one folder more.
  const withDir = (program) => agentArgv({ program, model: 'm', message, interactive: true, dirs: ['C:/home/holdout/x'] });
  for (const program of ['codex', 'claude']) {
    const argv = withDir(program);
    assert.deepEqual(argv.slice(argv.indexOf('--add-dir'), argv.indexOf('--add-dir') + 2), ['--add-dir', 'C:/home/holdout/x']);
    assert.equal(argv.at(-1), message);
  }
  assert.ok(!withDir('pi').includes('--add-dir'));
  assert.ok(!codex.includes('--add-dir'), 'a builder gets no folder outside the checkout');
});

test('the task reaches the agent as a file path, and a terminal name fits the limit of hc', () => {
  assert.match(firstMessage('C:/r/task-1.md'), /^Read the file C:\/r\/task-1\.md now/);
  const name = terminalName('brainstorm-match-engine-20261003-run', 'product-validator', 12);
  assert.ok(name.length <= 32, name);
  assert.match(name, /^[a-z0-9][a-z0-9_-]*-12$/);
  assert.notEqual(terminalName('demo', 'builder', 1), terminalName('demo', 'builder', 2));
});

test('launch under hc: a background terminal with the label of the run that outlives the lead', () => {
  const calls = [];
  const run = (program, args) => { calls.push([program, ...args]); return okJson({ address: 't9', name: 'demo-builder-1', state: 'live' }); };
  const r = launch({ hc: true, slug: 'demo', role: 'builder', n: 1, cwd: 'C:/r', program: 'codex', model: 'gpt-6.1-sol', effort: 'high', taskFile: 'C:/r/task-1.md' }, { run });
  assert.deepEqual(r, { launch: 'hc', terminal: 'demo-builder-1', address: 't9' });
  const [cmd] = calls;
  assert.deepEqual(cmd.slice(0, 4), ['hc', 'run', '--bg', '--json']);
  assert.ok(cmd.includes('--outlive-parent'));
  assert.ok(cmd.includes(`${RUN_LABEL}=demo`));
  assert.deepEqual(cmd.slice(cmd.indexOf('--') + 1, cmd.indexOf('--') + 3), ['codex', '--no-daemon']);
  assert.throws(() => launch({ hc: true, slug: 'demo', role: 'builder', n: 1, cwd: 'C:/r', program: 'codex', model: 'm', taskFile: 't' }, { run: () => ({ status: 1, stdout: '', stderr: '{"error":{"message":"name is taken"}}' }) }), /name is taken/);
});

test('launch with no hc: the program runs once, and the call returns its end', () => {
  const calls = [];
  const run = (program, args) => { calls.push([program, ...args]); return { status: 0, stdout: 'done', stderr: '' }; };
  const r = launch({ hc: false, slug: 'demo', role: 'builder', n: 1, cwd: 'C:/r', program: 'claude', model: 'claude-sonnet-5-5', taskFile: 'C:/r/task-1.md' }, { run });
  assert.equal(r.launch, 'direct');
  assert.equal(r.status, 'done');
  assert.ok(calls[0].includes('--print'), 'the one-shot form');
  assert.equal(launch({ hc: false, slug: 'demo', role: 'builder', n: 1, cwd: 'C:/r', program: 'claude', model: 'm', taskFile: 't' }, { run: () => ({ status: 2, stdout: '', stderr: 'boom' }) }).status, 'error');
});

test('the roster: only programs that run, a host subagent always, and no refused model', () => {
  const none = rosterOf(TIERS, { run: () => fail, host: 'claude' });
  assert.equal(none.hc, false);
  assert.ok(none.agents.length > 0 && none.agents.every((a) => a.launch === 'host-subagent'), 'with no program installed, the host subagents are the roster');
  assert.deepEqual(rosterOf(TIERS, { run: () => fail }).agents, [], 'with no host named and no program, the roster is empty');

  const all = rosterOf(TIERS, { run: () => okJson({}), host: 'codex' });
  assert.equal(all.hc, true);
  assert.ok(all.agents.some((a) => a.program === 'codex' && a.launch === 'hc'));
  assert.ok(all.agents.some((a) => a.program === 'pi' && a.provider));
  // A provider can name a model in another way: the roster carries that name for the launch.
  const glm = all.agents.find((a) => a.id === 'pi:glm-5.3');
  assert.deepEqual([glm.provider, glm['run-as'], glm.model], ['openrouter', 'z-ai/glm-5.3', 'glm-5.3']);
  for (const a of all.agents.filter((x) => x.provider === 'openrouter')) assert.ok(!/claude|anthropic/i.test(a['run-as']), 'no Claude model goes through OpenRouter');
  assert.ok(!all.agents.some((a) => /fable|mythos/i.test(a.model)), 'no Fable-class or Mythos-class model is ever on the roster');
  assert.ok(all.agents.some((a) => a['judge-only']), 'a judge-only model is listed, and the dispatch keeps it out of the build roles');
  // On Windows the check of a program goes through cmd.exe, so the program is in the arguments.
  // With a check, a provider of pi whose sign-in is not ready is marked, and asked once.
  let checks = 0;
  const checked = rosterOf(TIERS, { check: true, run: (p, args) => {
    if (!args.includes('auth')) return okJson({});
    checks += 1;
    return okJson(args.includes('anthropic') ? { status: 'invalid', reason: 'invalid_state' } : { status: 'ready' });
  } });
  const piAgents = checked.agents.filter((a) => a.program === 'pi');
  assert.ok(piAgents.filter((a) => a.provider === 'anthropic').every((a) => a['not-ready'] === 'invalid_state'));
  assert.ok(piAgents.filter((a) => a.provider !== 'anthropic').every((a) => !a['not-ready']));
  assert.equal(checks, new Set(piAgents.map((a) => a.provider)).size, 'one check for each provider');
  assert.ok(all.agents.every((a) => !('not-ready' in a)), 'no check without the option');
  const noHc = rosterOf(TIERS, { run: (p, args) => (p === 'hc' || args.includes('hc') ? fail : okJson({})) });
  assert.ok(noHc.agents.every((a) => a.launch === 'direct'));
});

test('the model rules of a dispatch', () => {
  assert.throws(() => checkDispatch(TIERS, { role: 'builder', model: 'claude-fable-5-2' }), /Fable-class/);
  assert.throws(() => checkDispatch(TIERS, { role: 'builder', model: 'claude-mythos-5-2' }), /Fable-class or Mythos-class/);
  assert.throws(() => checkDispatch(TIERS, { role: 'builder', model: 'unknown-model' }), /no tier/);
  assert.throws(() => checkDispatch(TIERS, { role: 'product-validator', model: 'claude-sonnet-5-5' }), /needs tier A/);
  assert.throws(() => checkDispatch(TIERS, { role: 'builder-hard', model: 'gpt-6-astra' }), /never builds/);
  assert.throws(() => checkDispatch(TIERS, { role: 'builder', model: 'gpt-6-luna' }), /needs tier B/);
  assert.equal(checkDispatch(TIERS, { role: 'product-validator', model: 'gpt-6-astra' }).tier, 'A');
  assert.equal(checkDispatch(TIERS, { role: 'builder', model: 'opus' }).model, 'claude-opus-5-5', 'an alias resolves, and a role may take a higher tier');
  assert.throws(() => checkDispatch(TIERS, { role: 'boss', model: 'opus' }), /not a role/);
});

test('one checkout: builders with meeting files wait, and builders and validators never overlap', () => {
  assert.equal(filesMeet(['src/a.js'], ['src/b.js']), false);
  assert.equal(filesMeet(['src'], ['src/b.js']), true, 'a folder meets a file inside it');
  assert.equal(filesMeet(['.\\src\\a.js'], ['src/a.js']), true);
  const running = (role, files, n = 1) => ({ n, role, files, state: 'running' });
  assert.equal(startBlock([running('builder', ['src/a.js'])], { n: 2, role: 'builder', files: ['src/b.js'] }), null);
  assert.match(startBlock([running('builder', ['src/a.js'])], { n: 2, role: 'builder', files: ['src/a.js'] }), /files meet/);
  assert.match(startBlock([running('builder', ['src/a.js'])], { n: 2, role: 'builder', files: [] }), /names no files/);
  assert.match(startBlock([running('builder', ['src/a.js'])], { n: 2, role: 'product-validator', files: [] }), /no builder writes/);
  assert.match(startBlock([running('code-validator', [])], { n: 2, role: 'builder', files: ['x'] }), /while a validator runs/);
  assert.equal(startBlock([running('product-validator', [])], { n: 2, role: 'artifact-validator', files: [] }), null, 'validators can run together');
  assert.equal(startBlock([running('builder', ['a'])], { n: 2, role: 'scenario', files: [] }), null, 'the scenario agent writes outside the repo');
});

test('decide: one pass decides, a fail needs a second run, and two of three decide', () => {
  const v = (...list) => list.map((verdict) => ({ verdict }));
  assert.equal(decide([]).decision, null);
  assert.equal(decide(v('pass')).decision, 'pass');
  assert.equal(decide(v('fail')).decision, null);
  assert.equal(decide(v('fail', 'fail')).decision, 'fail');
  assert.equal(decide(v('fail', 'pass')).decision, null);
  assert.deepEqual(decide(v('fail', 'pass', 'pass')), { decision: 'pass', flaky: true, need: null });
  assert.equal(decide(v('fail', 'pass', 'fail')).decision, 'fail');
  assert.equal(decide([{ verdict: 'fail', void: { reason: 'wrong scenario' } }, { verdict: 'pass' }]).decision, 'pass', 'a void verdict does not count');
  assert.equal(decide([{ verdict: 'fail', confirmed: true }]).decision, 'fail', 'a breach of a quoted rule decides alone');
});

test('wait: a timeout is a check-in, a blocked agent is reported, and a gone terminal is not an error', () => {
  const hc = (wait, get) => (program, args) => (args[0] === 'wait' ? wait : get);
  // The shapes are the output of a live `hc`: `ended` says that the wait ended, not the program.
  const live = (state) => okJson({ name: 't', state: 'live', status: state ? { app: 'codex', state } : null });
  const timeout = okJson({ ended: false, exit_code: null, reason: 'timeout', status: 'working', turn: 0 });
  assert.equal(waitFor('t', { run: hc(timeout, live('working')) }).status, 'working');
  assert.equal(waitFor('t', { run: hc(okJson({ ended: true, exit_code: null, reason: 'status', status: 'done', turn: 1 }), live('done')) }).status, 'done', 'a turn that ended is not an exit');
  assert.equal(waitFor('t', { run: hc(okJson({ ended: true, exit_code: null, reason: 'status', status: 'blocked', turn: 0 }), live('blocked')) }).status, 'blocked');
  assert.equal(waitFor('t', { run: hc(okJson({ ended: true, exit_code: null, reason: 'status', status: 'idle', turn: 0 }), live('idle')) }).status, 'working', 'idle before the first turn is the start, not the end');
  assert.equal(waitFor('t', { run: hc(okJson({ ended: true, exit_code: null, reason: 'status', status: 'idle', turn: 0 }), live('idle')) }).idle, true, 'the caller lets the result file decide');
  assert.equal(waitFor('t', { run: hc(okJson({ ended: true, exit_code: null, reason: 'status', status: 'idle', turn: 2 }), live('idle')) }).status, 'idle');
  assert.equal(waitFor('t', { run: hc(timeout, live(null)) }).status, 'starting', 'an agent with no status yet has not started: a start dialog can hold it');
  assert.equal(waitFor('t', { run: hc(okJson({ ended: true, exit_code: 1, reason: 'exit', status: null, turn: 1 }), okJson({ name: 't', state: 'finished', status: null })) }).status, 'exited');
  assert.equal(waitFor('t', { run: hc(fail, fail) }).status, 'gone');
  const stopped = okJson({ name: 't', state: 'live', status: { app: 'codex', state: 'idle' }, turn: 1 });
  assert.equal(waitFor('t', { run: hc(okJson({ ended: false, reason: 'timeout', status: 'working', turn: 1 }), stopped) }).status, 'idle', 'after a timeout, an agent that stopped is not reported as working');
});

test('a send is checked: text that sits in the input with no submit gets one Enter', () => {
  const term = (state, turn) => okJson({ name: 't', state: 'live', status: { app: 'codex', state }, turn });
  const fake = (states) => {
    const calls = [];
    let gets = 0;
    const run = (program, args) => {
      calls.push(args.slice(0, 2).join(' '));
      if (args[0] === 'get') { const s = states[Math.min(gets, states.length - 1)]; gets += 1; return term(...s); }
      return okJson({});
    };
    return { run, calls };
  };
  const good = fake([['idle', 1], ['working', 1]]);
  assert.deepEqual(sendText('t', 'go on', { run: good.run }), { terminal: 't', sent: true });
  assert.ok(!good.calls.includes('keys t'), 'a send that started the turn needs no key');

  const stuck = fake([['idle', 1], ['idle', 1], ['working', 1]]);
  assert.deepEqual(sendText('t', 'go on', { run: stuck.run }), { terminal: 't', sent: true, 'pressed-enter': true });
  assert.equal(stuck.calls.filter((c) => c === 'keys t').length, 1, 'one Enter, not a loop');

  const fast = fake([['idle', 1], ['idle', 2]]);
  assert.deepEqual(sendText('t', 'go on', { run: fast.run }), { terminal: 't', sent: true }, 'a turn that already ended gets no Enter');

  const dead = fake([['idle', 1]]);
  assert.ok(sendText('t', 'go on', { run: dead.run })['not-started']);
  assert.ok(!dead.calls.some((c) => /force/.test(c)));
  assert.throws(() => sendText('t', 'x', { run: (p, args) => (args[0] === 'send' ? { status: 1, stdout: '', stderr: 'blocked' } : term('blocked', 1)) }), /did not reach/);
});

test('the run ends only a terminal that carries its label', () => {
  const calls = [];
  const run = (program, args) => {
    calls.push(args.join(' '));
    if (args[0] === 'ls') return okJson({ terminals: [{ name: 'demo-builder-1', address: 't1' }, { name: 'someone-else', address: 't2' }, { address: 't3' }] });
    if (args[0] === 'get') return okJson({ name: args[1], state: 'live', status: null, labels: args[1] === 'demo-builder-1' ? { [RUN_LABEL]: 'demo', 'wf.role': 'builder' } : {} });
    return okJson({});
  };
  assert.deepEqual(terminalsOf('demo', { run }).map((t) => [t.name, t.role]), [['demo-builder-1', 'builder']]);
  assert.throws(() => endTerminal('demo', 'someone-else', { run }), /not a terminal of the run/);
  assert.ok(!calls.some((c) => c.startsWith('kill someone-else')), 'a terminal of another owner is never killed');
  assert.deepEqual(endTerminal('demo', 'demo-builder-1', { run }), { terminal: 'demo-builder-1', ended: true });
  assert.ok(calls.includes('kill demo-builder-1 --json') && calls.includes('rm demo-builder-1 --json'));
  assert.ok(!calls.some((c) => /^(stop|restart|shutdown)/.test(c)), 'the run never stops the core of hc');
});

test('scrubSecrets removes a key and keeps the rest of the log', () => {
  const r = scrubSecrets('ok line\nAuthorization: Bearer abcdefghijklmnopqrstuvwxyz012345\ntoken=ghp_abcdefghijklmnopqrstuvwxyz0123456789\nlast line');
  assert.ok(r.removed >= 2, JSON.stringify(r));
  assert.ok(!/abcdefghijklmnopqrstuvwxyz012345|ghp_abcdefghijklmnopqrstuvwxyz0123456789/.test(r.text));
  assert.match(r.text, /^ok line\n[\s\S]*\nlast line$/);
  assert.deepEqual(scrubSecrets('nothing secret here'), { text: 'nothing secret here', removed: 0 });
});
