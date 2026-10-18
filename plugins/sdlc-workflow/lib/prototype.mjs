// lib/prototype.mjs — the pure side of /wf prototype (WF-PROTOTYPE-PLAN).
//
// A prototype is a series of rounds that the person starts. The proof ledger
// (prototype-ledger.json) is its memory; the chat is not. This module holds the
// ledger rules that the JSON schema cannot express (references between ids, the
// worktree path rule, the decide and generalize rules), the commit plan of a
// decide round, and the rolling report builder. scripts/prototype.mjs owns git
// and the disk; this module reads nothing and writes nothing.

import { posix } from 'node:path';

export const LEDGER_FILE = 'prototype-ledger.json';
export const DOC_FILE = '01-prototype.md';
export const REPORT_FILE = 'report.html';
export const SCRATCH_DIR = '.scratch/prototype';
export const ROUND_KINDS = Object.freeze(['research', 'prove', 'compare', 'diagnose', 'decide', 'generalize', 'document', 'talk']);
export const VERDICTS = Object.freeze(['pass', 'mixed', 'fail', 'unresolved']);
// The rolling report must load on a phone over a remote link (plan section 6).
export const MAX_REPORT_BYTES = 1_000_000;
// A decide commit refuses a file this large: model weights and downloads stay out of git.
export const MAX_COMMIT_FILE_BYTES = 10 * 1024 * 1024;

export const branchFor = (slug) => `poc/${slug}`;

const IMAGE_TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const VIDEO_TYPES = new Set(['.mp4', '.webm', '.mov', '.mkv']);

/** The media kind of a path: image (with its MIME type), video, or other. */
export function mediaKind(path) {
  const ext = posix.extname(String(path).toLowerCase());
  if (IMAGE_TYPES[ext]) return { kind: 'image', mime: IMAGE_TYPES[ext] };
  if (VIDEO_TYPES.has(ext)) return { kind: 'video', mime: null };
  return { kind: 'other', mime: null };
}

export function newLedger({ slug, idea, branch, baseBranch, worktree, at }) {
  return {
    schema: 'sdlc/v1',
    artifact: 'prototype-ledger',
    slug,
    idea,
    status: 'open',
    branch,
    'base-branch': baseBranch ?? null,
    worktree,
    report: { file: REPORT_FILE, url: null },
    'created-at': at,
    'updated-at': at,
    rounds: [],
    proofs: [],
    decisions: [],
    pipeline: [],
    rejected: [],
  };
}

/**
 * A path that a proof or a round wrote must be relative to the worktree, and stay in it.
 * Returns null for a good path, else the reason.
 */
