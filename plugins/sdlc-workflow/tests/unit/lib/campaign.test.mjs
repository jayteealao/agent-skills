// WF-CAMPAIGN-PLAN C1 — red-first tests for lib/campaign.mjs: wave computation,
// same-slug exclusion, cycle detection, partial waves, the revert search, the
// drift classes, and the version order at ship time. Written before the module.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const C = await import('../../../lib/campaign.mjs');

// A packet as work-packets.mjs writes it (frontmatter fields only).
function packet(key, over = {}) {
  return {
    key,
    'work-slug': over['work-slug'] ?? key,
    title: over.title ?? `Piece ${key}`,
    form: over.form ?? 'intake',
    'target-slug': over['target-slug'] ?? null,
    urgency: over.urgency ?? 'normal',
    order: over.order ?? 1,
    'depends-on': over['depends-on'] ?? [],
    provides: over.provides ?? [],
    expects: over.expects ?? [],
    'carried-decisions': over['carried-decisions'] ?? [{ key: `${key}-d1`, text: `decision of ${key}`, session: 's1', 'decided-at': '2026-10-01' }],
    'ux-impact': over['ux-impact'] ?? 'none',
    state: over.state ?? 'proposed',
    'routed-to': over['routed-to'] ?? null,
  };
}

const units = (...packets) => packets.map(C.unitOf);
const keysOf = (waves) => waves.map((w) => [...w].sort());

test('unitOf: an extension drives its target slug; every unit names the slugs it touches', () => {
  const ext = C.unitOf(packet('W5', { form: 'extension', 'work-slug': 'engine-ext', 'target-slug': 'engine' }));
  assert.equal(ext.slug, 'engine');
  assert.deepEqual([...C.touchedSlugs(ext)].sort(), ['engine', 'engine-ext']);
  const fresh = C.unitOf(packet('W1', { 'work-slug': 'engine' }));
  assert.equal(fresh.slug, 'engine');
  assert.equal(C.isBuildUnit(fresh), true);
  assert.equal(C.isBuildUnit(C.unitOf(packet('W9', { form: 'task' }))), false);
});

test('waves: each wave holds the units whose dependencies are in earlier waves', () => {
  const u = units(
    packet('A', { order: 1 }),
    packet('B', { order: 2 }),
    packet('C', { order: 3, 'depends-on': ['A'] }),
    packet('D', { order: 4, 'depends-on': ['B', 'C'] }),
  );
  const plan = C.planWaves(u);
  assert.deepEqual(keysOf(plan.waves), [['A', 'B'], ['C'], ['D']]);
  assert.deepEqual(plan.waiting, []);
});

test('waves: two units that touch the same slug never share a wave (R1), the later order moves', () => {
  const u = units(
    packet('A', { order: 1, 'work-slug': 'engine' }),
    packet('B', { order: 2, form: 'fix', 'work-slug': 'engine-fix', 'target-slug': 'engine' }),
    packet('C', { order: 3 }),
    packet('E', { order: 4, 'depends-on': ['B'] }),
  );
  const plan = C.planWaves(u);
  assert.deepEqual(keysOf(plan.waves), [['A', 'C'], ['B'], ['E']]);
});

test('waves: done units count as placed; started waves stay as they are', () => {
  const u = units(packet('A'), packet('B', { 'depends-on': ['A'] }), packet('C', { 'depends-on': ['B'] }));
  const plan = C.planWaves(u, { done: new Set(['A']) });
  assert.deepEqual(keysOf(plan.waves), [['B'], ['C']]);
  const fixed = C.planWaves(u, { started: [['A']], done: new Set() });
  assert.deepEqual(keysOf(fixed.waves), [['A'], ['B'], ['C']], 'a started wave is never re-planned');
});

test('waves: a task, investigate or discover packet blocks only its dependents (W1, W2)', () => {
  const u = units(
    packet('T', { form: 'task' }),
    packet('A'),
    packet('B', { 'depends-on': ['T'] }),
    packet('C', { 'depends-on': ['B'] }),
  );
  const plan = C.planWaves(u);
  assert.deepEqual(keysOf(plan.waves), [['A']]);
  assert.deepEqual(plan.waiting.map((w) => [w.key, w.on.join(','), w.reason]), [
    ['B', 'T', 'needs-you'],
    ['C', 'B', 'waits'],
  ]);
  const after = C.planWaves(u, { outsideDone: new Set(['T']) });
  assert.deepEqual(keysOf(after.waves), [['A', 'B'], ['C']]);
});

