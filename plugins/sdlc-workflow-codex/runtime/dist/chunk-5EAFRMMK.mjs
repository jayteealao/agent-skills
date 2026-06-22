import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  callout
} from "./chunk-EG7S7OJR.mjs";
import {
  renderSimple
} from "./chunk-YJWVEN5Z.mjs";
import {
  md2html,
  renderHistoryBlock
} from "./chunk-ZY74LA7J.mjs";
import {
  figureCanvas
} from "./chunk-PDBKNARE.mjs";
import {
  artifactHeader,
  metricRow,
  stageBadge,
  statusBadge
} from "./chunk-U4F4JCWH.mjs";
import {
  escapeHtml
} from "./chunk-4WRIEOIP.mjs";

// renderers/rca.mjs
function render(artifact, ctx) {
  if (!artifact.siblingYaml) {
    return renderSimple(artifact, ctx, {
      title: artifact.frontmatter?.title ?? artifact.frontmatter?.symptom ?? "Root cause analysis"
    });
  }
  return renderRca(artifact, ctx);
}
function renderRca(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? {};
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: escapeHtml(sy.title ?? fm.title ?? fm.symptom ?? "Root cause analysis"),
    badges: [
      statusBadge(fm.status),
      stageBadge("rca"),
      sy.incident && `<span class="meta">${escapeHtml(sy.incident)}</span>`,
      sy.resolved_at && `<span class="meta">resolved ${escapeHtml(sy.resolved_at)}</span>`
    ]
  });
  const m = sy.metrics ?? {};
  const metricsHtml = metricRow([
    m.duration && { label: "duration", value: m.duration },
    m.time_to_detect && { label: "detect", value: m.time_to_detect },
    m.time_to_mitigate && { label: "mitigate", value: m.time_to_mitigate },
    m.user_failures != null && { label: "failures", value: m.user_failures, tone: "warn" },
    m.revenue_impact_usd != null && {
      label: "revenue",
      value: `$${Number(m.revenue_impact_usd).toLocaleString()}`,
      tone: "warn"
    }
  ].filter(Boolean));
  const timelineSvg = sy.timeline?.length ? timelineFigure(sy) : "";
  const chainSvg = sy.chain?.length ? causalChainFigure(sy) : "";
  const desktopFigures = [
    timelineSvg && figureCanvas({ figureNumber: 1, title: "Incident timeline", svgInner: timelineSvg }),
    chainSvg && figureCanvas({ figureNumber: 2, title: "Causal chain", svgInner: chainSvg })
  ].filter(Boolean).join("");
  const mobileFigures = `${mobileTimeline(sy)}${sy.chain?.length ? `<div class="subhead">Causal chain</div>${mobileChain(sy)}` : ""}`;
  const figuresHtml = `${desktopFigures ? `<div class="d-only">${desktopFigures}</div>` : ""}${mobileFigures.trim() ? `<div class="m-only">${mobileFigures}</div>` : ""}`;
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  const fiveWhysHtml = renderFiveWhys(sy.five_whys);
  const causes = (sy.contributing_causes ?? []).map((cause) => callout("warn", escapeHtml(cause.title), `<p>${escapeHtml(cause.body ?? "")}</p>`)).join("");
  const mitigations = (sy.mitigations ?? []).map((mitigation) => callout(
    "info",
    `${escapeHtml(mitigation.at ?? "")} \xB7 ${escapeHtml(mitigation.title)}`,
    `<p>${escapeHtml(mitigation.body ?? "")}</p>`
  )).join("");
  const bodyHtml = `
    ${metricsHtml}${figuresHtml}${fragmentBlock}${proseBlock}${fiveWhysHtml}
    ${causes ? `<section class="rca-causes"><h2 class="sdlc-h2">contributing causes</h2>${causes}</section>` : ""}
    ${mitigations ? `<section class="rca-mitigations"><h2 class="sdlc-h2">mitigations applied</h2>${mitigations}</section>` : ""}
    ${renderHistoryBlock(artifact.history)}
  `;
  return { headerHtml, bodyHtml, links: [], children: [] };
}
function renderFiveWhys(chain) {
  if (!Array.isArray(chain) || chain.length === 0) return "";
  const lastIdx = chain.length - 1;
  const anyExplicitRoot = chain.some((why) => why.root === true);
  const inferredRoot = /^\s*ROOT\b/i.test(chain[lastIdx]?.answer ?? "");
  const rootMarked = anyExplicitRoot || inferredRoot;
  const items = chain.map((why, i) => {
    const isRoot = why.root === true || !anyExplicitRoot && rootMarked && i === lastIdx;
    const answer = String(why.answer ?? "").replace(/^\s*ROOT[:\s-]+/i, "");
    return `<li${isRoot ? ' class="is-root"' : ""}>
      <div>
        <p class="why-q">${escapeHtml(why.question ?? "")}</p>
        <p class="why-a">${escapeHtml(answer)}</p>
      </div>
    </li>`;
  }).join("");
  return `<details class="rca-five-whys${rootMarked ? " is-root" : ""}">
    <summary>5 whys</summary>
    <ol class="why-chain">${items}</ol>
  </details>`;
}
function mobileTimeline(sy) {
  const events = sy.timeline ?? [];
  if (!events.length) return "";
  const items = events.map((e) => {
    const kind = String(e.kind ?? "").toLowerCase();
    return `<div class="evt k-${escapeHtml(kind)}">
      <span class="node"></span>
      <div class="et"><span class="when">${escapeHtml(e.at ?? "")}</span>${kind ? `<span class="kind">${escapeHtml(kind)}</span>` : ""}</div>
      <div class="eh">${escapeHtml(e.title ?? "")}</div>
      ${e.body ? `<div class="ed">${escapeHtml(e.body)}</div>` : ""}
    </div>`;
  }).join("");
  return `<div class="evtline">${items}</div>`;
}
function mobileChain(sy) {
  const steps = sy.chain ?? [];
  if (!steps.length) return "";
  const links = steps.map((s, i) => {
    const isRoot = s.step === "ROOT_CAUSE" || s.root === true;
    const cls = isRoot ? "clink is-root" : i === 0 ? "clink is-trigger" : "clink";
    const arrow = i < steps.length - 1 ? '<div class="carrow" aria-hidden="true">\u2193</div>' : "";
    return `<div class="${cls}"><div class="ck">${escapeHtml(String(s.step ?? ""))}</div><div class="cx">${escapeHtml(s.body ?? "")}</div></div>${arrow}`;
  }).join("");
  return `<div class="chain">${links}</div>`;
}
function timelineFigure(sy) {
  const events = sy.timeline ?? [];
  const width = 980;
  const height = 130;
  const padX = 60;
  const cy = 65;
  const xs = events.map((_, i) => padX + i * (width - 2 * padX) / Math.max(1, events.length - 1));
  const kindColor = {
    alert: "#b5305f",
    escalation: "#a07417",
    deploy: "#4a6c8c",
    mitigation: "#6b4a8a",
    resolution: "#3e7d4a"
  };
  const rail = `<line x1="${padX}" y1="${cy}" x2="${width - padX}" y2="${cy}" stroke="#cbc4b1" stroke-width="2"/>`;
  const dots = events.map((event, i) => {
    const x = xs[i];
    const color = kindColor[event.kind] ?? "#4a6c8c";
    return `<g><circle cx="${x}" cy="${cy}" r="9" fill="${color}"/>
      <text x="${x}" y="${cy - 18}" text-anchor="middle" font-size="10" fill="#4a443c">${escapeHtml(event.at ?? "")}</text>
      <text x="${x}" y="${cy + 26}" text-anchor="middle" font-size="10" font-weight="600" fill="${color}">${escapeHtml(String(event.kind ?? "").toUpperCase())}</text>
      <text x="${x}" y="${cy + 40}" text-anchor="middle" font-size="9" fill="#1f1b16">${escapeHtml(String(event.title ?? "").slice(0, 22))}</text></g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Incident timeline">${rail}${dots}</svg>`;
}
function causalChainFigure(sy) {
  const steps = sy.chain ?? [];
  const width = 980;
  const padX = 30;
  const cellW = (width - 2 * padX) / steps.length - 16;
  const height = 110;
  const cells = steps.map((step, i) => {
    const x = padX + i * (cellW + 16);
    const isRoot = step.step === "ROOT_CAUSE";
    const fill = isRoot ? "#fbeaf0" : "#f3f1ea";
    const stroke = isRoot ? "#b5305f" : "#cbc4b1";
    const arrow = i < steps.length - 1 ? `<line x1="${x + cellW + 2}" y1="55" x2="${x + cellW + 14}" y2="55" stroke="#8a8377" stroke-width="1.5" marker-end="url(#chain-arrow)"/>` : "";
    return `<g>
      <rect x="${x}" y="20" width="${cellW}" height="70" rx="6" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      <text x="${x + 12}" y="40" font-size="10" font-weight="700" fill="${isRoot ? "#b5305f" : "#8a8377"}">${escapeHtml(step.step)}</text>
      <text x="${x + 12}" y="62" font-size="11" fill="#1f1b16">${escapeHtml(String(step.body ?? "").slice(0, 50))}</text>
      ${arrow}
    </g>`;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Causal chain">
    <defs><marker id="chain-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#8a8377"/></marker></defs>
    ${cells}
  </svg>`;
}

export {
  render
};