export function pathProblem(p) {
  const s = String(p ?? '').replace(/\\/g, '/');
  if (!s.trim()) return 'an empty path';
  if (/^[a-z]:\//i.test(s) || s.startsWith('/') || s.startsWith('~')) return 'an absolute path: every file the loop writes is inside the worktree, written relative to it';
  if (/(^|\/)(temp|tmp)\//i.test(s) && /%temp%|appdata\/local\/temp/i.test(s)) return 'a temp folder: scratch goes to .scratch/prototype/ in the worktree';
  const norm = posix.normalize(s);
  if (norm === '..' || norm.startsWith('../')) return 'outside the worktree';
  return null;
}

export const isScratch = (p) => {
  const norm = posix.normalize(String(p).replace(/\\/g, '/'));
  return norm === '.scratch' || norm.startsWith('.scratch/');
};

const idsOf = (list) => new Set((list ?? []).map((x) => x?.id).filter(Boolean));

/**
 * The ledger rules that the schema cannot express. Each problem names the id
 * and the rule, so the author can repair the ledger while the round is in context.
 */
export function ledgerProblems(ledger) {
  const out = [];
  if (!ledger || typeof ledger !== 'object') return ['the ledger is not a JSON object'];
  const rounds = ledger.rounds ?? [];
  const proofs = ledger.proofs ?? [];
  const decisions = ledger.decisions ?? [];
  for (const [name, list] of [['round', rounds], ['proof', proofs], ['decision', decisions]]) {
    const seen = new Set();
    for (const x of list) {
      if (seen.has(x?.id)) out.push(`${name} ${x.id}: the id is used twice`);
      seen.add(x?.id);
    }
  }
  const roundIds = idsOf(rounds);
  const proofIds = idsOf(proofs);
  const decisionIds = idsOf(decisions);
  const roundOf = new Map(rounds.map((r) => [r.id, r]));
  const proofOf = new Map(proofs.map((p) => [p.id, p]));

  for (const r of rounds) {
    for (const pid of r.proofs ?? []) if (!proofIds.has(pid)) out.push(`round ${r.id}: names proof ${pid}, which is not in proofs`);
    if (r.kind === 'talk' && (r.proofs ?? []).length) out.push(`round ${r.id}: a talk round runs no proof`);
    if (r.kind === 'decide' && !decisions.some((d) => d.round === r.id)) out.push(`round ${r.id}: a decide round records a decision in decisions`);
    for (const f of r.files ?? []) {
      const why = pathProblem(f);
      if (why) out.push(`round ${r.id}: file ${f} is ${why}`);
    }
  }
  for (const p of proofs) {
    if (!roundIds.has(p.round)) out.push(`proof ${p.id}: names round ${p.round}, which is not in rounds`);
    for (const f of [...(p.files ?? []), ...(p.media ?? [])]) {
      const why = pathProblem(f);
      if (why) out.push(`proof ${p.id}: file ${f} is ${why}`);
    }
  }
  for (const d of decisions) {
    const r = roundOf.get(d.round);
    if (!r) out.push(`decision ${d.id}: names round ${d.round}, which is not in rounds`);
    else if (r.kind !== 'decide') out.push(`decision ${d.id}: only a decide round accepts a component (round ${d.round} is ${r.kind})`);
    for (const pid of d.proofs ?? []) if (!proofIds.has(pid)) out.push(`decision ${d.id}: names proof ${pid}, which is not in proofs`);
    if (d.generalized === true) {
      const g = proofOf.get(d['generalize-proof']);
      if (!g) out.push(`decision ${d.id}: generalized: true names no generalize proof`);
      else if (roundOf.get(g.round)?.kind !== 'generalize') out.push(`decision ${d.id}: proof ${g.id} is not from a generalize round`);
      else if (g.verdict !== 'pass') out.push(`decision ${d.id}: generalize proof ${g.id} has verdict ${g.verdict}, not pass`);
    }
  }
  for (const s of ledger.pipeline ?? []) {
    if (!decisionIds.has(s.decision)) out.push(`pipeline stage ${s.stage}: names decision ${s.decision}, which is not in decisions`);
  }
  for (const x of ledger.rejected ?? []) {
    for (const pid of x.proofs ?? []) if (!proofIds.has(pid)) out.push(`rejected path ${x.path}: names proof ${pid}, which is not in proofs`);
  }
  return out;
}

/** The proofs that no decision accepted and no rejected path closed, with an open verdict. */
export function openProofs(ledger) {
  const closed = new Set([
    ...(ledger.decisions ?? []).flatMap((d) => d.proofs ?? []),
    ...(ledger.rejected ?? []).flatMap((x) => x.proofs ?? []),
  ]);
  return (ledger.proofs ?? []).filter((p) => !closed.has(p.id) && (p.verdict === 'unresolved' || p.verdict === 'mixed'));
}

/**
 * The explicit paths a decide round commits: the files of the decision's proofs and
 * of its round, then the prototype's own records. Scratch never enters a commit.
 * `wfRel` is the workflow folder relative to the worktree (posix).
 */
export function commitPlan(ledger, decisionId, wfRel) {
  const d = (ledger.decisions ?? []).find((x) => x.id === decisionId);
  if (!d) return { error: `no decision ${decisionId} in the ledger` };
  if (d.commit) return { error: `decision ${decisionId} is already committed (${d.commit})` };
  const proofOf = new Map((ledger.proofs ?? []).map((p) => [p.id, p]));
  const round = (ledger.rounds ?? []).find((r) => r.id === d.round);
  const wanted = [
    ...(d.proofs ?? []).flatMap((pid) => proofOf.get(pid)?.files ?? []),
    ...(round?.files ?? []),
  ].map((p) => posix.normalize(String(p).replace(/\\/g, '/')));
  const skipped = wanted.filter((p) => isScratch(p) || pathProblem(p));
  const records = ['00-index.md', LEDGER_FILE, DOC_FILE, REPORT_FILE].map((f) => `${wfRel}/${f}`);
  const paths = [...new Set([...wanted.filter((p) => !skipped.includes(p)), ...records])];
  return {
    decision: d,
    paths,
    skipped: [...new Set(skipped)],
    message: `poc(${ledger.slug}): accept ${d.component}`,
    warning: d.generalized === true ? null : 'the component was accepted without a generalize check (generalized: false)',
  };
}

// ---------------------------------------------------------------- the report

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// A snippet payload rides in an HTML comment: no text may close the comment early.
const safe = (s) => String(s ?? '').replace(/-->/g, '- ->').replace(/<!--/g, '< !--');
const include = (name, data) => `<!-- @include ${name} ${JSON.stringify(data, (k, v) => (typeof v === 'string' ? safe(v) : v))} -->`;

function number(v) {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** A measured value and an estimated value never look the same on the page. */
function quantity(q, { estimated = false } = {}) {
  if (!q) return '';
  const unit = q.unit ? ` ${esc(q.unit)}` : '';
  const est = estimated || q.kind === 'estimated';
  return est
    ? `<span class="est" title="estimated${q.basis ? `: ${esc(q.basis)}` : ''}">≈ ${esc(q.value)}${unit} <small>(estimated)</small></span>`
    : `<span class="meas" title="measured">${esc(q.value)}${unit}</span>`;
}

const CSS = `
:root{--paper:#fbfaf7;--paper-2:#efece5;--ink:#1d1c1a;--ink-2:#45423d;--ink-3:#77726a;--rule:#d9d4ca;--accent:#2f5f8f;--accent-soft:#dde8f2;
--low:#2e7d4f;--low-bg:#dcefe3;--med:#a86b00;--med-bg:#f6ead2;--high:#b23b2e;--high-bg:#f6dcd8;--blocker:#7a1f6d;--blocker-bg:#efd9ec;
--rad-sm:3px;--rad-md:6px;--sans:system-ui,-apple-system,"Segoe UI",sans-serif;--mono:ui-monospace,"Cascadia Mono",Consolas,monospace}
@media (prefers-color-scheme:dark){:root{--paper:#161514;--paper-2:#24221f;--ink:#ecebe7;--ink-2:#c9c6bf;--ink-3:#99948b;--rule:#3a3733;--accent:#7fb0e0;--accent-soft:#1f3346;
--low:#6cc191;--low-bg:#1d3a28;--med:#e0b35a;--med-bg:#3d3018;--high:#ec8a7e;--high-bg:#45201b;--blocker:#d99bd0;--blocker-bg:#3d1f39}}
*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.55 var(--sans)}
main{max-width:860px;margin:0 auto;padding:24px 16px 64px}h1{font-size:26px;margin:0 0 4px}h2{font-size:20px;margin:36px 0 10px;border-bottom:1px solid var(--rule);padding-bottom:4px}
h3{font-size:16px;margin:22px 0 6px}p.lede{color:var(--ink-2);margin:0 0 18px}.say{color:var(--ink-2);margin:14px 0 4px}
table{border-collapse:collapse;width:100%;margin:8px 0;font-size:14.5px}th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--rule);vertical-align:top}
.meas{font-family:var(--mono)}.est{font-family:var(--mono);font-style:italic;color:var(--ink-3);border-bottom:1px dashed var(--ink-3)}
.v{display:inline-block;padding:1px 8px;border-radius:var(--rad-sm);font-size:12.5px;font-weight:600}.v-pass{background:var(--low-bg);color:var(--low)}
.v-mixed{background:var(--med-bg);color:var(--med)}.v-fail{background:var(--high-bg);color:var(--high)}.v-unresolved{background:var(--paper-2);color:var(--ink-3)}
.card{border:1px solid var(--rule);border-radius:var(--rad-md);padding:12px 14px;margin:14px 0;background:var(--paper)}
img{max-width:100%;height:auto;border-radius:var(--rad-sm);border:1px solid var(--rule)}figure.m{margin:10px 0}figure.m figcaption{font-size:12.5px;color:var(--ink-3)}
code{font-family:var(--mono);font-size:13.5px}small{color:var(--ink-3)}
`;

function verdictChip(v) {
  return `<span class="v v-${esc(v)}">${esc(v)}</span>`;
}

function mediaHtml(paths, mediaFor) {
  const out = [];
  for (const p of paths ?? []) {
    const m = mediaFor?.(p);
    const kind = mediaKind(p);
    if (kind.kind === 'image' && m?.dataUri) {
      out.push(`<figure class="m"><img src="${m.dataUri}" alt="${esc(posix.basename(p))}"><figcaption>${esc(p)}</figcaption></figure>`);
    } else if (kind.kind === 'video') {
      out.push(`<p><small>Video: <code>${esc(p)}</code>. A video is not embedded in this page; it goes on its own page or in the artifact's asset store.</small></p>`);
    } else {
      out.push(`<p><small>File: <code>${esc(p)}</code>${m && !m.exists ? ' (missing)' : ''}</small></p>`);
    }
  }
  return out.join('\n');
}

function proofCard(p, mediaFor) {
  const measured = (p.evidence?.measured ?? []).map((q) => `<tr><td>${esc(q.name)}</td><td>${quantity(q)}</td></tr>`);
  const estimated = (p.evidence?.estimated ?? []).map((q) => `<tr><td>${esc(q.name)}</td><td>${quantity(q, { estimated: true })}</td></tr>`);
  const repro = p.repro ? `Same process: <strong>${esc(p.repro['same-process'] ?? 'not-run')}</strong>. Fresh process: <strong>${esc(p.repro['fresh-process'] ?? 'not-run')}</strong>.${p.repro.note ? ` ${esc(p.repro.note)}` : ''}` : 'No repeat check recorded.';
  const licenses = (p.licenses ?? []).map((l) => `${esc(l.item)} (${esc(l.license)})`).join('; ') || 'none recorded';
  const setup = p.setup ? Object.entries(p.setup).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('') : '';
  return `<section class="card" id="${esc(p.id)}">
<h3>${esc(p.id)} · ${esc(p.question)} ${verdictChip(p.verdict)}</h3>
<p><small>Round ${esc(p.round)}</small></p>
${setup ? `<table><caption class="say">The setup of this proof.</caption>${setup}</table>` : ''}
${measured.length || estimated.length ? `<table><caption class="say">The numbers. Measured values are plain; estimated values are italic and marked ≈.</caption><tr><th>Quantity</th><th>Value</th></tr>${measured.join('')}${estimated.join('')}</table>` : ''}
<p>${repro}</p>
<p><small>Licenses: ${licenses}</small></p>
${(p.media ?? []).length ? `<p class="say">The output of this proof.</p>${mediaHtml(p.media, mediaFor)}` : ''}
</section>`;
}

/**
 * Build the rolling report from the ledger. The page has no script and loads no
 * external resource; every image is a data URI from `mediaFor(path)`.
 * `expand(html)` expands the explainer snippet tokens (components/_components.mjs).
 */
export function buildReport(ledger, { expand = (h) => h, mediaFor = () => null, doc = '' } = {}) {
  const decisions = new Map((ledger.decisions ?? []).map((d) => [d.id, d]));
  const rounds = ledger.rounds ?? [];
  const last = rounds[rounds.length - 1] ?? null;
  const proofs = ledger.proofs ?? [];
  const pipeline = ledger.pipeline ?? [];
  const parts = [];

  parts.push(`<h1>${esc(ledger.idea || ledger.slug)}</h1>`);
  parts.push(`<p class="lede">Prototype <code>${esc(ledger.slug)}</code> on branch <code>${esc(ledger.branch)}</code>. ${rounds.length} round(s), ${proofs.length} proof(s), ${pipeline.length} accepted stage(s). Status: ${esc(ledger.status)}.</p>`);

  // 1. The accepted pipeline now.
  parts.push('<h2>The accepted pipeline</h2>');
  if (pipeline.length) {
    parts.push('<p class="say">Read the stages from top to bottom. Each stage is a component that the person accepted in a decide round.</p>');
    parts.push(include('explainer/sequence', {
      title: 'The accepted pipeline',
      steps: pipeline.map((s) => ({ label: `${s.stage}: ${s.component}`, lane: decisions.get(s.decision)?.generalized === true ? 'generalized' : 'not generalized', text: s.settings || '' })),
    }));
    const timed = pipeline.filter((s) => number(s.time?.value) !== null);
    if (timed.length) {
      parts.push('<p class="say">Compare the time of each stage. The longest bar is the stage to work on next.</p>');
      parts.push(include('explainer/comparison', {
        title: 'Time per stage',
        unit: timed[0].time.unit || '',
        bars: timed.map((s) => ({ label: s.stage, value: number(s.time.value), tone: s.time.kind === 'estimated' ? 'muted' : 'accent', note: s.time.kind === 'estimated' ? 'estimated' : 'measured' })),
      }));
    }
    parts.push(`<table><tr><th>Stage</th><th>Component</th><th>Time</th><th>Cost</th><th>Decision</th></tr>${pipeline.map((s) => `<tr><td>${esc(s.stage)}</td><td>${esc(s.component)}</td><td>${quantity(s.time)}</td><td>${quantity(s.cost)}</td><td>${esc(s.decision)}${decisions.get(s.decision)?.generalized === true ? '' : ' <small>(not generalized)</small>'}</td></tr>`).join('')}</table>`);
  } else {
    parts.push('<p>No component is accepted yet. Only a decide round of the person accepts a component.</p>');
  }

  // 2. The latest round.
  parts.push('<h2>The latest round</h2>');
  if (last) {
    const lastProofs = proofs.filter((p) => p.round === last.id);
    parts.push(`<p><strong>${esc(last.id)} · ${esc(last.kind)}</strong>: ${esc(last.question || last.request)}</p>`);
    if (last.request) parts.push(`<p><small>Asked: “${esc(last.request)}”</small></p>`);
    if (last.summary) parts.push(`<p>${esc(last.summary)}</p>`);
    if (lastProofs.length) parts.push(`<p>Verdicts: ${lastProofs.map((p) => `<a href="#${esc(p.id)}">${esc(p.id)}</a> ${verdictChip(p.verdict)}`).join(' · ')}</p>`);
  } else {
    parts.push('<p>No round ran yet.</p>');
  }

  // 3. Every proof, newest first.
  parts.push('<h2>Every proof</h2>');
  if (proofs.length) for (const p of [...proofs].reverse()) parts.push(proofCard(p, mediaFor));
  else parts.push('<p>No proof yet.</p>');

  // 4. The rejected and unresolved paths.
  parts.push('<h2>Rejected and unresolved paths</h2>');
  const rejected = ledger.rejected ?? [];
  const open = openProofs(ledger);
  if (!rejected.length && !open.length) parts.push('<p>None.</p>');
  if (rejected.length) parts.push(`<table><tr><th>Path</th><th>Reason</th><th>Proofs</th></tr>${rejected.map((x) => `<tr><td>${esc(x.path)}</td><td>${esc(x.reason)}</td><td>${(x.proofs ?? []).map(esc).join(', ')}</td></tr>`).join('')}</table>`);
  if (open.length) parts.push(`<p>Unresolved, not promoted: ${open.map((p) => `<a href="#${esc(p.id)}">${esc(p.id)}</a> (${esc(p.question)})`).join('; ')}.</p>`);

  if (doc && doc.trim()) {
    parts.push('<h2>The pipeline in words</h2>');
    parts.push(doc.trim().split(/\r?\n\s*\r?\n/).map((para) => (para.startsWith('#') ? `<h3>${esc(para.replace(/^#+\s*/, ''))}</h3>` : `<p>${esc(para.replace(/\s+/g, ' '))}</p>`)).join('\n'));
  }

  const body = expand(parts.join('\n'));
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(ledger.idea || ledger.slug)} · prototype</title>
<style>${CSS}</style></head>
<body><main>
${body}
</main></body></html>
`;
}

/** The delivery rules of section 6 that a built page can break. */
export function reportProblems(html) {
  const out = [];
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_REPORT_BYTES) out.push(`the page is ${bytes} bytes, over ${MAX_REPORT_BYTES}: make the images smaller, or move video and large media to their own page or the asset store`);
  if (/<script\b/i.test(html)) out.push('the page holds a script: every result must be readable with scripts off');
  if (/\b(?:src|srcset|poster)\s*=\s*["']?(?:https?:)?\/\//i.test(html)) out.push('the page loads an external resource (src): embed the media');
  if (/<link\b[^>]*\bhref\s*=\s*["']?(?:https?:)?\/\//i.test(html) || /@import\s+url\(\s*["']?(?:https?:)?\/\//i.test(html) || /url\(\s*["']?(?:https?:)?\/\//i.test(html)) out.push('the page loads an external resource (stylesheet or url()): embed it');
  if (/@include\s/.test(html)) out.push('the page holds an unexpanded snippet token');
  return { bytes, problems: out };
}
