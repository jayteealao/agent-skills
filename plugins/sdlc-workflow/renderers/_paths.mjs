// renderers/_paths.mjs
// Map storage paths (.ai/workflows/<slug>/<file>.md) to view paths
// (.ai/_view/<slug>/<phase>/.../INDEX.html). The mapping is purely lexical —
// it does not touch disk. See SUNFLOWER-VIEW-PLAN §"View layer".

import { posix as path } from 'node:path';

const SLICE_RE   = /^slices\/([^/]+)\/(\d+[a-z]?)-([a-z-]+)\.md$/;
const REVIEW_RE  = /^07-review\/([^/]+)\.md$/;
const SHIPRUN_RE = /^ship\/([^/]+)\/(\d+[a-z]?)-([a-z-]+)\.md$/;
const AUG_RE     = /^augmentations\/([^/]+)\.md$/;
const AMEND_RE   = /^amendments\/(\d+)-(shape|slice)(?:[^/]*)\.md$/;
const HISTORY_RE = /^(?:(.+)\/)?history\/([^/]+)-(\d+)\.md$/;

const PHASE_BY_BASENAME = {
  '00-index':              ['', null],            // slug overview at root
  '01-intake':             ['intake', null],
  '02-shape':              ['shape', null],
  '02b-design':            ['design', null],
  '02c-craft':             ['design-brief', null],
  '03-slice-index':        ['slice', null],
  '04-plan-index':         ['plan', null],
  '05-implement-index':    ['implement', null],
  '06-verify-index':       ['verify', null],
  '07-review':             ['review', null],
  '08-handoff':            ['handoff', null],
  '09-ship-runs-index':    ['ship', null],
  '10-retro':              ['retro', null],
  'RESUME':                ['resume', null],
  'announce':              ['announce', null],
  'risk-register':         ['risk-register', null],
  'estimate':              ['estimate', null],
  '08b-docs-index':        ['docs-index', null],
};

/**
 * Resolve storage-relative path to a view-relative path. The interpretation
 * depends on the artifact `kind`:
 *
 * - `workflow` (default) — `storageRel` is relative to the slug root inside
 *   `.ai/workflows/<slug>/`. The returned `viewRel` is relative to the slug's
 *   view directory (`.ai/_view/<slug>/...`).
 * - `simplify` — `storageRel` is relative to `.ai/simplify/` (e.g. just
 *   `<run-id>.md`). The returned `viewRel` is relative to the view root
 *   (`.ai/_view/simplify/<run-id>/INDEX.html`).
 * - `profile` — `storageRel` is relative to `.ai/profiles/` (e.g.
 *   `<run-id>/01-profile.md`). The returned `viewRel` is rooted under
 *   `.ai/_view/profiles/<run-id>/01-profile/INDEX.html`.
 * - `docs` — `storageRel` is relative to `.ai/docs/`, currently the
 *   wf-docs run index at `<run-id>/08b-docs-index.md`.
 * - `project` — `storageRel` is relative to the project root for PRODUCT.md,
 *   DESIGN.md, and `.ai/ship-plan.md`. The returned `viewRel` is rooted under
 *   `.ai/_view/project/`.
 *
 * Off-pipeline support (v9.23.0+, S2.2): prior versions returned `null` for
 * simplify/profile paths and the orchestrator computed the view URL inline,
 * which left the link-graph rewriter blind to cross-references. Now any
 * caller (link-graph, breadcrumb, future cross-slug nav) gets the same view
 * path the orchestrator emits.
 *
 * @param {string} storageRel — POSIX path, no leading slash
 * @param {{ kind?: 'workflow'|'simplify'|'profile'|'docs'|'project' }} [opts]
 * @returns {{ viewRel: string, kind: string } | null}
 */
