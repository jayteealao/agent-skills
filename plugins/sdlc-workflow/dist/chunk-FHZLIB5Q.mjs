import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  escapeHtml
} from "./chunk-3RXHOXIK.mjs";

// renderers/_boards.mjs
function boardsGallery(db) {
  const boards = Array.isArray(db?.boards) ? db.boards : [];
  if (!boards.length) return "";
  const meta = [
    `revision ${escapeHtml(db.revision)}`,
    db.confirmedBy && `confirmed ${escapeHtml(db.confirmedBy)}${db.confirmedAt ? ` ${escapeHtml(db.confirmedAt)}` : ""}`,
    db.canvas && /^https?:\/\//i.test(db.canvas) && `<a href="${escapeHtml(db.canvas)}">canvas mirror${db.canvasVersion ? ` v${escapeHtml(db.canvasVersion)}` : ""}</a>`
  ].filter(Boolean).join(" \xB7 ");
  const figures = boards.map((b) => `<figure style="margin:0;border:1px solid var(--rule,#ddd);border-radius:6px;overflow:hidden">
      <a href="boards/${escapeHtml(b.file)}"><img src="boards/${escapeHtml(b.file)}" alt="${escapeHtml(b.caption)}" loading="lazy" style="display:block;width:100%;height:auto"></a>
      <figcaption style="padding:6px 10px"><b>${escapeHtml(b.caption)}</b><br><code>${escapeHtml(b.key)}</code></figcaption>
    </figure>`).join("");
  return `<section class="design-boards">
    <h2 class="sdlc-h2">confirmed boards</h2>
    <p class="muted">${meta}</p>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:12px">${figures}</div>
  </section>`;
}

export {
  boardsGallery
};
