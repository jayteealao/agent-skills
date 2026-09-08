import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  escapeHtml
} from "./chunk-3RXHOXIK.mjs";

// renderers/_icons.mjs
var SEVERITY_GLYPH = {
  blocker: "\u25CF",
  high: "\u25B2",
  medium: "\u25C6",
  med: "\u25C6",
  low: "\u2014",
  nit: "\xB7"
};
function severityChip(level, label) {
  const cssLevel = level === "medium" ? "med" : level;
  const glyph = SEVERITY_GLYPH[level] ?? SEVERITY_GLYPH[cssLevel] ?? "?";
  return `<span class="sev severity-${cssLevel}" aria-label="${level}"><span class="sev-glyph" aria-hidden="true">${glyph}</span>${label ?? level}</span>`;
}
function verdictBlock(kind, label, summary) {
  return `<section class="verdict verdict-${escapeHtml(kind)}">
    <div class="v-label">Verdict</div>
    <div class="v-text">${escapeHtml(label ?? kind)}</div>
    ${summary ? `<p class="v-sum">${escapeHtml(summary)}</p>` : ""}
  </section>`;
}
function callout(kind, title, body) {
  return `<aside class="callout callout-${kind}">
    <div class="callout-hd">${escapeHtml(title ?? "")}</div>
    <div class="callout-body">${body ?? ""}</div>
  </aside>`;
}
function findingListItem(params) {
  const {
    chip = "",
    file,
    line,
    action,
    msg = "",
    fix = "",
    id = "",
    variant = "",
    dataAttr
  } = params;
  const ref = file ? `<code class="finding-ref">${escapeHtml(file)}${line != null ? `:${escapeHtml(line)}` : ""}</code>` : "";
  const actionChip = action ? `<span class="finding-action is-${escapeHtml(action)}">${escapeHtml(action)}</span>` : "";
  const fixCallout = fix ? callout("info", "suggested fix", `<p>${escapeHtml(fix)}</p>`) : "";
  const liClass = `finding${variant ? " " + escapeHtml(variant) : ""}`;
  const dataAttrHtml = dataAttr ? ` data-${escapeHtml(dataAttr.name)}="${escapeHtml(dataAttr.value)}"` : "";
  return `<li class="${liClass}"${dataAttrHtml} id="${escapeHtml(id)}">
    <div class="finding-head">${chip}${ref}${actionChip}</div>
    <p class="finding-msg">${escapeHtml(msg)}</p>
    ${fixCallout}
  </li>`;
}
function normalizeVerdict(verdict) {
  if (verdict === "pass") return "ship";
  if (verdict === "conditional") return "caveats";
  if (verdict === "fail") return "no";
  return verdict;
}
function countBySeverity(items, keys = ["blocker", "high", "medium", "low", "nit"]) {
  const out = {};
  for (const key of keys) out[key] = 0;
  for (const item of items) {
    if (out[item.severity] != null) out[item.severity]++;
  }
  return out;
}

export {
  severityChip,
  verdictBlock,
  callout,
  findingListItem,
  normalizeVerdict,
  countBySeverity
};
