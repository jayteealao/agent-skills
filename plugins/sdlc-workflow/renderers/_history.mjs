// renderers/_history.mjs
// Surface prior revisions of an artifact. The additive-write contract snapshots
// rewrites to <slug>/history/<basename>-<rev>.md before overwriting. This
// helper loads those snapshots so renderers can offer a `<details class="history">`
// block listing prior revs.

import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { splitFrontmatter } from './_yaml.mjs';

/**
 * Load all history snapshots for an artifact. The history/ folder lives next
 * to the slug root (or next to the slice folder for per-slice files).
 *
 * @param {string} mdAbs — absolute path of the current artifact .md
 * @returns {Array<{ rev, snapshotPath, snapshotBody, snapshotFrontmatter, mtime }>}
 */
export function loadHistory(mdAbs) {
  const file = basename(mdAbs, '.md');
  // Candidate history directories: same dir + sibling/history, and parent + parent/history
  const candidates = [
    join(dirname(mdAbs), 'history'),
    join(dirname(dirname(mdAbs)), 'history'),
  ];

  const found = [];
  for (const dir of candidates) {
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch { continue; }
    for (const entry of entries) {
      const m = entry.match(/^(.+)-(\d+)\.md$/);
      if (!m) continue;
      const [, stem, rev] = m;
      if (stem !== file) continue;
      const abs = join(dir, entry);
      const text = readFileSync(abs, 'utf-8');
      const { frontmatter, body } = splitFrontmatter(text);
      const mtime = statSync(abs).mtimeMs;
      found.push({
        rev: Number(rev),
        snapshotPath: abs,
        snapshotBody: body,
        snapshotFrontmatter: frontmatter,
        mtime,
      });
    }
  }
  found.sort((a, b) => b.rev - a.rev);
  return found;
}

/**
 * Render the collapsible prior-revisions block. Each entry links to the
 * artifact's history view path (e.g., plan/<slice>/history/2/INDEX.html).
 */
export function renderHistoryBlock(history) {
  if (!history?.length) return '';
  const items = history.map((h) => {
    const when = h.snapshotFrontmatter?.['updated-at'] ?? new Date(h.mtime).toISOString().slice(0, 16).replace('T', ' ');
    return `<li><a href="history/${h.rev}/">Rev ${h.rev} — ${escape(when)}</a></li>`;
  }).join('');
  return `<details class="history revisions">
    <summary>${history.length} prior revision${history.length === 1 ? '' : 's'}</summary>
    <ol>${items}</ol>
  </details>`;
}

function escape(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
