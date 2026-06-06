import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
  sessionStartOrient: join(PLUGIN_ROOT, 'hooks', 'session-start-orient.mjs'),
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

test('post-write-verify reminds (non-blocking) when a rich-tier artifact lacks sibling fragment files', () => {
  const tmp = tempDir();
  try {
    // S-1: a schema-valid plan written WITHOUT its sibling .yaml/.html.fragment
    // must surface a non-blocking systemMessage reminder (exit 0, no stderr).
    const rel = '.ai/workflows/demo/slices/core/04-plan.md';
    writeFile(join(tmp, rel), md(validPlan()));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);

    equal(result.status, 0, result.stderr);
    equal(result.stderr, '');
    const parsed = JSON.parse(result.stdout);
    match(parsed.systemMessage, /sibling fragment files/);
    match(parsed.systemMessage, /04-plan\.yaml \+ 04-plan\.html\.fragment/);
    match(parsed.systemMessage, /fragment-author-contract\.md/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify stays silent when a rich-tier artifact has its sibling fragment files', () => {
  const tmp = tempDir();
  try {
    const dir = join(tmp, '.ai', 'workflows', 'demo', 'slices', 'core');
    writeFile(join(dir, '04-plan.md'), md(validPlan()));
    writeFile(join(dir, '04-plan.yaml'), 'files: []\n');
    writeFile(join(dir, '04-plan.html.fragment'), '<section class="fragment-plan"></section>\n');

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: '.ai/workflows/demo/slices/core/04-plan.md' },
    }, tmp);

    equal(result.status, 0, result.stderr);
    equal(result.stdout, '');
    equal(result.stderr, '');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify reminds for a profile artifact missing siblings (off-workflow .ai/profiles root)', () => {
  const tmp = tempDir();
  try {
    // Gap B (v9.41): profile lives off .ai/workflows. Confirm the reminder both
    // sees the .ai/profiles root and recognises the `profile` fragment type.
    const rel = '.ai/profiles/20260606T1200Z/01-profile.md';
    writeFile(join(tmp, rel), md(validProfile()));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);

    equal(result.status, 0, result.stderr);
    equal(result.stderr, '');
    const parsed = JSON.parse(result.stdout);
    match(parsed.systemMessage, /sibling fragment files/);
    match(parsed.systemMessage, /01-profile\.yaml \+ 01-profile\.html\.fragment/);
    match(parsed.systemMessage, /type: profile/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify reminds for a simplify-run artifact missing siblings (off-workflow .ai/simplify root)', () => {
  const tmp = tempDir();
  try {
    const rel = '.ai/simplify/20260606T1200Z.md';
    writeFile(join(tmp, rel), md(validSimplifyRun()));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);

    equal(result.status, 0, result.stderr);
    equal(result.stderr, '');
    const parsed = JSON.parse(result.stdout);
    match(parsed.systemMessage, /20260606T1200Z\.yaml \+ 20260606T1200Z\.html\.fragment/);
    match(parsed.systemMessage, /type: simplify-run/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('post-write-verify reminds for an augmentation artifact and resolves its augmentation-type', () => {
  const tmp = tempDir();
  try {
    // benchmark/experiment/instrument carry `type: augmentation`; the reminder
    // must resolve the fragment name from `augmentation-type:` (here: benchmark).
    const rel = '.ai/workflows/demo/augmentations/bench-1.md';
    writeFile(join(tmp, rel), md(validBenchmarkAugmentation()));

    const result = runHook(HOOKS.postWriteVerify, {
      cwd: tmp,
      tool_input: { file_path: rel },
    }, tmp);

    equal(result.status, 0, result.stderr);
    equal(result.stderr, '');
    const parsed = JSON.parse(result.stdout);
    match(parsed.systemMessage, /bench-1\.yaml \+ bench-1\.html\.fragment/);
    match(parsed.systemMessage, /type: benchmark/);
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

test('session-start-orient emits compact JSON for active workflows only', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'workflows', 'demo', '00-index.md'), md(minimalIndex()));
    writeFile(join(tmp, '.ai', 'workflows', 'done', '00-index.md'), md(minimalIndex({
      slug: 'done',
      status: 'complete',
      title: 'Done workflow',
    })));

    const result = runHook(HOOKS.sessionStartOrient, { cwd: tmp }, tmp, { SDLC_DISABLE_BOOTSTRAP: '1' });
    equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    match(parsed.systemMessage, /Active workflow: demo - Demo workflow/);
    match(parsed.systemMessage, /Stage: implement/);
    ok(!parsed.systemMessage.includes('Done workflow'));
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
      { file: 'hf-brief.md', type: 'hf-brief' },        // prefix filename, not NN
      { file: 'rf-plan.md', type: 'rf-plan' },          // prefix filename, not NN
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
