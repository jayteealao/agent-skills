// renderers/_icons.mjs
// Inline-SVG icon helpers. The shared design system pairs every severity colour
// with a deuteranope-safe glyph; this helper centralises the glyph + colour
// mapping. Renderers and the shell consume these for status chips, severity
// chips, and verdict glyphs.

import { escapeHtml } from './_validator.mjs';

export const SEVERITY_GLYPH = {
  blocker: '●',
  high:    '▲',
  medium:  '◆',
  med:     '◆',
  low:     '—',
  nit:     '·',
};

export const VERDICT_GLYPH = {
  ship:     '✓',
  caveats:  '◐',
  no:       '✗',
};

/** Severity chip — `.sev .severity-X` pairing glyph + label. */
export function severityChip(level, label) {
  const cssLevel = level === 'medium' ? 'med' : level;
  const glyph = SEVERITY_GLYPH[level] ?? SEVERITY_GLYPH[cssLevel] ?? '?';
  return `<span class="sev severity-${cssLevel}" aria-label="${level}"><span class="sev-glyph" aria-hidden="true">${glyph}</span>${label ?? level}</span>`;
}

/** Verdict block — `.verdict.verdict-X` with a small eyebrow label, a 30px
 *  serif display line, and an optional summary. The glyph (✓ / ◐ / ✗) is
 *  injected by CSS via `.v-text::before`, keyed off `.verdict-X`, so the markup
 *  stays semantic (D6.9 / D1.8). VERDICT_GLYPH stays exported for the snippet
 *  template + external consumers that still want the codepoint. */
export function verdictBlock(kind, label, summary) {
  return `<section class="verdict verdict-${escapeHtml(kind)}">
    <div class="v-label">Verdict</div>
    <div class="v-text">${escapeHtml(label ?? kind)}</div>
    ${summary ? `<p class="v-sum">${escapeHtml(summary)}</p>` : ''}
  </section>`;
}

/** Callout — `.callout.callout-X` with header + body. */
export function callout(kind, title, body) {
  return `<aside class="callout callout-${kind}">
    <div class="callout-hd">${escapeHtml(title ?? '')}</div>
    <div class="callout-body">${body ?? ''}</div>
  </aside>`;
}

/**
 * Shared `<li class="finding">` shape consumed by review-command.mjs and
 * simplify-run.mjs (Phase 4, v9.23.0 — closes audit S3.3). Earlier each
 * renderer hand-rolled an identical `<li>` outer + finding-head row + msg
 * paragraph + suggested-fix callout, differing only in the chip and the
 * data-attribute keying. This helper centralises the markup.
 *
 * @param {object} params
 * @param {string} params.chip — pre-rendered chip HTML (severity or category)
 * @param {string} [params.file] — source file path
 * @param {string|number|null} [params.line] — source line
 * @param {string} [params.action] — accept | defer | reject | skip
 * @param {string} [params.msg] — finding message (plain text — escaped here)
 * @param {string} [params.fix] — suggested fix (plain text — escaped here)
 * @param {string} [params.id] — DOM id for the <li>
 * @param {string} [params.variant] — extra class on the outer <li>, e.g. "finding-compact"
 * @param {{name:string,value:string}} [params.dataAttr] — { name: 'severity'|'category', value }
 */
export function findingListItem(params) {
  const {
    chip = '', file, line, action,
    msg = '', fix = '', id = '',
    variant = '', dataAttr,
  } = params;

  const ref = file
    ? `<code class="finding-ref">${escapeHtml(file)}${line != null ? `:${escapeHtml(line)}` : ''}</code>`
    : '';
  const actionChip = action
    ? `<span class="finding-action is-${escapeHtml(action)}">${escapeHtml(action)}</span>`
    : '';
  const fixCallout = fix ? callout('info', 'suggested fix', `<p>${escapeHtml(fix)}</p>`) : '';

  const liClass = `finding${variant ? ' ' + escapeHtml(variant) : ''}`;
  const dataAttrHtml = dataAttr
    ? ` data-${escapeHtml(dataAttr.name)}="${escapeHtml(dataAttr.value)}"`
    : '';

  return `<li class="${liClass}"${dataAttrHtml} id="${escapeHtml(id)}">
    <div class="finding-head">${chip}${ref}${actionChip}</div>
    <p class="finding-msg">${escapeHtml(msg)}</p>
    ${fixCallout}
  </li>`;
}

// Sibling-YAML verdict vocabulary (pass / conditional / fail) → the verdict
// glyph vocabulary verdictBlock reads (ship / caveats / no). Any other value
// passes through unchanged.
export function normalizeVerdict(verdict) {
  if (verdict === 'pass') return 'ship';
  if (verdict === 'conditional') return 'caveats';
  if (verdict === 'fail') return 'no';
  return verdict;
}

// Count items per severity key, in key order. A severity outside `keys` is
// not counted. The default key set is the design-critique vocabulary; the
// design-audit renderer passes its four-key set.
export function countBySeverity(items, keys = ['blocker', 'high', 'medium', 'low', 'nit']) {
  const out = {};
  for (const key of keys) out[key] = 0;
  for (const item of items) {
    if (out[item.severity] != null) out[item.severity]++;
  }
  return out;
}
