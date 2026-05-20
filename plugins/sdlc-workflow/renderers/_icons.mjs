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

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
