import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { equal, match, ok } from 'node:assert/strict';

import {
  defaultFrontmatterSchemaPath,
  loadJsonSchema,
  findFrontmatterBranch,
  validateFrontmatter,
  validateFrontmatterFile,
  validateSiblingYaml,
} from '../../../lib/schema-validator.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..', '..', '..');
const SCHEMA_PATH = defaultFrontmatterSchemaPath();
const VERIFY_FRAGMENT = join(PLUGIN_ROOT, 'scripts', 'verify-fragment.mjs');
const MIGRATE_DESIGN_TYPES = join(PLUGIN_ROOT, 'scripts', 'migrate-design-types.mjs');

function tempDir(prefix = 'sdlc-gap-phase1-') {
  return mkdtempSync(join(tmpdir(), prefix));
}

function writeText(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, 'utf-8');
}

function markdown(frontmatter, body = '# Body\n') {
  return `---\n${frontmatter.trim()}\n---\n${body}`;
}

function validDesignContract() {
  return {
    schema: 'sdlc/v1',
    type: 'design-contract',
    slug: 'demo',
    title: 'Checkout visual contract',
    status: 'ready',
    'created-at': '2026-05-24T12:00:00Z',
    'updated-at': '2026-05-24T12:05:00Z',
    component: 'Checkout',
    'based-on': '02b-design.md',
    tokens: ['color.surface'],
    states: ['default', 'focus'],
    sizes: ['mobile', 'desktop'],
    themes: ['light'],
    refs: { design: '02b-design.md' },
  };
}

function validDesignCritique() {
  return {
    schema: 'sdlc/v1',
    type: 'design-critique',
    slug: 'demo',
    title: 'Design critique',
    status: 'ready',
    'created-at': '2026-05-24T12:00:00Z',
    'updated-at': '2026-05-24T12:05:00Z',
    scope: 'surface',
    'findings-count': 1,
    'severity-distribution': { blocker: 0, high: 1, medium: 0, low: 0, nit: 0 },
    refs: { implementation: '05-implement.md' },
  };
}

function validDesignAudit() {
  return {
    schema: 'sdlc/v1',
    type: 'design-audit',
    slug: 'demo',
    title: 'Design audit',
    status: 'ready',
    'created-at': '2026-05-24T12:00:00Z',
    'updated-at': '2026-05-24T12:05:00Z',
    verdict: 'conditional',
    'audited-against': ['02b-design.md', '02c-craft.md'],
    'violations-count': 1,
    'severity-distribution': { blocker: 0, high: 0, medium: 1, low: 0 },
    'remediation-state': 'in-progress',
    refs: { implementation: '05-implement.md' },
  };
}

test('design phase 1 schema: admits strict design artifact branches only', async () => {
  const schema = await loadJsonSchema(SCHEMA_PATH);
  equal(findFrontmatterBranch(schema, 'design-contract')?.properties?.type?.const, 'design-contract');
  equal(findFrontmatterBranch(schema, 'design-critique')?.properties?.type?.const, 'design-critique');
  equal(findFrontmatterBranch(schema, 'design-audit')?.properties?.type?.const, 'design-audit');
  equal(findFrontmatterBranch(schema, 'craft'), null);
  equal(findFrontmatterBranch(schema, 'design-brief'), null);
  equal(findFrontmatterBranch(schema, 'critique'), null);
  equal(findFrontmatterBranch(schema, 'audit'), null);

  equal(validateFrontmatter(validDesignContract(), { schemaPath: SCHEMA_PATH }).valid, true);
  equal(validateFrontmatter(validDesignCritique(), { schemaPath: SCHEMA_PATH }).valid, true);
  equal(validateFrontmatter(validDesignAudit(), { schemaPath: SCHEMA_PATH }).valid, true);

  const missingContractFields = validateFrontmatter({
    schema: 'sdlc/v1',
    type: 'design-contract',
    slug: 'demo',
  }, { schemaPath: SCHEMA_PATH });
  equal(missingContractFields.valid, false);
  ok(missingContractFields.errors.some((err) => err.keyword === 'required'));
});

