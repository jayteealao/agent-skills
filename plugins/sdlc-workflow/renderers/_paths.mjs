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
// Flat per-slice layout: `NN-<stage>-<slice>.md` at the workflow root (e.g.
// `04-plan-toolchain.md`), as opposed to the nested `slices/<slice>/04-plan.md`
// handled by SLICE_RE. Both conventions appear in the wild.
const FLAT_PHASE_SLICE_RE = /^\d+[a-z]?-(slice|plan|implement|verify)-(.+)\.md$/;
// Flat per-dimension review files: `07-review-<command>.md` (incl. `-round2`),
// vs the nested `07-review/<command>.md` handled by REVIEW_RE.
const FLAT_REVIEW_RE = /^07-review-(.+)\.md$/;

const PHASE_BY_BASENAME = {
  '00-index':              ['', null],            // slug overview at root
  '01-intake':             ['intake', null],
  // Compressed-lifecycle change-mode leads (/wf intake fix|hotfix|refactor|
  // update-deps) name their lead artifact `01-<mode>.md` but carry `type: intake`
  // and drive a full `type: index` overview. That overview's intake card /
  // jump-rail / stripe all link to the FIXED STAGE_NAV.intake.dir = 'intake', so
  // every change-mode lead MUST land at intake/ or the intake card 404s. (Renderer
  // dispatch is by frontmatter `type` → intake.mjs; view-path placement is by
  // filename → here. Separate axes — see the file header.)
  '01-fix':                ['intake', null],
  '01-hotfix':             ['intake', null],
  '01-refactor':           ['intake', null],
  '01-update-deps':        ['intake', null],
  // Forwarded / investigative workflows (/wf intake rca|investigate, /wf probe)
  // keep their own named lead dirs. Without these entries resolveViewPath returns
  // null and the orchestrator skips them entirely — the RCA/probe writeup is then
  // never rendered and the slug overview has nothing to link to.
  '01-rca':                ['rca', null],
  '01-probe':              ['probe', null],
  '01-investigate':        ['investigate', null],
  // Terminal analysis modes (/wf intake ideate, /wf simplify, /wf probe) now root
  // in a `type: workflow-index` slug workflow with an `01-<mode>.md` lead instead
  // of writing off-pipeline (.ai/ideation/, .ai/simplify/). The lead keeps its
  // analysis type (ideation / simplify-run) but lands in its own named view dir.
  // (Legacy off-pipeline runs still render via the retained simplify/ideation
  // discovery + kind branches above — see D5.)
  '01-ideate':             ['ideate', null],
  '01-simplify':           ['simplify', null],
  '02-shape':              ['shape', null],
  '02b-design':            ['design', null],
  '02c-craft':             ['design-brief', null],
  '03-slice-index':        ['slice', null],
  '04-plan-index':         ['plan', null],
  '05-implement-index':    ['implement', null],
  '06-verify-index':       ['verify', null],
  // Bare stage-index basenames used by the flat layout (no `-index` suffix).
  '03-slice':              ['slice', null],
  '04-plan':               ['plan', null],
  '05-implement':          ['implement', null],
  '06-verify':             ['verify', null],
  '07-review':             ['review', null],
  '07-design-critique':    ['design-critique', null],   // /wf design critique
  '07-design-audit':       ['design-audit', null],      // /wf design audit
  '00-sync':               ['sync', null],               // /wf sync health report
  '08-handoff':            ['handoff', null],
  '09-ship-runs-index':    ['ship', null],
  '10-retro':              ['retro', null],
  'RESUME':                ['resume', null],
  'announce':              ['announce', null],
  'risk-register':         ['risk-register', null],
  'estimate':              ['estimate', null],
  '08b-docs-index':        ['docs-index', null],
  // wf-quick discover standalone lane (sibling of 01-fix / 01-investigate).
  '01-discover':           ['discover', null],
  // Hotfix mini-pipeline (/wf-quick hotfix) — grouped under a hotfix/ subtree.
  'hf-brief':              ['hotfix/brief', null],
  'hf-plan':               ['hotfix/plan', null],
  'hf-implement':          ['hotfix/implement', null],
  'hf-verify':             ['hotfix/verify', null],
  // Refactor mini-pipeline (/wf-quick refactor) — grouped under refactor/.
  'rf-brief':              ['refactor/brief', null],
  'rf-baseline':           ['refactor/baseline', null],
  'rf-plan':               ['refactor/plan', null],
  'rf-implement':          ['refactor/implement', null],
  'rf-verify':             ['refactor/verify', null],
  // wf-meta close record.
  '99-close':              ['close', null],
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
  if (kindHint === 'deps') {
    const stem = rel.replace(/\.md$/, '');
    return {
      viewRel: path.join('dep-updates', stem, 'INDEX.html'),
      kind: 'deps',
    };
  }
  if (kindHint === 'ideation') {
    const stem = rel.replace(/\.md$/, '');
    return {
      viewRel: path.join('ideation', stem, 'INDEX.html'),
      kind: 'ideation',
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

  // Flat per-slice files: NN-<stage>-<slice>.md (e.g. 04-plan-toolchain.md).
  // Checked AFTER PHASE_BY_BASENAME so bare/`-index` stage files win and a
  // slice literally named "index" can't shadow the stage index.
  m = rel.match(FLAT_PHASE_SLICE_RE);
  if (m) {
    const [, stage, sliceSlug] = m;
    return {
      viewRel: path.join(stage, sliceSlug, 'INDEX.html'),
      kind: stage === 'slice' ? 'slice-detail' : `slice-${stage}`,
    };
  }

  // Flat per-dimension review files: 07-review-<command>.md (incl. -round2).
  m = rel.match(FLAT_REVIEW_RE);
  if (m) {
    const [, command] = m;
    return {
      viewRel: path.join('review', command, 'INDEX.html'),
      kind: 'review-command',
    };
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
 *
 * `fragment` is the TYPED (canonical) fragment — the contract-bound, YAML-projected
 * `.html.fragment` validated by verify-fragment.mjs. An artifact may ALSO ship any
 * number of FREE narrative fragments named `<stem>.<label>.html.fragment`; those are
 * discovered by directory scan (see classifyFragmentName), not by this lexical helper.
 */
export function siblingPaths(storageRel) {
  const rel = storageRel.replace(/\\/g, '/');
  const stem = rel.replace(/\.md$/, '');
  return {
    yaml:     `${stem}.yaml`,
    fragment: `${stem}.html.fragment`,
  };
}

const FRAGMENT_SUFFIX = '.html.fragment';

/**
 * Classify a `*.html.fragment` filename against an artifact's basename stem
 * (the `.md` basename minus the extension, e.g. `04-plan-auth`). Two tiers:
 *
 *   - `<stem>.html.fragment`          → { tier: 'typed', label: null }
 *       The one canonical, contract-bound fragment the renderers project from
 *       the sibling `.yaml`. Enforced by verify-fragment.mjs.
 *   - `<stem>.<label>.html.fragment`  → { tier: 'free', label: '<label>' }
 *       A free narrative fragment — UNRESTRICTED raw HTML the agent authors to
 *       tell the story this artifact needs. Any number per artifact, injected
 *       raw-inline below the page body in label (filename) order. An `NN-`
 *       prefix on the label controls ordering (e.g. `01-state-machine`). No
 *       envelope, no scoping, no sibling `.yaml`, no contract.
 *
 * Returns `null` when `name` is not a fragment sibling of `stem` at all. The
 * typed check is exact, so a stem that is a prefix of a longer stem (e.g. stem
 * `04-plan` vs file `04-plan-auth.foo.html.fragment`) never cross-matches: the
 * free branch requires a literal `<stem>.` boundary.
 */
export function classifyFragmentName(name, stem) {
  if (!name.endsWith(FRAGMENT_SUFFIX)) return null;
  if (name === `${stem}${FRAGMENT_SUFFIX}`) return { tier: 'typed', label: null };
  const prefix = `${stem}.`;
  if (!name.startsWith(prefix)) return null;
  const label = name.slice(prefix.length, name.length - FRAGMENT_SUFFIX.length);
  if (!label) return null;
  return { tier: 'free', label };
}

/**
 * Convert a directory-style relative URL into an explicit INDEX.html file URL.
 *
 * Every internal nav link must resolve to a real file: neither file:// nor a
 * plain static host can be relied on to map `foo/` → `foo/INDEX.html` (most
 * only auto-serve lowercase `index.html`, and file:// serves nothing). Links
 * that already point at a concrete `.html` file pass through unchanged, so
 * this is safe to apply to any internal href.
 *
 *   ''               → 'INDEX.html'
 *   './'             → 'INDEX.html'
 *   '../'            → '../INDEX.html'
 *   '../../'         → '../../INDEX.html'
 *   'shape/'         → 'shape/INDEX.html'
 *   'slice/x'        → 'slice/x/INDEX.html'
 *   'project/P.html' → 'project/P.html'   (unchanged)
 */
export function pageHref(dirHref) {
  const s = String(dirHref ?? '');
  if (s.endsWith('.html')) return s;
  if (s === '' || s === './') return 'INDEX.html';
  return s.endsWith('/') ? `${s}INDEX.html` : `${s}/INDEX.html`;
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
    { label: 'sdlc', href: pageHref('../'.repeat(parts.length + 1)) },
    { label: slug,   href: pageHref('../'.repeat(parts.length)) },
  ];
  for (let i = 0; i < parts.length; i++) {
    const remaining = parts.length - i - 1;
    crumbs.push({
      label: parts[i],
      href:  pageHref('../'.repeat(remaining)),
    });
  }
  return crumbs;
}

/**
 * Asset base resolver — returns a URL-joined path from the configured
 * assetBase. The caller typically supplies a depth-relative path (e.g.
 * `../../_assets`) so links work when opened via file:// or any server root.
 */
export function assetUrl(assetBase, filename) {
  const base = assetBase.replace(/\/$/, '');
  return `${base}/${filename}`;
}