export function resolveViewPath(storageRel, opts = {}) {
  // Normalise — accept Windows separators, strip leading "./"
  const rel = storageRel.replace(/\\/g, '/').replace(/^\.\//, '');
  const kindHint = opts.kind ?? 'workflow';

  // Off-pipeline kinds — keyed by orchestrator. The storageRel here is
  // relative to the off-pipeline root (.ai/simplify/ or .ai/profiles/),
  // not the slug root, so the regexes above don't apply.
  if (kindHint === 'simplify') {
    const stem = rel.replace(/\.md$/, '');
    return {
      viewRel: path.join('simplify', stem, 'INDEX.html'),
      kind: 'simplify',
    };
  }
  if (kindHint === 'profile') {
    const stem = rel.replace(/\.md$/, '');
    return {
      viewRel: path.join('profiles', stem, 'INDEX.html'),
      kind: 'profile',
    };
  }
  if (kindHint === 'docs') {
    const stem = rel.replace(/\.md$/, '');
    const runId = path.dirname(stem);
    const page = path.basename(stem).replace(/^08b-/, '');
    return {
      viewRel: path.join('docs', runId === '.' ? 'run' : runId, page, 'INDEX.html'),
      kind: 'docs-index',
    };
  }
  if (kindHint === 'project') {
    const stem = rel.replace(/^\.ai\//, '').replace(/\.md$/, '');
    const file = stem.split('/').pop();
    return {
      viewRel: path.join('project', `${file}.html`),
      kind: file === 'ship-plan' ? 'ship-plan' : 'project-context',
    };
  }

  // history/<basename>-<rev>.md → embed as side-route on the parent
  let m = rel.match(HISTORY_RE);
  if (m) {
    const [, parent, basename, rev] = m;
    const parentResolved = parent
      ? resolveViewPath(`${parent}/${basename}.md`)
      : resolveViewPath(`${basename}.md`);
    if (!parentResolved) return null;
    return {
      viewRel: path.join(path.dirname(parentResolved.viewRel), 'history', rev, 'INDEX.html'),
      kind: 'history-snapshot',
    };
  }

  // slices/<slice>/<step>-<name>.md
  m = rel.match(SLICE_RE);
  if (m) {
    const [, sliceSlug, , kindToken] = m;
    const phaseFromStep = {
      'plan':      'plan',
      'implement': 'implement',
      'verify':    'verify',
    };
    const phase = phaseFromStep[kindToken];
    if (phase) {
      return {
        viewRel: path.join(phase, sliceSlug, 'INDEX.html'),
        kind: `slice-${phase}`,
      };
    }
    // unknown sub-step → fall through to generic per-slice route
    return {
      viewRel: path.join('slice', sliceSlug, kindToken, 'INDEX.html'),
      kind: `slice-${kindToken}`,
    };
  }

  // 03-slices/<slice>.md (slice detail)
  m = rel.match(/^03-slices\/([^/]+)\.md$/);
  if (m) {
    const [, sliceSlug] = m;
    return {
      viewRel: path.join('slice', sliceSlug, 'INDEX.html'),
      kind: 'slice-detail',
    };
  }

  // 07-review/<command>.md (per-dimension review)
  m = rel.match(REVIEW_RE);
  if (m) {
    const [, command] = m;
    return {
      viewRel: path.join('review', command, 'INDEX.html'),
      kind: 'review-command',
    };
  }

  // ship/<run-id>/09-ship-run.md
  m = rel.match(SHIPRUN_RE);
  if (m) {
    const [, runId] = m;
    return {
      viewRel: path.join('ship', runId, 'INDEX.html'),
      kind: 'ship-run',
    };
  }

  // augmentations/<id>.md
  m = rel.match(AUG_RE);
  if (m) {
    const [, id] = m;
    return {
      viewRel: path.join('augmentations', id, 'INDEX.html'),
      kind: 'augmentation',
    };
  }

  // amendments/<n>-<kind>(-...).md → amendments/<n>-<kind>/INDEX.html
  m = rel.match(AMEND_RE);
  if (m) {
    const [, n, kind] = m;
    return {
      viewRel: path.join('amendments', `${n}-${kind}`, 'INDEX.html'),
      kind: `${kind}-amendment`,
    };
  }

  // Direct phase files via PHASE_BY_BASENAME
  const basename = rel.replace(/\.md$/, '');
  if (Object.prototype.hasOwnProperty.call(PHASE_BY_BASENAME, basename)) {
    const [phaseDir] = PHASE_BY_BASENAME[basename];
    const viewRel = phaseDir === ''
      ? 'INDEX.html'
      : path.join(phaseDir, 'INDEX.html');
    return { viewRel, kind: basename };
  }

  // Skip-records skips/<stage>.md
  m = rel.match(/^skips\/([^/]+)\.md$/);
  if (m) {
    const [, stage] = m;
    return { viewRel: path.join('skips', stage, 'INDEX.html'), kind: 'skip-record' };
  }

  return null;
}

/**
 * Resolve sibling YAML / html.fragment paths for a given storage MD path.
 * Returns absolute-like POSIX paths relative to the slug root.
 */
export function siblingPaths(storageRel) {
  const rel = storageRel.replace(/\\/g, '/');
  const stem = rel.replace(/\.md$/, '');
  return {
    yaml:     `${stem}.yaml`,
    fragment: `${stem}.html.fragment`,
  };
}

/**
 * Compute the breadcrumb chain from a view-relative path. Each entry is
 * { label, href } where href is relative to the view root.
 */
export function breadcrumbFromView(viewRel, slug) {
  const parts = viewRel.split('/').filter(Boolean);
  // Last segment is INDEX.html — drop it
  if (parts[parts.length - 1] === 'INDEX.html') parts.pop();
  const crumbs = [
    { label: 'sdlc', href: '../'.repeat(parts.length + 1) || './' },
    { label: slug,   href: '../'.repeat(parts.length)     || './' },
  ];
  for (let i = 0; i < parts.length; i++) {
    const remaining = parts.length - i - 1;
    crumbs.push({
      label: parts[i],
      href:  remaining === 0 ? './' : '../'.repeat(remaining),
    });
  }
  return crumbs;
}

/**
 * Asset base resolver — returns an absolute-style path from the configured
 * assetBase. Default `/sdlc/_assets`. Renderer-supplied; never derived from
 * the view-tree depth (absolute paths resolve from the server root).
 */
export function assetUrl(assetBase, filename) {
  const base = assetBase.replace(/\/$/, '');
  return `${base}/${filename}`;
}
