import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  md2html,
  renderHistoryBlock,
  renderRevisionLedger
} from "./chunk-XV4QYX6S.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "./chunk-SWU6HFSL.mjs";
import {
  escapeHtml
} from "./chunk-4WRIEOIP.mjs";

// renderers/_simple.mjs
function frontmatterCard(fm, keys = null) {
  if (!fm) return "";
  const exclude = /* @__PURE__ */ new Set(["schema", "description", "body"]);
  const showKeys = keys ?? Object.keys(fm).filter((k) => !exclude.has(k));
  const rows = showKeys.filter((k) => fm[k] !== void 0 && fm[k] !== null && fm[k] !== "").map((k) => {
    const v = fm[k];
    const value = Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v);
    return `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  }).join("");
  if (!rows) return "";
  return `<dl class="frontmatter-card">${rows}</dl>`;
}
function renderSimple(artifact, ctx, { title, lede = "", metricFields = [] } = {}) {
  const fm = artifact.frontmatter ?? {};
  const badges = [
    statusBadge(fm.status),
    fm["current-stage"] && stageBadge(fm["current-stage"]),
    fm["stage-number"] != null && `<span class="meta">stage ${escapeHtml(fm["stage-number"])}</span>`,
    fm["revision-count"] && `<span class="meta">rev ${escapeHtml(fm["revision-count"])}</span>`,
    fm["updated-at"] && `<span class="meta">updated ${escapeHtml(fm["updated-at"])}</span>`
  ];
  const metrics = metricFields.map((f) => fm[f.key] != null ? { label: f.label, value: fm[f.key], tone: f.tone, sev: f.sev } : null).filter(Boolean);
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(title ?? fm.title ?? fm.type ?? artifact.path),
    lede,
    badges
  }) + (metrics.length ? metricRow(metrics) : "");
  const fmCard = frontmatterCard(fm);
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const fmCardBlock = artifact.fragment ? "" : fmCard;
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  const ledgerBlock = renderRevisionLedger(fm, artifact.siblingYaml);
  const bodyHtml = `${fragmentBlock}${ledgerBlock}${fmCardBlock}${proseBlock}`;
  return {
    headerHtml,
    bodyHtml: bodyHtml + renderHistoryBlock(artifact.history),
    links: [],
    children: []
  };
}

export {
  frontmatterCard,
  renderSimple
};
