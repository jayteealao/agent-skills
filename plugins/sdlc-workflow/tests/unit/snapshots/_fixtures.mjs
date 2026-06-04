// tests/unit/snapshots/_fixtures.mjs
//
// Shared, deterministic fixtures for the golden-file snapshot suite AND the
// fragment-determinism property test. Keeping ONE source of truth means the two
// suites can never drift apart.
//
// Determinism contract: every fixture uses `history: []`. renderHistoryBlock([])
// returns '' (renderers/_history.mjs:61), so no wall-clock mtime ever leaks into
// a golden. None of the 15 renderers exercised here read Date.now()/random — the
// only time-dependent renderers (dashboard, hub-dashboard, index, slice-index)
// are intentionally NOT snapshot-tested.

import { render as benchmark } from '../../../renderers/benchmark.mjs';
import { render as experiment } from '../../../renderers/experiment.mjs';
import { render as instrument } from '../../../renderers/instrument.mjs';
import { render as rca } from '../../../renderers/rca.mjs';
import { render as reviewDimension } from '../../../renderers/review-dimension.mjs';
import { render as designContract } from '../../../renderers/design-contract.mjs';
import { render as designCritique } from '../../../renderers/design-critique.mjs';
import { render as designAudit } from '../../../renderers/design-audit.mjs';
import { render as projectContext } from '../../../renderers/project-context.mjs';
import { render as shipPlan } from '../../../renderers/ship-plan.mjs';
import { render as announce } from '../../../renderers/announce.mjs';
import { render as riskRegister } from '../../../renderers/risk-register.mjs';
import { render as estimate } from '../../../renderers/estimate.mjs';
import { render as docsIndex } from '../../../renderers/docs-index.mjs';
import { render as profile } from '../../../renderers/profile.mjs';
// All-artifacts projection — lane + run-family renderers.
import { render as discover } from '../../../renderers/discover.mjs';
import { render as fixPlan } from '../../../renderers/fix-plan.mjs';
import { render as investigate } from '../../../renderers/investigate.mjs';
import { render as closeRecord } from '../../../renderers/close-record.mjs';
import { render as hfBrief } from '../../../renderers/hf-brief.mjs';
import { render as hfPlan } from '../../../renderers/hf-plan.mjs';
import { render as hfImplement } from '../../../renderers/hf-implement.mjs';
import { render as hfVerify } from '../../../renderers/hf-verify.mjs';
import { render as rfBrief } from '../../../renderers/rf-brief.mjs';
import { render as rfBaseline } from '../../../renderers/rf-baseline.mjs';
import { render as rfPlan } from '../../../renderers/rf-plan.mjs';
import { render as rfImplement } from '../../../renderers/rf-implement.mjs';
import { render as rfVerify } from '../../../renderers/rf-verify.mjs';
import { render as docsDiscover } from '../../../renderers/docs-discover.mjs';
import { render as docsAudit } from '../../../renderers/docs-audit.mjs';
import { render as docsPlanR } from '../../../renderers/docs-plan.mjs';
import { render as docsGenerate } from '../../../renderers/docs-generate.mjs';
import { render as depScan } from '../../../renderers/dep-scan.mjs';
import { render as depResearch } from '../../../renderers/dep-research.mjs';
import { render as depPlanR } from '../../../renderers/dep-plan.mjs';
import { render as depImplement } from '../../../renderers/dep-implement.mjs';
import { render as depVerify } from '../../../renderers/dep-verify.mjs';
import { render as ideation } from '../../../renderers/ideation.mjs';

// renderSimple-based renderers read ctx.slug directly (not ctx?.slug), so every
// case is rendered with a populated ctx.
const CTX = { slug: 'demo' };

// A single static, deterministic fragment string. The renderers wrap it in
// <div class="fragment">…</div> verbatim; the exact contents don't matter, only
// that the wrapper appears and is stable across runs.
const FRAG = '<section class="fragment-rich"><p>rich projection</p></section>';

function artifact(overrides = {}) {
  return {
    type: 'augmentation',
    path: 'demo.md',
    frontmatter: { schema: 'sdlc/v1', type: 'augmentation', status: 'complete', slug: 'demo' },
    body: '## Notes\nDemo body.\n',
    siblingYaml: null,
    history: [],
    fragment: null,
    ...overrides,
  };
}

