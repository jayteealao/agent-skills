#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  outputSystemMessage,
  projectRootFromInput,
  readStdinJson
} from "./chunk-CDKEYATP.mjs";
import {
  logError
} from "./chunk-SCQPZLF2.mjs";
import "./chunk-UTP6CBAZ.mjs";
import {
  loadConfig
} from "./chunk-D55RRO3F.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-SGA7NFMW.mjs";

// lib/memory-seed.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
var KERNEL_VERSION = 1;
var FENCE = "sdlc:wf-rules";
var IMPORT_FENCE = "sdlc:wf-rules-import";
function agentsStart(v) {
  return `<!-- ${FENCE} v${v} START - managed by sdlc-workflow; edit outside this fence -->`;
}
function agentsEnd(v) {
  return `<!-- ${FENCE} v${v} END -->`;
}
function kernelBody() {
  return [
    "## Working in this repo (sdlc-workflow)",
    "",
    "- `/wf` is the lifecycle entry point. Workflow artifacts live under `.ai/`; treat rendered or",
    "  generated output as read-only \u2014 regenerate, don't hand-edit.",
    "- Ground facts in real source instead of guessing: reach for **study-sources** before asserting",
    "  how a library, framework, SDK, or API actually behaves.",
    "- Durable per-workflow constraints (vetoes, preferences) go in `.ai/workflows/<slug>/steer.md`."
  ].join("\n");
}
function renderAgentsBlock(v = KERNEL_VERSION) {
  return `${agentsStart(v)}
${kernelBody()}
${agentsEnd(v)}`;
}
var AGENTS_FENCE_RE = new RegExp(
  `<!-- ${FENCE} v\\d+ START[\\s\\S]*?<!-- ${FENCE} v\\d+ END -->`
);
function ensureAgentsKernel(content) {
  const block = renderAgentsBlock();
  if (content == null) {
    return { text: `${block}
`, changed: true, action: "created" };
  }
  const m = content.match(AGENTS_FENCE_RE);
  if (m) {
    if (eolEqual(m[0], block)) return { text: content, changed: false, action: "current" };
    return { text: content.replace(AGENTS_FENCE_RE, block), changed: true, action: "updated" };
  }
  return { text: appendBlock(content, block), changed: true, action: "appended" };
}
var IMPORT_START = `<!-- ${IMPORT_FENCE} START - managed by sdlc-workflow; edit outside this fence -->`;
var IMPORT_BODY = "@AGENTS.md";
var IMPORT_END = `<!-- ${IMPORT_FENCE} END -->`;
function renderImportBlock() {
  return `${IMPORT_START}
${IMPORT_BODY}
${IMPORT_END}`;
}
var IMPORT_FENCE_RE = new RegExp(
  `<!-- ${IMPORT_FENCE} START[\\s\\S]*?<!-- ${IMPORT_FENCE} END -->`
);
function ensureClaudeImport(content) {
  const block = renderImportBlock();
  if (content == null) {
    return { text: `${block}
`, changed: true, action: "created" };
  }
  const m = content.match(IMPORT_FENCE_RE);
  if (m) {
    if (eolEqual(m[0], block)) return { text: content, changed: false, action: "current" };
    return { text: content.replace(IMPORT_FENCE_RE, block), changed: true, action: "updated" };
  }
  if (importsAgentsOutsideCode(content)) {
    return { text: content, changed: false, action: "user-import" };
  }
  return { text: appendBlock(content, block), changed: true, action: "appended" };
}
function importsAgentsOutsideCode(content) {
  const bare = stripInlineCode(stripFencedCode(content));
  return /@\.?\/?AGENTS\.md(?![\w./-])/.test(bare);
}
function stripFencedCode(md) {
  const lines = String(md).split(/\r?\n/);
  const out = [];
  let inFence = false;
  let mark = "";
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      if (!inFence) {
        inFence = true;
        mark = m[1][0];
      } else if (line.trimStart().startsWith(mark.repeat(3))) {
        inFence = false;
      }
      continue;
    }
    if (!inFence) out.push(line);
  }
  return out.join("\n");
}
function stripInlineCode(md) {
  return String(md).replace(/`[^`\n]*`/g, "");
}
function appendBlock(content, block) {
  const base = String(content).replace(/\s*$/, "");
  return base ? `${base}

${block}
` : `${block}
`;
}
function eolEqual(a, b) {
  return String(a).replace(/\r\n?/g, "\n") === String(b).replace(/\r\n?/g, "\n");
}
function seedMemoryKernel(projectRoot, config = {}, deps = {}) {
  const fs = deps.fs ?? { existsSync, mkdirSync, readFileSync, writeFileSync };
  const result = { enabled: true, seeded: false, changed: false, firstInsert: false, targets: [], notice: null };
  try {
    if (config?.memory?.seedRules === false) {
      result.enabled = false;
      return result;
    }
    if (!fs.existsSync(join(projectRoot, ".ai", "workflows"))) return result;
    const markerPath = join(projectRoot, ".ai", ".wf-rules-seeded");
    const markerExisted = fs.existsSync(markerPath);
    const agentsPath = join(projectRoot, "AGENTS.md");
    const claudePath = join(projectRoot, "CLAUDE.md");
    const agents = ensureAgentsKernel(readIf(fs, agentsPath));
    if (agents.changed) {
      fs.writeFileSync(agentsPath, agents.text, "utf-8");
      result.targets.push("AGENTS.md");
    }
    const claude = ensureClaudeImport(readIf(fs, claudePath));
    if (claude.changed) {
      fs.writeFileSync(claudePath, claude.text, "utf-8");
      result.targets.push("CLAUDE.md");
    }
    result.seeded = true;
    result.changed = agents.changed || claude.changed;
    if (!markerExisted) {
      try {
        fs.mkdirSync(join(projectRoot, ".ai"), { recursive: true });
        fs.writeFileSync(markerPath, `seeded ${nowIso()}
`, "utf-8");
      } catch {
      }
      if (result.changed) {
        result.firstInsert = true;
        result.notice = buildNotice(result.targets);
      }
    }
    return result;
  } catch {
    return result;
  }
}
function readIf(fs, p) {
  try {
    return fs.existsSync(p) ? fs.readFileSync(p, "utf-8") : null;
  } catch {
    return null;
  }
}
function nowIso() {
  try {
    return (/* @__PURE__ */ new Date()).toISOString();
  } catch {
    return "";
  }
}
function buildNotice(targets) {
  const files = targets.length ? targets.join(" + ") : "AGENTS.md";
  return `sdlc-workflow seeded a \`/wf\` rules block into ${files} (AGENTS.md is canonical; CLAUDE.md imports it). The plugin owns only the fenced region \u2014 edit freely outside it, or set \`memory.seedRules: false\` in \`.ai/sdlc-config.json\` to disable.`;
}

// hooks/seed-memory.mjs
var ON_CODEX = import.meta.url.includes("sdlc-workflow-codex");
async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === "1") return;
  if (process.env.SDLC_DISPATCH_ACTIVE === "1") return;
  if (process.env.SDLC_DISABLE_MEMORY_SEED === "1") return;
  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  const result = seedMemoryKernel(projectRoot, config);
  if (result.notice && !ON_CODEX) outputSystemMessage(result.notice);
}
main().catch(async (err) => {
  try {
    await logError("seed-memory", err);
  } catch {
  }
  process.exit(0);
});
