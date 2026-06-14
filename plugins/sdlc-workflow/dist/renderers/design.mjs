import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "../chunk-WSLT3R6C.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-ULKKJGJ3.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "../chunk-MSJ2NCHW.mjs";
import {
  escapeHtml
} from "../chunk-BTT5W62B.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-KGLQRRIU.mjs";

// renderers/design.mjs
var CATEGORY_ORDER = ["color", "radius", "spacing", "font", "easing", "shadow"];
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  if (!sy) {
    return renderSimple(artifact, ctx, { title: fm.title ?? "Design" });
  }
  const component = sy.component ?? fm.component ?? fm.title ?? "";
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Design \xB7 <code>${escapeHtml(component)}</code>`,
    badges: [
      statusBadge(fm.status),
      stageBadge("design"),
      fm["updated-at"] && `<span class="meta">${escapeHtml(fm["updated-at"])}</span>`
    ]
  });
  const metricsHtml = metricRow([
    sy.themes && { label: "themes", value: sy.themes.length },
    sy.states && { label: "states", value: sy.states.length },
    sy.sizes && { label: "sizes", value: sy.sizes.length },
    sy.tokens && { label: "tokens", value: sy.tokens.length }
  ].filter(Boolean));
  const themesHtml = chipRow("themes", sy.themes);
  const statesHtml = chipRow("states", sy.states);
  const sizesHtml = sizesTable(sy.sizes);
  const tokensDesktop = tokensByCategory(sy.tokens);
  const tokensHtml = tokensDesktop ? `<div class="d-only">${tokensDesktop}</div><div class="m-only"><section class="design-tokens-group"><h2 class="sdlc-h2">tokens</h2>${mobileTokens(sy.tokens)}</section></div>` : "";
  const specsHtml = specsBlock(sy.specs);
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  const bodyContent = `${fragmentBlock}${proseBlock}`;
  return {
    headerHtml,
    bodyHtml: `${metricsHtml}${themesHtml}${statesHtml}${sizesHtml}${tokensHtml}${specsHtml}${bodyContent}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function chipRow(label, values) {
  if (!Array.isArray(values) || !values.length) return "";
  const chips = values.map((v) => `<span class="design-chip"><code>${escapeHtml(v)}</code></span>`).join("");
  return `<section class="design-${escapeHtml(label)}">
    <h2 class="sdlc-h2">${escapeHtml(label)}</h2>
    <div class="design-chip-row">${chips}</div>
   </section>`;
}
function sizesTable(sizes) {
  if (!Array.isArray(sizes) || !sizes.length) return "";
  const headers = ["id", "height", "padx", "pady", "font", "radius"];
  const heads = headers.map((h) => `<th>${h}</th>`).join("");
  const rows = sizes.map((s) => {
    const cells = headers.map((h) => {
      const v = s[h];
      if (v == null) return '<td class="meta">\u2014</td>';
      const tag = h === "id" ? "code" : "span";
      return `<td><${tag}>${escapeHtml(v)}</${tag}></td>`;
    }).join("");
    return `<tr>${cells}</tr>`;
  }).join("");
  return `<section class="design-sizes">
    <h2 class="sdlc-h2">sizes</h2>
    <div class="table-scroll"><table class="sizes-table">
      <thead><tr>${heads}</tr></thead>
      <tbody>${rows}</tbody>
    </table></div>
   </section>`;
}
function mobileTokens(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return "";
  return tokens.map((t) => {
    const sw = (t.category ?? "") === "color" ? `<span class="tsw" style="background:${escapeHtml(t.value ?? "")}" aria-hidden="true"></span>` : "";
    return `<div class="tokrow">${sw}<span class="tnm">${escapeHtml(t.name ?? "")}</span><span class="tvl">${escapeHtml(t.value ?? "")}</span><button class="tcopy" type="button" data-token-copy="${escapeHtml(t.value ?? "")}">copy</button></div>`;
  }).join("");
}
function tokensByCategory(tokens) {
  if (!Array.isArray(tokens) || !tokens.length) return "";
  const groups = /* @__PURE__ */ new Map();
  for (const cat of CATEGORY_ORDER) groups.set(cat, []);
  for (const t of tokens) {
    const cat = t.category ?? "spacing";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat).push(t);
  }
  const sections = [];
  for (const [cat, list] of groups.entries()) {
    if (!list.length) continue;
    const rows = list.map((t) => tokenRow(t, cat)).join("");
    sections.push(`<section class="design-tokens design-tokens-${escapeHtml(cat)}">
      <h3 class="sdlc-h3">${escapeHtml(cat)}</h3>
      <table class="tokens-table">
        <thead><tr><th>name</th><th>value</th><th>note</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
     </section>`);
  }
  return `<section class="design-tokens-group">
    <h2 class="sdlc-h2">tokens</h2>
    ${sections.join("")}
   </section>`;
}
function tokenRow(t, cat) {
  const swatch = cat === "color" ? `<span class="token-swatch" style="background:${escapeHtml(t.value)}" aria-hidden="true"></span>` : "";
  return `<tr>
    <td><code>${escapeHtml(t.name ?? "")}</code></td>
    <td>${swatch}<code>${escapeHtml(t.value ?? "")}</code></td>
    <td class="meta">${escapeHtml(t.note ?? "")}</td>
   </tr>`;
}
function specsBlock(specs) {
  if (!specs || typeof specs !== "object") return "";
  const ref = specs.reference ? `<p class="meta">reference: <code>${escapeHtml(specs.reference)}</code></p>` : "";
  const annots = Array.isArray(specs.annotate) && specs.annotate.length ? `<ul class="design-annotate">${specs.annotate.map((a) => `<li>${escapeHtml(a)}</li>`).join("")}</ul>` : "";
  if (!ref && !annots) return "";
  return `<section class="design-specs">
    <h2 class="sdlc-h2">specs</h2>
    ${ref}
    ${annots}
   </section>`;
}
export {
  render
};
