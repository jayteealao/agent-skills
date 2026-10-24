import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { doesNotMatch, equal, match, ok } from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');

const HOOKS = {
  preWriteValidate: join(PLUGIN_ROOT, 'hooks', 'pre-write-validate.mjs'),
  postWriteVerify: join(PLUGIN_ROOT, 'hooks', 'post-write-verify.mjs'),
  postWriteAutoStage: join(PLUGIN_ROOT, 'hooks', 'post-write-auto-stage.mjs'),
  machineCleanup: join(PLUGIN_ROOT, 'hooks', 'machine-cleanup.mjs'),
};

function tempDir(prefix = 'sdlc-hooks-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function runHook(script, input, cwd, extraEnv = {}) {
  return spawnSync(process.execPath, [script], {
    cwd,
    input: JSON.stringify(input),
    encoding: 'utf-8',
    env: {
      ...process.env,
      CLAUDE_PLUGIN_ROOT: PLUGIN_ROOT,
      ...extraEnv,
    },
  });
}

function writeFile(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, 'utf-8');
}

// A clean explainer beside a stage agent file, so a compliant write stays silent
// (post-write-verify nudges when a stage file lands without one).
function writeExplainer(mdPath) {
  writeFile(mdPath.replace(/\.md$/, '.explainer.html.fragment'), '<p>Summary.</p>\n<p>Recap.</p>\n');
}

function md(frontmatter, body = 'body\n') {
  const yaml = Object.entries(frontmatter)
    .map(([key, value]) => `${key}: ${yamlScalar(value)}`)
    .join('\n');
  return `---\n${yaml}\n---\n${body}`;
}

