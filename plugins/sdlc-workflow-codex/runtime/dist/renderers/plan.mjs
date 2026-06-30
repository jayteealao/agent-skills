import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  callout
} from "../chunk-EG7S7OJR.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-PU6XVNUZ.mjs";
import {
  figureCanvas
} from "../chunk-PDBKNARE.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "../chunk-BFWZBB4T.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/plan.mjs
function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? null;
  const sliceSlug = fm["slice-slug"] ?? "";
  const planTitle = fm.title ? escapeHtml(fm.title) : `Plan \xB7 <code>${escapeHtml(sliceSlug)}</code>`;
  const planLede = fm.summary ?? fm.lede ?? (sliceSlug && fm.title ? `Plan \xB7 ${sliceSlug}` : "");
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: planTitle,
    lede: planLede ? escapeHtml(planLede) : "",
    badges: [
      statusBadge(fm.status),
      stageBadge("plan"),
      fm["revision-count"] != null && `<span class="meta">rev ${escapeHtml(fm["revision-count"])}</span>`,
      fm["updated-at"] && `<span class="meta">${escapeHtml(fm["updated-at"])}</span>`
    ]
  }) + metricRow([
    fm["metric-files-to-touch"] != null && { label: "files to touch", value: fm["metric-files-to-touch"] },
    fm["metric-step-count"] != null && { label: "steps", value: fm["metric-step-count"] },
    { label: "blockers", value: fm["has-blockers"] ? "yes" : "none", tone: fm["has-blockers"] ? "warn" : "ok" }
  ].filter(Boolean));
  const PLAN_LEGEND = [
    { state: "modified", label: "modified" },
    { state: "new", label: "new" },
    { state: "deleted", label: "deleted" },
    { state: "external", label: "external" }
  ];
  let figureHtml = "";
  try {
    if (sy?.files?.length) {
      const dataFlow = hasDataFlowLanes(sy);
      figureHtml = dataFlow ? figureCanvas({ figureNumber: 3, title: "Data-flow lanes", svgInner: dataFlowLaneSvg(sy), legend: PLAN_LEGEND }) + dataFlowLegendExtra() : figureCanvas({ figureNumber: 3, title: "File-change topology", svgInner: fileTopologySvg(sy), legend: PLAN_LEGEND });
    } else {
      figureHtml = figureCanvas({ figureNumber: 3, title: "File-change topology", svgInner: placeholderTopologySvg(), legend: PLAN_LEGEND });
    }
  } catch {
    figureHtml = figureCanvas({ figureNumber: 3, title: "File-change topology", svgInner: placeholderTopologySvg(), legend: PLAN_LEGEND });
  }
  const structured = artifact.fragment ? "" : structuredSections(fm, sy);
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  const bodyHtml = `${figureHtml}${structured}${fragmentBlock}${proseBlock}`;
  return {
    headerHtml,
    bodyHtml: bodyHtml + renderHistoryBlock(artifact.history),
    links: [],
    children: []
  };
}
function normalizeModule(m) {
  if (typeof m === "string") return { key: m, label: m };
  if (m && typeof m === "object") {
    const key = m.id ?? m.key ?? m.name ?? m.label ?? "";
    return { key: String(key), label: String(m.label ?? m.name ?? key) };
  }
  return { key: String(m ?? ""), label: String(m ?? "") };
}
var CHANGE_TYPES = /* @__PURE__ */ new Set(["new", "modified", "deleted", "external"]);
function changeRole(f) {
  if (CHANGE_TYPES.has(f?.status)) return f.status;
  if (CHANGE_TYPES.has(f?.role)) return f.role;
  return "modified";
}
function fileTopologySvg(sy) {
  const modules = (sy.modules ?? []).map(normalizeModule);
  const files = sy.files ?? [];
  const edges = sy.edges ?? [];
  const W = 980;
  const moduleByFile = /* @__PURE__ */ new Map();
  const buckets = /* @__PURE__ */ new Map();
  for (const m of modules) buckets.set(m.key, { label: m.label, files: [] });
  for (const f of files) {
    const key = f.module != null && f.module !== "" ? String(f.module) : modules.find((m) => typeof f.path === "string" && f.path.startsWith(m.key))?.key ?? modules[0]?.key ?? "";
    moduleByFile.set(f.path, key);
    if (!buckets.has(key)) buckets.set(key, { label: key, files: [] });
    buckets.get(key).files.push(f);
  }
  const moduleEntries = [...buckets.entries()];
  const cols = Math.min(3, Math.max(1, moduleEntries.length));
  const colW = (W - 40) / cols;
  const padTop = 30;
  const fileH = 26;
  const fileGap = 6;
  const modPad = 16;
  let H = padTop;
  const filePos = /* @__PURE__ */ new Map();
  const modBoxes = [];
  moduleEntries.forEach(([key, bucket], i) => {
    const list = bucket.files;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 20 + col * colW;
    const fileBlockH = list.length * (fileH + fileGap) + modPad;
    const boxH = fileBlockH + 28;
    const yStart = padTop + row * (boxH + 24);
    modBoxes.push({ x, y: yStart, w: colW - 12, h: boxH, label: bucket.label ?? key });
    list.forEach((f, j) => {
      filePos.set(f.path, {
        x: x + 12,
        y: yStart + 28 + j * (fileH + fileGap),
        w: colW - 36
      });
    });
    H = Math.max(H, yStart + boxH + 20);
  });
  const moduleSvg = modBoxes.map(
    (b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="6" fill="none" stroke="#cbc4b1" stroke-dasharray="4 3" stroke-width="1"/>
     <text x="${b.x + 10}" y="${b.y + 18}" font-size="10" font-weight="600" fill="#8a8377" letter-spacing="0.8">${escapeHtml(String(b.label ?? "").toUpperCase())}</text>`
  ).join("");
  const fileSvg = files.map((f) => {
    const p = filePos.get(f.path);
    if (!p) return "";
    const role = changeRole(f);
    const fill = role === "new" ? "#ecf3e7" : role === "deleted" ? "#fbeaf0" : role === "external" ? "#f0ece1" : "#e9eef4";
    const stroke = role === "new" ? "#3e7d4a" : role === "deleted" ? "#b5305f" : role === "external" ? "#cbc4b1" : "#4a6c8c";
    const short = escapeHtml(String(f.path).split("/").slice(-1)[0]);
    const deco = role === "deleted" ? ' text-decoration="line-through"' : "";
    const sub = locSublabel(f);
    return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${fileH - 2}" rx="3" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
      <text x="${p.x + 8}" y="${p.y + (sub ? 12 : 17)}" font-size="11" fill="#1f1b16" font-family="ui-monospace, monospace"${deco}>${short}</text>
      ${sub ? `<text x="${p.x + 8}" y="${p.y + 22}" font-size="8" fill="#8a8377">${escapeHtml(sub)}</text>` : ""}`;
  }).join("");
  const edgeSvg = edges.map((e) => {
    const from = filePos.get(e.from);
    const to = filePos.get(e.to);
    if (!from || !to) return "";
    const fx = from.x + from.w, fy = from.y + fileH / 2;
    const tx = to.x, ty = to.y + fileH / 2;
    const dash = e.kind === "replaces" ? ' stroke-dasharray="3 3"' : "";
    const stroke = e.kind === "replaces" ? "#b5305f" : "#8a8377";
    const cpx = (fx + tx) / 2;
    const label = e.kind === "replaces" || e.kind === "styles" ? `<text x="${cpx}" y="${(fy + ty) / 2 - 4}" text-anchor="middle" font-size="8" fill="${stroke}">${escapeHtml(e.kind)}</text>` : "";
    return `<path d="M ${fx} ${fy} C ${cpx} ${fy}, ${cpx} ${ty}, ${tx} ${ty}" fill="none" stroke="${stroke}" stroke-width="1.2"${dash} marker-end="url(#arrow)"/>${label}`;
  }).join("");
  const defs = `<defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8377"/>
    </marker>
  </defs>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="File-change topology">
    ${defs}${moduleSvg}${fileSvg}${edgeSvg}
  </svg>`;
}
function structuredSections(fm, sy) {
  const parts = [
    planFrontmatterCard(fm),
    sectionWrap("acceptance criteria", acList(sy?.acceptance ?? fm["acceptance-criteria"] ?? fm.acceptance)),
    sectionWrap("files touched", filesTouchedDual(sy?.files)),
    sectionWrap("risks", riskCallouts(sy?.risks)),
    revisionsBlock(fm, sy)
  ];
  return parts.filter(Boolean).join("");
}
function sectionWrap(title, inner) {
  return inner ? `<section><h2 class="sec">${escapeHtml(title)}</h2>${inner}</section>` : "";
}
function planFrontmatterCard(fm) {
  const rows = [
    ["slug", fm["slice-slug"] ?? fm.slug],
    ["parent", fm.parent],
    ["files", fm["metric-files-to-touch"]],
    ["steps", fm["metric-step-count"]],
    ["revisions", fm["revision-count"]],
    ["blockers", fm["has-blockers"] ? "yes" : null],
    ["est-loc", fm["est-loc"] ?? fm["estimated-loc"]],
    ["depends-on", Array.isArray(fm["depends-on"]) ? fm["depends-on"].join(", ") : fm["depends-on"]],
    ["tags", Array.isArray(fm.tags) ? fm.tags.join(", ") : fm.tags],
    ["updated", fm["updated-at"]]
  ].filter(([, v]) => v != null && v !== "");
  if (!rows.length) return "";
  return `<dl class="frontmatter-card">${rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>`).join("")}</dl>`;
}
function acList(items) {
  if (!Array.isArray(items) || !items.length) return "";
  const lis = items.map((it) => {
    const o = typeof it === "string" ? { text: it } : it ?? {};
    const state = o.state ?? (o.done ? "done" : o.failed ? "fail" : "todo");
    const cls = state === "done" ? "done" : state === "fail" ? "fail" : "todo";
    const id = o.id ? `<span class="ac-id">${escapeHtml(o.id)}</span>` : "";
    const note = o.note ? `<span class="ac-note">${escapeHtml(o.note)}</span>` : "";
    const text = escapeHtml(o.text ?? o.criterion ?? "");
    return `<li><span class="chk ${cls}" aria-hidden="true"></span><span class="ac-body">${id}${text}${note}</span></li>`;
  }).join("");
  return `<ul class="ac-list">${lis}</ul>`;
}
function filesTable(files) {
  if (!Array.isArray(files) || !files.length) return "";
  const rows = files.map((f) => {
    const role = f.role ?? "modified";
    const loc = f.loc != null ? String(f.loc) : "";
    const intent = f.intent ?? f.note ?? f.summary ?? "";
    const pathCell = intent ? `<details><summary><code>${escapeHtml(f.path)}</code></summary><div class="ft-intent">${escapeHtml(intent)}</div></details>` : `<code>${escapeHtml(f.path)}</code>`;
    return `<tr>
      <td class="path">${pathCell}</td>
      <td class="loc">${escapeHtml(loc)}</td>
      <td class="delta">${formatDelta(f.delta)}</td>
      <td><span class="role is-${escapeHtml(role)}">${escapeHtml(role)}</span></td>
    </tr>`;
  }).join("");
  return `<div class="table-scroll"><table class="files-touched">
    <thead><tr><th>Path</th><th>LOC</th><th>&#916;</th><th>Role</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
