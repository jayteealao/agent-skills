import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { equal, match, ok } from 'node:assert/strict';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');

const HOOKS = {
  preWriteValidate: join(PLUGIN_ROOT, 'hooks', 'pre-write-validate.mjs'),
  postWriteVerify: join(PLUGIN_ROOT, 'hooks', 'post-write-verify.mjs'),
  postWriteAutoStage: join(PLUGIN_ROOT, 'hooks', 'post-write-auto-stage.mjs'),
  postWriteRender: join(PLUGIN_ROOT, 'hooks', 'post-write-render.mjs'),
  sessionStartOrient: join(PLUGIN_ROOT, 'hooks', 'session-start-orient.mjs'),
};

// Read the pending render-queue records under a repo's view dir (excludes the
// .status.json sidecar + the .processing/.failed subdirs).
function queueRecords(repoRoot) {
  const qdir = join(repoRoot, '.ai', '_view', '.render-queue');
  if (!existsSync(qdir)) return [];
  return readdirSync(qdir)
    .filter((n) => n.endsWith('.json') && n !== '.status.json')
    .map((n) => JSON.parse(readFileSync(join(qdir, n), 'utf-8')));
}

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

test('post-write-verify BLOCKS (exit 2) when a rich-tier artifact lacks its mandatory sibling .yaml', () => {
  const tmp = tempDir();
  try {
    // S-1 hardening (v9.47): a schema-valid plan written WITHOUT its sibling
    // .yaml must BLOCK (exit 2 + stderr). The renderer gates the entire rich tier
    // on the YAML, so the prior soft reminder was empirically ignored and the rich
    // tier stayed dark. The block forces authoring while the artifact is in context.
    const rel = '.ai/workflows/demo/04-plan-core.md';
    writeFile(join(tmp, rel), md(validPlan()));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);

    equal(result.status, 2);
    match(result.stderr, /mandatory sibling \.yaml/);
    match(result.stderr, /04-plan-core\.yaml \+ 04-plan-core\.html\.fragment/);
    match(result.stderr, /fragment-author-contract\.md/);
    match(result.stderr, /fragment: none/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify nudges (non-blocking) when the .yaml is present but the .html.fragment is missing', () => {
  const tmp = tempDir();
  try {
    // .yaml present → the page already renders rich; the missing .html.fragment is
    // only the interactive layer, so this is a soft systemMessage, NOT a block.
    const dir = join(tmp, '.ai', 'workflows', 'demo');
    writeFile(join(dir, '04-plan-core.md'), md(validPlan()));
    writeFile(join(dir, '04-plan-core.yaml'), 'artifact: plan\nslice: core\nmodules: [core]\nfiles: [{ path: src/a.ts, role: new }]\n');

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/04-plan-core.md' },
    }, tmp);

    equal(result.status, 0, result.stderr);
    equal(result.stderr, '');
    const parsed = JSON.parse(result.stdout);
    match(parsed.systemMessage, /no \.html\.fragment/);
    match(parsed.systemMessage, /04-plan-core\.html\.fragment/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify honours the `fragment: none` per-artifact escape', () => {
  const tmp = tempDir();
  try {
    // A rich artifact that legitimately has no structured data opts out with
    // `fragment: none` in frontmatter — no block, no nudge, no output.
    const rel = '.ai/workflows/demo/04-plan-core.md';
    writeFile(join(tmp, rel), md(validPlan({ fragment: 'none' })));

    const result = runHook(HOOKS.postWriteVerify, {
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

test('post-write-verify honours the global hooks.remindMissingFragments:false opt-out', () => {
  const tmp = tempDir();
  try {
    // Global opt-out disables both the block and the nudge. Also exercises that
    // the config schema accepts the key (additionalProperties:false on hooks).
    writeFile(join(tmp, '.ai', 'sdlc-config.json'),
      JSON.stringify({ hooks: { remindMissingFragments: false } }));
    const rel = '.ai/workflows/demo/04-plan-core.md';
    writeFile(join(tmp, rel), md(validPlan()));

    const result = runHook(HOOKS.postWriteVerify, {
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

test('post-write-verify stays silent when a rich-tier artifact has both sibling fragment files', () => {
  const tmp = tempDir();
  try {
    const dir = join(tmp, '.ai', 'workflows', 'demo');
    writeFile(join(dir, '04-plan-core.md'), md(validPlan()));
    writeFile(join(dir, '04-plan-core.yaml'), 'artifact: plan\nslice: core\nmodules: [core]\nfiles: [{ path: src/a.ts, role: new }]\n');
    writeFile(join(dir, '04-plan-core.html.fragment'), '<section class="fragment-plan"></section>\n');

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/04-plan-core.md' },
    }, tmp);

    equal(result.status, 0, result.stderr);
    equal(result.stdout, '');
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify BLOCKS (exit 2) when a present plan sibling .yaml violates its schema', () => {
  const tmp = tempDir();
  try {
    const dir = join(tmp, '.ai', 'workflows', 'demo');
    writeFile(join(dir, '04-plan-core.md'), md(validPlan()));
    // a file with no required `path` — genuinely malformed structure.
    writeFile(join(dir, '04-plan-core.yaml'), 'artifact: plan\nslice: core\nmodules: [core]\nfiles: [{ role: new }]\n');
    writeFile(join(dir, '04-plan-core.html.fragment'), '<section class="fragment-plan"></section>\n');

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/04-plan-core.md' },
    }, tmp);

    equal(result.status, 2, result.stderr);
    match(result.stderr, /sibling YAML validation FAILED/);
    match(result.stderr, /04-plan-core\.yaml/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify honours the hooks.validateSiblingYaml:false opt-out', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'sdlc-config.json'),
      JSON.stringify({ hooks: { validateSiblingYaml: false } }));
    const dir = join(tmp, '.ai', 'workflows', 'demo');
    writeFile(join(dir, '04-plan-core.md'), md(validPlan()));
    writeFile(join(dir, '04-plan-core.yaml'), 'artifact: plan\nslice: core\nmodules: [core]\nfiles: [{ role: new }]\n');
    writeFile(join(dir, '04-plan-core.html.fragment'), '<section class="fragment-plan"></section>\n');

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/04-plan-core.md' },
    }, tmp);

    equal(result.status, 0, result.stderr);   // validation disabled → no block
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify BLOCKS for a profile artifact missing its .yaml (off-workflow .ai/profiles root)', () => {
  const tmp = tempDir();
  try {
    // Gap B (v9.41): profile lives off .ai/workflows. Confirm the block both
    // sees the .ai/profiles root and recognises the `profile` fragment type.
    const rel = '.ai/profiles/20260606T1200Z/01-profile.md';
    writeFile(join(tmp, rel), md(validProfile()));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);

    equal(result.status, 2);
    match(result.stderr, /mandatory sibling \.yaml/);
    match(result.stderr, /01-profile\.yaml \+ 01-profile\.html\.fragment/);
    match(result.stderr, /type: profile/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify BLOCKS for a simplify-run artifact missing its .yaml (off-workflow .ai/simplify root)', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/simplify/20260606T1200Z.md';
    writeFile(join(tmp, rel), md(validSimplifyRun()));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);

    equal(result.status, 2);
    match(result.stderr, /20260606T1200Z\.yaml \+ 20260606T1200Z\.html\.fragment/);
    match(result.stderr, /type: simplify-run/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify BLOCKS for an augmentation artifact and resolves its augmentation-type', () => {
  const tmp = tempDir();
  try {
    // benchmark/experiment/instrument carry `type: augmentation`; the block
    // must resolve the fragment name from `augmentation-type:` (here: benchmark).
    const rel = '.ai/workflows/demo/augmentations/bench-1.md';
    writeFile(join(tmp, rel), md(validBenchmarkAugmentation()));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);

    equal(result.status, 2);
    match(result.stderr, /bench-1\.yaml \+ bench-1\.html\.fragment/);
    match(result.stderr, /type: benchmark/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify BLOCKS for a per-dimension review-command artifact missing its .yaml (v9.48 coverage)', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/07-review-correctness.md';
    writeFile(join(tmp, rel), md(validReviewCommand()));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);

    equal(result.status, 2);
    match(result.stderr, /mandatory sibling \.yaml/);
    match(result.stderr, /07-review-correctness\.yaml \+ 07-review-correctness\.html\.fragment/);
    match(result.stderr, /type: review-command/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify BLOCKS for a design-audit artifact missing its .yaml (v9.48 coverage)', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/07-design-audit.md';
    writeFile(join(tmp, rel), md(validDesignAudit()));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);

    equal(result.status, 2);
    match(result.stderr, /07-design-audit\.yaml \+ 07-design-audit\.html\.fragment/);
    match(result.stderr, /type: design-audit/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify BLOCKS for a design-critique artifact missing its .yaml (v9.48 coverage)', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/07-design-critique.md';
    writeFile(join(tmp, rel), md(validDesignCritique()));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);

    equal(result.status, 2);
    match(result.stderr, /07-design-critique\.yaml \+ 07-design-critique\.html\.fragment/);
    match(result.stderr, /type: design-critique/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify honours fragment: none on a review-command artifact (v9.48)', () => {
  const tmp = tempDir();
  try {
    // A clean dimension with zero findings opts out — no block, no output.
    const rel = '.ai/workflows/demo/07-review-style-consistency.md';
    writeFile(join(tmp, rel), md(validReviewCommand({ fragment: 'none', result: 'clean' })));

    const result = runHook(HOOKS.postWriteVerify, {
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

test('post-write-verify stays silent for a profile artifact that has its sibling fragment files', () => {
  const tmp = tempDir();
  try {
    const dir = join(tmp, '.ai', 'profiles', '20260606T1200Z');
    writeFile(join(dir, '01-profile.md'), md(validProfile()));
    writeFile(join(dir, '01-profile.yaml'), 'artifact: profile\n');
    writeFile(join(dir, '01-profile.html.fragment'), '<section class="fragment-profile"></section>\n');

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/profiles/20260606T1200Z/01-profile.md' },
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

test('session-start-orient emits no orientation message (stripped)', () => {
  const tmp = tempDir();
  try {
    // Even with an active workflow present, the hook no longer surfaces an
    // orientation systemMessage — the /wf commands re-read 00-index.md themselves.
    writeFile(join(tmp, '.ai', 'workflows', 'demo', '00-index.md'), md(minimalIndex()));

    const result = runHook(HOOKS.sessionStartOrient, { cwd: tmp }, tmp, { SDLC_DISABLE_BOOTSTRAP: '1', SDLC_DISABLE_TRAY_HEAL: '1' });
    equal(result.status, 0, result.stderr);
    equal(result.stdout.trim(), '', 'session-start-orient emits nothing to stdout');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

/* ───────────────────────── render dispatch (RENDER-DISPATCH-PLAN) ───────────────────────── */

// SDLC_DISABLE_ENSURE_HUB keeps the hub-ensure helper from spawning a real
// daemon in tests; SDLC_DISABLE_TRAY_HEAL keeps the tray reconcile from reaping
// a real tray; SDLC_HOME isolates any registry side effects to the temp dir.
function renderEnv(tmp) {
  return { SDLC_DISABLE_ENSURE_HUB: '1', SDLC_DISABLE_TRAY_HEAL: '1', SDLC_HOME: join(tmp, '.sdlc-home') };
}

test('post-write-render (hub dispatch) ENQUEUES a render request instead of spawning', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/workflows/demo/04-plan-core.md';
    writeFile(join(tmp, rel), md(validPlan()));

    const result = runHook(HOOKS.postWriteRender, { cwd: tmp, tool_input: { file_path: rel } }, tmp, renderEnv(tmp));
    equal(result.status, 0, result.stderr);

    const records = queueRecords(tmp);
    equal(records.length, 1, 'one queue record written for the slug write');
    equal(records[0].kind, 'incremental');
    equal(records[0].bucket, 'demo');
    equal(records[0].repoRoot, tmp);
    ok(!existsSync(join(tmp, '.ai', '_view', '.render-pending')), 'no legacy inline debounce file under hub dispatch');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-render (hub) enqueues off-pipeline writes with kind=offpipeline', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/simplify/20260606T1200Z.md';
    writeFile(join(tmp, rel), md(validSimplifyRun()));

    const result = runHook(HOOKS.postWriteRender, { cwd: tmp, tool_input: { file_path: rel } }, tmp, renderEnv(tmp));
    equal(result.status, 0, result.stderr);

    const records = queueRecords(tmp);
    equal(records.length, 1);
    equal(records[0].kind, 'offpipeline');
    equal(records[0].bucket, 'simplify', 'view bucket matches the off-pipeline source dir (--only simplify/**)');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-render coalesces multiple touched paths in one bucket into one record', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai/workflows/demo/04-plan-core.md'), md(validPlan()));
    writeFile(join(tmp, '.ai/workflows/demo/04-plan-core.yaml'), 'artifact: plan\n');

    const result = runHook(HOOKS.postWriteRender, {
      cwd: tmp,
      tool_input: { edits: [
        { file_path: '.ai/workflows/demo/04-plan-core.md' },
        { file_path: '.ai/workflows/demo/04-plan-core.yaml' },
      ] },
    }, tmp, renderEnv(tmp));
    equal(result.status, 0, result.stderr);

    const records = queueRecords(tmp);
    equal(records.length, 1, 'two paths in one bucket → one record');
    equal(records[0].bucket, 'demo');
    equal(records[0].paths.length, 2, 'both paths recorded for provenance');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-render (inline dispatch) uses the legacy debounce path, NOT the queue', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'sdlc-config.json'), JSON.stringify({ view: { renderDispatch: 'inline' } }));
    const rel = '.ai/workflows/demo/04-plan-core.md';
    writeFile(join(tmp, rel), md(validPlan()));

    const result = runHook(HOOKS.postWriteRender, { cwd: tmp, tool_input: { file_path: rel } }, tmp, renderEnv(tmp));
    equal(result.status, 0, result.stderr);

    ok(existsSync(join(tmp, '.ai', '_view', '.render-pending')), 'inline path writes the debounce touch-file');
    equal(queueRecords(tmp).length, 0, 'inline path does not enqueue');

    // The inline path spawned a detached debounce child (cwd=tmp, which Windows
    // locks). Bump .render-pending so it bails at +2s WITHOUT spawning
    // render-sunflower, releasing the dir sooner.
    writeFileSync(join(tmp, '.ai', '_view', '.render-pending'), String(Date.now() + 1e9), 'utf-8');
  } finally {
    // Best-effort: the detached child briefly locks the temp dir on Windows.
    // Retry, then tolerate — the assertions already passed and %TEMP% is
    // reclaimed by the OS. (This is the ONLY hook that spawns a detached child.)
    try { rmSync(tmp, { recursive: true, force: true, maxRetries: 30, retryDelay: 200 }); }
    catch { /* detached inline child still holds cwd — leave it for OS temp cleanup */ }
  }
});

test('post-write-render skips writes inside the view tree (no self-trigger loop)', () => {
  const tmp = tempDir();
  try {
    const result = runHook(HOOKS.postWriteRender, {
      cwd: tmp, tool_input: { file_path: '.ai/_view/demo/notes.md' },
    }, tmp, renderEnv(tmp));
    equal(result.status, 0, result.stderr);
    equal(queueRecords(tmp).length, 0, 'a view-internal write never enqueues');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('session-start-orient (hub dispatch) enqueues a bootstrap render request', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'workflows', 'demo', '00-index.md'), md(minimalIndex()));

    // bootstrap ENABLED (no SDLC_DISABLE_BOOTSTRAP) but ensure-hub disabled, so
    // it enqueues without spawning a real daemon.
    const result = runHook(HOOKS.sessionStartOrient, { cwd: tmp }, tmp, renderEnv(tmp));
    equal(result.status, 0, result.stderr);

    const records = queueRecords(tmp);
    equal(records.length, 1, 'a whole-repo bootstrap request is enqueued at session start');
    equal(records[0].kind, 'bootstrap');
    equal(records[0].bucket, '__bootstrap__');

    // orientation message is stripped — the hook emits nothing to stdout
    equal(result.stdout.trim(), '', 'session-start-orient emits nothing to stdout');
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