function yamlScalar(value) {
  if (Array.isArray(value)) return `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
  if (value && typeof value === 'object') return JSON.stringify(value);
  return JSON.stringify(value);
}

function minimalIndex(overrides = {}) {
  return {
    schema: 'sdlc/v1',
    type: 'index',
    slug: 'demo',
    status: 'active',
    title: 'Demo workflow',
    'current-stage': 'implement',
    'stage-number': 5,
    'branch-strategy': 'dedicated',
    branch: 'feature/demo',
    'base-branch': 'main',
    'selected-slice': 'core',
    'open-questions': ['confirm rollout'],
    progress: { intake: 'complete', implement: 'in-progress' },
    'next-command': '/wf verify demo',
    'next-invocation': 'verify',
    ...overrides,
  };
}

function validIntake(overrides = {}) {
  return {
    schema: 'sdlc/v1',
    type: 'intake',
    slug: 'demo',
    status: 'complete',
    'stage-number': 1,
    'created-at': '2026-05-11T12:00:00Z',
    'updated-at': '2026-05-11T12:05:00Z',
    tags: [],
    refs: {},
    'next-command': '/wf shape demo',
    'next-invocation': 'shape',
    ...overrides,
  };
}

function validPlan(overrides = {}) {
  return {
    schema: 'sdlc/v1',
    type: 'plan',
    slug: 'demo',
    'slice-slug': 'core',
    status: 'complete',
    'stage-number': 4,
    'created-at': '2026-06-04T12:00:00Z',
    'updated-at': '2026-06-04T12:05:00Z',
    'metric-files-to-touch': 3,
    'metric-step-count': 5,
    'has-blockers': false,
    'revision-count': 0,
    tags: [],
    refs: {},
    'next-command': '/wf implement demo',
    'next-invocation': 'implement',
    ...overrides,
  };
}

function validProfile(overrides = {}) {
  // .ai/profiles/<run>/01-profile.md — off the .ai/workflows root.
  return {
    schema: 'sdlc/v1',
    type: 'profile',
    'run-id': '20260606T1200Z',
    target: 'checkout service',
    language: 'typescript',
    'profiling-method': 'static',
    'hotspots-found': 3,
    'optimization-candidates': 2,
    confidence: 'high',
    'created-at': '2026-06-06T12:00:00Z',
    ...overrides,
  };
}

function validSimplifyRun(overrides = {}) {
  // .ai/simplify/<run>.md — off the .ai/workflows root.
  return {
    schema: 'sdlc/v1',
    type: 'simplify-run',
    'run-id': '20260606T1200Z',
    scope: 'branch',
    target: 'feature/demo',
    status: 'complete',
    'created-at': '2026-06-06T12:00:00Z',
    'updated-at': '2026-06-06T12:05:00Z',
    'findings-total': 4,
    'findings-reuse': 1,
    'findings-quality': 1,
    'findings-efficiency': 2,
    'findings-accepted': 3,
    'findings-skipped': 1,
    'findings-deferred': 0,
    'routing-summary': {},
    'routing-assignments': [],
    'proposed-deltas': [],
    ...overrides,
  };
}

function validBenchmarkAugmentation(overrides = {}) {
  // benchmark / experiment / instrument ride `type: augmentation` with an
  // `augmentation-type:` discriminator — NOT a top-level `type: benchmark`.
  return {
    schema: 'sdlc/v1',
    type: 'augmentation',
    'augmentation-type': 'benchmark',
    slug: 'demo',
    'parent-workflow': 'demo',
    mode: 'compare',
    language: 'typescript',
    'benchmark-framework': 'vitest-bench',
    'targets-measured': 2,
    'targets-failed': 0,
    'baseline-branch': 'main',
    'baseline-commit': 'a3f7d12',
    'measured-at': '2026-06-06T12:00:00Z',
    ...overrides,
  };
}

function validReviewCommand(overrides = {}) {
  return {
    schema: 'sdlc/v1',
    type: 'review-command',
    slug: 'demo',
    'review-scope': 'slug-wide',
    'slice-slug': '',
    'review-command': 'correctness',
    status: 'complete',
    'updated-at': '2026-06-08T12:00:00Z',
    'metric-findings-total': 2,
    'metric-findings-blocker': 0,
    'metric-findings-high': 1,
    result: 'issues-found',
    tags: [],
    refs: {},
    ...overrides,
  };
}

function validDesignAudit(overrides = {}) {
  return {
    schema: 'sdlc/v1',
    type: 'design-audit',
    slug: 'demo',
    title: 'Token audit',
    status: 'ready',
    'created-at': '2026-06-08T12:00:00Z',
    'updated-at': '2026-06-08T12:00:00Z',
    verdict: 'conditional',
    'audited-against': 'tokens.css',
    'violations-count': 3,
    'severity-distribution': { blocker: 0, high: 1, medium: 1, low: 1 },
    'remediation-state': 'in-progress',
    refs: {},
    ...overrides,
  };
}

function validDesignCritique(overrides = {}) {
  return {
    schema: 'sdlc/v1',
    type: 'design-critique',
    slug: 'demo',
    title: 'Surface critique',
    status: 'ready',
    'created-at': '2026-06-08T12:00:00Z',
    'updated-at': '2026-06-08T12:00:00Z',
    scope: 'surface',
    'findings-count': 2,
    'severity-distribution': { blocker: 0, high: 0, medium: 1, low: 1, nit: 0 },
    refs: {},
    ...overrides,
  };
}

function validVerify(overrides = {}) {
  // A clean passing per-slice verify artifact: every AC met, no deferral.
  // verify is NOT a rich-tier fragment type, so no sibling .yaml is required.
  return {
    schema: 'sdlc/v1',
    type: 'verify',
    slug: 'demo',
    'slice-slug': 'core',
    status: 'complete',
    'stage-number': 6,
    'created-at': '2026-06-30T12:00:00Z',
    'updated-at': '2026-06-30T12:05:00Z',
    result: 'pass',
    'metric-checks-run': 3,
    'metric-checks-passed': 3,
    'metric-acceptance-met': 2,
    'metric-acceptance-total': 2,
    'metric-interactive-checks-run': 1,
    'metric-interactive-checks-passed': 1,
    'metric-issues-found': 0,
    'evidence-dir': '.ai/workflows/demo/verify-evidence/core/',
    tags: [],
    refs: {},
    'next-command': '/wf review demo core',
    'next-invocation': 'review',
    ...overrides,
  };
}

test('pre-write-validate skips missing and non-workflow file paths', () => {
  const tmp = tempDir();
  try {
    let result = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: {} }, tmp);
    equal(result.status, 0);
    equal(result.stdout, '');
    equal(result.stderr, '');

    result = runHook(HOOKS.preWriteValidate, {
      cwd: tmp,
      tool_input: { file_path: 'README.md', content: '# readme\n' },
    }, tmp);
    equal(result.status, 0);
    equal(result.stdout, '');
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('pre-write-validate blocks bad filename, missing frontmatter, bad schema, and slug drift', () => {
  const tmp = tempDir();
  try {
    const cases = [
      {
        file_path: '.ai/workflows/demo/not-numbered.md',
        content: md({ schema: 'sdlc/v1', type: 'intake', slug: 'demo' }),
        pattern: /Filename 'not-numbered\.md'/,
      },
      {
        file_path: '.ai/workflows/demo/01-intake.md',
        content: '# no frontmatter\n',
        pattern: /Missing YAML frontmatter/,
      },
      {
        file_path: '.ai/workflows/demo/01-intake.md',
        content: md({ schema: 'wrong', type: 'intake', slug: 'demo' }),
        pattern: /Invalid schema 'wrong'/,
      },
      {
        file_path: '.ai/workflows/demo/01-intake.md',
        content: md({ schema: 'sdlc/v1', type: 'intake', slug: 'other' }),
        pattern: /Slug mismatch/,
      },
    ];

    for (const testCase of cases) {
      const result = runHook(HOOKS.preWriteValidate, {
        cwd: tmp,
        tool_input: testCase,
      }, tmp);
      equal(result.status, 2, result.stderr);
      match(result.stderr, testCase.pattern);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('pre-write-validate normalizes a Grok/Cursor camelCase payload (toolInput → tool_input)', () => {
  // Claude-compatible hosts (Grok Build, Cursor) load this plugin's hooks.json
  // but deliver the event on camelCase keys. The lib/stdin.mjs shim aliases
  // toolInput → tool_input so the guard still fires; without it the hook reads
  // undefined, early-returns exit 0, and — since PreToolUse fails OPEN on those
  // hosts — the validation gate would silently pass. This asserts the block.
  const tmp = tempDir();
  try {
    const result = runHook(HOOKS.preWriteValidate, {
      cwd: tmp,
      hookEventName: 'pre_tool_use',
      toolName: 'search_replace',
      toolInput: {
        file_path: '.ai/workflows/demo/not-numbered.md',
        content: md({ schema: 'sdlc/v1', type: 'intake', slug: 'demo' }),
      },
    }, tmp);
    equal(result.status, 2, result.stderr);
    match(result.stderr, /Filename 'not-numbered\.md'/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('pre-write-validate allows valid content and warns on missing registry', () => {
  const tmp = tempDir();
  try {
    const result = runHook(HOOKS.preWriteValidate, {
      cwd: tmp,
      tool_input: {
        file_path: '.ai/workflows/demo/00-index.md',
        content: md({ schema: 'sdlc/v1', type: 'index', slug: 'demo' }),
      },
    }, tmp);

    equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    match(parsed.systemMessage, /Global workflow registry/);
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('pre-write-validate allows po-answers.md prose log without frontmatter', () => {
  const tmp = tempDir();
  try {
    // po-answers.md is the cumulative product-owner Q/A log — frontmatter-less
    // prose by design. It must clear BOTH gates: the NN-stagename filename
    // convention and the mandatory-frontmatter check.
    const result = runHook(HOOKS.preWriteValidate, {
      cwd: tmp,
      tool_input: {
        file_path: '.ai/workflows/demo/po-answers.md',
        content: '# Product Owner Answers\n\n## 2026-05-31 — 01-intake\n\n**Q:** Branch strategy?\n**A:** Shared branch.\n',
      },
    }, tmp);

    equal(result.status, 0, result.stderr);
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify validates written workflow artifacts with Ajv', () => {
  const tmp = tempDir();
  try {
    const good = join(tmp, '.ai', 'workflows', 'demo', '01-intake.md');
    const bad = join(tmp, '.ai', 'workflows', 'demo', '02-shape.md');
    writeFile(good, md(validIntake()));
    writeExplainer(good);
    writeFile(bad, md({ schema: 'sdlc/v1', type: 'shape', slug: 'demo' }));

    let result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/01-intake.md' },
    }, tmp);
    equal(result.status, 0, result.stderr);
    equal(result.stdout, '');
    equal(result.stderr, '');

    result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/02-shape.md' },
    }, tmp);
    equal(result.status, 2);
    match(result.stderr, /frontmatter validation FAILED/);
    match(result.stderr, /must have required property/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

const brainstormBoard = () => ({
  schema: 'sdlc/v1', artifact: 'brainstorm-board', slug: 'brainstorm-cost-budget-20260922',
  topic: 'a per-slug cost budget', sessions: 1, batches: 0,
  areas: [{ key: 'seeing-the-cost', name: 'Seeing what a project costs', side: 'problem', state: 'open' }],
  threads: [{ key: 'limit-per-project', name: 'A spending limit per project', area: 'seeing-the-cost', state: 'live', 'routed-to': null }],
  items: [], work: [], selected: [], log: [], 'consult-runs': [],
});

// BRAINSTORM-MODE-PLAN P-B4 — the write hook accepts a brainstorm board and its
// workflow-index, and demands no sibling fragment (brainstorm is not rich-tier).
test('post-write-verify accepts a brainstorm board and its workflow-index', () => {
  const tmp = tempDir();
  try {
    const dir = join(tmp, '.ai', 'workflows', 'brainstorm-cost-budget-20260922');
    writeFile(join(dir, '00-index.md'), md({
      schema: 'sdlc/v1', type: 'workflow-index', slug: 'brainstorm-cost-budget-20260922',
      title: 'Brainstorm: a per-slug cost budget 2026-09-22', 'workflow-type': 'brainstorm',
      'current-stage': 'brainstorm', status: 'ready', 'branch-strategy': 'none', 'open-questions': [],
      'next-command': 'intake', 'next-invocation': '/wf intake brainstorm brainstorm-cost-budget-20260922',
      progress: { brainstorm: 'in-progress' }, 'created-at': '2026-09-22T10:00:00Z', 'updated-at': '2026-09-22T10:00:00Z',
    }));
    writeFile(join(dir, '01-brainstorm.md'), md({
      schema: 'sdlc/v1', type: 'brainstorm', slug: 'brainstorm-cost-budget-20260922',
      topic: 'a per-slug cost budget', status: 'open', board: 'brainstorm-board.json',
      'created-at': '2026-09-22T10:00:00Z', 'updated-at': '2026-09-22T10:00:00Z', sessions: 1, batches: 0, revisions: [],
    }));
    writeFile(join(dir, 'brainstorm-board.json'), JSON.stringify(brainstormBoard()));
    for (const file of ['00-index.md', '01-brainstorm.md', 'brainstorm-board.json']) {
      const result = runHook(HOOKS.postWriteVerify, {
        cwd: tmp,
        tool_input: { file_path: `.ai/workflows/brainstorm-cost-budget-20260922/${file}` },
      }, tmp);
      equal(result.status, 0, `${file}: ${result.stderr}`);
      equal(result.stderr, '', `${file}: the hook demanded something of a brainstorm artifact`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// BRAINSTORM-MODE-PLAN §20 — the agent's JSON board is validated on every write.
test('post-write-verify blocks a brainstorm board that breaks the schema or does not parse', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/brainstorm-cost-budget-20260922/brainstorm-board.json';
    const bad = brainstormBoard();
    bad.items.push({ key: 'C-01', kind: 'claim', thread: 'limit-per-project', text: 'a numbered claim' });
    writeFile(join(tmp, rel), JSON.stringify(bad));
    const blocked = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(blocked.status, 2, blocked.stderr);
    match(blocked.stderr, /brainstorm board validation FAILED/);

    writeFile(join(tmp, rel), '{ "schema": "sdlc/v1", ');
    const unparsed = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(unparsed.status, 2, unparsed.stderr);
    match(unparsed.stderr, /brainstorm board validation FAILED/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify mock-evidence gate blocks result: pass with a user-observable mock AC', () => {
  const tmp = tempDir();
  try {
    // A passing verify whose evidence for a user-observable AC bottoms out at a mock rung.
    const p = join(tmp, '.ai', 'workflows', 'demo', '06-verify-core.md');
    writeFile(p, md(validVerify({ 'metric-acceptance-mock-rung': 1 })));
    const blocked = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/06-verify-core.md' },
    }, tmp);
    equal(blocked.status, 2, blocked.stderr);
    match(blocked.stderr, /metric-acceptance-mock-rung/);

    // rung 0 (all AC on real rungs) passes clean.
    writeFile(p, md(validVerify({ 'metric-acceptance-mock-rung': 0 })));
    const ok = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/06-verify-core.md' },
    }, tmp);
    equal(ok.status, 0, ok.stderr);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

function auditLedger({ triageStatus, triage, severity = 'HIGH', status = 'open', lastRun = 1, awaitingSince } = {}) {
  const head = ['kind: ship-plan-audit', 'audited-plan-version: 1', `last-run: ${lastRun}`, 'verdict: unsound'];
  if (triageStatus) head.push(`triage-status: ${triageStatus}`);
  if (awaitingSince !== undefined) head.push(`awaiting-since: ${awaitingSince}`);
  const finding = [
    '  - id: release-safety:release-yml:bump-after-tag',
    '    lens: release-safety',
    '    target: .github/workflows/release.yml:42',
    `    severity: ${severity}`,
    `    status: ${status}`,
    '    surfaced-at: 1',
    '    last-seen: 1',
    '    route: /wf project ship-plan edit C',
  ];
  if (triage) finding.push(`    triage: ${triage}`);
  return `---\n${head.join('\n')}\nfindings:\n${finding.join('\n')}\n---\n## The Audit\nbody\n`;
}

