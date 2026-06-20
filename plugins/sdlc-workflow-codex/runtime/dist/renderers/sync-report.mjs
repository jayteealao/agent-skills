import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  callout,
  severityChip
} from "../chunk-EG7S7OJR.mjs";
import {
  renderSimple
} from "../chunk-JKADD63T.mjs";
import {
  md2html,
  renderHistoryBlock
} from "../chunk-PZPUPYVP.mjs";
import {
  figureCanvas
} from "../chunk-PDBKNARE.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "../chunk-QCCGPNTM.mjs";
import {
  escapeHtml
} from "../chunk-4WRIEOIP.mjs";
import "../chunk-LFGT2BKG.mjs";
import "../chunk-FZ2GR6GF.mjs";
import "../chunk-SGA7NFMW.mjs";

// renderers/sync-report.mjs
var RISK_VERDICT = {
  none: { kind: "ship", label: "In sync" },
  low: { kind: "ship", label: "In sync" },
  med: { kind: "caveats", label: "Drifting" },
  high: { kind: "no", label: "Conflicts likely" }
};
var RISK_WORD = { none: "No", low: "Low", med: "Medium", high: "High" };
var PX_PER_COMMIT = 25;
var MAX_ARM = 360;
var BASE_X = 460;
var CY = 110;
var HEX = { accent: "#4a6c8c", accentSoft: "#e9eef4", med: "#a07417", medBg: "#fbf3df", ink: "#1f1b16", ink3: "#8a8377", paper: "#fbfaf6", rule2: "#cbc4b1" };
function render(artifact, ctx) {
  if (!artifact.siblingYaml) {
    return renderSimple(artifact, ctx, {
      title: artifact.frontmatter?.title ?? `Sync \xB7 ${artifact.frontmatter?.branch ?? artifact.frontmatter?.slug ?? ""}`
    });
  }
  return renderSync(artifact, ctx);
}
function renderSync(artifact) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? {};
  const branch = sy.branch ?? fm.branch ?? "";
  const base = sy.base_branch ?? "base";
  const ahead = num(sy.ahead_count);
  const behind = num(sy.behind_count);
  const stale = sy.stale_days != null ? num(sy.stale_days) : null;
  const files = Array.isArray(sy.diverged_files) ? sy.diverged_files : [];
  const conflicts = files.filter((f) => f && f.conflict).length;
  const risk = String(sy.conflict_risk ?? "none").toLowerCase();
  const verdict = RISK_VERDICT[risk] ?? RISK_VERDICT.none;
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Branch sync \xB7 <code>${escapeHtml(branch)}</code>`,
    lede: syncLede({ ahead, behind, base, stale, risk }),
    badges: [
      statusBadge(fm.status),
      stageBadge("sync"),
      base && `<span class="meta">base <code>${escapeHtml(base)}</code></span>`,
      sy.rebase_status && `<span class="meta">rebase ${escapeHtml(sy.rebase_status)}</span>`
    ]
  });
  const verdictHtml = verdictBlock(verdict.kind, verdict.label, verdictSummary(sy, { ahead, behind, base, stale, conflicts }));
  const metricsHtml = metricRow([
    { label: "ahead", value: ahead, ann: `commits not in ${base}` },
    { label: "behind", value: behind, tone: behind ? "warn" : void 0, ann: "upstream commits missing" },
    stale != null && { label: "stale", value: stale, ann: "days since last rebase" },
    { label: "conflicts", value: conflicts, tone: conflicts ? "bad" : void 0, ann: "files with dual edits" }
  ].filter(Boolean));
  const tilesHtml = syncTiles({ ahead, behind, stale, conflicts });
  const figureHtml = figureCanvas({
    figureNumber: 1,
    title: `Commits ahead and behind ${base}`,
    svgInner: divergingBarSvg({ ahead, behind, base, branch }),
    legend: [
      { state: "ahead", label: `ahead (${branch || "branch"})` },
      { state: "behind", label: `behind (${base})` }
    ]
  });
  const tableHtml = files.length ? driftTable(files) : "";
  const filesMobile = files.length ? mobileFileGroups(files) : "";
  const desktopBlock = `<div class="d-only">${metricsHtml}<h2 class="sec">Divergence from base</h2>${figureHtml}${files.length ? `<h2 class="sec">Diverged files</h2>${tableHtml}` : ""}</div>`;
  const mobileBlock = `<div class="m-only">${tilesHtml}${files.length ? `<div class="subhead">Diverged files</div>${filesMobile}` : ""}</div>`;
  const recHtml = sy.recommendation ? callout(risk === "high" ? "risk" : "warn", "Recommended next step", `<p>${escapeHtml(sy.recommendation)}</p>`) : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  const bodyHtml = `
    ${verdictHtml}
    ${desktopBlock}${mobileBlock}
    ${recHtml}${proseBlock}${renderHistoryBlock(artifact.history)}
  `;
  return { headerHtml, bodyHtml, links: [], children: [] };
}
function verdictBlock(kind, label, summary) {
  return `<section class="verdict verdict-${escapeHtml(kind)}">
    <div class="v-label">Verdict</div>
    <div class="v-text">${escapeHtml(label ?? kind)}</div>
    ${summary ? `<p class="v-sum">${escapeHtml(summary)}</p>` : ""}
  </section>`;
}
function syncLede({ ahead, behind, base, stale, risk }) {
  const head = `${ahead} commit${ahead === 1 ? "" : "s"} ahead of <code>${escapeHtml(base)}</code>, ${behind} behind`;
  const staleBit = stale != null ? `; last synced ${stale} day${stale === 1 ? "" : "s"} ago` : "";
  const riskWord = RISK_WORD[risk] ?? "Unknown";
  return `${head}${staleBit}. ${riskWord} conflict risk.`;
}
function verdictSummary(sy, { ahead, behind, base, stale, conflicts }) {
  if (sy.summary) return String(sy.summary);
  const bits = [];
  if (behind) bits.push(`${behind} upstream commit${behind === 1 ? "" : "s"} not yet merged`);
  if (conflicts) bits.push(`${conflicts} file${conflicts === 1 ? "" : "s"} with edits on both sides`);
  if (stale != null) bits.push(`${stale} day${stale === 1 ? "" : "s"} since last rebase`);
  return bits.length ? `${bits.join(" \xB7 ")}.` : `${ahead} commit${ahead === 1 ? "" : "s"} ahead of ${base}; nothing to reconcile.`;
}
function syncTiles({ ahead, behind, stale, conflicts }) {
  const tile = (lbl, val, ann, blocker) => `<div class="mtile"><div class="lbl">${escapeHtml(lbl)}</div><div class="val${blocker ? " is-blocker" : ""}">${escapeHtml(String(val))}</div>${ann ? `<div class="ann">${escapeHtml(ann)}</div>` : ""}</div>`;
  return `<div class="mtiles">
    ${tile("Ahead", ahead, "commits", false)}
    ${tile("Behind", behind, "upstream", behind > 0)}
    ${tile("Stale", stale != null ? `${stale}d` : "\u2014", "no rebase", false)}
    ${tile("Conflicts", conflicts, "files", conflicts > 0)}
  </div>`;
}
function divergingBarSvg({ ahead, behind, base, branch }) {
  const aheadW = Math.min(ahead * PX_PER_COMMIT, MAX_ARM);
  const behindW = Math.min(behind * PX_PER_COMMIT, MAX_ARM);
  const aheadX = BASE_X + 6;
  const behindRight = BASE_X - 6;
  const behindX = behindRight - behindW;
  const axis = `<line x1="60" y1="${CY}" x2="880" y2="${CY}" stroke="${HEX.rule2}" stroke-width="1" stroke-dasharray="4 4"/>`;
  const baseNode = `<line x1="${BASE_X}" y1="68" x2="${BASE_X}" y2="155" stroke="${HEX.ink}" stroke-width="1.5"/>
    <circle cx="${BASE_X}" cy="${CY}" r="9" fill="${HEX.paper}" stroke="${HEX.ink}" stroke-width="2"/>
    <text x="${BASE_X}" y="168" text-anchor="middle" font-size="11" font-weight="600" fill="${HEX.ink3}" letter-spacing="0.5">base \xB7 ${escapeHtml(base)}</text>`;
  const behindBar = behind ? `<rect x="${behindX.toFixed(0)}" y="94" width="${behindW.toFixed(0)}" height="32" rx="3" fill="${HEX.medBg}" stroke="${HEX.med}" stroke-width="1"/>
       ${dots(behindRight, behind, -1, HEX.med)}
       <text x="${(behindX - 8).toFixed(0)}" y="85" text-anchor="end" font-size="13" font-weight="600" fill="${HEX.ink}">${behind} behind</text>
       <text x="${(behindX - 8).toFixed(0)}" y="101" text-anchor="end" font-size="11" fill="${HEX.med}">${escapeHtml(base)} has moved on</text>` : `<text x="${(behindRight - 8).toFixed(0)}" y="${CY + 4}" text-anchor="end" font-size="11" fill="${HEX.ink3}">0 behind</text>`;
  const aheadBar = ahead ? `<rect x="${aheadX}" y="94" width="${aheadW.toFixed(0)}" height="32" rx="3" fill="${HEX.accentSoft}" stroke="${HEX.accent}" stroke-width="1"/>
       ${dots(aheadX, ahead, 1, HEX.accent)}
       <text x="${(aheadX + aheadW + 8).toFixed(0)}" y="85" text-anchor="start" font-size="13" font-weight="600" fill="${HEX.ink}">${ahead} ahead</text>
       <text x="${(aheadX + aheadW + 8).toFixed(0)}" y="101" text-anchor="start" font-size="11" fill="${HEX.accent}">${escapeHtml(branch || "this branch")}</text>` : `<text x="${aheadX + 8}" y="${CY + 4}" text-anchor="start" font-size="11" fill="${HEX.ink3}">0 ahead</text>`;
  return `<svg viewBox="0 0 920 220" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Diverging bar: ${ahead} commits ahead and ${behind} behind ${escapeHtml(base)}">
    ${axis}${behindBar}${baseNode}${aheadBar}
  </svg>`;
}
function dots(originX, count, dir, color) {
  const shown = Math.min(count, Math.floor(MAX_ARM / PX_PER_COMMIT));
  let out = "";
  for (let i = 0; i < shown; i++) {
    const x = originX + dir * (i + 1) * PX_PER_COMMIT;
    out += `<circle cx="${x.toFixed(0)}" cy="${CY}" r="4" fill="${color}"/>`;
  }
  return out;
}
function driftTable(files) {
  const rows = files.map((f) => {
    const cls = f.conflict ? "is-modified" : f.base_delta == null ? "is-new" : "is-modified";
    const conflictCell = f.conflict ? severityChip("blocker", "conflict") : "\u2014";
    return `<tr class="${cls}">
      <td class="path">${escapeHtml(f.path ?? "")}</td>
      <td class="delta">${deltaCell(f.base_delta)}</td>
      <td class="delta">${deltaCell(f.branch_delta)}</td>
      <td>${conflictCell}</td>
    </tr>`;
  }).join("");
  return `<div class="table-scroll"><table class="files-touched">
    <thead><tr><th>Path</th><th>Base \u0394</th><th>Branch \u0394</th><th>Conflict</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>`;
}
function deltaCell(delta) {
  const parsed = parseDelta(delta);
  if (!parsed) return delta == null || delta === "" ? "\u2014" : escapeHtml(String(delta));
  const { add, del } = parsed;
  return `<span class="pos">${escapeHtml(add)}</span> / <span class="neg">${escapeHtml(del)}</span>`;
}
function mobileDelta(delta) {
  const parsed = parseDelta(delta);
  if (!parsed) return delta == null || delta === "" ? "" : `<span class="a">${escapeHtml(String(delta))}</span>`;
  const { add, delNum } = parsed;
  const showDel = delNum !== "0" && delNum !== "";
  return `<span class="a">${escapeHtml(add)}</span>${showDel ? ` <span class="r">\u2212${escapeHtml(delNum)}</span>` : ""}`;
}
function parseDelta(delta) {
  if (delta == null || delta === "") return null;
  const m = /([+-]?\d+)\s*\/\s*([−+-]?\d+)/.exec(String(delta));
  if (!m) return null;
  const add = m[1].startsWith("+") ? m[1] : `+${m[1].replace(/^-/, "")}`;
  const delNum = m[2].replace(/^[−+-]/, "");
  return { add, del: `\u2212${delNum}`, delNum };
}
function mobileFileGroups(files) {
  const groups = /* @__PURE__ */ new Map();
  for (const f of files) {
    const path = f.path ?? "";
    const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "(root)";
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push(f);
  }
  const out = [];
  for (const [dir, gfiles] of groups) {
    const conflicts = gfiles.filter((f) => f.conflict).length;
    const ct = conflicts ? `${conflicts} conflict${conflicts === 1 ? "" : "s"}` : "clean";
    const rows = gfiles.map((f) => {
      const path = f.path ?? "";
      const name = path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;
      const cls = f.conflict ? "is-modified" : f.base_delta == null ? "is-new" : "is-modified";
      const flag = f.conflict ? `<div class="frow-flag">${severityChip("blocker", "conflict")}</div>` : "";
      return `<div class="frow ${cls}"><span class="role-dot"></span><span class="fname">${escapeHtml(name)}</span><span class="delta">${mobileDelta(f.branch_delta)}</span></div>${flag}`;
    }).join("");
    out.push(`<div class="modgroup"><div class="modhd"><span>${escapeHtml(dir)}</span><span class="ct">${escapeHtml(ct)}</span></div>${rows}</div>`);
  }
  return out.join("");
}
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
export {
  render
};
