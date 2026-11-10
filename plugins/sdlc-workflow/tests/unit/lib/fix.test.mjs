// lib/fix.mjs: the shape of a fix, a refusal that carries one, the defect fix that names the
// error log, and the fix lines of a script that prints text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { agentFix, asFix, failure, failureOf, fixLines, isFix, personFix, refuse, withFix } from '../../../lib/fix.mjs';

test('a fix: who, one sentence, and a command only for the agent', () => {
  assert.deepEqual(agentFix('Run it.', 'wf.mjs status x'), { who: 'agent', do: 'Run it.', command: 'wf.mjs status x' });
  assert.deepEqual(personFix('Sign in.'), { who: 'person', do: 'Sign in.' });
  assert.equal(isFix({ who: 'person', do: 'x', command: 'rm -rf .' }), false, 'a person fix carries no command');
  assert.equal(isFix({ who: 'robot', do: 'x' }), false);
  assert.deepEqual(asFix('wf.mjs status x'), agentFix('Run this command, then the first command again.', 'wf.mjs status x'));
  assert.deepEqual(failure('no list', personFix('End it.'), { source: 's' }), { ok: false, source: 's', error: 'no list', fix: personFix('End it.') });
});

test('a refusal prints its fix and its fields; any other error is a defect that names the log', () => {
  const home = mkdtempSync(path.join(os.tmpdir(), 'fix-home-'));
  const before = process.env.SDLC_HOME;
  process.env.SDLC_HOME = home;
  try {
    const r = failureOf(refuse('busy', agentFix('Wait.'), { busy: true }), 'x.mjs');
    assert.deepEqual(r, { ok: false, busy: true, error: 'busy', fix: agentFix('Wait.') });
    const d = failureOf(new TypeError('a bug'), 'x.mjs');
    assert.equal(d.fix.who, 'person');
    assert.match(d.fix.do, /defect of the plugin/);
    const log = path.join(home, 'errors.log');
    assert.ok(d.fix.do.includes(log));
    assert.ok(existsSync(log));
    assert.match(readFileSync(log, 'utf8'), /"label":"script:x\.mjs".*"message":"a bug"/);
    // A failed result with no fix gets the defect fix; a result that is ok stays as it is.
    assert.equal(withFix({ ok: false, error: 'e' }, 'x.mjs').fix.who, 'person');
    assert.deepEqual(withFix({ ok: true }, 'x.mjs'), { ok: true });
  } finally {
    if (before === undefined) delete process.env.SDLC_HOME; else process.env.SDLC_HOME = before;
    rmSync(home, { recursive: true, force: true });
  }
});

test('the fix lines: who and do first, the command on its own last line, then', () => {
  assert.deepEqual(fixLines(agentFix('Run it.', 'wf.mjs status x')), ['fix.who: agent', 'fix.do: Run it.', 'fix: wf.mjs status x']);
  assert.deepEqual(fixLines(agentFix('Run it.', 'a.mjs b', 'a.mjs c')), ['fix.who: agent', 'fix.do: Run it.', 'fix: a.mjs b', 'fix.then: a.mjs c']);
  assert.deepEqual(fixLines(personFix('Sign in.')), ['fix.who: person', 'fix.do: Sign in.']);
  assert.deepEqual(fixLines(null), []);
});