test('post-write-verify ship-plan audit triage gate blocks an untriaged ledger and passes a triaged one', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/ship-plan-audit.md';
    const p = join(tmp, '.ai', 'ship-plan-audit.md');
    const run = () => runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);

    // The transcript failure: open HIGH, triage-status: pending, turn ends.
    writeFile(p, auditLedger({ triageStatus: 'pending' }));
    let r = run();
    equal(r.status, 2, r.stderr);
    match(r.stderr, /ship-plan audit triage gate BLOCKED/);
    match(r.stderr, /triage-status is `pending`/);

    // Missing triage-status is the same violation.
    writeFile(p, auditLedger());
    r = run();
    equal(r.status, 2, r.stderr);
    match(r.stderr, /\(missing\)/);

    // complete without a per-finding decision is still untriaged.
    writeFile(p, auditLedger({ triageStatus: 'complete' }));
    r = run();
    equal(r.status, 2, r.stderr);
    match(r.stderr, /carry no `triage: accept`/);

    // complete + accept passes.
    writeFile(p, auditLedger({ triageStatus: 'complete', triage: 'accept' }));
    r = run();
    equal(r.status, 0, r.stderr);
    equal(r.stderr, '');

    // awaiting-user is the explicit ask-and-wait escape, valid for the run that asked.
    writeFile(p, auditLedger({ triageStatus: 'awaiting-user', awaitingSince: 1 }));
    r = run();
    equal(r.status, 0, r.stderr);

    // The escape lasts one run: a stale or missing awaiting-since blocks.
    writeFile(p, auditLedger({ triageStatus: 'awaiting-user', lastRun: 2, awaitingSince: 1 }));
    r = run();
    equal(r.status, 2, r.stderr);
    match(r.stderr, /the escape lasts one run/);
    match(r.stderr, /`awaiting-since` is 1 while `last-run` is 2/);
    writeFile(p, auditLedger({ triageStatus: 'awaiting-user' }));
    r = run();
    equal(r.status, 2, r.stderr);
    match(r.stderr, /`awaiting-since` is \(missing\)/);

    // An acknowledged finding needs no accept; a MED finding never prompts.
    writeFile(p, auditLedger({ triageStatus: 'complete', status: 'acknowledged' }));
    equal(run().status, 0);
    writeFile(p, auditLedger({ severity: 'MED' }));
    equal(run().status, 0);

    // Never schema-gated: the ledger has no sdlc/v1 type and must not reach Ajv.
    writeFile(p, auditLedger({ triageStatus: 'complete', triage: 'accept' }));
    r = run();
    ok(!/frontmatter validation FAILED/.test(r.stderr), r.stderr);

    // Opt-out.
    writeFile(join(tmp, '.ai', 'sdlc-config.json'), JSON.stringify({ hooks: { shipPlanAuditTriageGate: false } }));
    writeFile(p, auditLedger({ triageStatus: 'pending' }));
    equal(run().status, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify skips po-answers.md prose log instead of schema-validating it', () => {
  const tmp = tempDir();
  try {
    // po-answers.md has no sdlc/v1 schema type. The `type: po-answers` below
    // would fail Ajv if validated — the hook must skip the prose log entirely
    // (path-based exemption, matching pre-write-validate).
    const poLog = join(tmp, '.ai', 'workflows', 'demo', 'po-answers.md');
    writeFile(poLog, md(
      { schema: 'sdlc/v1', type: 'po-answers', slug: 'demo' },
      '# Product Owner Answers\n\n## 2026-05-31 — 01-intake\n\n**Q:** Branch?\n**A:** Shared.\n',
    ));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/po-answers.md' },
    }, tmp);

    equal(result.status, 0, result.stderr);
    equal(result.stdout, '');
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('pre-write-validate allows steer.md standing-steering prose without frontmatter', () => {
  const tmp = tempDir();
  try {
    // steer.md is the user-owned standing-steering file — frontmatter-less free
    // prose by design (W6). Like po-answers.md it must clear BOTH gates: the
    // NN-stagename filename convention and the mandatory-frontmatter check.
    const result = runHook(HOOKS.preWriteValidate, {
      cwd: tmp,
      tool_input: {
        file_path: '.ai/workflows/demo/steer.md',
        content: '# Steering\n\n- Never touch `config/loader.ts` — being rewritten next week.\n- Prefer the queue approach.\n',
      },
    }, tmp);

    equal(result.status, 0, result.stderr);
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify skips steer.md standing-steering prose instead of schema-validating it', () => {
  const tmp = tempDir();
  try {
    // steer.md has no sdlc/v1 schema type. Even with an accidental type field it
    // must be skipped entirely (path-based exemption, matching pre-write-validate).
    const steer = join(tmp, '.ai', 'workflows', 'demo', 'steer.md');
    writeFile(steer, '# Steering\n\n- Never touch `config/loader.ts`.\n- Prefer the queue approach.\n');

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/steer.md' },
    }, tmp);

    equal(result.status, 0, result.stderr);
    equal(result.stdout, '');
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});





