import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/leak-lexicon.mjs
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var __dirname = dirname(fileURLToPath(import.meta.url));
var BOUNDARY_PATH = resolve(
  __dirname,
  "..",
  "skills",
  "wf",
  "reference",
  "_output-boundary.md"
);
var DEFAULT_ROOTS = [".ai/", ".claude/"];
var WF_KEYS = "intake|shape|slice|plan|implement|verify|review|handoff|ship-plan|ship|retro|design|probe|simplify|auto|yolo|status|recap|close|docs";
var SKILL_SUFFIXES = `${WF_KEYS}|meta|quick|next|resume|amend|extend|announce`;
var STAGE_NAMES = "intake|quick|shape|design|craft|slice|plan|implement|verify|review|handoff|ship-run|ship-runs|ship|rollback|retro|recap|resume|rca|investigate|fix|hotfix|refactor|instrument|experiment|benchmark|close|index|docs";
function parseBoundaryRoots(text) {
  const roots = /* @__PURE__ */ new Set();
  const re = /`\.([a-z][\w-]*)\/\*\*`/g;
  let m;
  while (m = re.exec(String(text ?? ""))) roots.add(`.${m[1]}/`);
  return roots.size ? [...roots] : [...DEFAULT_ROOTS];
}
function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildLexicon({ boundaryPath = BOUNDARY_PATH } = {}) {
  let text = "";
  try {
    text = readFileSync(boundaryPath, "utf8");
  } catch {
  }
  const roots = parseBoundaryRoots(text);
  const rootAlt = roots.map(escapeRe).join("|");
  return {
    roots,
    patterns: [
      // A concrete internal path: .ai/workflows/foo/06-verify.md, .claude/settings…
      { kind: "internal-path", re: new RegExp(`(?:^|[^\\w./\\\\-])((?:${rootAlt})[\\w./-]+)`, "g") },
      // A workflow command string: "/wf verify", "/wf ship-plan init".
      { kind: "wf-command", re: new RegExp(`(?:^|[^\\w])(/wf\\s+(?:${WF_KEYS})\\b)`, "g") },
      // A skill/stage token: wf-verify, wf-meta.
      { kind: "skill-token", re: new RegExp(`\\b(wf-(?:${SKILL_SUFFIXES}))\\b`, "g") },
      // A stage-artifact stem: 06-verify-core.md, 02b-design.yaml, 09-rollback-….md.
      {
        kind: "artifact-stem",
        re: new RegExp(
          `\\b(\\d{2}[a-z]?-(?:${STAGE_NAMES})(?:-[\\w-]+)?\\.(?:md|yaml|html\\.fragment))\\b`,
          "g"
        )
      },
      // The artifact schema tag.
      { kind: "schema-tag", re: /\b(sdlc\/v1)\b/g }
    ]
  };
}
function scanText(text, lexicon = buildLexicon()) {
  const findings = [];
  const seen = /* @__PURE__ */ new Set();
  const s = String(text ?? "");
  for (const { kind, re } of lexicon.patterns) {
    re.lastIndex = 0;
    let m;
    while (m = re.exec(s)) {
      const match = m[1] ?? m[0];
      const key = `${kind}:${match}`;
      if (!seen.has(key)) {
        seen.add(key);
        findings.push({ kind, match, index: m.index });
      }
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return findings;
}
function formatFindings(findings, { limit = 5 } = {}) {
  const shown = findings.slice(0, limit).map((f) => `\`${f.match}\` (${f.kind})`);
  const more = findings.length > limit ? ` (+${findings.length - limit} more)` : "";
  return shown.join(", ") + more;
}

export {
  buildLexicon,
  scanText,
  formatFindings
};
