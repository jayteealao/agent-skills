// renderers/index.mjs — slug overview ("00-index.md")
// This is the gate renderer (per SUNFLOWER-VIEW-PLAN line 1400). Building this
// first end-to-end validates every helper's contract before 29 more renderers
// depend on them.

import { md2html } from './_markdown.mjs';
import { artifactHeader, statusBadge, stageBadge, metricRow } from './_shell.mjs';
import { renderHistoryBlock } from './_history.mjs';
import { figureCanvas, evenX } from './_figure.mjs';
import { escapeHtml } from './_validator.mjs';
import { pageHref } from './_paths.mjs';

const STAGES = [
  'intake', 'shape', 'slice', 'plan', 'implement',
  'verify', 'review', 'handoff', 'ship', 'retro',
];

// Map each stage to the artifact `type` values that count as a member of
// that stage, plus the canonical sub-path under the slug root (which is the
// href emitted by the stages-grid cards on the slug overview).
const STAGE_NAV = {
  intake:    { types: ['intake'],                                       dir: 'intake' },
  shape:     { types: ['shape', 'design', 'design-contract', 'design-brief'], dir: 'shape' },
  slice:     { types: ['slice-index', 'slice'],                         dir: 'slice' },
  plan:      { types: ['plan-index', 'plan'],                           dir: 'plan' },
  implement: { types: ['implement-index', 'implement'],                 dir: 'implement' },
  verify:    { types: ['verify-index', 'verify'],                       dir: 'verify' },
  review:    { types: ['review', 'review-command', 'design-audit', 'design-critique'], dir: 'review' },
  handoff:   { types: ['handoff'],                                      dir: 'handoff' },
  ship:      { types: ['ship-runs-index', 'ship-run'],                  dir: 'ship' },
  retro:     { types: ['retro'],                                        dir: 'retro' },
};

