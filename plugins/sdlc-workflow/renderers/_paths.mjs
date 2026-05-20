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
};

/**
 * Resolve storage-relative path to a view-relative path. Storage paths are
 * relative to the slug root (e.g. "slices/auth-cache/04-plan.md"); view paths
 * are relative to the view root for that slug.
 *
 * @param {string} storageRel — POSIX path relative to slug root, no leading slash
 * @returns {{ viewRel: string, kind: string } | null}
 */
export function resolveViewPath(storageRel) {
  // Normalise — accept Windows separators, strip leading "./"
  const rel = storageRel.replace(/\\/g, '/').replace(/^\.\//, '');

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