/**
 * What each golden captures: header + body joined by a comment marker, so a
 * regression in EITHER a badge (header) or a table/metric/finding (body) trips
 * the snapshot. Substring-match tests miss exactly these (wrong badge colour,
 * dropped table column, missing metric row).
 */
export function renderToString(out) {
  return `${out.headerHtml}\n<!-- body -->\n${out.bodyHtml}`;
}

export const CASES = [
  /* ── benchmark ─────────────────────────────────────────────────────── */
  {
    name: 'benchmark',
    render: benchmark,
    ctx: CTX,
    variants: {
      full: artifact({
        path: '05c-benchmark.md',
        frontmatter: { schema: 'sdlc/v1', type: 'augmentation', 'augmentation-type': 'benchmark', status: 'complete', slug: 'demo' },
        siblingYaml: {
          artifact: 'benchmark', target: 'cache lookup', framework: 'criterion', mode: 'compare',
          metrics: [
            { name: 'p95', before: 120, after: 90, unit: 'ms', direction: 'lower-is-better' },
            { name: 'p99', before: 210, after: 185, unit: 'ms', direction: 'lower-is-better' },
          ],
          improvements: ['p95', 'p99'], regressions: [],
          'commands-run': ['npm run bench -- --filter cache'],
        },
      }),
      fallback: artifact({
        path: '05c-benchmark.md',
        frontmatter: { schema: 'sdlc/v1', type: 'augmentation', 'augmentation-type': 'benchmark', status: 'complete', slug: 'demo', title: 'cache lookup' },
      }),
      fragment: artifact({
        path: '05c-benchmark.md',
        frontmatter: { schema: 'sdlc/v1', type: 'augmentation', 'augmentation-type': 'benchmark', status: 'complete', slug: 'demo' },
        fragment: FRAG,
        siblingYaml: {
          artifact: 'benchmark', target: 'cache lookup', framework: 'criterion', mode: 'compare',
          metrics: [{ name: 'p95', before: 120, after: 90, unit: 'ms', direction: 'lower-is-better' }],
          'commands-run': ['npm run bench'],
        },
      }),
    },
  },

  /* ── experiment ────────────────────────────────────────────────────── */
  {
    name: 'experiment',
    render: experiment,
    ctx: CTX,
    variants: {
      full: artifact({
        path: '04c-experiment.md',
        frontmatter: { schema: 'sdlc/v1', type: 'augmentation', 'augmentation-type': 'experiment', status: 'ready', slug: 'demo' },
        siblingYaml: {
          artifact: 'experiment', experiment_type: 'feature-flag', flag: 'new-onboarding',
          hypothesis: 'Shorter setup improves activation.',
          arms: [
            { id: 'control', allocated_pct: 50, description: 'Current flow' },
            { id: 'variant', allocated_pct: 50, description: 'Guided flow' },
          ],
          'ramp-schedule': [{ at: 'day 1', allocation: '10%' }, { at: 'day 3', allocation: '50%' }],
          guardrails: [{ name: 'error rate', threshold: 2, direction: 'lower-is-better', unit: '%' }],
        },
      }),
      fallback: artifact({
        path: '04c-experiment.md',
        frontmatter: { schema: 'sdlc/v1', type: 'augmentation', 'augmentation-type': 'experiment', status: 'ready', slug: 'demo', 'flag-name': 'new-onboarding' },
      }),
      fragment: artifact({
        path: '04c-experiment.md',
        frontmatter: { schema: 'sdlc/v1', type: 'augmentation', 'augmentation-type': 'experiment', status: 'ready', slug: 'demo' },
        fragment: FRAG,
        siblingYaml: {
          artifact: 'experiment', experiment_type: 'feature-flag', flag: 'new-onboarding',
          hypothesis: 'Shorter setup improves activation.',
          arms: [{ id: 'control', allocated_pct: 50, description: 'Current flow' }],
        },
      }),
    },
  },

  /* ── instrument ────────────────────────────────────────────────────── */
  {
    name: 'instrument',
    render: instrument,
    ctx: CTX,
    variants: {
      full: artifact({
        path: '04b-instrument.md',
        frontmatter: { schema: 'sdlc/v1', type: 'augmentation', 'augmentation-type': 'instrument', status: 'ready', slug: 'demo' },
        siblingYaml: {
          artifact: 'instrument', framework: 'opentelemetry',
          signals: [
            { name: 'checkout_started', kind: 'counter', labels: ['tenant'], where_emitted: 'Checkout.tsx:12' },
            { name: 'checkout_duration', kind: 'histogram', labels: ['tenant'], where_emitted: 'Checkout.tsx:30' },
            { name: 'checkout_failed', kind: 'counter', labels: ['tenant', 'reason'], where_emitted: 'Checkout.tsx:48' },
          ],
          dark_paths: [
            { path: 'Checkout.tsx:44', reason: 'No failure metric' },
            { path: 'Cart.tsx:90', reason: 'No abandonment signal' },
          ],
          dashboards: [{ name: 'Checkout health', url: 'https://dash.example/checkout' }],
          pii_warnings: 0,
        },
      }),
      fallback: artifact({
        path: '04b-instrument.md',
        frontmatter: { schema: 'sdlc/v1', type: 'augmentation', 'augmentation-type': 'instrument', status: 'ready', slug: 'demo', 'instrumentation-framework': 'opentelemetry' },
      }),
      fragment: artifact({
        path: '04b-instrument.md',
        frontmatter: { schema: 'sdlc/v1', type: 'augmentation', 'augmentation-type': 'instrument', status: 'ready', slug: 'demo' },
        fragment: FRAG,
        siblingYaml: {
          artifact: 'instrument', framework: 'opentelemetry',
          signals: [{ name: 'checkout_started', kind: 'counter', labels: ['tenant'], where_emitted: 'Checkout.tsx:12' }],
          pii_warnings: 0,
        },
      }),
    },
  },

  /* ── rca ───────────────────────────────────────────────────────────── */
  {
    name: 'rca',
    render: rca,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'rca',
        path: '01-rca.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'rca', slug: 'demo', 'workflow-type': 'rca',
          symptom: 'Checkout fails for EU users', impact: 'high',
          'root-cause-confidence': 'high', 'blast-radius': 'medium',
          'recommended-next': '/wf plan', status: 'ready-for-fix-routing',
        },
        siblingYaml: {
          artifact: 'rca', incident: 'INC-1', title: 'Checkout failure',
          started_at: '2026-05-24T11:00:00Z', resolved_at: '2026-05-24T12:00:00Z',
          metrics: { duration: '60m', time_to_detect: '5m', time_to_mitigate: '20m', user_failures: 12 },
          timeline: [
            { id: 't1', at: '11:00', kind: 'alert', title: 'Alert fired' },
            { id: 't2', at: '11:05', kind: 'investigation', title: 'On-call paged' },
            { id: 't3', at: '11:20', kind: 'mitigation', title: 'Rolled back' },
            { id: 't4', at: '12:00', kind: 'resolution', title: 'Resolved' },
          ],
          chain: [
            { step: 'TRIGGER', body: 'Deploy changed env parsing' },
            { step: 'ROOT_CAUSE', body: 'No contract test covered EU config' },
          ],
          heatmap: { buckets: ['api'], systems: { checkout: [1] } },
          five_whys: [
            { question: 'Why did checkout fail?', answer: 'Payment config was missing.' },
            { question: 'Why was it missing?', answer: 'ROOT: EU env was not contract-tested.' },
          ],
        },
      }),
      fallback: artifact({
        type: 'rca',
        path: '01-rca.md',
        frontmatter: { schema: 'sdlc/v1', type: 'rca', slug: 'demo', status: 'ready-for-fix-routing', symptom: 'Checkout fails for EU users' },
      }),
      fragment: artifact({
        type: 'rca',
        path: '01-rca.md',
        frontmatter: { schema: 'sdlc/v1', type: 'rca', slug: 'demo', status: 'ready-for-fix-routing', symptom: 'Checkout fails for EU users' },
        fragment: FRAG,
        siblingYaml: {
          artifact: 'rca', incident: 'INC-1', title: 'Checkout failure',
          timeline: [{ id: 't1', at: '11:00', kind: 'alert', title: 'Alert fired' }],
          chain: [{ step: 'ROOT_CAUSE', body: 'No contract test covered EU config' }],
        },
      }),
    },
  },

  /* ── review-dimension ──────────────────────────────────────────────── */
  {
    name: 'review-dimension',
    render: reviewDimension,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'review-command',
        path: '07-review/security.md',
        frontmatter: { schema: 'sdlc/v1', type: 'review-command', status: 'complete', slug: 'demo', 'review-command': 'security' },
        siblingYaml: {
          artifact: 'review-dimension', dimension: 'security', parent: '07-review.md', rev: 1,
          verdict: 'conditional', summary: 'One high finding.',
          counts: { blocker: 0, high: 1, med: 0, low: 0, nit: 0 },
          findings: [
            { id: 'S1', severity: 'high', msg: 'Missing auth check', fix: 'Guard route', file: 'api.ts', line: 9 },
          ],
        },
      }),
      fallback: artifact({
        type: 'review-command',
        path: '07-review/security.md',
        frontmatter: { schema: 'sdlc/v1', type: 'review-command', status: 'complete', slug: 'demo', 'review-command': 'security' },
      }),
      fragment: artifact({
        type: 'review-command',
        path: '07-review/security.md',
        frontmatter: { schema: 'sdlc/v1', type: 'review-command', status: 'complete', slug: 'demo', 'review-command': 'security' },
        fragment: FRAG,
        siblingYaml: {
          artifact: 'review-dimension', dimension: 'security', parent: '07-review.md', rev: 1,
          verdict: 'conditional', summary: 'One high finding.',
          counts: { blocker: 0, high: 1, med: 0, low: 0, nit: 0 },
          findings: [{ id: 'S1', severity: 'high', msg: 'Missing auth check', fix: 'Guard route', file: 'api.ts', line: 9 }],
        },
      }),
    },
  },

  /* ── design-contract ───────────────────────────────────────────────── */
  {
    name: 'design-contract',
    render: designContract,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'design-contract',
        path: '02c-craft.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'design-contract', slug: 'demo', title: 'Checkout visual contract',
          status: 'ready', component: 'Checkout', 'based-on': '02b-design.md',
          tokens: ['color.action', 'space.md', 'radius.sm'],
          states: ['default', 'focus', 'disabled'],
          sizes: ['mobile', 'desktop'],
          themes: ['light', 'dark'],
        },
      }),
      fallback: artifact({
        type: 'design-contract',
        path: '02c-craft.md',
        frontmatter: { schema: 'sdlc/v1', type: 'design-contract', slug: 'demo', status: 'ready', component: 'Checkout' },
      }),
    },
  },

  /* ── design-critique ───────────────────────────────────────────────── */
  {
    name: 'design-critique',
    render: designCritique,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'design-critique',
        path: '07-design-critique.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'design-critique', slug: 'demo', title: 'Design critique',
          status: 'ready', scope: 'surface',
          'severity-distribution': { blocker: 0, high: 1, medium: 1, low: 0, nit: 0 },
        },
        siblingYaml: {
          artifact: 'design-critique', scope: 'surface', summary: 'The primary action is weak.',
          findings: [
            { id: 'C1', severity: 'high', where: 'Hero', observation: 'Primary action is hidden.', recommendation: 'Move it above the fold.' },
            { id: 'C2', severity: 'medium', where: 'Footer', observation: 'Low contrast links.', recommendation: 'Raise contrast to AA.' },
          ],
        },
      }),
      fallback: artifact({
        type: 'design-critique',
        path: '07-design-critique.md',
        frontmatter: { schema: 'sdlc/v1', type: 'design-critique', slug: 'demo', status: 'ready', title: 'Design critique' },
      }),
      fragment: artifact({
        type: 'design-critique',
        path: '07-design-critique.md',
        frontmatter: { schema: 'sdlc/v1', type: 'design-critique', slug: 'demo', status: 'ready', title: 'Design critique' },
        fragment: FRAG,
        siblingYaml: {
          artifact: 'design-critique', scope: 'surface', summary: 'The primary action is weak.',
          findings: [{ id: 'C1', severity: 'high', where: 'Hero', observation: 'Primary action is hidden.', recommendation: 'Move it above the fold.' }],
        },
      }),
    },
  },

  /* ── design-audit ──────────────────────────────────────────────────── */
  {
    name: 'design-audit',
    render: designAudit,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'design-audit',
        path: '07-design-audit.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'design-audit', slug: 'demo', title: 'Design audit',
          status: 'ready', verdict: 'conditional',
          'severity-distribution': { blocker: 0, high: 0, medium: 1, low: 0 },
          'remediation-state': 'in-progress',
        },
        siblingYaml: {
          artifact: 'design-audit', verdict: 'conditional',
          'audited-against': ['02b-design.md', '02c-craft.md'], 'remediation-state': 'in-progress',
          violations: [
            { id: 'A1', severity: 'medium', 'token-or-rule': 'focus-visible', observation: 'Focus is too subtle.', 'remediation-status': 'open' },
          ],
        },
      }),
      fallback: artifact({
        type: 'design-audit',
        path: '07-design-audit.md',
        frontmatter: { schema: 'sdlc/v1', type: 'design-audit', slug: 'demo', status: 'ready', title: 'Design audit' },
      }),
      fragment: artifact({
        type: 'design-audit',
        path: '07-design-audit.md',
        frontmatter: { schema: 'sdlc/v1', type: 'design-audit', slug: 'demo', status: 'ready', title: 'Design audit' },
        fragment: FRAG,
        siblingYaml: {
          artifact: 'design-audit', verdict: 'conditional',
          'audited-against': ['02b-design.md'], 'remediation-state': 'in-progress',
          violations: [{ id: 'A1', severity: 'medium', 'token-or-rule': 'focus-visible', observation: 'Focus is too subtle.', 'remediation-status': 'open' }],
        },
      }),
    },
  },

  /* ── project-context (PRODUCT.md no-frontmatter + DESIGN.md frontmatter) */
  {
    name: 'project-context',
    render: projectContext,
    ctx: CTX,
    variants: {
      product: artifact({
        type: 'project-context',
        path: 'PRODUCT.md',
        frontmatter: {},
        body: '# Product\nWhat we are building and why.\n',
      }),
      design: artifact({
        type: 'project-context',
        path: 'DESIGN.md',
        frontmatter: { schema: 'sdlc/v1', type: 'project-context', slug: 'demo', status: 'current', source: 'figma', title: 'Design context' },
        body: '# Design\nVisual language and tokens.\n',
      }),
    },
  },

  /* ── ship-plan ─────────────────────────────────────────────────────── */
  {
    name: 'ship-plan',
    render: shipPlan,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'ship-plan',
        path: 'SHIP-PLAN.md',
        frontmatter: { schema: 'sdlc/v1', type: 'ship-plan', slug: 'demo', status: 'planned', title: 'Ship plan', source: 'PRODUCT.md', phases: 3 },
        body: '## Phase 1\nCanary.\n## Phase 2\nRamp.\n## Phase 3\nGA.\n',
      }),
      fallback: artifact({
        type: 'ship-plan',
        path: 'SHIP-PLAN.md',
        frontmatter: { schema: 'sdlc/v1', type: 'ship-plan', slug: 'demo', status: 'planned' },
      }),
    },
  },

  /* ── announce ──────────────────────────────────────────────────────── */
  {
    name: 'announce',
    render: announce,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'announce',
        path: '11-announce.md',
        frontmatter: { schema: 'sdlc/v1', type: 'announce', slug: 'demo', status: 'complete', title: 'Launch announcement', channel: 'blog', 'audiences-count': 3, 'channels-count': 2 },
      }),
      fallback: artifact({
        type: 'announce',
        path: '11-announce.md',
        frontmatter: { schema: 'sdlc/v1', type: 'announce', slug: 'demo', status: 'draft' },
      }),
    },
  },

  /* ── risk-register ─────────────────────────────────────────────────── */
  {
    name: 'risk-register',
    render: riskRegister,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'risk-register',
        path: '10-risk-register.md',
        frontmatter: { schema: 'sdlc/v1', type: 'risk-register', slug: 'demo', status: 'complete', title: 'Risk register', 'risks-total': 2, 'risks-high': 1, 'risks-open': 1 },
      }),
      fallback: artifact({
        type: 'risk-register',
        path: '10-risk-register.md',
        frontmatter: { schema: 'sdlc/v1', type: 'risk-register', slug: 'demo', status: 'draft' },
      }),
    },
  },

  /* ── estimate ──────────────────────────────────────────────────────── */
  {
    name: 'estimate',
    render: estimate,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'estimate',
        path: '03-estimate.md',
        frontmatter: { schema: 'sdlc/v1', type: 'estimate', slug: 'demo', status: 'complete', title: 'Estimate', 'estimate-points': 13, confidence: 'medium', 'uncertainty-count': 2 },
      }),
      fallback: artifact({
        type: 'estimate',
        path: '03-estimate.md',
        frontmatter: { schema: 'sdlc/v1', type: 'estimate', slug: 'demo', status: 'draft' },
      }),
    },
  },

  /* ── docs-index ────────────────────────────────────────────────────── */
  {
    name: 'docs-index',
    render: docsIndex,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'docs-index',
        path: '08b-docs-index.md',
        frontmatter: { schema: 'sdlc/v1', type: 'docs-index', slug: 'demo', status: 'complete', 'run-id': '20260603T1200Z', 'gaps-found': 1, 'actions-completed': 4 },
        siblingYaml: {
          docs: [
            { path: 'README.md', type: 'tutorial', status: 'updated', action: 'rewrote intro' },
            { path: 'docs/api.md', type: 'reference', status: 'created', action: 'generated from schema' },
            { path: 'docs/howto.md', type: 'how-to', status: 'updated', action: 'added auth section' },
            { path: 'docs/explain.md', type: 'explanation', status: 'unchanged', action: '' },
          ],
        },
      }),
      fallback: artifact({
        type: 'docs-index',
        path: '08b-docs-index.md',
        frontmatter: { schema: 'sdlc/v1', type: 'docs-index', slug: 'demo', status: 'complete' },
      }),
    },
  },

  /* ── profile ───────────────────────────────────────────────────────── */
  {
    name: 'profile',
    render: profile,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'profile',
        path: '01-profile.md',
        frontmatter: { schema: 'sdlc/v1', type: 'profile', slug: 'demo', status: 'complete', 'run-id': '20260603T1200Z' },
        siblingYaml: {
          artifact: 'profile', run_id: '20260603T1200Z', target: 'POST /api/checkout',
          method: 'dynamic-cpu', confidence: 'high', measured_at: '2026-06-03T12:00:00Z',
          hotspots: [
            { id: 'H1', function: 'validateCart', file: 'src/cart/validate.ts', line: 24, cost_pct: 32.4, candidate: true },
            { id: 'H2', function: 'computeTaxes', cost_pct: 11.0, candidate: false },
          ],
          optimization_candidates: [
            { id: 'OC1', hotspot: 'H1', intent: 'Memoize per-request validators by cart-shape hash.', estimated_gain_pct: 18.0, confidence: 'high' },
          ],
          comparisons: [
            { metric: 'p50_ms', before: 120, after: 95, unit: 'ms', direction: 'lower-is-better' },
            { metric: 'p95_ms', before: 320, after: 280, unit: 'ms', direction: 'lower-is-better' },
          ],
        },
      }),
      fallback: artifact({
        type: 'profile',
        path: '01-profile.md',
        frontmatter: { schema: 'sdlc/v1', type: 'profile', slug: 'demo', status: 'complete', 'run-id': '20260603T1200Z' },
      }),
      fragment: artifact({
        type: 'profile',
        path: '01-profile.md',
        frontmatter: { schema: 'sdlc/v1', type: 'profile', slug: 'demo', status: 'complete', 'run-id': '20260603T1200Z' },
        fragment: FRAG,
        siblingYaml: {
          artifact: 'profile', run_id: '20260603T1200Z', target: 'POST /api/checkout',
          method: 'dynamic-cpu', confidence: 'high',
          hotspots: [{ id: 'H1', function: 'validateCart', file: 'src/cart/validate.ts', line: 24, cost_pct: 32.4, candidate: true }],
        },
      }),
    },
  },

  /* ── all-artifacts projection: workflow lanes ──────────────────────── */
  {
    name: 'discover', render: discover, ctx: CTX,
    variants: { full: artifact({ type: 'discover', path: '01-discover.md', frontmatter: { schema: 'sdlc/v1', type: 'discover', slug: 'demo', 'workflow-type': 'discover', hypothesis: 'The cache is never invalidated', verdict: 'holds', confidence: 'high', 'recommended-next': '/wf plan', status: 'ready-for-routing', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'fix-plan', render: fixPlan, ctx: CTX,
    variants: { full: artifact({ type: 'fix-plan', path: '01-fix.md', frontmatter: { schema: 'sdlc/v1', type: 'fix-plan', slug: 'demo', 'workflow-type': 'fix', intent: 'Fix typo in error message', 'estimated-steps': 2, status: 'ready-for-implement', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'investigate', render: investigate, ctx: CTX,
    variants: { full: artifact({ type: 'investigate', path: '01-investigate.md', frontmatter: { schema: 'sdlc/v1', type: 'investigate', slug: 'demo', 'workflow-type': 'investigate', 'problem-statement': 'How to paginate the feed', 'option-count': 3, status: 'ready-for-routing', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'close-record', render: closeRecord, ctx: CTX,
    variants: { full: artifact({ type: 'close-record', path: '99-close.md', frontmatter: { schema: 'sdlc/v1', type: 'close-record', slug: 'demo', 'workflow-type': 'fix', 'close-reason': 'superseded', 'superseded-by': 'PR #42', 'last-stage-reached': 'implement', 'unmerged-commits': 0, 'closed-at': '2026-06-04T00:00:00Z' } }) },
  },

  /* ── hotfix family ─────────────────────────────────────────────────── */
  {
    name: 'hf-brief', render: hfBrief, ctx: CTX,
    variants: { full: artifact({ type: 'hf-brief', path: 'hf-brief.md', frontmatter: { schema: 'sdlc/v1', type: 'hf-brief', slug: 'demo', 'workflow-type': 'hotfix', symptom: 'Checkout 500s for EU users', impact: 'critical', 'affected-scope': 'all-users', status: 'in-progress', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'hf-plan', render: hfPlan, ctx: CTX,
    variants: { full: artifact({ type: 'hf-plan', path: 'hf-plan.md', frontmatter: { schema: 'sdlc/v1', type: 'hf-plan', slug: 'demo', 'workflow-type': 'hotfix', 'step-count': 3, 'data-remediation-needed': false, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'hf-implement', render: hfImplement, ctx: CTX,
    variants: { full: artifact({ type: 'hf-implement', path: 'hf-implement.md', frontmatter: { schema: 'sdlc/v1', type: 'hf-implement', slug: 'demo', 'workflow-type': 'hotfix', 'lines-changed': 12, 'test-result': 'pass', 'commit-sha': 'a3f7d12', status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'hf-verify', render: hfVerify, ctx: CTX,
    variants: { full: artifact({ type: 'hf-verify', path: 'hf-verify.md', frontmatter: { schema: 'sdlc/v1', type: 'hf-verify', slug: 'demo', 'workflow-type': 'hotfix', result: 'PASS', 'symptom-confirmed-fixed': true, 'tests-pass': 'pass', status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },

  /* ── refactor family ───────────────────────────────────────────────── */
  {
    name: 'rf-brief', render: rfBrief, ctx: CTX,
    variants: { full: artifact({ type: 'rf-brief', path: 'rf-brief.md', frontmatter: { schema: 'sdlc/v1', type: 'rf-brief', slug: 'demo', 'workflow-type': 'refactor', goal: 'Extract the auth service layer', 'existing-coverage': 'high', status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'rf-baseline', render: rfBaseline, ctx: CTX,
    variants: { full: artifact({ type: 'rf-baseline', path: 'rf-baseline.md', frontmatter: { schema: 'sdlc/v1', type: 'rf-baseline', slug: 'demo', 'workflow-type': 'refactor', 'tests-passing': 80, 'tests-failing': 0, 'tests-skipped': 2, 'caller-count': 12, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'rf-plan', render: rfPlan, ctx: CTX,
    variants: { full: artifact({ type: 'rf-plan', path: 'rf-plan.md', frontmatter: { schema: 'sdlc/v1', type: 'rf-plan', slug: 'demo', 'workflow-type': 'refactor', 'step-count': 4, 'pattern-used': 'extract-function', 'api-surface-changes': 'none', status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'rf-implement', render: rfImplement, ctx: CTX,
    variants: { full: artifact({ type: 'rf-implement', path: 'rf-implement.md', frontmatter: { schema: 'sdlc/v1', type: 'rf-implement', slug: 'demo', 'workflow-type': 'refactor', 'steps-completed': 4, 'steps-failed': 0, 'api-surface-changed': false, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'rf-verify', render: rfVerify, ctx: CTX,
    variants: { full: artifact({ type: 'rf-verify', path: 'rf-verify.md', frontmatter: { schema: 'sdlc/v1', type: 'rf-verify', slug: 'demo', 'workflow-type': 'refactor', result: 'PASS', 'baseline-tests-pass': 80, 'post-refactor-tests-pass': 80, 'api-surface-identical': true, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },

  /* ── wf-docs intermediates ─────────────────────────────────────────── */
  {
    name: 'docs-discover', render: docsDiscover, ctx: CTX,
    variants: { full: artifact({ type: 'docs-discover', path: 'discover.md', frontmatter: { schema: 'sdlc/v1', type: 'docs-discover', 'run-id': 'dr1', scope: 'project', 'doc-files-found': 9, 'gaps-found': 2, 'has-docs-folder': true, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'docs-audit', render: docsAudit, ctx: CTX,
    variants: { full: artifact({ type: 'docs-audit', path: 'audit.md', frontmatter: { schema: 'sdlc/v1', type: 'docs-audit', 'run-id': 'dr1', 'files-audited': 9, 'accuracy-issues': 1, 'quadrant-violations': 0, 'gaps-found': 2, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'docs-plan', render: docsPlanR, ctx: CTX,
    variants: { full: artifact({ type: 'docs-plan', path: 'plan.md', frontmatter: { schema: 'sdlc/v1', type: 'docs-plan', 'run-id': 'dr1', 'total-actions': 6, 'p0-count': 1, 'p1-count': 2, 'audit-only': false, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'docs-generate', render: docsGenerate, ctx: CTX,
    variants: { full: artifact({ type: 'docs-generate', path: 'generate.md', frontmatter: { schema: 'sdlc/v1', type: 'docs-generate', 'run-id': 'dr1', 'actions-completed': 6, 'actions-skipped': 0, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },

  /* ── dep-update family ─────────────────────────────────────────────── */
  {
    name: 'dep-scan', render: depScan, ctx: CTX,
    variants: { full: artifact({ type: 'dep-scan', path: 'scan.md', frontmatter: { schema: 'sdlc/v1', type: 'dep-scan', 'run-id': 'r1', 'total-deps': 40, 'outdated-count': 7, 'vulnerable-count': 2, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'dep-research', render: depResearch, ctx: CTX,
    variants: { full: artifact({ type: 'dep-research', path: 'research.md', frontmatter: { schema: 'sdlc/v1', type: 'dep-research', 'run-id': 'r1', 'packages-researched': 7, 'packages-update-now': 4, 'packages-migration-needed': 2, 'packages-hold': 1, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'dep-plan', render: depPlanR, ctx: CTX,
    variants: { full: artifact({ type: 'dep-plan', path: 'plan.md', frontmatter: { schema: 'sdlc/v1', type: 'dep-plan', 'run-id': 'r1', 'p0-count': 2, 'p1-count': 1, 'p2-count': 3, 'hold-count': 1, status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'dep-implement', render: depImplement, ctx: CTX,
    variants: { full: artifact({ type: 'dep-implement', path: 'implement.md', frontmatter: { schema: 'sdlc/v1', type: 'dep-implement', 'run-id': 'r1', updated: ['left-pad@1.3.0', 'axios@1.7.0'], blocked: [], status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'dep-verify', render: depVerify, ctx: CTX,
    variants: { full: artifact({ type: 'dep-verify', path: 'verify.md', frontmatter: { schema: 'sdlc/v1', type: 'dep-verify', 'run-id': 'r1', result: 'pass', status: 'complete', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },

  /* ── ideation (rich) ───────────────────────────────────────────────── */
  {
    name: 'ideation', render: ideation, ctx: CTX,
    variants: {
      full: artifact({
        type: 'ideation', path: 'all-20260604.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'ideation', focus: 'all', 'created-at': '2026-06-04T00:00:00Z',
          'raw-candidates': 12, 'culled-count': 9, 'shown-count': 3,
          ideas: [
            { id: 'IDEA-001', title: 'Memoize validators', category: 'performance', impact: 'high', effort: 's', score: 8.5 },
            { id: 'IDEA-002', title: 'Add request tracing', category: 'observability', impact: 'medium', effort: 'm', score: 6.0 },
          ],
          culled: [{ id: 'IDEA-009', title: 'Rewrite in Rust', reason: 'out of scope' }],
        },
      }),
      fallback: artifact({
        type: 'ideation', path: 'all-20260604.md',
        frontmatter: { schema: 'sdlc/v1', type: 'ideation', focus: 'all', 'created-at': '2026-06-04T00:00:00Z' },
      }),
    },
  },
];

// Renderers that emit a <div class="fragment"> block when artifact.fragment is
// present — the determinism suite verifies these are byte-stable across runs.
export const FRAGMENT_RENDERERS = new Set([
  'benchmark', 'experiment', 'instrument', 'rca',
  'review-dimension', 'design-critique', 'design-audit', 'profile',
]);