// Intent-Risk (RIM) ledger chip (INTENT-FIDELITY W1.3) — sits beside the status/
// stage chips. Renders nothing when the ledger is absent (older workflows), so
// existing pages are byte-stable. Any `status: open` entry dominates as a warning
// tone (shape should have adjudicated it); otherwise it summarises adjudicated /
// carried counts. Reuses the same at-a-glance role the deferral pressure has.
function intentRisksChip(risks) {
  if (!Array.isArray(risks) || !risks.length) return '';
  const by = { open: 0, adjudicated: 0, carried: 0 };
  for (const r of risks) {
    const s = String(r?.status ?? '').trim().toLowerCase();
    if (s in by) by[s]++;
  }
  const total = by.open + by.adjudicated + by.carried;
  if (!total) return '';
  if (by.open > 0) {
    return `<span class="badge is-warn" title="unadjudicated intent-risks — shape should resolve these">⚠ ${by.open} intent-risk${by.open === 1 ? '' : 's'} open</span>`;
  }
  const parts = [];
  if (by.adjudicated) parts.push(`${by.adjudicated} adjudicated`);
  if (by.carried) parts.push(`${by.carried} carried`);
  return `<span class="badge" title="intent-risk (RIM) ledger">⚑ risks · ${escapeHtml(parts.join(' · '))}</span>`;
}

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const current = fm['current-stage'] ?? 'intake';

  // so-hd two-column identity block (D4.1): pg-title + restored lede on the
  // left, branch badge + status/stage chips on the right.
  const lede = fm.description ?? fm.lede ?? fm.summary ?? '';
  const headerHtml = `<header class="so-hd">
    <div class="so-hd-main">
      <h1 class="pg-title">${escapeHtml(fm.title ?? fm.slug ?? 'untitled')}</h1>
      ${lede ? `<p class="sdlc-lede">${escapeHtml(lede)}</p>` : ''}
    </div>
    <aside class="so-hd-aside">
      ${fm.branch ? `<span class="badge">⎇ ${escapeHtml(fm.branch)}</span>` : ''}
      ${statusBadge(fm.status)}
      ${stageBadge(current)}
      ${intentRisksChip(fm['intent-risks'])}
      ${fm['pr-number'] ? `<span class="meta">PR #${escapeHtml(fm['pr-number'])}</span>` : ''}
      ${fm['updated-at'] ? `<span class="meta">updated ${escapeHtml(fm['updated-at'])}</span>` : ''}
    </aside>
  </header>`;

  const progressValue = formatProgress(fm.progress, ctx.allArtifacts);
  const metrics = [
    progressValue && { label: 'progress', value: progressValue },
    fm['selected-slice'] && { label: 'slice', value: fm['selected-slice'] },
    fm['review-scope'] && { label: 'review', value: fm['review-scope'] },
  ].filter(Boolean);

  const metricsHtml = metrics.length ? metricRow(metrics) : '';

  // Figure 2 — Stage stripe (slug-overview canonical figure)
  const figureSvg = stageStripeSvg({ current, allArtifacts: ctx.allArtifacts, fm });
  const figureHtml = figureCanvas({
    figureNumber: 2,
    title: `Slug stage stripe — ${fm.slug ?? ''}`,
    svgInner: figureSvg,
    legend: [
      { state: 'done',    label: 'done' },
      { state: 'current', label: 'current' },
      { state: 'queued',  label: 'queued' },
    ],
  });

  // Activity feed + jump rail (D4.9 / D4.10). so-grid roles: activity left,
  // jump rail right (D4.11). Stages grid + slices + prose move below (D4.14).
  const activity = buildActivityList(ctx.allArtifacts);
  const railHtml = jumpRail(current, ctx.allArtifacts);
  const proseHtml = artifact.body ? md2html(artifact.body) : '';
  const stagesGridHtml = stagesGrid(current, ctx.allArtifacts);
  const slicesHtml = slicesPreview(ctx.allArtifacts);
  const plansHtml = plansPreview(ctx.allArtifacts);

  // Dual-DOM (M-S4): the 10-station stage stripe SVG is illegible at 390px, so
  // phones (<=480px) get metric tiles + a vertical stepper instead (M-OVR-02/03).
  const mobileStripeHtml = mobileStripe({ current, allArtifacts: ctx.allArtifacts, fm });

  const bodyHtml = `
    <div class="d-only">${figureHtml}${metricsHtml}</div>
    <div class="m-only">${mobileStripeHtml}</div>
    <section class="so-grid">
      <div class="so-main">
        <h2 class="sec">recent activity</h2>
        ${activity}
      </div>
      <aside class="so-side">
        ${railHtml}
      </aside>
    </section>
    ${proseHtml ? `<section class="so-prose"><div class="prose">${proseHtml}</div></section>` : ''}
    ${stagesGridHtml}
    ${slicesHtml}
    ${plansHtml}
    ${renderHistoryBlock(artifact.history)}
  `;

  return { headerHtml, bodyHtml, links: [], children: [] };
}

// Mobile slug overview (M-S3 / 5b): metric tiles + a vertical stage stepper,
// the portrait reconception of the desktop stage-stripe SVG.
function mobileStripe({ current, allArtifacts, fm }) {
  const currentIdx = Math.max(0, STAGES.indexOf(current));
  // Same always-current stats as the desktop callout band (slugStats).
  const s = slugStats(allArtifacts, fm);
  const tiles = `<div class="mtiles">
    <div class="mtile"><div class="lbl">Slices</div><div class="val">${s.slices || '—'}</div></div>
    <div class="mtile"><div class="lbl">Reviews</div><div class="val">${s.reviews || '—'}</div></div>
    <div class="mtile"><div class="lbl">Blockers</div><div class="val${s.blockers ? ' is-blocker' : ''}">${s.blockers}</div></div>
    <div class="mtile"><div class="lbl">Checks</div><div class="val">${escapeHtml(String(s.checks ?? '—'))}</div></div>
  </div>`;
  const steps = STAGES.map((stage, i) => {
    const cfg = STAGE_NAV[stage] ?? { types: [stage], dir: stage };
    const { count } = stageArtifacts(stage, allArtifacts);
    const cls = currentIdx === i ? 'step cur' : currentIdx > i ? 'step done' : 'step';
    const meta = count > 0 ? stationAnnotation(stage, count, allArtifacts, fm) : 'not started';
    const inner = `<span class="ring">${i + 1}</span><div class="nm">${escapeHtml(stage)}</div><div class="meta">${escapeHtml(meta)}</div>`;
    return count > 0
      ? `<a class="${cls}" href="${escapeHtml(pageHref(cfg.dir))}">${inner}</a>`
      : `<div class="${cls}">${inner}</div>`;
  }).join('');
  return `${tiles}<div class="subhead">Stages</div><div class="stepper">${steps}</div>`;
}

const SVG_SERIF = 'Iowan Old Style, Palatino, Georgia, serif';

// Count the artifacts belonging to a stage by mapping the stage to its member
// types (STAGE_NAV), since ctx.allArtifacts is keyed by frontmatter.type — not
// by stage name. Returns { count, latest } for date + annotation rendering.
function stageArtifacts(stage, allArtifacts) {
  const cfg = STAGE_NAV[stage] ?? { types: [stage] };
  // Count work-item artifacts only — a stage's own `*-index` roll-up is not a
  // member of the work it summarises. Counting it inflated the slice station by
  // +1 (03-slice.md is itself type `slice-index`), and likewise plan/implement/
  // verify/ship. The roll-ups are still read directly where authoritative.
  const types = (cfg.types ?? [stage]).filter((t) => !t.endsWith('-index'));
  const list = types.flatMap((t) => allArtifacts?.[t] ?? []);
  const dates = list.map((a) => a.frontmatter?.['updated-at']).filter(Boolean).sort();
  return { count: list.length, latest: dates[dates.length - 1] ?? '' };
}

// The authoritative per-slice roster lives in the slice-index artifact's
// frontmatter (`slices: [{slug,status}]` + `total-slices`), maintained by the
// slice/implement stages. The individual slice-stage files carry only their own
// slicing status (`defined`), so slice counts and per-slice status come from
// this roster — never the leaves.
function sliceRoster(allArtifacts) {
  const fm = (allArtifacts?.['slice-index'] ?? [])[0]?.frontmatter ?? {};
  const list = Array.isArray(fm.slices) ? fm.slices : [];
  const total = Number(fm['total-slices']);
  return { list, total: Number.isFinite(total) && total > 0 ? total : list.length };
}

const SLICE_DONE = new Set(['complete', 'completed', 'done', 'shipped']);

// `progress` in the index frontmatter is a stage→status map
// ({intake:'complete', shape:'complete', …}) — NOT the {done,total} counter the
// metarow historically read (which always rendered 0/0). Accept all three
// shapes: an explicit counter, a plain string, or the stage-status map
// (collapsed to done/total over its completed stages).
function formatProgress(progress, allArtifacts = {}) {
  if (!progress) return null;
  if (typeof progress === 'string') return progress;
  if (typeof progress !== 'object') return String(progress);
  if (Number(progress.total) > 0) {
    // A {done,total} counter is slice-based (the only counter shape the schema
    // defines — `slices-implemented`/`slices-total`). `wf-meta extend` bumps the
    // slice roster but never this stored counter, so its `total` strands at the
    // pre-extend count. Reconcile the denominator UP to the live roster total so
    // an extended workflow shows progress over its CURRENT scope; never shrink it
    // (Math.max), guarding any larger non-slice counter that might appear.
    const rosterTotal = sliceRoster(allArtifacts).total;
    const total = Math.max(Number(progress.total), Number.isFinite(rosterTotal) ? rosterTotal : 0);
    return `${Number(progress.done) || 0}/${total}`;
  }
  const states = Object.values(progress).filter((v) => typeof v === 'string');
  if (!states.length) return null;
  const done = states.filter((v) => SLICE_DONE.has(v.toLowerCase())).length;
  return `${done}/${states.length}`;
}

// Semantic per-stage caption under each station (D4.6): plan → revisions,
// implement → done/total slices, verify → tests passed; the rest keep a plain
// artifact count. Every richer branch falls back to the generic count when its
// signal isn't present, so a sparse workflow never shows a misleading 0.
function stationAnnotation(stage, count, allArtifacts = {}, fm = {}) {
  const generic = `${count} artifact${count === 1 ? '' : 's'}`;
  switch (stage) {
    case 'slice':  return `${count} slice${count === 1 ? '' : 's'}`;
    case 'review': return `${count} review${count === 1 ? '' : 's'}`;
    case 'ship':   return `${count} run${count === 1 ? '' : 's'}`;
    case 'implement': {
      // Denominator MUST come from the slice roster (`03-slice.md`: total-slices
      // / slices[]) — it is the only slice count `wf-meta extend` maintains. The
      // implement-index roll-up's `slices-total` is written once at implement
      // time and never re-bumped, so trusting it as the denominator strands the
      // total at the pre-extend count (e.g. "3/5" forever after extending to 7).
      // The roll-up's `slices-implemented` is still trusted for the NUMERATOR —
      // alongside live implement-leaf completions and the roster's own statuses —
      // since extend never marks new slices done, so it can only undercount.
      const { list, total } = sliceRoster(allArtifacts);
      if (!total) return generic;
      const ii = (allArtifacts['implement-index'] ?? [])[0]?.frontmatter ?? {};
      const rollDone = Number(ii['slices-implemented']);
      const fromLeaves = (allArtifacts.implement ?? [])
        .filter((a) => SLICE_DONE.has(String(a.frontmatter?.status ?? '').toLowerCase())).length;
      const fromRoster = list
        .filter((s) => SLICE_DONE.has(String(s.status ?? '').toLowerCase())).length;
      const done = Math.max(Number.isFinite(rollDone) ? rollDone : 0, fromLeaves, fromRoster);
      return `${done}/${total} slices`;
    }
    case 'verify': {
      const t = deriveChecks(allArtifacts, fm);
      return t != null ? `${t} ✓` : generic;
    }
    case 'plan': {
      const revs = (allArtifacts.plan ?? []).reduce((n, a) => n + (Number(a.frontmatter?.['revision-count']) || 0), 0);
      return revs > 0 ? `${revs} revision${revs === 1 ? '' : 's'}` : generic;
    }
    default: return generic;
  }
}

function stageStripeSvg({ current, allArtifacts, fm = {} }) {
  const W = 920, H = 230, padX = 60;
  const xs = evenX(W, padX, STAGES.length);
  const cy = 96;
  const currentIdx = Math.max(0, STAGES.indexOf(current));

  const baseRail = `<line x1="${padX}" y1="${cy}" x2="${W - padX}" y2="${cy}" stroke="#cbc4b1" stroke-width="2"/>`;
  // Solid ink-strong progress overlay from the first station to current (D4.4).
  const progress = currentIdx > 0
    ? `<line x1="${xs[0]}" y1="${cy}" x2="${xs[currentIdx]}" y2="${cy}" stroke="#1f1b16" stroke-width="2.5"/>`
    : '';

  const stations = STAGES.map((stage, i) => {
    const x = xs[i];
    const done  = currentIdx > i;
    const isCur = currentIdx === i;
    const fill   = done ? '#3e7d4a' : isCur ? '#4a6c8c' : '#fbfaf6';
    const stroke = done ? '#3e7d4a' : isCur ? '#4a6c8c' : '#cbc4b1';
    const { count, latest } = stageArtifacts(stage, allArtifacts);

    // Current station is an enlarged disc (r=22) with an inner dashed ring (D4.7).
    const dot = isCur
      ? `<circle cx="${x}" cy="${cy}" r="22" fill="${fill}" stroke="${stroke}" stroke-width="2"/>` +
        `<circle cx="${x}" cy="${cy}" r="14" fill="none" stroke="#fbfaf6" stroke-width="1.2" stroke-dasharray="3 3"/>`
      : done
        ? `<circle cx="${x}" cy="${cy}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`
        : `<circle cx="${x}" cy="${cy}" r="7" fill="${fill}" stroke="${stroke}" stroke-width="1.5" stroke-dasharray="2.5 2"/>`;

    // Design stacks the current-station marker ABOVE its date (date sits ~28px
    // off the rail for every station; "you are here" rises a line higher) — D4.5.
    const date  = latest
      ? `<text x="${x}" y="${cy - 28}" text-anchor="middle" font-size="9" fill="#8a8377" font-family="ui-monospace, monospace">${escapeHtml(String(latest).slice(5, 10))}</text>`
      : '';
    const youHere = isCur ? `<text x="${x}" y="${cy - 44}" text-anchor="middle" font-size="10" fill="#4a6c8c" font-style="italic">you are here</text>` : '';
    const label = `<text x="${x}" y="${cy + 42}" text-anchor="middle" font-size="11" fill="#1f1b16" font-weight="${isCur ? 600 : 500}">${stage}</text>`;
    const ann = count > 0
      ? `<text x="${x}" y="${cy + 56}" text-anchor="middle" font-size="9" fill="#8a8377">${escapeHtml(stationAnnotation(stage, count, allArtifacts, fm))}</text>`
      : '';
    return `${date}${youHere}${dot}${label}${ann}`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Slug stage stripe">
    ${baseRail}${progress}${stations}
    ${metricCalloutBand(W, 186, fm, allArtifacts)}
  </svg>`;
}

// Bottom metric-callout band (D4.8): a second hairline rule and five summary
// groups. Every value is derived from the artifacts on disk (slugStats) so the
// band is always current; an em-dash shows only when a metric has no source yet.
function metricCalloutBand(W, y, fm, allArtifacts) {
  const s = slugStats(allArtifacts, fm);
  const groups = [
    { lbl: 'LOC TOUCHED', val: s.loc ?? '—' },
    { lbl: 'SLICES',      val: s.slices || '—' },
    { lbl: 'REVIEWS',     val: s.reviews || '—' },
    { lbl: 'BLOCKERS',    val: s.blockers },
    { lbl: 'CHECKS',      val: s.checks ?? '—' },
  ];
  const rule = `<line x1="20" y1="${y}" x2="${W - 20}" y2="${y}" stroke="#e0dbcd" stroke-width="1"/>`;
  const gx = evenX(W, 110, groups.length);
  const cells = groups.map((g, i) => {
    const x = gx[i];
    return `<text x="${x}" y="${y + 18}" text-anchor="middle" font-size="9" letter-spacing="1" fill="#8a8377">${g.lbl}</text>` +
      `<text x="${x}" y="${y + 38}" text-anchor="middle" font-size="18" font-weight="600" fill="#1f1b16" font-family="${SVG_SERIF}">${escapeHtml(String(g.val))}</text>`;
  }).join('');
  return `${rule}${cells}`;
}

// Canonical slug stats, derived from the artifacts on disk so they are ALWAYS
// current — never from unmaintained index frontmatter fields (the source of the
// stale "—" LOC/TESTS and the inflated slice/review counts). The index fm is
// consulted only as an explicit human-set override.
function slugStats(allArtifacts = {}, fm = {}) {
  const roster = sliceRoster(allArtifacts);
  const verify = allArtifacts.verify ?? [];
  const blockedSlices = roster.list.filter((sl) => String(sl.status ?? '').toLowerCase() === 'blocked').length;
  const verifyBlockers = verify.filter((a) => isTruthyFlag(a.frontmatter?.['has-blockers'])).length;
  const explicitBlockers = Number(fm.blockers ?? fm['blocker-count']);
  return {
    slices:  roster.total,
    // Review DIMENSIONS (review-command) — the `review` index is a roll-up, not
    // a review, so it is excluded (fall back to it only if no dimensions exist).
    reviews: (allArtifacts['review-command'] ?? []).length || (allArtifacts.review ?? []).length,
    blockers: Number.isFinite(explicitBlockers) ? explicitBlockers : blockedSlices + verifyBlockers,
    loc:     fm['loc-touched'] ?? fm['metric-loc']
               ?? deriveLoc((allArtifacts['implement-index'] ?? [])[0]?.frontmatter ?? {}, allArtifacts.implement ?? []),
    checks:  deriveChecks(allArtifacts, fm),
  };
}

function isTruthyFlag(v) {
  return v === true || ['true', 'yes', '1'].includes(String(v).toLowerCase());
}

function sumField(list, key) {
  return (list ?? []).reduce((n, a) => n + (Number(a.frontmatter?.[key]) || 0), 0);
}

// Verification gate-checks, always current from the verify leaves: the total
// checks passed (shown passed/run when any failed). Prefers an explicit count if
// one is set; falls back to real adversarial tests when no checks were recorded.
// (Labelled CHECKS, not TESTS — these are the verify-stage gates, not a unit-test
// count, which the schema does not track.)
function deriveChecks(allArtifacts = {}, fm = {}) {
  const explicit = fm['checks-passed'] ?? fm['metric-checks'] ?? fm['tests-passed'] ?? fm['metric-tests'];
  if (explicit != null && explicit !== '') return explicit;
  const verify = allArtifacts.verify ?? [];
  const passed = sumField(verify, 'metric-checks-passed');
  const run = sumField(verify, 'metric-checks-run');
  if (passed > 0 || run > 0) return run > passed ? `${passed}/${run}` : String(passed);
  const adv = sumField(verify, 'adversarial-tests-run');
  return adv > 0 ? String(adv) : null;
}

// LOC touched = lines added + removed — from the implement roll-up if present,
// else summed across the implement leaves; compacted to fit the cell (26195 →
// "26.2k").
function deriveLoc(impFm = {}, impLeaves = []) {
  let add = Number(impFm['metric-total-lines-added']);
  let rem = Number(impFm['metric-total-lines-removed']);
  if (!Number.isFinite(add) && !Number.isFinite(rem) && impLeaves.length) {
    add = sumField(impLeaves, 'metric-lines-added');
    rem = sumField(impLeaves, 'metric-lines-removed');
  }
  if (!Number.isFinite(add) && !Number.isFinite(rem)) return null;
  return compactNum((Number.isFinite(add) ? add : 0) + (Number.isFinite(rem) ? rem : 0));
}

function compactNum(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

// Jump rail (D4.10): one link per lifecycle stage with a per-stage artifact
// count. Stages with no artifacts render as a non-clickable muted entry.
function jumpRail(current, allArtifacts) {
  const items = STAGES.map((stage) => {
    const cfg = STAGE_NAV[stage] ?? { types: [stage], dir: stage };
    const { count } = stageArtifacts(stage, allArtifacts);
    const cur = stage === current ? ' aria-current="true"' : '';
    const inner = `<span class="lbl">${escapeHtml(stage)}</span><span class="count">${count || '·'}</span>`;
    return count > 0
      ? `<a href="${escapeHtml(pageHref(cfg.dir))}"${cur}>${inner}</a>`
      : `<span class="rail-empty"${cur}>${inner}</span>`;
  }).join('');
  return `<nav class="so-rail" aria-label="jump to stage"><h2 class="sec">jump to</h2>${items}</nav>`;
}

// Activity feed (D4.9): each row is a human-relative `when` paired with a
// `what` block (the touched file + the actor/type), inside the clickable
// activity-link. Structure mirrors the design's 88px / 1fr two-column rows.
function buildActivityList(allArtifacts) {
  const flat = [];
  for (const list of Object.values(allArtifacts ?? {})) {
    if (!Array.isArray(list)) continue;
    for (const a of list) {
      flat.push({
        type:  a.frontmatter?.type ?? a.type,
        updated: a.frontmatter?.['updated-at'] ?? '',
        who: a.frontmatter?.author ?? a.frontmatter?.['updated-by'] ?? '',
        file: a.storageRel ?? a.path ?? '',
        href: a.viewRel ?? '',
      });
    }
  }
  flat.sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
  const top = flat.slice(0, 8);
  if (!top.length) return '<p class="sdlc-lede">No artifacts yet.</p>';
  return `<ol class="activity-list">${top.map((a) => {
    const when = a.updated ? humanRelative(a.updated) : a.type;
    const who  = a.who || a.type;
    // Decision 6 (2026-06-04): render an editorial "{who} updated {file}"
    // sentence (hand-off OVR-04) from the author + file already in hand — no
    // schema change. Falls back to the artifact type when no author is recorded.
    const fileBase = String(a.file).split('/').filter(Boolean).at(-1) ?? a.file;
    const inner = `<span class="when">${escapeHtml(when)}</span>` +
      `<span class="what">${escapeHtml(who)} updated <span class="file"><code>${escapeHtml(fileBase)}</code></span></span>`;
    return a.href
      ? `<li><a class="activity-link" href="${escapeHtml(a.href)}">${inner}</a></li>`
      : `<li>${inner}</li>`;
  }).join('')}</ol>`;
}

// Map a raw slice status to a slice-card tone class, mirroring slice-index's
// sliceState() vocabulary so the slug-overview preview and the slice grid agree.
function sliceTone(status) {
  const s = String(status ?? '').trim().toLowerCase();
  if (['complete', 'completed', 'done', 'shipped'].includes(s)) return 'is-ok';
  if (s === 'blocked') return 'is-bad';
  if (['active', 'in-progress', 'in progress', 'wip', 'review', 'in-review'].includes(s)) return 'is-current';
  return '';
}

// ISO timestamp → "12 min ago". Returns raw text (escaped at call site).
function humanRelative(iso) {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return String(iso);
  const diff = Date.now() - then;
  if (diff < 0) return String(iso);
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const d = Math.round(hr / 24);
  if (d < 30) return `${d} day${d === 1 ? '' : 's'} ago`;
  return `${Math.round(d / 30)} mo ago`;
}

/**
 * Emit a clickable stages grid. Each card links to the canonical phase
 * sub-directory under the slug root (e.g. `plan/`, `slice/`). Stages with
 * zero artifacts render as a non-clickable "not started" placeholder so
 * the user can see the overall shape of progress.
 */
function stagesGrid(current, allArtifacts) {
  const cards = STAGES.map((stage) => {
    const cfg = STAGE_NAV[stage];
    const count = (cfg.types ?? [stage]).reduce(
      (n, t) => n + ((allArtifacts?.[t] ?? []).length),
      0,
    );
    const isCurrent = stage === current;
    const present = count > 0;
    const cls = ['slice-card'];
    if (isCurrent) cls.push('is-current');
    if (!present) cls.push('is-missing');
    const inner = `<span class="slice-slug"><code>${escapeHtml(stage)}</code></span>
      ${present
        ? `<span class="meta">${count} artifact${count === 1 ? '' : 's'}</span>`
        : '<span class="meta">not started</span>'}`;
    if (!present) {
      return `<div class="${cls.join(' ')}">${inner}</div>`;
    }
    return `<a class="${cls.join(' ')}" href="${escapeHtml(pageHref(cfg.dir))}">${inner}</a>`;
  }).join('');
  return `<section class="slug-stages">
    <h2 class="sdlc-h2">stages</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}