function filesTouchedDual(files) {
  const table = filesTable(files);
  if (!table) return "";
  return `<div class="d-only">${table}</div><div class="m-only">${filesModgroups(files)}</div>`;
}
function filesModgroups(files) {
  if (!Array.isArray(files) || !files.length) return "";
  const groups = /* @__PURE__ */ new Map();
  for (const f of files) {
    const path = String(f.path ?? "");
    const slash = path.lastIndexOf("/");
    const mod = slash > 0 ? path.slice(0, slash) : "(root)";
    if (!groups.has(mod)) groups.set(mod, []);
    groups.get(mod).push(f);
  }
  return [...groups.entries()].map(([mod, fs]) => {
    const rows = fs.map((f) => {
      const role = String(f.role ?? "modified");
      const name = String(f.path ?? "").split("/").filter(Boolean).at(-1) ?? f.path;
      const cls = role === "new" ? "is-new" : role === "deleted" ? "is-deleted" : "is-modified";
      return `<div class="frow ${cls}"><span class="role-dot"></span><span class="fname">${escapeHtml(String(name))}</span><span class="delta">${formatDeltaFrow(f.delta)}</span></div>`;
    }).join("");
    return `<div class="modgroup"><div class="modhd"><span>${escapeHtml(mod)}</span><span class="ct">${fs.length} file${fs.length === 1 ? "" : "s"}</span></div>${rows}</div>`;
  }).join("");
}
function formatDeltaFrow(delta) {
  if (delta == null) return "";
  if (typeof delta === "object") {
    const add = Number(delta.add ?? 0), rem = Number(delta.rem ?? delta.del ?? 0);
    return `<span class="a">+${add}</span> <span class="r">&minus;${rem}</span>`;
  }
  const n = Number(delta);
  if (Number.isNaN(n)) return escapeHtml(String(delta));
  return n >= 0 ? `<span class="a">+${n}</span>` : `<span class="r">&minus;${Math.abs(n)}</span>`;
}
function formatDelta(delta) {
  if (delta == null) return "";
  if (typeof delta === "object") {
    const add = Number(delta.add ?? 0), rem = Number(delta.rem ?? delta.del ?? 0);
    return `<span class="pos">+${add}</span> <span class="neg">&minus;${rem}</span>`;
  }
  const n = Number(delta);
  if (Number.isNaN(n)) return escapeHtml(String(delta));
  return n >= 0 ? `<span class="pos">+${n}</span>` : `<span class="neg">&minus;${Math.abs(n)}</span>`;
}
function locSublabel(f) {
  if (f.delta != null) {
    const d = typeof f.delta === "object" ? `+${Number(f.delta.add ?? 0)}/\u2212${Number(f.delta.rem ?? f.delta.del ?? 0)}` : Number(f.delta) >= 0 ? `+${f.delta}` : `\u2212${Math.abs(Number(f.delta))}`;
    return `${f.role ?? "modified"} \xB7 ${d}`;
  }
  if (f.loc != null) return `${f.role ?? "modified"} \xB7 ${f.loc} loc`;
  return "";
}
function riskCallouts(risks) {
  if (!Array.isArray(risks) || !risks.length) return "";
  return risks.map((r) => {
    const level = String(r.level ?? r.severity ?? "med").toLowerCase();
    const kind = level.startsWith("high") || level === "blocker" ? "risk" : level.startsWith("low") ? "info" : "warn";
    const body = escapeHtml(r.body ?? r.description ?? r.detail ?? "");
    return callout(kind, r.title ?? r.name ?? "risk", body);
  }).join("");
}
function revisionsBlock(fm, sy) {
  const revs = sy?.revisions ?? fm.revisions;
  if (!Array.isArray(revs) || !revs.length) return "";
  const items = revs.map((r) => {
    const when = typeof r === "object" ? r.when ?? r.at ?? "" : "";
    const what = typeof r === "object" ? r.summary ?? r.note ?? r.what ?? "" : String(r);
    return `<li>${when ? `<span class="when">${escapeHtml(when)}</span> ` : ""}${escapeHtml(what)}</li>`;
  }).join("");
  return `<details class="revisions"><summary>Prior revisions (${revs.length})</summary><ol>${items}</ol></details>`;
}
function placeholderTopologySvg() {
  const W = 920, H = 150;
  const nodes = [[140, 56], [380, 38], [380, 96], [620, 66]];
  const rects = nodes.map(
    ([x, y]) => `<rect x="${x}" y="${y}" width="150" height="30" rx="4" fill="#fbfaf6" stroke="#cbc4b1" stroke-width="1" stroke-dasharray="4 3"/>`
  ).join("");
  const note = `<text x="${W / 2}" y="${H - 16}" text-anchor="middle" font-size="11" fill="#8a8377">topology renders once the plan declares files in its sibling YAML</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="File-change topology (placeholder)">${rects}${note}</svg>`;
}
function hasDataFlowLanes(sy) {
  if (Array.isArray(sy.lanes) && sy.lanes.length >= 2) return true;
  return (sy.edges ?? []).some((e) => e.kind === "crosses-service");
}
function dataFlowLegendExtra() {
  return `<div class="plan-lanes-legend">
    <span class="crosses">cross-service edge</span>
  </div>`;
}
function dataFlowLaneSvg(sy) {
  const lanes = inferLanes(sy);
  const edges = sy.edges ?? [];
  const W = 980;
  const padX = 28, padTop = 18;
  const laneH = 110;
  const laneGap = 22;
  const fileW = 150, fileH = 30, fileGap = 12;
  const filePos = /* @__PURE__ */ new Map();
  const laneBoxes = [];
  lanes.forEach((lane, li) => {
    const y = padTop + li * (laneH + laneGap);
    laneBoxes.push({ y, lane });
    const labelX = padX;
    const filesStartX = padX + 130;
    lane.files.forEach((path, fi) => {
      const x = filesStartX + fi * (fileW + fileGap);
      filePos.set(path, { x, y: y + (laneH - fileH) / 2, w: fileW, h: fileH });
    });
    lane._labelX = labelX;
  });
  const H = padTop + lanes.length * (laneH + laneGap) + 10;
  const roleByPath = /* @__PURE__ */ new Map();
  for (const f of sy.files ?? []) roleByPath.set(f.path, changeRole(f));
  const laneSvg = laneBoxes.map(({ y, lane }) => {
    const banner = `<rect x="${padX}" y="${y}" width="${W - 2 * padX}" height="${laneH}" rx="6" fill="none" stroke="#cbc4b1" stroke-dasharray="4 3" stroke-width="1"/>`;
    const label = `<text x="${lane._labelX + 6}" y="${y + 22}" font-size="10" font-weight="700" letter-spacing="0.8" fill="#8a8377">${escapeHtml(String(lane.label ?? lane.service ?? "").toUpperCase())}</text>`;
    const sub = `<text x="${lane._labelX + 6}" y="${y + 38}" font-size="9" fill="#8a8377">service</text>`;
    return banner + label + sub;
  }).join("");
  const fileSvg = lanes.flatMap((lane) => lane.files.map((path) => {
    const p = filePos.get(path);
    if (!p) return "";
    const role = roleByPath.get(path) ?? "modified";
    const fill = role === "new" ? "#ecf3e7" : role === "deleted" ? "#fbeaf0" : role === "external" ? "#f0ece1" : "#e9eef4";
    const stroke = role === "new" ? "#3e7d4a" : role === "deleted" ? "#b5305f" : role === "external" ? "#cbc4b1" : "#4a6c8c";
    const short = escapeHtml(String(path).split("/").slice(-1)[0]);
    return `<rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1"/>
      <text x="${p.x + 10}" y="${p.y + 19}" font-size="11" fill="#1f1b16" font-family="ui-monospace, monospace">${short}</text>`;
  })).join("");
  const edgeSvg = edges.map((e) => {
    const from = filePos.get(e.from);
    const to = filePos.get(e.to);
    if (!from || !to) return "";
    const cross = e.kind === "crosses-service" || from.y !== to.y;
    const fx = from.x + from.w, fy = from.y + from.h / 2;
    const tx = to.x, ty = to.y + to.h / 2;
    const stroke = cross ? "#b5305f" : "#8a8377";
    const dash = cross ? ' stroke-dasharray="4 4"' : "";
    const mid = (fy + ty) / 2;
    const sway = Math.abs(ty - fy) > 10 ? Math.max(40, Math.abs(ty - fy) * 0.6) : 0;
    const cpx1 = fx + sway, cpx2 = tx - sway;
    return `<path d="M ${fx} ${fy} C ${cpx1} ${fy}, ${cpx2} ${ty}, ${tx} ${ty}" fill="none" stroke="${stroke}" stroke-width="1.4"${dash} marker-end="url(#lane-arrow)"/>
      ${cross ? `<text x="${(fx + tx) / 2}" y="${mid - 6}" text-anchor="middle" font-size="9" fill="#b5305f">${escapeHtml(e.kind)}</text>` : ""}`;
  }).join("");
  const defs = `<defs>
    <marker id="lane-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8377"/>
    </marker>
  </defs>`;
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Data-flow lanes">
    ${defs}${laneSvg}${fileSvg}${edgeSvg}
  </svg>`;
}
function inferLanes(sy) {
  if (Array.isArray(sy.lanes) && sy.lanes.length >= 2) {
    return sy.lanes.map((l) => ({
      service: l.service,
      label: l.label ?? l.service,
      files: (l.files ?? []).filter((p) => p)
    }));
  }
  const byService = /* @__PURE__ */ new Map();
  for (const f of sy.files ?? []) {
    const seg = String(f.path ?? "").split("/")[0] || "(root)";
    if (!byService.has(seg)) byService.set(seg, []);
    byService.get(seg).push(f.path);
  }
  return [...byService.entries()].map(([service, files]) => ({
    service,
    label: service,
    files
  }));
}
export {
  render
};
