import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  aggregateCost,
  readCostRows
} from "./chunk-PNDGQNSP.mjs";
import {
  escapeHtml
} from "./chunk-3RXHOXIK.mjs";

// renderers/_cost.mjs
var n = (v) => escapeHtml(Number(v ?? 0).toLocaleString("en-US"));
function costRowsFor(slugRoot) {
  try {
    return readCostRows(slugRoot);
  } catch {
    return [];
  }
}
var HEAD = "<tr><th>key</th><th>turns</th><th>sub-agents</th><th>input</th><th>output</th><th>cache read</th><th>cache write</th><th>external in / out</th></tr>";
function aggRow(label, a, { strong = false } = {}) {
  const cell = (v) => strong ? `<td><b>${n(v)}</b></td>` : `<td>${n(v)}</td>`;
  const ext = a.external ? `${n(a.externalInput)} / ${n(a.externalOutput)} <span class="meta">(${n(a.external)})</span>` : "\u2014";
  return `<tr><td>${strong ? `<b>${escapeHtml(label)}</b>` : `<code>${escapeHtml(label)}</code>`}</td>${cell(a.turns)}${cell(a.subagents)}${cell(a.input)}${cell(a.output)}${cell(a.cacheRead)}${cell(a.cacheWrite)}<td>${ext}</td></tr>`;
}
function costSectionHtml(rows, { title = "cost \xB7 exact tokens" } = {}) {
  if (!rows?.length) return "";
  const agg = aggregateCost(rows);
  const body = Object.entries(agg.byKey).sort(([a], [b]) => a.localeCompare(b)).map(([key, a]) => aggRow(key, a)).join("");
  return `<section class="slug-cost">
    <h2 class="sdlc-h2">${escapeHtml(title)}</h2>
    <table class="cost-table"><thead>${HEAD}</thead><tbody>${body}${aggRow("total", agg.total, { strong: true })}</tbody></table>
    <p class="meta">${n(agg.rows)} row${agg.rows === 1 ? "" : "s"} in <code>cost.jsonl</code> \xB7 every integer copied from the host's own record; nothing estimated or priced.</p>
  </section>`;
}
function costDashboardHtml(slugs) {
  const withCost = (slugs ?? []).filter((s) => s.cost && s.cost.rows > 0);
  if (!withCost.length) return "";
  const total = { turns: 0, subagents: 0, external: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, externalInput: 0, externalOutput: 0 };
  const body = withCost.map((s) => {
    for (const k of Object.keys(total)) total[k] += Number(s.cost.total[k] ?? 0);
    return aggRow(s.slug, s.cost.total);
  }).join("");
  return `<section class="slug-cost dashboard-cost">
    <h2 class="sdlc-h2">cost \xB7 exact tokens</h2>
    <table class="cost-table"><thead>${HEAD.replace("<th>key</th>", "<th>slug</th>")}</thead><tbody>${body}${aggRow("total", total, { strong: true })}</tbody></table>
    <p class="meta">Summed from each slug's <code>cost.jsonl</code>; the slug page breaks the same integers down per key.</p>
  </section>`;
}

export {
  costRowsFor,
  costSectionHtml,
  costDashboardHtml
};