test('waves: a stopped unit and its dependents wait; the rest of the campaign goes on (12.1, F6)', () => {
  const u = units(packet('A'), packet('B'), packet('C', { 'depends-on': ['A'] }), packet('D', { 'depends-on': ['B'] }));
  const plan = C.planWaves(u, { done: new Set(['B']), stopped: new Set(['A']) });
  assert.deepEqual(keysOf(plan.waves), [['D']]);
  assert.deepEqual(plan.waiting.map((w) => `${w.key}:${w.reason}`).sort(), ['A:stopped', 'C:waits']);
});

test('cycle detection and contract checks refuse the work set', () => {
  const cyc = C.checkCampaignSet([packet('A', { 'depends-on': ['C'] }), packet('B', { 'depends-on': ['A'] }), packet('C', { 'depends-on': ['B'] })]);
  assert.ok(cyc.errors.some((e) => /cycle/.test(e)), cyc.errors.join('\n'));
  const orphan = C.checkCampaignSet([packet('A'), packet('B', { 'depends-on': ['A'], expects: [{ from: 'A', key: 'api', text: 'an API' }] })]);
  assert.ok(orphan.errors.some((e) => /expects A\/api/.test(e)), orphan.errors.join('\n'));
  const unknown = C.checkCampaignSet([packet('A'), packet('B', { 'depends-on': ['Z'] })]);
  assert.ok(unknown.errors.some((e) => /Z/.test(e)));
  const single = C.checkCampaignSet([packet('A')]);
  assert.equal(single.single, true, 'a single-slug work set is not a campaign');
  const big = C.checkCampaignSet([packet('A', { 'carried-decisions': Array.from({ length: 41 }, (_, i) => ({ key: `d${i}`, text: 'x' })) }), packet('B')]);
  assert.ok(big.errors.some((e) => /41 carried decisions/.test(e)), 'F7: more than 40 cannot be prepared');
  const ok = C.checkCampaignSet([packet('A', { provides: [{ key: 'api', text: 'an API' }] }), packet('B', { 'depends-on': ['A'], expects: [{ from: 'A', key: 'api', text: 'an API' }] })]);
  assert.deepEqual(ok.errors, []);
});

test('a piece the brainstorm already wrote is a done dependency: no error, no wait, no drift', () => {
  const p = packet('B', { 'depends-on': ['A', 'charter'], expects: [{ from: 'A', key: 'api', text: 'an API' }, { from: 'charter', key: 'doc', text: 'the charter' }] });
  const a = packet('A', { provides: [{ key: 'api', text: 'an API' }] });
  assert.equal(C.checkCampaignSet([a, p]).errors.length, 2, 'without the written list, charter is unknown');
  assert.deepEqual(C.checkCampaignSet([a, p], { written: ['charter'] }).errors, []);
  const u = C.unitOf(p, { written: ['charter'] });
  assert.deepEqual(u.dependsOn, ['A']);
  assert.deepEqual(u.expects.map((e) => e.from), ['A']);
  assert.deepEqual(u.writtenDeps, ['charter']);
  assert.deepEqual(u.writtenExpects.map((e) => e.key), ['doc']);
  assert.deepEqual(keysOf(C.planWaves([C.unitOf(a), u]).waves), [['A'], ['B']]);
  assert.equal(C.classifyDrift(u, { A: { lines: [{ key: 'api', status: 'met' }] } }).class, 'none', 'the written charter has no as-built note and is not drift');
});

test('a wave starts with its prepared units; an unprepared unit moves with its dependents (9.3 step 6)', () => {
  const u = units(packet('A'), packet('B'), packet('C', { 'depends-on': ['B'] }));
  const res = C.deferUnprepared(['A', 'B'], u, new Set(['A']));
  assert.deepEqual(res.start, ['A']);
  assert.deepEqual(res.moved, [{ key: 'B', reason: 'not prepared' }]);
  assert.deepEqual(C.deferUnprepared(['A'], u, new Set()).start, []);
});

