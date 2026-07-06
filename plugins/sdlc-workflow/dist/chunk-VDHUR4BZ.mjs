import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  callout
} from "./chunk-EG7S7OJR.mjs";
import {
  renderSimple
} from "./chunk-OU5UGP3B.mjs";
import {
  md2html,
  renderHistoryBlock
} from "./chunk-N4KXM6H5.mjs";
import {
  figureCanvas
} from "./chunk-PDBKNARE.mjs";
import {
  artifactHeader,
  stageBadge,
  statusBadge
} from "./chunk-XHWF3YBV.mjs";
import {
  escapeHtml
} from "./chunk-4WRIEOIP.mjs";

// renderers/experiment.mjs
function render(artifact, ctx) {
  if (!artifact.siblingYaml) {
    return renderSimple(artifact, ctx, {
      title: `Experiment \xB7 ${artifact.frontmatter?.["flag-name"] ?? artifact.frontmatter?.title ?? ""}`
    });
  }
  return renderExperiment(artifact, ctx);
}
function renderExperiment(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  const sy = artifact.siblingYaml ?? {};
  const arms = sy.arms ?? sy.variants ?? [];
  const flagName = sy.flag ?? sy["flag-name"] ?? fm["flag-name"] ?? fm.title ?? "";
  const headerHtml = artifactHeader({
    crumb: artifact.path,
    h1: `Experiment \xB7 <code>${escapeHtml(flagName)}</code>`,
    badges: [
      statusBadge(sy.status ?? fm.status),
      stageBadge("experiment"),
      (sy.experiment_type ?? sy["experiment-type"]) && `<span class="meta">${escapeHtml(sy.experiment_type ?? sy["experiment-type"])}</span>`,
      sy.framework && `<span class="meta">${escapeHtml(sy.framework)}</span>`,
      sy.split && `<span class="meta">split ${escapeHtml(sy.split)}</span>`
    ]
  });
  const hypothesisHtml = sy.hypothesis ? callout("info", "hypothesis", `<p>${escapeHtml(sy.hypothesis)}</p>`) : "";
  const armsFigure = arms.length ? figureCanvas({
    figureNumber: 1,
    title: "Arm allocation",
    svgInner: armsBar(arms)
  }) : "";
  const armCards = arms.length ? `<section class="aug-result aug-experiment-arms">
        <h2 class="sdlc-h2">variants</h2>
        <dl class="exp-arms">${arms.map((arm) => {
    const id = arm.id ?? arm.name;
    const pct = arm.allocated_pct ?? arm["allocation-pct"] ?? arm.allocation_pct;
    return `<dt><code>${escapeHtml(id)}</code> \xB7 ${escapeHtml(pct)}%</dt>
            <dd>${escapeHtml(arm.description ?? "")}</dd>`;
  }).join("")}</dl>
       </section>` : "";
  const ramp = sy["ramp-schedule"] ?? sy.ramp_schedule ?? [];
  const rampHtml = ramp.length ? `<section class="aug-result aug-experiment-ramp">
        <h2 class="sdlc-h2">ramp schedule</h2>
        <ol>${ramp.map((step) => `<li><strong>${escapeHtml(step.at ?? step.stage ?? "")}</strong> ${escapeHtml(step.allocation ?? step.description ?? "")}</li>`).join("")}</ol>
       </section>` : "";
  const guardrailsHtml = (sy.guardrails ?? []).length ? `<section class="aug-result aug-experiment-guardrails">
        <h2 class="sdlc-h2">guardrails</h2>
        <table class="guardrail-table">
          <thead><tr><th>metric</th><th>threshold</th><th>direction</th></tr></thead>
          <tbody>${sy.guardrails.map((guardrail) => `
            <tr>
              <td>${escapeHtml(guardrail.name)}</td>
              <td>${escapeHtml(guardrail.threshold)}${guardrail.unit ? " " + escapeHtml(guardrail.unit) : ""}</td>
              <td>${escapeHtml(guardrail.direction ?? guardrail.severity ?? "")}</td>
            </tr>`).join("")}
          </tbody>
        </table>
       </section>` : "";
  const killSwitch = sy["kill-switch"] ?? sy.kill_switch;
  const switchesHtml = killSwitch ? callout("warn", "operational control", `<p>kill switch <code>${escapeHtml(killSwitch)}</code></p>`) : "";
  const fragmentBlock = artifact.fragment ? `<div class="fragment">${artifact.fragment}</div>` : "";
  const proseBlock = artifact.body ? `<div class="prose">${md2html(artifact.body)}</div>` : "";
  return {
    headerHtml,
    bodyHtml: `${hypothesisHtml}${armsFigure}${armCards}${rampHtml}${guardrailsHtml}${switchesHtml}${fragmentBlock}${proseBlock}${renderHistoryBlock(artifact.history)}`,
    links: [],
    children: []
  };
}
function armsBar(arms) {
  const width = 980;
  const padX = 20;
  const height = 60;
  const barY = 18;
  const barH = 28;
  const allocations = arms.map((arm) => Number(arm.allocated_pct ?? arm["allocation-pct"] ?? arm.allocation_pct ?? 0));
  const total = allocations.reduce((sum, pct) => sum + pct, 0) || 100;
  const colors = ["#4a6c8c", "#3e7d4a", "#a07417", "#6b4a8a", "#c07820"];
  let x = padX;
  const cells = arms.map((arm, i) => {
    const pct = allocations[i];
    const w = pct / total * (width - 2 * padX);
    const color = colors[i % colors.length];
    const id = arm.id ?? arm.name;
    const cell = `<g>
      <rect x="${x}" y="${barY}" width="${w}" height="${barH}" fill="${color}"/>
      <text x="${x + 8}" y="${barY + 18}" font-size="11" font-weight="600" fill="#fbf9f3">${escapeHtml(id)}</text>
      <text x="${x + 8}" y="${barY + barH + 14}" font-size="10" fill="#4a443c">${pct}%</text>
    </g>`;
    x += w;
    return cell;
  }).join("");
  return `<svg viewBox="0 0 ${width} ${height}" width="100%" preserveAspectRatio="xMinYMid meet" aria-label="Experiment arm allocation">${cells}</svg>`;
}

export {
  render
};
