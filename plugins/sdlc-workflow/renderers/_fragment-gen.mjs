// renderers/_fragment-gen.mjs — build the typed `<stem>.html.fragment` from its
// sibling `<stem>.yaml` (R7, W5).
//
// Before W5 every rich-tier agent authored the typed fragment by hand. This
// module builds it from the YAML instead, so agents write only the `.yaml`
// (the hook that blocks a missing `.yaml` stays: the generator depends on it).
//
// Freshness rule (see shouldGenerateFragment): the orchestrator uses the
// generated fragment when the `.yaml` exists and the typed fragment is absent
// or OLDER than the `.yaml`. An agent-authored fragment that is as new as the
// `.yaml` (or newer) still wins, so every existing fragment keeps working.
//
// The generated fragment is built in memory at render time and never written to
// workflow storage. Output is deterministic: the same YAML gives the same bytes
// (no clock, no random ids, key order = YAML order).

import { escapeHtml } from './_validator.mjs';

/**
 * The rich-tier types — keep in step with RICH_TIER_TYPES in
 * hooks/post-write-verify.mjs (a unit test compares the two lists).
 */
export const RICH_TIER_TYPES = Object.freeze([
  'review', 'plan', 'design', 'ship-run', 'rca',
  'benchmark', 'experiment', 'instrument', 'profile', 'simplify-run',
  'review-command', 'design-audit', 'design-critique',
  'design-contract',
]);

// Frontmatter type → the `fragment-<name>` section name verify-fragment allows.
const FRAGMENT_NAME = {
  'review-command': 'review-dimension',
};

/** The `<section class="fragment-<name>">` name for a rich-tier type. */
export function fragmentNameFor(type) {
  return FRAGMENT_NAME[type] ?? type;
}

/**
 * True when the renderer must build the typed fragment from the `.yaml`:
 * the `.yaml` exists and the fragment is absent or older than the `.yaml`.
 * Mtimes are epoch milliseconds; `null`/`undefined` means "file absent".
 */
export function shouldGenerateFragment({ type, yamlMtimeMs, fragmentMtimeMs }) {
  if (!RICH_TIER_TYPES.includes(type)) return false;
  if (yamlMtimeMs == null) return false;
  if (fragmentMtimeMs == null) return true;
  return fragmentMtimeMs < yamlMtimeMs;
}

const SEVERITY_ORDER = ['blocker', 'high', 'med', 'medium', 'low', 'nit', 'info'];
const CLOSED_STATUS = new Set(['fixed', 'resolved', 'closed', 'dismissed', 'wontfix', "won't-fix", 'accepted', 'done']);

/**
 * Build the typed fragment HTML for one artifact.
 *
 * @param {object} p
 * @param {string} p.type         frontmatter type (a RICH_TIER_TYPES member)
 * @param {object} p.siblingYaml  parsed sibling YAML
 * @param {string} [p.artifact]   artifact stem for the ready event
 * @returns {string} one `<section class="fragment-<name>" data-generated="yaml">`
 */