test('revert search: newest merge first; the first green verify names the breaker (12.2)', () => {
  const merges = [{ key: 'A', sha: 'a1' }, { key: 'B', sha: 'b1' }, { key: 'C', sha: 'c1' }];
  assert.deepEqual(C.revertOrder(merges).map((m) => m.key), ['C', 'B', 'A']);
  // The other slugs stay merged: a slug reverted before the breaker is merged again.
  assert.deepEqual(C.findBreaker(merges, [false, true]), { culprit: 'B', reverted: ['C', 'B'], reapply: ['C'] });
  assert.deepEqual(C.findBreaker(merges, [true]), { culprit: 'C', reverted: ['C'], reapply: [] });
  assert.deepEqual(C.findBreaker(merges, [false, false, false]), { culprit: null, base: true, reverted: ['C', 'B', 'A'] });
  assert.deepEqual(C.findBreaker(merges, [false]), { culprit: null, base: false, reverted: ['C'], next: 'B' });
});

test('drift classes: met is none, a changed line carries its class, missing and unverified are contract (11.2)', () => {
  const waiting = C.unitOf(packet('W', {
    'depends-on': ['A'],
    expects: [
      { from: 'A', key: 'api', text: 'GET /teams' },
      { from: 'A', key: 'shape', text: 'team has a squad list' },
      { from: 'A', key: 'save', text: 'saves to disk' },
      { from: 'A', key: 'log', text: 'logs each match' },
    ],
  }));
  const asBuilt = { A: { lines: [
    { key: 'api', status: 'met' },
    { key: 'shape', status: 'changed', class: 'implementation-detail', note: 'squad is a map' },
    { key: 'save', status: 'unverified' },
  ] } };
  const d = C.classifyDrift(waiting, asBuilt);
  assert.deepEqual(d.lines.map((l) => `${l.key}:${l.class}`), ['api:none', 'shape:implementation-detail', 'save:contract', 'log:contract']);
  assert.equal(d.class, 'contract');
  const clean = C.classifyDrift(waiting, { A: { lines: ['api', 'shape', 'save', 'log'].map((key) => ({ key, status: 'met' })) } });
  assert.equal(clean.class, 'none');
  const changedNoClass = C.classifyDrift(C.unitOf(packet('X', { 'depends-on': ['A'], expects: [{ from: 'A', key: 'api', text: 'x' }] })), { A: { lines: [{ key: 'api', status: 'changed' }] } });
  assert.equal(changedNoClass.class, 'contract', 'an unclassified change is a contract difference');
});

test('versions are assigned at ship time, in ship order (V2, V3)', () => {
  assert.equal(C.nextWaveVersion({ target: '0.3.0', tags: ['v0.2.0', 'v0.2.1'] }), '0.3.0-beta.1');
  assert.equal(C.nextWaveVersion({ target: '0.3.0', tags: ['v0.2.0', 'v0.3.0-beta.1', 'v0.3.0-beta.2'] }), '0.3.0-beta.3');
  assert.equal(C.nextWaveVersion({ target: '0.3.0', tags: ['0.3.0-rc.1'], label: 'rc' }), '0.3.0-rc.2');
  assert.throws(() => C.nextWaveVersion({ target: '0.3.0', tags: ['v0.3.0'] }), /already released/);
  assert.equal(C.hotfixVersion({ tags: ['v0.2.0', 'v0.1.9'] }), '0.2.1');
  assert.equal(C.hotfixVersion({ tags: ['v0.2.0', 'v0.3.0-beta.2'] }), '0.3.0-beta.3', 'during a pre-release series: the next pre-release');
  assert.equal(C.compareVersions('0.3.0-beta.10', '0.3.0-beta.9') > 0, true);
  assert.equal(C.compareVersions('0.3.0', '0.3.0-beta.9') > 0, true);
  assert.equal(C.buildLabel({ wave: 2, sha: 'abcdef1234567' }), 'wave-2+abcdef1');
  assert.equal(C.buildLabel({ wave: 2, slug: 'engine', sha: 'abcdef1234567' }), 'wave-2.engine+abcdef1');
});

