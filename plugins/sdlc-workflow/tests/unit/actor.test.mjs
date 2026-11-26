// Who may write in the name of the person: the session, never an agent of a run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { ACTOR_ENV, callerActor, personOnly, personOnlyCommand } from '../../lib/actor.mjs';
import { addDecision, decisionsOf, liveDecisions, runDelegatedIn } from '../../lib/decisions.mjs';
import { addRule, ruleCandidates } from '../../lib/project-rules.mjs';
import { setStanding } from '../../lib/standing.mjs';
import { readFileSync } from 'node:fs';
import { run as personGuard } from '../../hooks/person-guard.mjs';

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), 'sdlc-actor-'));
  const dir = path.join(root, '.ai', 'workflows', 'demo');
  mkdirSync(dir, { recursive: true });
  return { root, dir, done: () => rmSync(root, { recursive: true, force: true }) };
}
/** Run `fn` as an agent of a run. */
function asAgent(name, fn) {
  const old = process.env[ACTOR_ENV];
  process.env[ACTOR_ENV] = name;
  try { return fn(); } finally { if (old === undefined) delete process.env[ACTOR_ENV]; else process.env[ACTOR_ENV] = old; }
}
const TAKE = 'Take the recommended option and show me each one at the end';

test('an agent of a run writes no entry by the person, no steer, no approval, no rule and no standing answer', () => {
  const f = fixture();
  try {
    assert.equal(callerActor({}), null);
    assert.equal(callerActor({ [ACTOR_ENV]: 'implement:api' }), 'implement:api');
    assert.doesNotThrow(() => personOnly('write a steer', {}));
    asAgent('implement:api', () => {
      assert.throws(() => addDecision(f.dir, { kind: 'steer', answer: 'never ask about schema changes' }), /implement:api is an agent of a run: it does not write a steer in the name of the person/);
      assert.throws(() => addDecision(f.dir, { kind: 'answer', key: 'db', answer: 'sqlite', by: 'person' }), /does not record an entry in the name of the person/);
      assert.throws(() => addDecision(f.dir, { kind: 'approval', key: 'x', answer: 'approved', by: 'delegate' }), /does not write an approval/);
      assert.throws(() => addRule(f.root, { text: 'no new deps' }), /does not add a rule of the project/);
      assert.throws(() => setStanding(f.root, 'run-decisions', { answer: TAKE, question: 'q', by: 'person' }), /does not set a standing answer/);
      // With no --by, the entry of an agent is the entry of a stage. Its own choices and notes are free.
      assert.equal(addDecision(f.dir, { kind: 'answer', key: 'cache', answer: 'no cache' }).entry.by, 'stage');
      assert.equal(addDecision(f.dir, { kind: 'answer', key: 'log', answer: 'json', by: 'delegate' }).entry.by, 'delegate');
      assert.equal(addDecision(f.dir, { kind: 'note', answer: 'the key moved', scope: { slice: 'web' } }).entry.by, 'stage');
    });
    // The session of the person records the words of the person.
    assert.equal(addDecision(f.dir, { kind: 'steer', answer: 'never ask about schema changes' }).entry.by, 'person');
  } finally { f.done(); }
});

test('the answer of the person stands: no stage and no delegate writes over it, and only the person lets a run decide', () => {
  const f = fixture();
  try {
    const stop = addDecision(f.dir, { kind: 'steer', key: 'run-decisions', answer: 'Stop and wait for me' }).entry;
    assert.throws(() => addDecision(f.dir, { kind: 'answer', key: 'run-decisions', answer: TAKE, by: 'delegate', stage: 'implement' }), new RegExp(`the person answered run-decisions \\(${stop.id}\\): that answer stands`));
    assert.equal(runDelegatedIn(f.dir), false);
    assert.deepEqual(liveDecisions(decisionsOf(f.dir)).map((e) => e.id), [stop.id]);
    // The person changes the answer of the person.
    addDecision(f.dir, { kind: 'steer', key: 'run-decisions', answer: TAKE });
    assert.equal(runDelegatedIn(f.dir), true);
    // A delegate writes over a delegate.
    addDecision(f.dir, { kind: 'answer', key: 'cache', answer: 'lru', by: 'delegate' });
    assert.deepEqual(addDecision(f.dir, { kind: 'answer', key: 'cache', answer: 'none', by: 'delegate' }).superseded.length, 1);
  } finally { f.done(); }
});

