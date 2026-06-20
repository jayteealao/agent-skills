import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

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
  return `<section class="verdict verdict-${escape(kind)}">
    <div class="v-label">Verdict</div>
    <div class="v-text">${escape(label ?? kind)}</div>
    ${summary ? `<p class="v-sum">${escape(summary)}</p>` : ""}
  </section>`;
}
function callout(kind, title, body) {
  return `<aside class="callout callout-${kind}">
    <div class="callout-hd">${escape(title ?? "")}</div>
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
  const ref = file ? `<code class="finding-ref">${escape(file)}${line != null ? `:${escape(line)}` : ""}</code>` : "";
  const actionChip = action ? `<span class="finding-action is-${escape(action)}">${escape(action)}</span>` : "";
  const fixCallout = fix ? callout("info", "suggested fix", `<p>${escape(fix)}</p>`) : "";
  const liClass = `finding${variant ? " " + escape(variant) : ""}`;
  const dataAttrHtml = dataAttr ? ` data-${escape(dataAttr.name)}="${escape(dataAttr.value)}"` : "";
  return `<li class="${liClass}"${dataAttrHtml} id="${escape(id)}">
    <div class="finding-head">${chip}${ref}${actionChip}</div>
    <p class="finding-msg">${escape(msg)}</p>
    ${fixCallout}
  </li>`;
}
function escape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

export {
  severityChip,
  verdictBlock,
  callout,
  findingListItem
};