test('the ledger state decides what /wf campaign does next (section 6)', () => {
  const u = units(packet('A'), packet('B', { 'depends-on': ['A'] }));
  assert.equal(C.campaignAction(null, { revision: 1 }).action, 'orient');
  const ledger = C.newLedger({ brainstorm: 'realism', revision: 1, units: u, now: '2026-10-03T10:00:00Z' });
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'setup');
  Object.assign(ledger.answers, { forecast: 'continue', 'target-version': '0.3.0', 'release-each-wave': false, output: { 'build-cmd': 'make', artifacts: ['out/'], try: 'run out/app' } });
  assert.deepEqual(C.campaignAction(ledger, { revision: 1 }), { action: 'setup', question: 'budget' });
  ledger.answers.budget = C.DEFAULT_BUDGET;
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'prepare');
  ledger.units.A.state = 'prepared';
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'start-wave');
  assert.equal(C.campaignAction(ledger, { revision: 2 }).action, 'work-changed');
  ledger.pause = { reason: 'five-hour window', until: '2026-10-03T15:00:00Z' };
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'paused');
  ledger.pause = null;
  ledger.questions.push({ id: 'q1', wave: 1, text: 'CI is red', 'asked-at': '2026-10-03T11:00:00Z' });
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'ask');
});

// ---------------------------------------------------------------- Stage D

const reading = (five, seven, at = '2026-10-03T10:00:00Z') => ({
  at, rateLimits: [
    { kind: 'five_hour', percentUsed: five, resetsAt: '2026-10-03T13:00:00Z' },
    { kind: 'seven_day', percentUsed: seven, resetsAt: '2026-10-08T00:00:00Z' },
  ],
});
const NOW = Date.parse('2026-10-03T10:05:00Z');

test('budget: under slow is ok; slow narrows; pause and the 7-day reserve pause until the reset (17.2, 17.3)', () => {
  const b = C.DEFAULT_BUDGET;
  assert.deepEqual(b, { fiveHourSlow: 75, fiveHourPause: 90, sevenDayReserve: 15 });
  assert.equal(C.budgetState(reading(40, 20), b, { now: NOW }).state, 'ok');
  assert.equal(C.budgetState(reading(80, 20), b, { now: NOW }).state, 'slow');
  const p = C.budgetState(reading(91, 20), b, { now: NOW });
  assert.equal(p.state, 'pause');
  assert.equal(p.until, '2026-10-03T13:00:00Z');
  const r = C.budgetState(reading(10, 86), b, { now: NOW });
  assert.equal(r.state, 'pause');
  assert.equal(r.until, '2026-10-08T00:00:00Z');
  assert.match(r.reason, /reserve/);
});

test('budget: no reading, an empty reading, or one older than 10 minutes is unknown (17.5)', () => {
  const b = C.DEFAULT_BUDGET;
  assert.equal(C.budgetState(null, b, { now: NOW }).state, 'unknown');
  assert.equal(C.budgetState({ at: '2026-10-03T10:00:00Z', rateLimits: [] }, b, { now: NOW }).state, 'unknown');
  assert.equal(C.budgetState(reading(10, 10, '2026-10-03T09:50:00Z'), b, { now: NOW }).state, 'unknown');
  assert.equal(C.newestReading([reading(1, 1, '2026-10-03T09:00:00Z'), reading(2, 2, '2026-10-03T10:00:00Z'), null]).rateLimits[0].percentUsed, 2);
});

test('a usage-limit failure is the rate_limit kind, status 429, or the limit text; 529 is not (P3)', () => {
  assert.equal(C.isUsageLimitFailure({ error: 'rate_limit' }), true);
  assert.equal(C.isUsageLimitFailure({ apiErrorStatus: 429 }), true);
  assert.equal(C.isUsageLimitFailure({ text: "You've reached your Fable limit. Switch to another model" }), true);
  assert.equal(C.isUsageLimitFailure({ text: 'Claude AI usage limit reached|1759500000' }), true);
  assert.equal(C.isUsageLimitFailure({ error: 'server_error', apiErrorStatus: 529, text: 'Overloaded' }), false);
  assert.equal(C.isUsageLimitFailure({ text: 'the test failed: expected 3' }), false);
});

