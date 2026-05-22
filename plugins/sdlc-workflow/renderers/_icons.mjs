// renderers/_icons.mjs
// Inline-SVG icon helpers. The shared design system pairs every severity colour
// with a deuteranope-safe glyph; this helper centralises the glyph + colour
// mapping. Renderers and the shell consume these for status chips, severity
// chips, and verdict glyphs.

export const SEVERITY_GLYPH = {
  blocker: '●',
  high:    '▲',
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
  const glyph = SEVERITY_GLYPH[level] ?? '?';
  return `<span class="sev severity-${level}" aria-label="${level}"><span class="sev-glyph" aria-hidden="true">${glyph}</span>${label ?? level}</span>`;
}

/** Verdict block — `.verdict.verdict-X` with label + summary. */
export function verdictBlock(kind, label, summary) {
  const glyph = VERDICT_GLYPH[kind] ?? '◐';
  return `<section class="verdict verdict-${kind}">
    <div class="v-glyph" aria-hidden="true">${glyph}</div>
    <div class="v-text">
      <div class="v-label">${escape(label ?? kind)}</div>
      ${summary ? `<p class="v-sum">${escape(summary)}</p>` : ''}
    </div>
  </section>`;
}

/** Callout — `.callout.callout-X` with header + body. */
export function callout(kind, title, body) {
  return `<aside class="callout callout-${kind}">
    <div class="callout-hd">${escape(title ?? '')}</div>
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
    ? `<code class="finding-ref">${escape(file)}${line != null ? `:${escape(line)}` : ''}</code>`
    : '';
  const actionChip = action
    ? `<span class="finding-action is-${escape(action)}">${escape(action)}</span>`
    : '';
  const fixCallout = fix ? callout('info', 'suggested fix', `<p>${escape(fix)}</p>`) : '';

  const liClass = `finding${variant ? ' ' + escape(variant) : ''}`;
  const dataAttrHtml = dataAttr
    ? ` data-${escape(dataAttr.name)}="${escape(dataAttr.value)}"`
    : '';

  return `<li class="${liClass}"${dataAttrHtml} id="${escape(id)}">
    <div class="finding-head">${chip}${ref}${actionChip}</div>
    <p class="finding-msg">${escape(msg)}</p>
    ${fixCallout}
  </li>`;
}

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
