// tests/unit/snapshots/_fixtures.mjs
//
// Shared, deterministic fixtures for the golden-file snapshot suite AND the
// fragment-determinism property test. Keeping ONE source of truth means the two
// suites can never drift apart.
//
// Determinism contract: every fixture uses `history: []`. renderHistoryBlock([])
// returns '' (renderers/_history.mjs:61), so no wall-clock mtime ever leaks into
// a golden. No renderer exercised here reads Date.now()/random on its own: the
// dashboard takes its clock from `ctx.now` (epoch ms), and its case pins one.
// The other time-dependent renderers (hub-dashboard, index, slice-index) are
// intentionally NOT snapshot-tested.

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
import { render as syncReport } from '../../../renderers/sync-report.mjs';
// All-artifacts projection — lane + run-family renderers.
import { render as discover } from '../../../renderers/discover.mjs';
import { render as investigate } from '../../../renderers/investigate.mjs';
import { render as closeRecord } from '../../../renderers/close-record.mjs';
import { render as docsDiscover } from '../../../renderers/docs-discover.mjs';
import { render as docsAudit } from '../../../renderers/docs-audit.mjs';
import { render as docsPlanR } from '../../../renderers/docs-plan.mjs';
import { render as docsGenerate } from '../../../renderers/docs-generate.mjs';
import { render as ideation } from '../../../renderers/ideation.mjs';
// Lifecycle stages + the cross-slug dashboard (2026-09-08).
import { render as intake } from '../../../renderers/intake.mjs';
import { render as shape } from '../../../renderers/shape.mjs';
import { render as plan } from '../../../renderers/plan.mjs';
import { render as verify } from '../../../renderers/verify.mjs';
import { render as review } from '../../../renderers/review.mjs';
import { render as handoff } from '../../../renderers/handoff.mjs';
import { render as ship } from '../../../renderers/ship.mjs';
import { render as dashboard } from '../../../renderers/dashboard.mjs';

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
      fragment: artifact({
        type: 'design-contract',
        path: '02c-craft.md',
        frontmatter: { schema: 'sdlc/v1', type: 'design-contract', slug: 'demo', status: 'ready', title: 'Checkout visual contract', component: 'Checkout' },
        fragment: FRAG,
        siblingYaml: {
          artifact: 'design-contract', component: 'Checkout', 'based-on': '02b-design.md',
          summary: 'Checkout button contract: action token, three states, two themes.',
          tokens: ['color.action', 'space.md', 'radius.sm'],
          states: ['default', 'focus', 'disabled'],
          sizes: ['mobile', 'desktop'],
          themes: ['light', 'dark'],
          contract: [
            { element: 'Primary button', tokens: ['color.action', 'radius.sm'], states: ['default', 'focus', 'disabled'], requirement: 'Action token fill; 2px focus ring; 40% opacity when disabled.' },
          ],
          'anti-patterns': ['No purple-blue gradient on the CTA.'],
        },
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

  /* ── sync-report (branch-sync health) ──────────────────────────────── */
  {
    name: 'sync-report',
    render: syncReport,
    ctx: CTX,
    variants: {
      full: artifact({
        type: 'sync-report',
        path: '00-sync.md',
        frontmatter: { schema: 'sdlc/v1', type: 'sync-report', slug: 'demo', status: 'active', branch: 'feat/checkout-v2', health: 'significant-drift' },
        siblingYaml: {
          artifact: 'sync', branch: 'feat/checkout-v2', base_branch: 'main',
          ahead_count: 12, behind_count: 7, conflict_risk: 'med', rebase_status: 'conflicts', stale_days: 14,
          diverged_files: [
            { path: 'src/checkout/CartSummary.tsx', base_delta: '+42/−11', branch_delta: '+67/−8', conflict: true },
            { path: 'src/api/payments.ts', base_delta: '+18/−5', branch_delta: '+31/−14', conflict: true },
            { path: 'src/hooks/useCheckout.ts', base_delta: null, branch_delta: '+94/0', conflict: false },
            { path: 'src/components/PriceBreakdown.tsx', base_delta: '+6/−2', branch_delta: null, conflict: false },
          ],
          recommendation: 'Rebase on origin/main; resolve CartSummary + payments conflicts before merging.',
        },
      }),
      fallback: artifact({
        type: 'sync-report',
        path: '00-sync.md',
        frontmatter: { schema: 'sdlc/v1', type: 'sync-report', slug: 'demo', status: 'active', branch: 'feat/checkout-v2' },
      }),
    },
  },

  /* ── all-artifacts projection: workflow lanes ──────────────────────── */
  {
    name: 'discover', render: discover, ctx: CTX,
    variants: { full: artifact({ type: 'discover', path: '01-discover.md', frontmatter: { schema: 'sdlc/v1', type: 'discover', slug: 'demo', 'workflow-type': 'discover', hypothesis: 'The cache is never invalidated', verdict: 'holds', confidence: 'high', 'recommended-next': '/wf plan', status: 'ready-for-routing', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'investigate', render: investigate, ctx: CTX,
    variants: { full: artifact({ type: 'investigate', path: '01-investigate.md', frontmatter: { schema: 'sdlc/v1', type: 'investigate', slug: 'demo', 'workflow-type': 'investigate', 'problem-statement': 'How to paginate the feed', 'option-count': 3, status: 'ready-for-routing', 'created-at': '2026-06-04T00:00:00Z' } }) },
  },
  {
    name: 'close-record', render: closeRecord, ctx: CTX,
    variants: { full: artifact({ type: 'close-record', path: '99-close.md', frontmatter: { schema: 'sdlc/v1', type: 'close-record', slug: 'demo', 'workflow-type': 'fix', 'close-reason': 'superseded', 'superseded-by': 'PR #42', 'last-stage-reached': 'implement', 'unmerged-commits': 0, 'closed-at': '2026-06-04T00:00:00Z' } }) },
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

  /* ── lifecycle stages (renderSimple family) ────────────────────────── */
  {
    name: 'intake', render: intake, ctx: CTX,
    variants: {
      full: artifact({
        type: 'intake', path: '01-intake.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'intake', slug: 'demo', title: 'Checkout retries', status: 'complete',
          'stage-number': 1, 'created-at': '2026-06-04T00:00:00Z', 'updated-at': '2026-06-04T01:00:00Z',
          'revision-count': 1, tags: ['checkout', 'payments'], refs: [], 'next-command': '/wf shape demo',
          revisions: [{ rev: 1, at: '2026-06-04T01:00:00Z', trigger: 'answers-returned', because: 'Two open questions answered.', changed: 'Constraints section.' }],
        },
        body: '## Problem\nRetried checkouts double-charge.\n\n## Acceptance criteria\n- [ ] One charge per order\n',
      }),
      fragment: artifact({
        type: 'intake', path: '01-intake.md',
        frontmatter: { schema: 'sdlc/v1', type: 'intake', slug: 'demo', title: 'Checkout retries', status: 'complete', 'stage-number': 1 },
        fragment: FRAG,
      }),
    },
  },
  {
    name: 'shape', render: shape, ctx: CTX,
    variants: {
      full: artifact({
        type: 'shape', path: '02-shape.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'shape', slug: 'demo', title: 'Checkout retries', status: 'complete',
          'stage-number': 2, 'metric-slice-count': 3, 'metric-risk-count': 2, 'docs-needed': true, 'docs-types': ['how-to'],
          'updated-at': '2026-06-04T02:00:00Z', tags: ['checkout'],
        },
        body: '## Slices\n1. idempotency key\n2. retry budget\n3. audit log\n',
      }),
      fragment: artifact({
        type: 'shape', path: '02-shape.md',
        frontmatter: { schema: 'sdlc/v1', type: 'shape', slug: 'demo', title: 'Checkout retries', status: 'complete', 'stage-number': 2, 'metric-slice-count': 3 },
        fragment: FRAG,
      }),
    },
  },
  {
    name: 'verify', render: verify, ctx: CTX,
    variants: {
      full: artifact({
        type: 'verify', path: '06-verify-idempotency-key.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'verify', slug: 'demo', 'slice-slug': 'idempotency-key', status: 'complete',
          'stage-number': 6, 'metric-test-count': 14, 'metric-pass-count': 13, 'metric-fail-count': 1,
          'updated-at': '2026-06-05T09:00:00Z',
        },
        body: '## Results\n13 of 14 pass. The failing case is the replay after a timeout.\n',
      }),
      fragment: artifact({
        type: 'verify', path: '06-verify-idempotency-key.md',
        frontmatter: { schema: 'sdlc/v1', type: 'verify', slug: 'demo', 'slice-slug': 'idempotency-key', status: 'complete', 'stage-number': 6, 'metric-test-count': 14 },
        fragment: FRAG,
      }),
    },
  },
  {
    name: 'handoff', render: handoff, ctx: CTX,
    variants: {
      full: artifact({
        type: 'handoff', path: '08-handoff.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'handoff', slug: 'demo', title: 'Checkout retries · handoff', status: 'complete',
          'stage-number': 8, 'handoff-mode': 'aggregate', 'handoff-scope': 'branch', 'handoff-lead': 'demo',
          'slice-slugs': ['idempotency-key', 'retry-budget'], 'pr-number': 42, 'updated-at': '2026-06-06T10:00:00Z',
        },
        body: '## PR readiness\nCI green on `feat/checkout-v2`. Two slices, one PR.\n',
      }),
      fragment: artifact({
        type: 'handoff', path: '08-handoff.md',
        frontmatter: { schema: 'sdlc/v1', type: 'handoff', slug: 'demo', title: 'Checkout retries · handoff', status: 'complete', 'stage-number': 8 },
        fragment: FRAG,
      }),
    },
  },
  {
    // `type: ship` is the deprecated pre-v9.2.0 doc: the alias renders the
    // banner from ship-legacy above the simple page.
    name: 'ship', render: ship, ctx: CTX,
    variants: {
      full: artifact({
        type: 'ship', path: '09-ship.md',
        frontmatter: { schema: 'sdlc/v1', type: 'ship', slug: 'demo', title: 'Checkout retries · ship', status: 'complete', 'updated-at': '2026-06-07T10:00:00Z' },
        body: '## Shipped\nMerged as PR #42.\n',
      }),
      fragment: artifact({
        type: 'ship', path: '09-ship.md',
        frontmatter: { schema: 'sdlc/v1', type: 'ship', slug: 'demo', title: 'Checkout retries · ship', status: 'complete' },
        fragment: FRAG,
      }),
    },
  },

  /* ── plan (Figure 3 topology + structured sections) ────────────────── */
  {
    name: 'plan', render: plan, ctx: CTX,
    variants: {
      full: artifact({
        type: 'plan', path: '04-plan-idempotency-key.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'plan', slug: 'demo', 'slice-slug': 'idempotency-key', title: 'Idempotency key on checkout',
          summary: 'One key per order; the gateway drops a replay.', status: 'complete', 'stage-number': 4,
          'metric-files-to-touch': 3, 'metric-step-count': 5, 'has-blockers': false, 'revision-count': 2,
          parent: 'checkout', tags: ['checkout', 'payments'], 'updated-at': '2026-06-05T08:00:00Z',
          revisions: [{ rev: 2, at: '2026-06-05T08:00:00Z', trigger: 'review-feedback', because: 'Key must survive a gateway timeout.', changed: 'Step 3.' }],
        },
        siblingYaml: {
          artifact: 'plan', slug: 'demo', slice: 'idempotency-key', rev: 2,
          modules: [{ id: 'api', label: 'API', role: 'service' }, { id: 'db', label: 'Storage', role: 'data' }],
          files: [
            { path: 'src/api/checkout.ts', status: 'modified', module: 'api', loc: 120, delta: { add: 18, rem: 4 }, planned_change: { intent: 'Attach the key to the charge request.' } },
            { path: 'src/api/idempotency.ts', status: 'new', module: 'api', loc: 40, delta: 40 },
            { path: 'migrations/0042_idempotency.sql', status: 'new', module: 'db', delta: '+12/-0' },
          ],
          edges: [{ from: 'src/api/checkout.ts', to: 'src/api/idempotency.ts', kind: 'import' }],
          acceptance: ['One charge per order under retry', 'Replay within 24 h returns the first response'],
          risks: [
            { title: 'Key collision', level: 'high', body: 'Two orders with one key charge once.' },
            { title: 'Migration lock', level: 'low', body: 'The index build takes the table lock for a few seconds.' },
          ],
        },
        body: '## Steps\n1. Generate the key.\n2. Store it.\n3. Replay on timeout.\n',
      }),
      // Two lanes and a cross-service edge switch Figure 3 to data-flow lanes.
      lanes: artifact({
        type: 'plan', path: '04-plan-retry-budget.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'plan', slug: 'demo', 'slice-slug': 'retry-budget', title: 'Retry budget',
          status: 'complete', 'stage-number': 4, 'metric-files-to-touch': 2, 'metric-step-count': 3, 'has-blockers': true,
        },
        siblingYaml: {
          artifact: 'plan', slug: 'demo', slice: 'retry-budget', rev: 1,
          modules: [{ id: 'web', label: 'Web' }, { id: 'gateway', label: 'Gateway' }],
          lanes: [{ id: 'web', label: 'Web' }, { id: 'gateway', label: 'Gateway' }],
          files: [
            { path: 'web/src/retry.ts', status: 'modified', module: 'web' },
            { path: 'gateway/src/budget.go', status: 'new', module: 'gateway' },
          ],
          edges: [{ from: 'web/src/retry.ts', to: 'gateway/src/budget.go', kind: 'crosses-service' }],
        },
        body: '## Steps\n1. Count retries per order.\n',
      }),
      // No sibling YAML: placeholder topology, frontmatter card only.
      fallback: artifact({
        type: 'plan', path: '04-plan-audit-log.md',
        frontmatter: { schema: 'sdlc/v1', type: 'plan', slug: 'demo', 'slice-slug': 'audit-log', status: 'awaiting-input', 'stage-number': 4, 'has-blockers': false },
        body: '## Steps\n1. Append one row per charge.\n',
      }),
      fragment: artifact({
        type: 'plan', path: '04-plan-idempotency-key.md',
        frontmatter: { schema: 'sdlc/v1', type: 'plan', slug: 'demo', 'slice-slug': 'idempotency-key', title: 'Idempotency key on checkout', status: 'complete', 'stage-number': 4, 'has-blockers': false },
        siblingYaml: {
          artifact: 'plan', modules: ['src/api'],
          files: [{ path: 'src/api/checkout.ts', role: 'modified' }, { path: 'src/api/idempotency.ts', role: 'new' }],
          acceptance: ['One charge per order under retry'],
        },
        fragment: FRAG,
      }),
    },
  },

  /* ── review (Figure 4 heatmap + verdict + severity metrics) ────────── */
  {
    name: 'review', render: review, ctx: CTX,
    variants: {
      full: artifact({
        type: 'review', path: '07-review.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'review', slug: 'demo', title: 'Review · checkout retries', status: 'complete',
          'stage-number': 7, 'review-scope': 'slug-wide', verdict: 'ship-with-caveats', 'updated-at': '2026-06-06T09:00:00Z',
          'metric-findings-total': 4, 'metric-findings-blocker': 0, 'metric-findings-high': 1, 'metric-findings-med': 2, 'metric-findings-low': 1, 'metric-findings-nit': 0,
        },
        siblingYaml: {
          artifact: 'review', rev: 1, verdict: 'caveats', summary: 'Ship after the replay window is bounded.',
          counts: { blocker: 0, high: 1, med: 2, low: 1, nit: 0 },
          dimensions: [{ name: 'correctness' }, { name: 'security' }, { name: 'performance' }],
          findings: [
            { id: 'R-1', severity: 'high', dimension: 'correctness', file: 'src/api/idempotency.ts', line: 41, msg: 'Replay window is unbounded.', action: 'accept' },
            { id: 'R-2', severity: 'med', dimension: 'correctness', file: 'src/api/checkout.ts', line: 88, msg: 'Timeout path skips the audit row.' },
            { id: 'R-3', severity: 'med', dimension: 'security', file: 'src/api/idempotency.ts', line: 12, msg: 'Key is logged in full.' },
            { id: 'R-4', severity: 'low', dimension: 'performance', file: 'migrations/0042_idempotency.sql', msg: 'Index is not partial.' },
          ],
        },
        body: '## Findings\nOne high, two medium, one low.\n',
      }),
      // No sibling YAML: verdict + counts from the frontmatter, no Figure 4.
      fallback: artifact({
        type: 'review', path: '07-review.md',
        frontmatter: {
          schema: 'sdlc/v1', type: 'review', slug: 'demo', title: 'Review · checkout retries', status: 'complete', 'stage-number': 7,
          verdict: 'ship', counts: { blocker: 0, high: 0, med: 0, low: 1, nit: 2 },
        },
        body: '## Findings\nNothing blocks.\n',
      }),
      fragment: artifact({
        type: 'review', path: '07-review.md',
        frontmatter: { schema: 'sdlc/v1', type: 'review', slug: 'demo', title: 'Review · checkout retries', status: 'complete', 'stage-number': 7, verdict: 'dont-ship' },
        siblingYaml: {
          artifact: 'review', rev: 2, verdict: 'no', summary: 'A blocker is open.',
          counts: { blocker: 1, high: 0, med: 0, low: 0, nit: 0 },
          dimensions: [{ name: 'correctness' }],
          findings: [{ id: 'R-5', severity: 'blocker', dimension: 'correctness', file: 'src/api/checkout.ts', msg: 'Double charge on replay.' }],
        },
        fragment: FRAG,
      }),
    },
  },

  /* ── dashboard (cross-slug INDEX; clock pinned through ctx.now) ────── */
  {
    name: 'dashboard', render: dashboard,
    ctx: {
      slug: '',
      now: Date.parse('2026-09-08T12:00:00Z'),
      allArtifacts: {
        __project__: [
          { path: 'project-context.md', viewRel: 'project-context.html', frontmatter: { type: 'project-context', title: 'Shop monorepo', status: 'current' } },
        ],
        __summary__: [
          // Two slugs on one branch: one ready for handoff, one blocked → the
          // branch group carries a "1 blocked" chip.
          { slug: 'checkout-retries', frontmatter: { type: 'index', title: 'Checkout retries', description: 'One charge per order under retry.', status: 'active', branch: 'feat/checkout-v2', 'current-stage': 'handoff', 'revision-count': 2, 'updated-at': '2026-09-08T11:48:00Z' } },
          { slug: 'refund-audit', frontmatter: { type: 'index', title: 'Refund audit log', status: 'blocked', blockers: 2, branch: 'feat/checkout-v2', 'current-stage': 'implement', 'updated-at': '2026-09-07T12:00:00Z' } },
          // Solo active slug at the first stage, paused.
          { slug: 'search-facets', frontmatter: { type: 'index', title: 'Search facets', status: 'paused', 'current-stage': 'intake', 'updated-at': '2026-09-01T12:00:00Z' } },
          // Shipped and closed rows.
          { slug: 'cart-merge', frontmatter: { type: 'index', title: 'Cart merge', description: 'Merge guest carts on login.', status: 'shipped', 'current-stage': 'retro', 'updated-at': '2026-08-20T12:00:00Z' } },
          { slug: 'legacy-export', frontmatter: { type: 'index', title: 'Legacy export', status: 'abandoned', 'current-stage': 'plan', 'updated-at': '2026-06-01T12:00:00Z' } },
          // Quick / investigative workflow (own list, no swimlane row).
          { slug: 'rca-timeout', frontmatter: { type: 'workflow-index', title: 'Gateway timeouts', 'workflow-type': 'rca', status: 'ready', 'current-stage': 'routing', 'updated-at': '2026-09-08T09:00:00Z' } },
        ],
      },
    },
    variants: {
      full: artifact({ type: 'dashboard', path: 'INDEX.html', frontmatter: { type: 'dashboard' }, body: '' }),
    },
  },
  {
    // No workflows and no project context: the empty swimlane placeholder.
    name: 'dashboard-empty', render: dashboard,
    ctx: { slug: '', now: Date.parse('2026-09-08T12:00:00Z'), allArtifacts: { __summary__: [], __project__: [] } },
    variants: {
      full: artifact({ type: 'dashboard', path: 'INDEX.html', frontmatter: { type: 'dashboard' }, body: '' }),
    },
  },
];

// Renderers that emit a <div class="fragment"> block when artifact.fragment is
// present — the determinism suite verifies these are byte-stable across runs.
export const FRAGMENT_RENDERERS = new Set([
  'benchmark', 'experiment', 'instrument', 'rca',
  'review-dimension', 'design-contract', 'design-critique', 'design-audit', 'profile',
  'intake', 'shape', 'plan', 'verify', 'review', 'handoff', 'ship',
]);
