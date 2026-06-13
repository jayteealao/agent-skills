import { test } from 'node:test';
import { equal, match, ok } from 'node:assert/strict';

import { render as renderAugmentation } from '../../../renderers/augmentation.mjs';
import { render as renderBenchmark } from '../../../renderers/benchmark.mjs';
import { render as renderExperiment } from '../../../renderers/experiment.mjs';
import { render as renderInstrument } from '../../../renderers/instrument.mjs';
import { render as renderRca } from '../../../renderers/rca.mjs';
import { render as renderReviewDimension } from '../../../renderers/review-dimension.mjs';
import { render as renderReviewCommand } from '../../../renderers/review-command.mjs';
import { render as renderDesignContract } from '../../../renderers/design-contract.mjs';
import { render as renderDesignCritique } from '../../../renderers/design-critique.mjs';
import { render as renderDesignAudit } from '../../../renderers/design-audit.mjs';
import { render as renderPlan } from '../../../renderers/plan.mjs';
import {
  defaultFrontmatterSchemaPath,
  validateFrontmatter,
} from '../../../lib/schema-validator.mjs';

const SCHEMA_PATH = defaultFrontmatterSchemaPath();

function artifact(overrides = {}) {
  return {
    type: 'test',
    path: 'demo.md',
    frontmatter: { type: 'test', status: 'complete' },
    body: '## Narrative\nBody text.',
    siblingYaml: null,
    history: [],
    fragment: null,
    ...overrides,
  };
}

test('phase 2 renderer: benchmark renders comparison table, commands, fragment, and prose', () => {
  const out = renderBenchmark(artifact({
    path: '05c-benchmark.md',
    frontmatter: { type: 'augmentation', 'augmentation-type': 'benchmark', status: 'complete' },
    siblingYaml: {
      artifact: 'benchmark',
      target: 'cache lookup',
      framework: 'criterion',
      mode: 'compare',
      metrics: [
        { name: 'p95', before: 120, after: 90, unit: 'ms', direction: 'lower-is-better' },
      ],
      'commands-run': ['npm run bench'],
    },
    fragment: '<section class="fragment-benchmark"></section>',
  }));

  match(out.headerHtml, /Benchmark/);
  match(out.bodyHtml, /benchmark-table/);
  match(out.bodyHtml, /npm run bench/);
  match(out.bodyHtml, /fragment-benchmark/);
  match(out.bodyHtml, /Narrative/);
});

test('phase 2 renderer: experiment renders hypothesis, allocation, ramp, and guardrails', () => {
  const out = renderExperiment(artifact({
    path: '04c-experiment.md',
    frontmatter: { type: 'augmentation', 'augmentation-type': 'experiment', status: 'ready' },
    siblingYaml: {
      artifact: 'experiment',
      experiment_type: 'feature-flag',
      flag: 'new-onboarding',
      hypothesis: 'Shorter setup improves activation.',
      arms: [
        { id: 'control', allocated_pct: 50, description: 'Current flow' },
        { id: 'variant', allocated_pct: 50, description: 'Guided flow' },
      ],
      'ramp-schedule': [{ at: 'day 1', allocation: '10%' }],
      guardrails: [{ name: 'error rate', threshold: 2, direction: 'lower-is-better', unit: '%' }],
    },
  }));

  match(out.bodyHtml, /hypothesis/);
  match(out.bodyHtml, /Arm allocation/);
  match(out.bodyHtml, /aug-experiment-ramp/);
  match(out.bodyHtml, /guardrail-table/);
});

test('phase 2 renderer: instrument renders signals, dark paths, and dashboards', () => {
  const out = renderInstrument(artifact({
    path: '04b-instrument.md',
    frontmatter: { type: 'augmentation', 'augmentation-type': 'instrument', status: 'ready' },
    siblingYaml: {
      artifact: 'instrument',
      framework: 'opentelemetry',
      signals: [
        { name: 'checkout_started', kind: 'counter', labels: ['tenant'], where_emitted: 'Checkout.tsx:12' },
      ],
      dark_paths: [{ path: 'Checkout.tsx:44', reason: 'No failure metric' }],
      dashboards: [{ name: 'Checkout health', url: 'https://dash.example/checkout' }],
      pii_warnings: 0,
    },
  }));

  match(out.bodyHtml, /signal-table/);
  match(out.bodyHtml, /Checkout.tsx:44/);
  match(out.bodyHtml, /aug-instrument-dashboards/);
});