test('design phase 1 schema: validates critique and audit sibling YAML', () => {
  equal(validateSiblingYaml({
    artifact: 'design-critique',
    scope: 'surface',
    summary: 'One high-impact hierarchy issue.',
    run_at: '2026-05-24T12:00:00Z',
    findings: [{
      id: 'C1',
      severity: 'high',
      dimension: 'visual hierarchy',
      where: 'Checkout header',
      observation: 'Primary action is visually weaker than secondary content.',
      recommendation: 'Increase contrast and isolate the action in the main flow.',
    }],
  }, { schemaPath: SCHEMA_PATH }).valid, true);

  equal(validateSiblingYaml({
    artifact: 'design-audit',
    verdict: 'conditional',
    'audited-against': ['02b-design.md', '02c-craft.md'],
    'remediation-state': 'in-progress',
    run_at: '2026-05-24T12:00:00Z',
    violations: [{
      id: 'A1',
      severity: 'medium',
      'token-or-rule': 'focus-visible',
      where: 'Checkout button',
      observation: 'Focus state is present but too subtle.',
      'remediation-status': 'open',
      recommendation: 'Use the product focus ring token.',
    }],
  }, { schemaPath: SCHEMA_PATH }).valid, true);
});

test('design phase 1 fragments: critique and audit names pass whitelist and sibling schemas', () => {
  const tmp = tempDir();
  try {
    const workflow = join(tmp, '.ai', 'workflows', 'demo');
    writeText(join(workflow, '07-design-critique.html.fragment'), `
<section class="fragment-design-critique">
  <p>Critique</p>
  <script>window.dispatchEvent(new CustomEvent('sdlc:fragment-ready'));</script>
</section>
`);
    writeText(join(workflow, '07-design-critique.yaml'), `
artifact: design-critique
scope: surface
summary: One high-impact hierarchy issue.
run_at: 2026-05-24T12:00:00Z
findings:
  - id: C1
    severity: high
    observation: Primary action is visually weaker than secondary content.
    recommendation: Increase contrast and isolate the action in the main flow.
`);
    writeText(join(workflow, '07-design-audit.html.fragment'), `
<section class="fragment-design-audit">
  <p>Audit</p>
  <script>window.dispatchEvent(new CustomEvent('sdlc:fragment-ready'));</script>
</section>
`);
    writeText(join(workflow, '07-design-audit.yaml'), `
artifact: design-audit
verdict: conditional
audited-against: [02b-design.md, 02c-craft.md]
remediation-state: in-progress
run_at: 2026-05-24T12:00:00Z
violations:
  - id: A1
    severity: medium
    token-or-rule: focus-visible
    observation: Focus state is present but too subtle.
    remediation-status: open
`);

    const result = spawnSync(process.execPath, [
      VERIFY_FRAGMENT,
      '--root',
      join(tmp, '.ai', 'workflows'),
      '--schema',
      SCHEMA_PATH,
    ], { cwd: PLUGIN_ROOT, encoding: 'utf-8' });

    equal(result.status, 0, result.stderr || result.stdout);
    match(result.stdout, /2 fragments OK/);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

test('migrate-design-types: dry-run, migrate, and rerun are idempotent', async () => {
  const tmp = tempDir();
  try {
    const workflow = join(tmp, '.ai', 'workflows', 'demo');
    const craftPath = join(workflow, '02c-craft.md');
    const critiquePath = join(workflow, '07-design-critique.md');
    const auditPath = join(workflow, '07-design-audit.md');

    writeText(craftPath, markdown(`
schema: sdlc/v1
type: craft
slug: demo
created-at: 2026-05-24T12:00:00Z
based-on: 02b-design.md
register: product
image-gate: pass
north-star-mock: none
references-loaded: [typeset.md]
`));
    writeText(critiquePath, markdown(`
schema: sdlc/v1
type: critique
slug: demo
`));
    writeText(auditPath, markdown(`
schema: sdlc/v1
type: audit
slug: demo
`));

    const beforeDryRun = readFileSync(craftPath, 'utf-8');
    const dryRun = spawnSync(process.execPath, [
      MIGRATE_DESIGN_TYPES,
      '--root',
      tmp,
      '--dry-run',
    ], { cwd: PLUGIN_ROOT, encoding: 'utf-8' });

    equal(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
    match(dryRun.stdout, /\[dry-run\].*02c-craft\.md/);
    match(dryRun.stdout, /would migrate 3 file\(s\)/);
    equal(readFileSync(craftPath, 'utf-8'), beforeDryRun);

    const migrated = spawnSync(process.execPath, [
      MIGRATE_DESIGN_TYPES,
      '--root',
      tmp,
    ], { cwd: PLUGIN_ROOT, encoding: 'utf-8' });

    equal(migrated.status, 0, migrated.stderr || migrated.stdout);
    match(migrated.stdout, /\[migrated\].*07-design-audit\.md/);
    match(migrated.stdout, /migrated 3 file\(s\)/);

    equal((await validateFrontmatterFile(craftPath, { schemaPath: SCHEMA_PATH })).valid, true);
    equal((await validateFrontmatterFile(critiquePath, { schemaPath: SCHEMA_PATH })).valid, true);
    equal((await validateFrontmatterFile(auditPath, { schemaPath: SCHEMA_PATH })).valid, true);
    match(readFileSync(craftPath, 'utf-8'), /type: "?design-contract"?/);
    match(readFileSync(critiquePath, 'utf-8'), /type: "?design-critique"?/);
    match(readFileSync(auditPath, 'utf-8'), /type: "?design-audit"?/);

    const afterMigration = readFileSync(craftPath, 'utf-8')
      + readFileSync(critiquePath, 'utf-8')
      + readFileSync(auditPath, 'utf-8');
    const rerun = spawnSync(process.execPath, [
      MIGRATE_DESIGN_TYPES,
      '--root',
      tmp,
    ], { cwd: PLUGIN_ROOT, encoding: 'utf-8' });

    equal(rerun.status, 0, rerun.stderr || rerun.stdout);
    match(rerun.stdout, /migrated 0 file\(s\)/);
    equal(
      readFileSync(craftPath, 'utf-8')
        + readFileSync(critiquePath, 'utf-8')
        + readFileSync(auditPath, 'utf-8'),
      afterMigration,
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});

// WF-DESIGN-PLAN Release E (Part III 9.1): four design modes per surface; `register`
// stays readable and optional, and reads as a design mode (brand → persuade, product → operate).
test('design modes: surface-modes on 02c-craft.md, design-mode on 02b and a move, register optional', async () => {
  const contract = { ...validDesignContract(), 'surface-modes': { home: 'persuade', settings: 'operate', docs: 'read', game: 'experience' } };
  equal(validateFrontmatter(contract).valid, true, JSON.stringify(validateFrontmatter(contract).errors));
  equal(validateFrontmatter({ ...contract, 'surface-modes': { home: 'brand' } }).valid, false, 'a design mode is one of four');
  equal(validateFrontmatter({ ...validDesignContract(), register: 'product' }).valid, true, 'an old register still validates');
  const design = { schema: 'sdlc/v1', type: 'design', slug: 'demo', 'created-at': '2026-05-24T12:00:00Z', 'recommended-references': [] };
  equal(validateFrontmatter(design).valid, true, 'register is no longer required on 02b-design.md');
  equal(validateFrontmatter({ ...design, 'design-mode': 'operate', 'surface-modes': { home: 'read' } }).valid, true);
  equal(validateFrontmatter({ ...design, register: 'brand' }).valid, true);
  const move = { schema: 'sdlc/v1', type: 'design-augmentation', 'sub-command': 'polish', slug: 'demo', 'created-at': '2026-05-24T12:00:00Z', 'files-modified': [] };
  equal(validateFrontmatter(move).valid, true, 'register is no longer required on a move');
  equal(validateFrontmatter({ ...move, 'design-mode': 'experience' }).valid, true);
  equal(validateFrontmatter({ ...move, 'design-mode': 'brand' }).valid, false);
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'));
  const required = JSON.stringify(Object.values(schema.$defs).map((d) => d?.required ?? []));
  ok(!required.includes('"register"'), 'no schema branch requires register');
  ok(!('modes' in (schema.$defs.surfaceModes.properties ?? {})), 'the design field is surface-modes, never modes');

  const { designModeAdvice } = await import('../../../hooks/post-write-verify.mjs');
  match(designModeAdvice({ type: 'design-contract', register: 'brand' }), /read as design mode `persuade`.*Write `surface-modes:`/);
  match(designModeAdvice({ type: 'design-augmentation', register: 'product' }), /design mode `operate`.*Write `design-mode:`/);
  equal(designModeAdvice({ type: 'design-contract', register: 'brand', 'surface-modes': { home: 'persuade' } }), null);
  equal(designModeAdvice({ type: 'plan', register: 'brand' }), null);

  const { render } = await import('../../../renderers/design-contract.mjs');
  const page = (fm) => render({ type: 'design-contract', path: '02c-craft.md', frontmatter: fm, body: '' }, {}).bodyHtml;
  const modern = page(contract);
  match(modern, /design modes/);
  match(modern, /<code>home<\/code>: persuade/);
  match(modern, /<code>game<\/code>: experience/);
  const old = page({ ...validDesignContract(), register: 'brand' });
  match(old, /<li>persuade<\/li>/);
  match(old, /Read from the deprecated <code>register: brand<\/code>/);
  match(old, /<dt>register<\/dt><dd>brand<\/dd>/, 'the old register still renders in the record');
  ok(!page(validDesignContract()).includes('design modes'), 'no section when the contract names no design mode');
});