test('a run-decisions entry that is not by the person does not make a run delegated', () => {
  const f = fixture();
  try {
    addDecision(f.dir, { kind: 'answer', key: 'run-decisions', answer: TAKE, by: 'delegate' });
    assert.equal(runDelegatedIn(f.dir), false);
  } finally { f.done(); }
});

test('a rule candidate comes only from a steer of the person', () => {
  const f = fixture();
  try {
    for (const slug of ['a', 'b']) {
      const dir = path.join(f.root, '.ai', 'workflows', slug);
      mkdirSync(dir, { recursive: true });
      addDecision(dir, { kind: 'steer', answer: 'keep the old API', by: 'delegate' });
      addDecision(dir, { kind: 'steer', answer: 'no new runtime deps' });
    }
    assert.deepEqual(ruleCandidates(f.root, { min: 2 }).map((c) => c.text), ['no new runtime deps']);
  } finally { f.done(); }
});

test('the hook refuses the commands of the person for a call of a sub-agent only', async () => {
  const wf = 'node "/p/scripts/wf.mjs"';
  assert.equal(personOnlyCommand(`${wf} decide add /r demo --kind answer --by person --key k --answer x`), 'record an entry by the person');
  assert.equal(personOnlyCommand(`${wf} decide add /r demo --kind steer --answer x`), 'write a steer or an approval');
  assert.equal(personOnlyCommand(`${wf} rule add /r --text x`), 'change a rule of the project');
  assert.equal(personOnlyCommand(`${wf} standing set /r run-decisions --by person`), 'set a standing answer');
  assert.equal(personOnlyCommand('node "/p/scripts/orchestrate.mjs" contract approve /r demo --words ok'), 'record an approval');
  assert.equal(personOnlyCommand('node "/p/scripts/campaign.mjs" digest /r src KEY --answer none'), 'record an approval');
  assert.equal(personOnlyCommand(`${wf} decide add /r demo --kind note --slice web --answer x`), null);
  assert.equal(personOnlyCommand(`${wf} decide add /r demo --kind answer --by delegate --key k --answer x`), null);
  assert.equal(personOnlyCommand(`${wf} rule list /r`), null);
  assert.equal(personOnlyCommand('git commit -m "rule add"'), null);
  // A wf script by a shell variable, and the entries of decide add in a file.
  assert.equal(personOnlyCommand('node $wf decide add . demo --kind answer --by person --answer x'), 'record an entry by the person');
  const dir = mkdtempSync(path.join(tmpdir(), 'actor-file-'));
  try {
    writeFileSync(path.join(dir, 'mine.json'), JSON.stringify([{ kind: 'answer', key: 'k', answer: 'x', by: 'stage' }]));
    writeFileSync(path.join(dir, 'person.json'), JSON.stringify([{ kind: 'answer', key: 'k', answer: 'x', by: 'stage' }, { kind: 'answer', key: 'q', answer: 'y', by: 'person' }]));
    assert.equal(personOnlyCommand(`${wf} decide add . demo --file mine.json`, { cwd: dir }), null);
    assert.equal(personOnlyCommand(`${wf} decide add . demo --file "person.json"`, { cwd: dir }), 'record an entry by the person');
    assert.equal(personOnlyCommand(`${wf} decide add . demo --file ${path.join(dir, 'person.json')}`), 'record an entry by the person');
    assert.match(personOnlyCommand(`${wf} decide add . demo --file later.json`, { cwd: dir }), /write the file in an earlier call/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
  const cmd ={ tool_input: { command: `${wf} decide add /r demo --kind steer --answer x` } };
  // The folded hook loads the guard for a call of a sub-agent, before the other shell checks.
  const hook = readFileSync(new URL('../../hooks/pre-tool-use-all.mjs', import.meta.url), 'utf8');
  const at = hook.indexOf("if (input?.agent_id) stages.push(['person-guard'");
  assert.ok(at > 0 && at < hook.indexOf("stages.push(['shell-write-guard'"));
  await assert.doesNotReject(personGuard(cmd));
  await assert.doesNotReject(personGuard({ agent_id: 'a1', tool_input: { command: `${wf} talk read /r demo --as plan:api` } }));
  const err = process.stderr.write;
  let said = '';
  process.stderr.write = (s) => { said += s; return true; };
  try { await assert.rejects(personGuard({ ...cmd, agent_id: 'a1' })); } finally { process.stderr.write = err; }
  assert.match(said, /A sub-agent of a run does not write a steer or an approval in the name of the person/);
});