test('width: no isolation contract or parallel false is width 1; slow and unknown narrow to 1; pause is 0 (13, 17.3)', () => {
  const iso = { parallel: true, 'port-env': { PORT: 3000 }, 'build-dirs': ['target'], 'heavy-suites': ['npx playwright test'], 'min-free-gb': 20 };
  assert.equal(C.effectiveWidth({ width: 3, isolation: null, budget: 'ok' }), 1);
  assert.equal(C.effectiveWidth({ width: 3, isolation: { ...iso, parallel: false }, budget: 'ok' }), 1);
  assert.equal(C.effectiveWidth({ width: 3, isolation: iso, budget: 'ok' }), 3);
  assert.equal(C.effectiveWidth({ width: 3, isolation: iso, budget: 'slow' }), 1);
  assert.equal(C.effectiveWidth({ width: 3, isolation: iso, budget: 'unknown' }), 1);
  assert.equal(C.effectiveWidth({ width: 3, isolation: iso, budget: 'pause' }), 0);
  assert.deepEqual(C.portsFor(iso, 2), { PORT: 3200 });
  assert.equal(C.isolationOf({ campaign: { isolation: iso } }).parallel, true);
  assert.equal(C.isolationOf({}), null);
  assert.equal(C.isolationOf({ campaign: { isolation: { parallel: true } } }), null, 'a contract without port-env and build-dirs is not usable');
});

test('drive slots: the next prepared units of the running wave, in packet order, up to the width', () => {
  const u = units(packet('A', { order: 1 }), packet('B', { order: 2 }), packet('C', { order: 3 }), packet('D', { order: 4 }));
  const ledger = C.newLedger({ brainstorm: 'b', revision: 1, units: u });
  for (const k of ['A', 'B', 'C', 'D']) ledger.units[k].state = 'prepared';
  ledger.waves[0].state = 'running';
  ledger.units.A.state = 'running';
  assert.deepEqual(C.driveSlots(ledger, 1, 3), ['B', 'C']);
  ledger.units.B.state = 'finished';
  assert.deepEqual(C.driveSlots(ledger, 1, 3), ['C', 'D']);
  assert.deepEqual(C.driveSlots(ledger, 1, 1), []);
});

test('stacking: the next wave may start once the wave below merged its slugs, up to max-unshipped (16.3, 12.5)', () => {
  const u = units(packet('A'), packet('B', { 'depends-on': ['A'] }), packet('C', { 'depends-on': ['B'] }));
  const ledger = C.newLedger({ brainstorm: 'b', revision: 1, units: u });
  Object.assign(ledger.answers, { forecast: 'continue', 'target-version': 'none', 'release-each-wave': false, output: 'none', budget: C.DEFAULT_BUDGET });
  for (const k of ['A', 'B', 'C']) ledger.units[k].state = 'prepared';
  ledger.waves[0].state = 'boundary';
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'running', 'the merge into the wave branch is not done yet');
  ledger.waves[0].state = 'handoff';
  ledger.units.A.state = 'merged';
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'running', 'Stage C waits for the merge');
  ledger.stack = { enabled: true, number: null, 'max-unshipped': 2 };
  assert.deepEqual(C.campaignAction(ledger, { revision: 1 }), { action: 'start-wave', wave: 2, beside: [1] });
  ledger.waves[1].state = 'handoff';
  ledger.units.B.state = 'merged';
  assert.equal(C.campaignAction(ledger, { revision: 1 }).action, 'running', 'two unshipped waves already wait above the trunk');
  assert.equal(C.waveBase(ledger, 3, 'main'), 'campaign/b/wave-2');
  ledger.waves[0].state = 'shipped';
  ledger.waves[1].state = 'shipped';
  assert.equal(C.waveBase(ledger, 3, 'main'), 'main');
});

test('the context file names the ports, the build folders, and the heavy-suite lock (13, part 6)', () => {
  const u = units(packet('A'));
  const ledger = C.newLedger({ brainstorm: 'b', revision: 1, units: u });
  const iso = { parallel: true, 'port-env': { PORT: 3000, E2E_PORT: 4173 }, 'build-dirs': ['target'], 'heavy-suites': ['npx playwright test'], 'min-free-gb': 20 };
  const text = C.renderContext({ unit: u[0], units: u, ledger, isolation: C.isolationText(iso, { index: 1, worktree: '/w/a', lockCmd: 'node campaign.mjs lock' }) });
  assert.match(text, /PORT=3100/);
  assert.match(text, /E2E_PORT=4273/);
  assert.match(text, /`target`/);
  assert.match(text, /npx playwright test/);
  assert.match(text, /node campaign\.mjs lock acquire/);
  assert.match(text, /lock-wait/);
});