/**
 * If the slug has slices, surface them inline so the slug page links into
 * each one (in addition to the `slice/` phase card above). Without this
 * the only path into a slice from the slug overview is one extra hop
 * through the slice-index.
 */
function slicesPreview(allArtifacts) {
  const slices = allArtifacts?.slice ?? [];
  if (!slices.length) return '';
  const cards = slices.map((s) => {
    const fm = s.frontmatter ?? {};
    const slug = fm['slice-slug'] ?? fm.slug ?? '';
    // Route through the same status→state vocabulary the slice-index cards use,
    // so 'done'/'shipped'/'wip'/etc. get the right tone (not a blank card).
    const tone = sliceTone(fm.status);
    return `<a class="slice-card ${tone}" href="${escapeHtml(pageHref(`slice/${slug}`))}">
      <span class="slice-slug"><code>${escapeHtml(slug)}</code></span>
      <span class="slice-title">${escapeHtml(fm.title ?? '')}</span>
      <span class="slice-status">${statusBadge(fm.status)}</span>
    </a>`;
  }).join('');
  return `<section class="slug-slices">
    <h2 class="sdlc-h2">slices · ${slices.length}</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}

/**
 * Surface per-slice plans inline, mirroring slicesPreview, so a specific slice's
 * plan is one click from the slug overview — at parity with slices. Without
 * this the only path into a per-slice plan is slug → plan/ → grid (one hop
 * deeper than slices). Links resolve to `plan/<slice>/INDEX.html` (the rendered
 * per-slice plan page), NOT the raw `04-plan-<slice>.md` source.
 */
function plansPreview(allArtifacts) {
  const plans = (allArtifacts?.plan ?? []).filter((p) => (p.frontmatter?.['slice-slug'] ?? p.frontmatter?.slug));
  if (!plans.length) return '';
  const cards = plans.map((p) => {
    const fm = p.frontmatter ?? {};
    const slug = fm['slice-slug'] ?? fm.slug ?? '';
    const tone = sliceTone(fm.status);
    return `<a class="slice-card ${tone}" href="${escapeHtml(pageHref(`plan/${slug}`))}">
      <span class="slice-slug"><code>${escapeHtml(slug)}</code></span>
      <span class="slice-title">${escapeHtml(fm.title ?? '')}</span>
      <span class="slice-status">${statusBadge(fm.status)}</span>
    </a>`;
  }).join('');
  return `<section class="slug-plans">
    <h2 class="sdlc-h2">slice plans · ${plans.length}</h2>
    <div class="slice-grid">${cards}</div>
  </section>`;
}