/* ───────────────────────── R7: verify result gate (AC-VERIFIABILITY) ───────────────────────── */

test('post-write-verify BLOCKS a false-pass verify: result pass with metric-acceptance-met < total (R7 G1)', () => {
  const tmp = tempDir();
  try {
    // The kanban phone-responsive false pass: result: pass with met:0 / total:2.
    const rel = '.ai/workflows/demo/06-verify-core.md';
    writeFile(join(tmp, rel), md(validVerify({ result: 'pass', 'metric-acceptance-met': 0, 'metric-acceptance-total': 2 })));

    const result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(result.status, 2, result.stderr);
    match(result.stderr, /verify result gate BLOCKED/);
    match(result.stderr, /metric-acceptance-met \(0\) < metric-acceptance-total \(2\)/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify BLOCKS result: pass with interactive-verification: deferred (R7 G2)', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/06-verify-core.md';
    writeFile(join(tmp, rel), md(validVerify({
      result: 'pass',
      'interactive-verification': 'deferred',
      'interactive-verification-defer-reason': 'no device',
    })));

    const result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(result.status, 2, result.stderr);
    match(result.stderr, /interactive-verification: deferred/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify allows a clean passing verify (met == total, no deferral) (R7)', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/06-verify-core.md';
    writeFile(join(tmp, rel), md(validVerify()));
    writeExplainer(join(tmp, rel));

    const result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(result.status, 0, result.stderr);
    equal(result.stdout, '');
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify allows result: partial with a deferral (the honest path) (R7)', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/06-verify-core.md';
    writeFile(join(tmp, rel), md(validVerify({
      result: 'partial',
      'metric-acceptance-met': 1,
      'metric-acceptance-total': 2,
      'interactive-verification': 'deferred',
      'interactive-verification-defer-reason': 'Robolectric covers logic (9/9); AVD boot failed (HAXM); residual = live multi-touch',
    })));

    const result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(result.status, 0, result.stderr);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify rejects the forbidden metric-acceptance-unverified-interactive shadow field (R7 schema)', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/06-verify-core.md';
    writeFile(join(tmp, rel), md(validVerify({ 'metric-acceptance-unverified-interactive': 2 })));

    const result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(result.status, 2, result.stderr);
    match(result.stderr, /frontmatter validation FAILED/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify accepts result: blocked-runtime-evidence-missing (R7 enum fix)', () => {
  const tmp = tempDir();
  try {
    // The schema previously rejected this contract-valid result state.
    const rel = '.ai/workflows/demo/06-verify-core.md';
    writeFile(join(tmp, rel), md(validVerify({
      result: 'blocked-runtime-evidence-missing',
      'metric-acceptance-met': 0,
      'metric-acceptance-total': 2,
    })));

    const result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(result.status, 0, result.stderr);   // valid state; not `pass`, so the result gate does not fire
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify WARNS (non-blocking) on a prose-only deferral with result: pass (R7 lint)', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/06-verify-core.md';
    writeFile(join(tmp, rel), md(
      validVerify(),
      '# Verify: core\n\nThe 375px responsive layout was deferred to user verification.\n',
    ));

    const result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(result.status, 0, result.stderr);   // heuristic → warn, never block
    const parsed = JSON.parse(result.stdout);
    match(parsed.systemMessage, /possible prose-only deferral/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify honours the hooks.verifyResultGate:false opt-out (R7)', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'sdlc-config.json'), JSON.stringify({ hooks: { verifyResultGate: false } }));
    const rel = '.ai/workflows/demo/06-verify-core.md';
    writeFile(join(tmp, rel), md(validVerify({ result: 'pass', 'metric-acceptance-met': 0, 'metric-acceptance-total': 2 })));

    const result = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
    equal(result.status, 0, result.stderr);   // gate disabled → no block
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('project context hooks allow plain markdown and validate typed frontmatter when present', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, 'PRODUCT.md'), '# Product\nPlain context.\n');
    let result = runHook(HOOKS.preWriteValidate, {
      cwd: tmp,
      tool_input: { file_path: 'PRODUCT.md', content: '# Product\nPlain context.\n' },
    }, tmp);
    equal(result.status, 0, result.stderr);

    result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: 'PRODUCT.md' },
    }, tmp);
    equal(result.status, 0, result.stderr);

    result = runHook(HOOKS.preWriteValidate, {
      cwd: tmp,
      tool_input: {
        file_path: 'DESIGN.md',
        content: md({ schema: 'sdlc/v1', type: 'wrong-type', title: 'Design', status: 'active', source: 'DESIGN.md' }),
      },
    }, tmp);
    equal(result.status, 2);
    match(result.stderr, /Expected 'project-context'/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('machine-cleanup removes the old state under SDLC_HOME, writes nothing to stdout, and exits 0', () => {
  const tmp = tempDir();
  try {
    const home = join(tmp, '.sdlc-home');
    writeFile(join(home, 'registry.json'), '{}');
    writeFile(join(home, 'errors.log'), 'kept\n');
    const result = runHook(HOOKS.machineCleanup, { cwd: tmp, hook_event_name: 'SessionStart' }, tmp, { SDLC_HOME: home, CLAUDE_CONFIG_DIR: join(tmp, '.claude') });
    equal(result.status, 0, result.stderr);
    equal(result.stdout.trim(), '', 'machine-cleanup emits nothing to stdout');
    equal(existsSync(join(home, 'registry.json')), false, 'the old registry is removed');
    equal(readFileSync(join(home, 'errors.log'), 'utf-8'), 'kept\n', 'the error log stays');
    ok(existsSync(join(home, '.v10-cleanup.json')), 'the marker is written');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('machine-cleanup warns once about old mod settings, and only reads the settings file', () => {
  const tmp = tempDir();
  try {
    const home = join(tmp, '.sdlc-home');
    const settings = join(tmp, '.claude', 'settings.json');
    const text = JSON.stringify({ pluginConfigs: { 'sdlc-workflow@m': { options: { strip: true } } } });
    writeFile(settings, text);
    const env = { SDLC_HOME: home, CLAUDE_CONFIG_DIR: join(tmp, '.claude') };
    const first = runHook(HOOKS.machineCleanup, { cwd: tmp, hook_event_name: 'SessionStart' }, tmp, env);
    equal(first.status, 0, first.stderr);
    match(JSON.parse(first.stdout).systemMessage, /These settings are ignored: strip\./);
    const second = runHook(HOOKS.machineCleanup, { cwd: tmp, hook_event_name: 'SessionStart' }, tmp, env);
    equal(second.stdout.trim(), '', 'the warning shows once');
    equal(readFileSync(settings, 'utf-8'), text, 'the settings file is not changed');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-auto-stage stages code files during active implement workflows', (t) => {
  const gitVersion = spawnSync('git', ['--version'], { encoding: 'utf-8' });
  if (gitVersion.error || gitVersion.status !== 0) {
    t.skip('git unavailable');
    return;
  }

  const tmp = tempDir();
  try {
    spawnSync('git', ['init'], { cwd: tmp, encoding: 'utf-8' });
    writeFile(join(tmp, '.ai', 'workflows', 'demo', '00-index.md'), md(minimalIndex()));
    writeFile(join(tmp, 'src', 'app.js'), 'console.log("demo");\n');

    const result = runHook(HOOKS.postWriteAutoStage, {
      cwd: tmp,
      tool_input: { file_path: 'src/app.js' },
    }, tmp);
    equal(result.status, 0);

    const staged = spawnSync('git', ['diff', '--cached', '--name-only'], {
      cwd: tmp,
      encoding: 'utf-8',
    });
    equal(staged.status, 0);
    match(staged.stdout, /src\/app\.js/);

    const stageWorkflow = runHook(HOOKS.postWriteAutoStage, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/01-intake.md' },
    }, tmp);
    equal(stageWorkflow.status, 0);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('hooks honor CLAUDE_PLUGIN_INSTALL suppression', () => {
  const tmp = tempDir();
  try {
    const result = runHook(HOOKS.preWriteValidate, {
      cwd: tmp,
      tool_input: {
        file_path: '.ai/workflows/demo/01-intake.md',
        content: '# invalid but suppressed\n',
      },
    }, tmp, { CLAUDE_PLUGIN_INSTALL: '1' });

    equal(result.status, 0);
    equal(result.stdout, '');
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('pre+post-write accept registered wf-quick/wf-meta artifact types and prefix filenames', () => {
  const tmp = tempDir();
  try {
    // Regression guard for v9.35.0: these lanes were silently blocked — unregistered
    // types (post-write Ajv) and/or non-NN filenames (pre-write). Both gates must pass now.
    const cases = [
      { file: '01-fix.md', type: 'fix-plan' },
      { file: '00-index.md', type: 'workflow-index' },
      { file: '01-discover.md', type: 'discover' },
      { file: '01-investigate.md', type: 'investigate' },
      // hf-*/rf-* exemptions retired by the compressed-lifecycle migration — new
      // hotfix/refactor runs write NN-prefixed standard artifacts. skip-* remains.
      { file: '99-close.md', type: 'close-record' },
      { file: '90-next.md', type: 'routing' },
    ];
    for (const c of cases) {
      const rel = `.ai/workflows/demo/${c.file}`;
      const content = md({ schema: 'sdlc/v1', type: c.type, slug: 'demo' });
      writeFile(join(tmp, rel), content);

      const pre = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: { file_path: rel, content } }, tmp);
      equal(pre.status, 0, `pre-write blocked ${c.file} (${c.type}): ${pre.stderr}`);

      const post = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: rel } }, tmp);
      equal(post.status, 0, `post-write blocked ${c.file} (${c.type}): ${post.stderr}`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('skip-record prefix filename clears pre-write, and ship-plan needs only project-name + plan-version', () => {
  const tmp = tempDir();
  try {
    // skip-<stage>.md: prefix filename (pre-write) + strict skip-record schema (post-write).
    const skipRel = '.ai/workflows/demo/skip-shape.md';
    const skipContent = md({
      schema: 'sdlc/v1', type: 'skip-record', slug: 'demo',
      'skipped-stage': 'shape', 'skipped-stage-artifact': '02-shape.md',
      reason: 'covered by rca', 'skipped-at': '2026-05-31T00:00:00Z', 'high-risk': false,
    });
    writeFile(join(tmp, skipRel), skipContent);
    let r = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: { file_path: skipRel, content: skipContent } }, tmp);
    equal(r.status, 0, `pre-write blocked skip-shape.md: ${r.stderr}`);
    r = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: skipRel } }, tmp);
    equal(r.status, 0, `post-write blocked skip-shape.md: ${r.stderr}`);

    // ship-plan: required[] aligned to the real template (no title/status/source).
    const planRel = '.ai/ship-plan.md';
    const planContent = md({ schema: 'sdlc/v1', type: 'ship-plan', slug: 'demo', 'project-name': 'demo', 'plan-version': 1 });
    writeFile(join(tmp, planRel), planContent);
    r = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: planRel } }, tmp);
    equal(r.status, 0, `post-write blocked ship-plan.md: ${r.stderr}`);

    // observability-plan (.ai/observability.md): project-root artifact, valid frontmatter → allowed (v9.132.0).
    const obsPlanRel = '.ai/observability.md';
    const obsPlanContent = md({ schema: 'sdlc/v1', type: 'observability-plan', slug: 'demo', 'plan-version': 1 });
    writeFile(join(tmp, obsPlanRel), obsPlanContent);
    r = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: { file_path: obsPlanRel, content: obsPlanContent } }, tmp);
    equal(r.status, 0, `pre-write blocked observability.md: ${r.stderr}`);
    r = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: obsPlanRel } }, tmp);
    equal(r.status, 0, `post-write blocked observability.md: ${r.stderr}`);

    // observability-build (.ai/observability-build.md): the build run record carries NO slug — must still validate.
    const obsBuildRel = '.ai/observability-build.md';
    const obsBuildContent = md({ schema: 'sdlc/v1', type: 'observability-build', backend: 'grafana-cloud' });
    writeFile(join(tmp, obsBuildRel), obsBuildContent);
    r = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: obsBuildRel } }, tmp);
    equal(r.status, 0, `post-write blocked observability-build.md: ${r.stderr}`);

    // Enforcement is live: a wrong type on the observability path is hard-blocked pre-write.
    const obsWrongContent = md({ schema: 'sdlc/v1', type: 'ship-plan', slug: 'demo', 'project-name': 'demo', 'plan-version': 1 });
    r = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: { file_path: obsPlanRel, content: obsWrongContent } }, tmp);
    equal(r.status, 2, `pre-write should block a wrong type on .ai/observability.md, got ${r.status}`);

    // The audit ledger is kind-keyed (kind: observability-audit, no sdlc/v1 type) — must stay EXEMPT, never schema-gated.
    const obsAuditRel = '.ai/observability-audit.md';
    const obsAuditContent = md({ kind: 'observability-audit', 'last-run': 1, verdict: 'sound' });
    writeFile(join(tmp, obsAuditRel), obsAuditContent);
    r = runHook(HOOKS.preWriteValidate, { cwd: tmp, tool_input: { file_path: obsAuditRel, content: obsAuditContent } }, tmp);
    equal(r.status, 0, `pre-write blocked the exempt observability-audit.md ledger: ${r.stderr}`);
    r = runHook(HOOKS.postWriteVerify, { cwd: tmp, tool_input: { file_path: obsAuditRel } }, tmp);
    equal(r.status, 0, `post-write blocked the exempt observability-audit.md ledger: ${r.stderr}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- W1 solutions corpus (v9.100.0): .ai/solutions/ validation scope ---------

test('post-write-verify validates .ai/solutions/ category files against the solution schema', () => {
  const tmp = tempDir();
  try {
    const goodRel = '.ai/solutions/testing/emulator-seed-harness.md';
    writeFile(join(tmp, goodRel), md({
      schema: 'sdlc/v1',
      type: 'solution',
      category: 'testing',
      'source-workflow': 'demo',
      'created-at': '2026-07-06T00:00:00Z',
      tags: ['emulator', 'auth'],
      status: 'active',
    }, '# Emulator seed harness\n\n**Problem:** auth wall.\n\n**Learning:** seed the emulator.\n\n**How to apply:** run the seed script.\n'));

    let result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: goodRel },
    }, tmp);
    equal(result.status, 0, result.stderr);
    equal(result.stderr, '');

    // A category outside the closed set must fail schema validation — the
    // closed category set is the corpus contract (misc is the overflow).
    const badRel = '.ai/solutions/randomcat/misfiled.md';
    writeFile(join(tmp, badRel), md({
      schema: 'sdlc/v1',
      type: 'solution',
      category: 'randomcat',
      'source-workflow': 'demo',
      'created-at': '2026-07-06T00:00:00Z',
      tags: [],
      status: 'active',
    }));
    result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: badRel },
    }, tmp);
    equal(result.status, 2);
    match(result.stderr, /frontmatter validation FAILED/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify skips .ai/solutions/INDEX.md and never demands sibling fragments for solutions', () => {
  const tmp = tempDir();
  try {
    // INDEX.md is a frontmatter-less registry line-index (same convention as
    // .ai/workflows/INDEX.md) — the category-subdir path predicate keeps it
    // out of schema validation entirely.
    writeFile(join(tmp, '.ai/solutions/INDEX.md'), '# Solutions\n\n- [Emulator seed harness](testing/emulator-seed-harness.md) — auth-wall harness\n');
    let result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/solutions/INDEX.md' },
    }, tmp);
    equal(result.status, 0, result.stderr);
    equal(result.stderr, '');

    // solution is NOT a rich-tier type: a valid solution file with no sibling
    // .yaml / .html.fragment must produce neither a block nor a nudge.
    const rel = '.ai/solutions/gotcha/build-cache-poisoning.md';
    writeFile(join(tmp, rel), md({
      schema: 'sdlc/v1',
      type: 'solution',
      category: 'gotcha',
      'source-workflow': 'demo',
      'created-at': '2026-07-06T00:00:00Z',
      tags: ['build'],
      status: 'active',
    }, '**Problem:** stale cache.\n\n**Learning:** key the cache on buildId.\n\n**How to apply:** include buildId in the cache key.\n'));
    result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);
    equal(result.status, 0, result.stderr);
    equal(result.stdout, '');
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// --- W3.2 leak guards (v9.101.0): advisory-first EOB enforcement -------------

const LEAK_HOOKS = {
  bash: join(PLUGIN_ROOT, 'hooks', 'leak-guard-bash.mjs'),
  write: join(PLUGIN_ROOT, 'hooks', 'leak-guard-write.mjs'),
};
const semanticConfig = (mode) =>
  JSON.stringify({ semantic: { enabled: true, mode } });

test('leak-guard-bash is silent by default (semantic.enabled: false)', () => {
  const tmp = tempDir();
  try {
    const result = runHook(LEAK_HOOKS.bash, {
      cwd: tmp,
      tool_input: { command: 'git commit -m "fix: update .ai/workflows/demo/06-verify-core.md"' },
    }, tmp);
    equal(result.status, 0, result.stderr);
    equal(result.stdout, '');
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('leak-guard-bash advises on internal vocabulary in commit messages when enabled', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'sdlc-config.json'), semanticConfig('advisory'));
    const result = runHook(LEAK_HOOKS.bash, {
      cwd: tmp,
      tool_input: { command: 'git commit -m "fix: verified via /wf verify demo, see .ai/workflows/demo/06-verify-core.md"' },
    }, tmp);
    equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    match(parsed.systemMessage, /External Output Boundary/);
    match(parsed.systemMessage, /wf-command|internal-path/);

    // Clean product-language message → no output at all.
    const clean = runHook(LEAK_HOOKS.bash, {
      cwd: tmp,
      tool_input: { command: 'git commit -m "fix: restore preview rendering for long links"' },
    }, tmp);
    equal(clean.status, 0, clean.stderr);
    equal(clean.stdout, '');

    // Non-publishing commands are never scanned, even with internal paths.
    const nonPublish = runHook(LEAK_HOOKS.bash, {
      cwd: tmp,
      tool_input: { command: 'cat .ai/workflows/demo/06-verify-core.md' },
    }, tmp);
    equal(nonPublish.status, 0, nonPublish.stderr);
    equal(nonPublish.stdout, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('leak-guard-bash denies (exit 2) in enforce mode and respects the dispatch sentinel', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'sdlc-config.json'), semanticConfig('enforce'));
    const input = {
      cwd: tmp,
      tool_input: { command: 'gh release create v1.2.3 --notes "shipped via /wf ship demo"' },
    };
    const denied = runHook(LEAK_HOOKS.bash, input, tmp);
    equal(denied.status, 2);
    match(denied.stderr, /External Output Boundary/);

    // Inside external-model dispatch the guard must never fire.
    const dispatched = runHook(LEAK_HOOKS.bash, input, tmp, { SDLC_DISPATCH_ACTIVE: '1' });
    equal(dispatched.status, 0, dispatched.stderr);
    equal(dispatched.stdout, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('leak-guard-write advises on public-doc writes and skips internal paths', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'sdlc-config.json'), semanticConfig('advisory'));
    const leakyReadme = runHook(LEAK_HOOKS.write, {
      cwd: tmp,
      tool_input: {
        file_path: 'README.md',
        content: '## Changes\nVerified with /wf verify demo (see .ai/workflows/demo/).\n',
      },
    }, tmp);
    equal(leakyReadme.status, 0, leakyReadme.stderr);
    match(JSON.parse(leakyReadme.stdout).systemMessage, /External Output Boundary/);

    // Internal-root writes are never scanned — workflow vocabulary belongs there.
    const internal = runHook(LEAK_HOOKS.write, {
      cwd: tmp,
      tool_input: {
        file_path: '.ai/workflows/demo/06-verify-core.md',
        content: 'run /wf verify demo per 04-plan-core.md',
      },
    }, tmp);
    equal(internal.status, 0, internal.stderr);
    equal(internal.stdout, '');

    // Clean public docs pass silently.
    const clean = runHook(LEAK_HOOKS.write, {
      cwd: tmp,
      tool_input: {
        file_path: 'docs/how-to/setup.md',
        content: 'Run the installer and review the settings page.\n',
      },
    }, tmp);
    equal(clean.status, 0, clean.stderr);
    equal(clean.stdout, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('leak-guard-write scans MultiEdit edits[] against public-doc paths', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'sdlc-config.json'), semanticConfig('advisory'));
    const result = runHook(LEAK_HOOKS.write, {
      cwd: tmp,
      tool_input: {
        file_path: 'CHANGELOG.md',
        edits: [
          { old_string: 'a', new_string: 'Improved link previews.' },
          { old_string: 'b', new_string: 'Verified via /wf verify demo.' },
        ],
      },
    }, tmp);
    equal(result.status, 0, result.stderr);
    match(JSON.parse(result.stdout).systemMessage, /External Output Boundary/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// WORK-WITHOUT-A-HOME (task + intake audit) — evidence gate + schema round-trips
// ---------------------------------------------------------------------------

test('post-write-verify mock-evidence gate message names the asserted rung (contract §7)', () => {
  const tmp = tempDir();
  try {
    // A task 06-verify.md whose only evidence for an AC is the agent's own
    // claim of success (evidence-rung: asserted). asserted counts into
    // metric-acceptance-mock-rung, so result: pass rides the SAME hook path
    // that blocks a mock-evidenced code AC — and the operator message must
    // name asserted so the fix (re-read the system of record) is legible.
    const p = join(tmp, '.ai', 'workflows', 'task-demo', '06-verify.md');
    writeFile(p, md(validVerify({ slug: 'task-demo', 'metric-acceptance-mock-rung': 1 })));
    const blocked = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/task-demo/06-verify.md' },
    }, tmp);
    equal(blocked.status, 2, blocked.stderr);
    match(blocked.stderr, /asserted/);
    match(blocked.stderr, /attested/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('schema round-trips: workflow-type task on type:index, audit on type:workflow-index', () => {
  const tmp = tempDir();
  try {
    // task — a full type:index with workflow-type: task and skipped stages
    // must survive the post-write-verify schema gate (the W0.5 hard blocker).
    const taskIndex = join(tmp, '.ai', 'workflows', 'task-demo', '00-index.md');
    writeFile(taskIndex, md(minimalIndex({
      slug: 'task-demo',
      'workflow-type': 'task',
      'current-stage': 'implement',
      'branch-strategy': 'none',
      branch: '',
      'created-at': '2026-08-11T12:00:00Z',
      'updated-at': '2026-08-11T12:05:00Z',
      'review-scope': 'slug-wide',
      'pr-url': '',
      'pr-number': null,
      tags: [],
      'workflow-files': ['00-index.md', '01-task.md'],
      progress: {
        intake: 'complete', shape: 'skipped', slice: 'skipped', plan: 'skipped',
        implement: 'in-progress', verify: 'not-started', review: 'skipped',
        handoff: 'skipped', ship: 'skipped',
      },
    })));
    const taskOk = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/task-demo/00-index.md' },
    }, tmp);
    equal(taskOk.status, 0, taskOk.stderr);

    // A value outside the enum still fails — the enum is real.
    writeFile(taskIndex, md(minimalIndex({ slug: 'task-demo', 'workflow-type': 'todo-list' })));
    const bad = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/task-demo/00-index.md' },
    }, tmp);
    equal(bad.status, 2);
    match(bad.stderr, /frontmatter validation FAILED/);

    // audit — a type:workflow-index root validates under the quick-meta set
    // (schema/type/slug required; workflow-type: audit rides along).
    const auditIndex = join(tmp, '.ai', 'workflows', 'audit-demo', '00-index.md');
    writeFile(auditIndex, md({
      schema: 'sdlc/v1',
      type: 'workflow-index',
      slug: 'audit-demo',
      'workflow-type': 'audit',
      status: 'active',
      'current-stage': 'audit',
      progress: { audit: 'complete' },
    }));
    const auditOk = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/audit-demo/00-index.md' },
    }, tmp);
    equal(auditOk.status, 0, auditOk.stderr);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('an audit-written 07-review-<lens>.md validates as review-command', () => {
  const tmp = tempDir();
  try {
    const p = join(tmp, '.ai', 'workflows', 'audit-demo', '07-review-correctness.md');
    writeFile(p, md({
      schema: 'sdlc/v1',
      type: 'review-command',
      slug: 'audit-demo',
      'review-scope': 'slug-wide',
      'slice-slug': '',
      'review-command': 'correctness',
      status: 'complete',
      'updated-at': '2026-08-11T12:00:00Z',
      'metric-findings-total': 0,
      'metric-findings-blocker': 0,
      'metric-findings-high': 0,
      result: 'clean',
      fragment: 'none',
      tags: [],
      refs: { 'review-master': '07-review.md' },
    }));
    const ok = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/audit-demo/07-review-correctness.md' },
    }, tmp);
    equal(ok.status, 0, ok.stderr);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