test('phase 2 renderer: rca validates direct frontmatter and renders timeline, chain, and 5-whys', () => {
  const frontmatter = {
    schema: 'sdlc/v1',
    type: 'rca',
    slug: 'checkout-failure',
    'workflow-type': 'rca',
    symptom: 'Checkout fails for EU users',
    impact: 'high',
    'root-cause-confidence': 'high',
    'blast-radius': 'medium',
    'recommended-next': '/wf plan',
    status: 'ready-for-fix-routing',
    'created-at': '2026-05-24T12:00:00Z',
  };
  equal(validateFrontmatter(frontmatter, { schemaPath: SCHEMA_PATH }).valid, true);

  const out = renderRca(artifact({
    path: '01-rca.md',
    frontmatter,
    siblingYaml: {
      artifact: 'rca',
      incident: 'INC-1',
      title: 'Checkout failure',
      started_at: '2026-05-24T11:00:00Z',
      resolved_at: '2026-05-24T12:00:00Z',
      metrics: { duration: '60m', time_to_detect: '5m', time_to_mitigate: '20m', user_failures: 12 },
      timeline: [
        { id: 't1', at: '11:00', kind: 'alert', title: 'Alert' },
        { id: 't2', at: '11:20', kind: 'mitigation', title: 'Mitigated' },
      ],
      chain: [
        { step: 'TRIGGER', body: 'Deploy changed env parsing' },
        { step: 'CHANGE', body: 'Region fallback broke' },
        { step: 'CASCADE', body: 'Payment config missing' },
        { step: 'ROOT_CAUSE', body: 'No contract test covered EU config' },
      ],
      heatmap: { buckets: ['api'], systems: { checkout: [1] } },
      five_whys: [
        { question: 'Why did checkout fail?', answer: 'Payment config was missing.' },
        { question: 'Why was it missing?', answer: 'ROOT: EU env was not contract-tested.' },
      ],
    },
  }));

  match(out.bodyHtml, /Incident timeline/);
  match(out.bodyHtml, /Causal chain/);
  match(out.bodyHtml, /rca-five-whys is-root/);
});

test('phase 2 renderer: review-dimension owns focused review and review-command aliases it', () => {
  const reviewArtifact = artifact({
    path: '07-review/security.md',
    frontmatter: { type: 'review-command', status: 'complete', 'review-command': 'security' },
    siblingYaml: {
      artifact: 'review-dimension',
      dimension: 'security',
      parent: '07-review.md',
      rev: 1,
      verdict: 'conditional',
      summary: 'One high finding.',
      counts: { blocker: 0, high: 1, med: 0, low: 0, nit: 0 },
      findings: [
        { id: 'S1', severity: 'high', msg: 'Missing auth check', fix: 'Guard route', file: 'api.ts', line: 9 },
      ],
    },
  });

  const direct = renderReviewDimension(reviewArtifact);
  const alias = renderReviewCommand(reviewArtifact);
  match(direct.headerHtml, /review-dimension/);
  match(direct.bodyHtml, /Missing auth check/);
  equal(alias.bodyHtml, direct.bodyHtml);
});

test('phase 2 renderer: augmentation dispatches to concrete subtype renderers', () => {
  const out = renderAugmentation(artifact({
    frontmatter: { type: 'augmentation', 'augmentation-type': 'benchmark', status: 'complete' },
    siblingYaml: {
      artifact: 'benchmark',
      target: 'startup',
      metrics: [{ name: 'cold start', before: 500, after: 420, unit: 'ms' }],
    },
  }));

  match(out.bodyHtml, /benchmark-table/);
  ok(!/frontmatter-card/.test(out.bodyHtml));
});

