// renderers/_boards.mjs — the confirmed design boards on a page (DESIGN-BOARDS-PLAN W7).
// Shared by the contract renderer (design-contract.mjs) and the four-part page
// composer (_page.mjs). Path-agnostic: the render engine copies each PNG beside
// the page and passes the list in.

import { escapeHtml } from './_validator.mjs';

/**
 * The confirmed boards as a gallery. `db` comes from the render engine:
 * `{ revision, canvas, canvasVersion, confirmedBy, confirmedAt, boards: [{ key, surface, state, viewport, caption, file }] }`.
 * Each image is a copy beside the page (`boards/<key>.png`), which the hub CSP allows.
 */
export function boardsGallery(db) {
  const boards = Array.isArray(db?.boards) ? db.boards : [];
  if (!boards.length) return '';
  const meta = [
    `revision ${escapeHtml(db.revision)}`,
    db.confirmedBy && `confirmed ${escapeHtml(db.confirmedBy)}${db.confirmedAt ? ` ${escapeHtml(db.confirmedAt)}` : ''}`,
    db.canvas && /^https?:\/\//i.test(db.canvas) && `<a href="${escapeHtml(db.canvas)}">canvas mirror${db.canvasVersion ? ` v${escapeHtml(db.canvasVersion)}` : ''}</a>`,
  ].filter(Boolean).join(' · ');
  const figures = boards.map((b) => `<figure style="margin:0;border:1px solid var(--rule,#ddd);border-radius:6px;overflow:hidden">
      <a href="boards/${escapeHtml(b.file)}"><img src="boards/${escapeHtml(b.file)}" alt="${escapeHtml(b.caption)}" loading="lazy" style="display:block;width:100%;height:auto"></a>
      <figcaption style="padding:6px 10px"><b>${escapeHtml(b.caption)}</b><br><code>${escapeHtml(b.key)}</code></figcaption>
    </figure>`).join('');
  return `<section class="design-boards">
    <h2 class="sdlc-h2">confirmed boards</h2>
    <p class="muted">${meta}</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:12px">${figures}</div>
  </section>`;
}
