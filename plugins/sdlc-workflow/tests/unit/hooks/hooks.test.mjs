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
  preCompactPreserve: join(PLUGIN_ROOT, 'hooks', 'pre-compact-preserve.mjs'),
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

test('pre-compact-preserve emits preservation instructions for active workflows', () => {
  const tmp = tempDir();
  try {
    writeFile(join(tmp, '.ai', 'workflows', 'demo', '00-index.md'), md(minimalIndex()));

    const result = runHook(HOOKS.preCompactPreserve, { cwd: tmp }, tmp);
    equal(result.status, 0, result.stderr);
    match(result.stdout, /CRITICAL - Active SDLC workflow state/);
    match(result.stdout, /WORKFLOW: demo/);
    match(result.stdout, /Progress: intake: complete, implement: in-progress/);
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