test('phase 2 renderer: design contract, critique, and audit render Phase 1 artifact types', () => {
  const contract = renderDesignContract(artifact({
    path: '02c-craft.md',
    frontmatter: {
      type: 'design-contract',
      title: 'Checkout visual contract',
      status: 'ready',
      component: 'Checkout',
      'based-on': '02b-design.md',
      tokens: ['color.action'],
      states: ['default', 'focus'],
      sizes: ['mobile'],
      themes: ['light'],
    },
  }));
  match(contract.bodyHtml, /design-contract-matrix/);

  const critique = renderDesignCritique(artifact({
    path: '07-design-critique.md',
    frontmatter: {
      type: 'design-critique',
      title: 'Design critique',
      status: 'ready',
      scope: 'surface',
      'severity-distribution': { blocker: 0, high: 1, medium: 0, low: 0, nit: 0 },
    },
    siblingYaml: {
      artifact: 'design-critique',
      scope: 'surface',
      summary: 'The primary action is weak.',
      findings: [
        { id: 'C1', severity: 'high', where: 'Hero', observation: 'Primary action is hidden.', recommendation: 'Move it above the fold.' },
      ],
    },
  }));
  match(critique.bodyHtml, /design-critique-findings/);
  match(critique.bodyHtml, /Primary action is hidden/);

  const audit = renderDesignAudit(artifact({
    path: '07-design-audit.md',
    frontmatter: {
      type: 'design-audit',
      title: 'Design audit',
      status: 'ready',
      verdict: 'conditional',
      'severity-distribution': { blocker: 0, high: 0, medium: 1, low: 0 },
      'remediation-state': 'in-progress',
    },
    siblingYaml: {
      artifact: 'design-audit',
      verdict: 'conditional',
      'audited-against': ['02b-design.md', '02c-craft.md'],
      'remediation-state': 'in-progress',
      violations: [
        { id: 'A1', severity: 'medium', 'token-or-rule': 'focus-visible', observation: 'Focus is too subtle.', 'remediation-status': 'open' },
      ],
    },
  }));
  match(audit.bodyHtml, /design-audit-violations/);
  match(audit.bodyHtml, /focus-visible/);
});

// Regression: a plan whose sibling YAML uses the rich object-form `modules:`
// (with files referencing them via `module:`) must still render its topology
// figure AND keep the markdown prose alongside the fragment. Previously
// fileTopologySvg assumed `modules` was a string[] and called
// `b.mod.toUpperCase()` on an object → threw → the dispatch fell back to the
// prose-dropping fallback renderer, so the body showed only the fragment.
test('plan renderer: object-form modules render topology + keep prose with a fragment', () => {
  const out = renderPlan(artifact({
    path: '04-plan-signin-ui.md',
    frontmatter: { type: 'plan', status: 'complete', 'slice-slug': 'signin-ui' },
    body: '## Current State\nThe authored plan prose that must survive.',
    siblingYaml: {
      modules: [
        { id: 'firebase-init', label: 'Firebase client init', role: 'infra' },
        { id: 'auth-context', label: 'Auth context + hook', role: 'domain' },
      ],
      files: [
        { path: 'frontend/src/lib/firebase.ts', role: 'new', module: 'firebase-init' },
        { path: 'frontend/src/auth/context.tsx', role: 'modified', module: 'auth-context' },
      ],
    },
    fragment: '<section class="fragment-plan">rich cards</section>',
  }));

  // Prose survives (the whole point of the fix).
  match(out.bodyHtml, /class="prose"/);
  match(out.bodyHtml, /authored plan prose that must survive/);
  // Fragment still renders.
  match(out.bodyHtml, /fragment-plan/);
  // The topology figure rendered the module label, not a crash fallback.
  match(out.bodyHtml, /File-change topology/);
  match(out.bodyHtml, /FIREBASE CLIENT INIT/);
});

// Defense-in-depth: even if the figure data is malformed enough to throw,
// the per-figure guard degrades to the placeholder topology and the prose
// still renders — the render never collapses into the fallback.
test('plan renderer: a malformed figure degrades but prose still renders', () => {
  const out = renderPlan(artifact({
    path: '04-plan-broken.md',
    frontmatter: { type: 'plan', status: 'complete' },
    body: '## Plan\nProse that must not disappear.',
    // `files` present (so the figure path runs) but `edges` reference a shape
    // that would historically throw deep in the SVG builder.
    siblingYaml: { modules: [{ id: 'm1', label: 'Mod One' }], files: [{ path: 'a/b.ts', module: 'm1' }], edges: [{ from: null, to: null }] },
  }));

  match(out.bodyHtml, /class="prose"/);
  match(out.bodyHtml, /must not disappear/);
});

// Topology coloring must read the change-type from `status` (new convention),
// not from `role` — which now carries a semantic category (ui/config/…). A
// `status: new` file previously fell through to the default "modified" fill
// because `role: ui` matched none of new/deleted/external.
test('plan renderer: topology colors by `status`, not the category `role`', () => {
  const out = renderPlan(artifact({
    path: '04-plan-color.md',
    frontmatter: { type: 'plan', status: 'complete' },
    body: '## Plan\nprose',
    siblingYaml: {
      modules: [{ id: 'm1', label: 'Mod One' }],
      files: [{ path: 'a/created.ts', role: 'ui', status: 'new', module: 'm1' }],
    },
  }));
  // #ecf3e7 is the "new" fill; it only appears if status:new was honored.
  match(out.bodyHtml, /#ecf3e7/);
});
