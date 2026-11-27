// Reports about wf itself: filed by an agent, triaged by the code when filed, decided by the person.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { addReport, builtReport, decideReport, groups, guessArea, guessSeverity, readAll, reportsDir } from '../../lib/reports.mjs';

const home = () => mkdtempSync(path.join(tmpdir(), 'sdlc-reports-'));
const AREAS = ['campaign split', 'campaign status', 'slice split', 'step done', 'implement'];

test('a report is triaged when it is filed: its area, its severity, and the report it repeats', () => {
  const h = home();
  try {
    const one = addReport({ kind: 'bug', title: 'campaign split refuses after the run-end agent writes its line', body: 'the run had ended; split said it had not' }, { home: h, areas: AREAS });
    assert.equal(one.report.triage.area, 'campaign split');
    assert.equal(one.report.triage.severity, 'medium');
    assert.equal(one.report.triage.duplicateOf, undefined);
    const two = addReport({ kind: 'bug', title: 'campaign split refuses after the run-end agent line', body: 'same again' }, { home: h, areas: AREAS });
    assert.equal(two.report.triage.duplicateOf, one.report.id, 'close words in the title: a sighting');
    assert.equal(two.group.count, 2);
    const other = addReport({ kind: 'feature', title: 'campaign split refuses after the run-end agent writes its line', body: 'x' }, { home: h, areas: AREAS });
    assert.equal(other.report.triage.duplicateOf, undefined, 'another kind is another report');
    const third = addReport({ kind: 'bug', title: 'the watch hangs after every run and the records are lost', body: 'y' }, { home: h, areas: AREAS });
    assert.equal(third.report.triage.severity, 'high');
    assert.equal(third.report.triage.area, 'general');
    // The group is what the person decides: one file per report, one writer per file.
    assert.equal(readdirSync(reportsDir(h)).filter((f) => f.endsWith('.json')).length, 4);
  } finally { rmSync(h, { recursive: true, force: true }); }
});

test('a group that is seen more often ranks higher, and a bug above a feature of the same severity', () => {
  const h = home();
  try {
    const f = addReport({ kind: 'feature', title: 'a view of every report on the desktop', body: 'so the person can decide', severity: 'medium' }, { home: h });
    const b = addReport({ kind: 'bug', title: 'step done names a flag that the code rejects', body: 'control stop --after stage', severity: 'medium' }, { home: h });
    let order = groups(readAll(h)).map((g) => g.id);
    assert.deepEqual(order, [b.report.id, f.report.id]);
    for (let i = 0; i < 3; i += 1) addReport({ kind: 'feature', title: 'a view of every report on the desktop app', body: 'again', severity: 'medium' }, { home: h });
    order = groups(readAll(h)).map((g) => g.id);
    assert.deepEqual(order, [f.report.id, b.report.id], 'four sightings outrank one bug');
  } finally { rmSync(h, { recursive: true, force: true }); }
});

test('the person decides on a group, a session records the build, and a new sighting is told both', () => {
  const h = home();
  try {
    const one = addReport({ kind: 'docs', title: 'campaign.md tells the slice step to read a file that open moved', body: 'the issues file is in history' }, { home: h });
    const two = addReport({ kind: 'docs', title: 'campaign.md tells the slice step to read a moved file', body: 'again' }, { home: h });
    const d = decideReport(two.report.id, 'build', { home: h, note: 'next release' });
    assert.equal(d.id, one.report.id, 'a sighting decides its group');
    assert.throws(() => decideReport(one.report.id, 'maybe', { home: h }), /build, later, reject/);
    builtReport(one.report.id, { home: h, commit: 'abc12345' });
    const g = groups(readAll(h))[0];
    assert.equal(g.state, 'built');
    assert.equal(g.decision.note, 'next release');
    const three = addReport({ kind: 'docs', title: 'campaign.md tells the slice step to read a file that open moved away', body: 'x' }, { home: h });
    assert.equal(three.group.built.commit, 'abc12345');
    assert.ok(existsSync(path.join(reportsDir(h), 'decisions', `${one.report.id}.json`)));
  } finally { rmSync(h, { recursive: true, force: true }); }
});

test('a report names what is wrong, what was expected and the workaround: an empty one is refused', () => {
  const h = home();
  try {
    assert.throws(() => addReport({ kind: 'bug', title: 'short', body: 'x' }, { home: h }), /--title is required/);
    assert.throws(() => addReport({ kind: 'bug', title: 'a title long enough', body: '' }, { home: h }), /--body is required/);
    assert.throws(() => addReport({ kind: 'wish', title: 'a title long enough', body: 'x' }, { home: h }), /--kind must be one of/);
    assert.equal(guessArea('`slice split` refuses a stopped slice', ['slice', 'slice split']), 'slice split', 'the longest name first');
    assert.equal(guessSeverity('feature', 'it crashes'), 'low');
  } finally { rmSync(h, { recursive: true, force: true }); }
});