export function generateTypedFragment({ type, siblingYaml, artifact = '' }) {
  const name = fragmentNameFor(type);
  const sy = siblingYaml && typeof siblingYaml === 'object' ? siblingYaml : {};
  const parts = [];
  const findings = Array.isArray(sy.findings) ? sy.findings : null;
  // The review page leaves the finding list to the fragment (review.mjs), so
  // the generated fragment carries it. Renderers that draw a static copy of a
  // section when no fragment exists (plan, review-dimension, design-*) keep it
  // when the fragment is generated (`artifact.fragmentGenerated`), so the
  // generator adds only the collapsed data view for them.
  if (type === 'review' && findings?.length) {
    parts.push(findingsList(findings));
  }
  parts.push(dataProjection(sy));
  const detail = {
    generated: true,
    keys: Object.keys(sy).length,
    ...(findings ? { findings: findings.length } : {}),
  };
  return [
    `<section class="fragment-${escapeHtml(name)}" data-generated="yaml">`,
    ...parts.filter(Boolean),
    // Inline dispatch (the fragment-ready snippet shape), so the generated
    // fragment also passes verify-fragment Check 4 if someone writes it out.
    `<script>window.dispatchEvent(new CustomEvent('sdlc:fragment-ready', { detail: ${jsonForScript({ ...detail, name, artifact })} }));</script>`,
    '</section>',
  ].join('\n');
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function isOpen(f) {
  const s = String(f?.status ?? 'open').toLowerCase();
  return !CLOSED_STATUS.has(s);
}

function sevRank(s) {
  const i = SEVERITY_ORDER.indexOf(String(s ?? '').toLowerCase());
  return i === -1 ? SEVERITY_ORDER.length : i;
}

/** Finding cards grouped by severity, open findings first. */
export function findingsList(findings) {
  const rows = findings
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (Number(isOpen(b.f)) - Number(isOpen(a.f)))
      || (sevRank(a.f?.severity) - sevRank(b.f?.severity))
      || (a.i - b.i));
  const items = rows.map(({ f }) => {
    if (!f || typeof f !== 'object') return `<li>${escapeHtml(String(f))}</li>`;
    const sev = String(f.severity ?? '').toLowerCase();
    const sevClass = sev === 'medium' ? 'med' : sev;
    const chip = sev ? `<span class="sev severity-${escapeHtml(sevClass)}">${escapeHtml(sev)}</span> ` : '';
    const id = f.id ? `<code>${escapeHtml(f.id)}</code> ` : '';
    const title = escapeHtml(f.title ?? f.summary ?? f.finding ?? '');
    const where = f.file ?? f.location ?? f.path;
    const loc = where ? ` <span class="meta"><code>${escapeHtml(where)}${f.line != null ? `:${escapeHtml(f.line)}` : ''}</code></span>` : '';
    const status = f.status ? ` <span class="meta">${escapeHtml(f.status)}</span>` : '';
    return `<li class="${isOpen(f) ? 'is-open' : 'is-closed'}">${chip}${id}${title}${loc}${status}</li>`;
  }).join('');
  const open = findings.filter(isOpen).length;
  return `<section class="gen-findings"><h3 class="sdlc-h3">Findings · ${open} open of ${findings.length}</h3><ul class="gen-findings-list">${items}</ul></section>`;
}

/**
 * A readable, collapsed projection of the whole YAML: scalars as a definition
 * list, arrays of objects as tables (columns in first-seen key order), arrays
 * of scalars as lists. Deterministic.
 */
export function dataProjection(sy) {
  const keys = Object.keys(sy ?? {});
  if (!keys.length) return '';
  return `<details class="gen-data"><summary>Structured data · ${keys.length} key${keys.length === 1 ? '' : 's'}</summary>${projectValue(sy, 0)}</details>`;
}

function projectValue(v, depth) {
  if (v == null) return '<span class="meta">—</span>';
  if (v instanceof Date) return escapeHtml(v.toISOString());
  if (Array.isArray(v)) {
    if (!v.length) return '<span class="meta">none</span>';
    if (v.every((x) => x && typeof x === 'object' && !Array.isArray(x)) && depth < 4) return objectTable(v, depth);
    return `<ul>${v.map((x) => `<li>${projectValue(x, depth + 1)}</li>`).join('')}</ul>`;
  }
  if (typeof v === 'object') {
    if (depth >= 4) return `<code>${escapeHtml(JSON.stringify(v))}</code>`;
    const rows = Object.entries(v)
      .map(([k, x]) => `<div><dt>${escapeHtml(k)}</dt><dd>${projectValue(x, depth + 1)}</dd></div>`)
      .join('');
    return `<dl class="frontmatter-card">${rows}</dl>`;
  }
  return escapeHtml(String(v));
}

function objectTable(list, depth) {
  const cols = [];
  for (const row of list) for (const k of Object.keys(row)) if (!cols.includes(k)) cols.push(k);
  const head = cols.map((c) => `<th>${escapeHtml(c)}</th>`).join('');
  const body = list.map((row) => `<tr>${cols.map((c) => `<td>${row[c] === undefined ? '' : projectValue(row[c], depth + 1)}</td>`).join('')}</tr>`).join('');
  return `<table class="prose-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
