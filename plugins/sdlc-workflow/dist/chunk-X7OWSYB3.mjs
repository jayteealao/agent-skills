import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  blockToolCall,
  isEntry,
  runStandalone
} from "./chunk-2K4NI6FA.mjs";
import {
  formatList,
  hasFrontmatterFence,
  isProbeEvidencePath,
  isProjectContextMarkdownPath,
  isProseLogPath,
  isWorkflowMarkdownPath,
  outputSystemMessage,
  projectContextPathInfo,
  projectRootFromInput,
  readTextIfExists,
  resolveProjectPath,
  workflowPathInfo
} from "./chunk-P23TDRBT.mjs";
import {
  loadConfig
} from "./chunk-KYXH2XZE.mjs";
import {
  safeParseFrontmatter
} from "./chunk-5LBIJZHF.mjs";

// hooks/pre-write-validate.mjs
import { existsSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// lib/design-lane.mjs
var UX_IMPACT_VALUES = Object.freeze(["none", "visual", "flow", "new-surface"]);
var NEEDS_DESIGN = /* @__PURE__ */ new Set(["visual", "flow", "new-surface"]);
function designNeeded(index, hasBrief) {
  const impact = index?.["ux-impact"];
  if (impact !== void 0 && impact !== null && impact !== "") {
    return NEEDS_DESIGN.has(String(impact).trim());
  }
  return Boolean(hasBrief);
}
function imageGateResolved(value) {
  const v = String(value ?? "").trim();
  if (v === "pass") return true;
  return /^skipped:\s*\S/.test(v);
}
function designReopened(index) {
  const progress = index?.progress;
  return Boolean(progress && typeof progress === "object" && progress.design === "in-progress");
}
function designSettled(index, contract) {
  if (designReopened(index)) return false;
  const progress = index?.progress;
  if (progress && typeof progress === "object" && progress.design === "skipped" && String(index?.["design-skip-reason"] ?? "").trim()) {
    return true;
  }
  if (!contract) return false;
  return imageGateResolved(contract["image-gate"]) && String(contract["direction-confirmed-by"] ?? "").trim() !== "";
}
function isPlanArtifact(storageRel) {
  return /^04-plan(?:-[^/]+)?\.md$/.test(String(storageRel ?? ""));
}
function designGateRefusal({ index, hasBrief, contract, slug }) {
  if (!index) return null;
  if (!designNeeded(index, hasBrief)) return null;
  if (designSettled(index, contract)) return null;
  const reopened = designReopened(index) && contract;
  const why = reopened ? "the design is reopened (progress.design: in-progress)" : contract ? "02c-craft.md exists but carries no resolved image-gate or no direction-confirmed-by" : "02c-craft.md is missing";
  const route = reopened ? `/wf design ${slug} amend` : `/wf design ${slug}`;
  return `Design is needed for '${slug}' (ux-impact: ${index["ux-impact"] ?? "unset; 02b-design.md exists"}) but not settled: ${why}. A person confirms the design before planning. Run ${route}. (Opt out: hooks.designDirectionGate: false.)`;
}

// hooks/pre-write-validate.mjs
function validateFilename(filename) {
  if (/^\d{2}[a-z]?-.+\.md$/.test(filename)) return null;
  if (["risk-register.md", "estimate.md", "announce.md"].includes(filename)) return null;
  if (/^skip-.+\.md$/.test(filename)) return null;
  return `Filename '${filename}' does not follow the NN-stagename.md convention (e.g., 01-intake.md, 04-plan.md). Use two-digit prefix + hyphen + name.`;
}
async function registryWarnings({ projectRoot, filePath, workflowDir, filename }) {
  if (filename !== "00-index.md") return [];
  const registry = join(projectRoot, ".ai", "workflows", "INDEX.md");
  if (!existsSync(registry)) {
    return [
      `Global workflow registry .ai/workflows/INDEX.md is missing. Run /wf status once to bootstrap it - this enables positional slug detection (the no-flag way to attach a compressed slice to '${workflowDir}' via /wf intake/probe/simplify).`
    ];
  }
  const registryText = await readTextIfExists(registry);
  if (registryText !== null && !new RegExp(`^${escapeRegex(workflowDir)}\\t`, "m").test(registryText)) {
    return [
      `Slug '${workflowDir}' has no row in .ai/workflows/INDEX.md. Run /wf status to register it - until then, '/wf intake <mode> ${workflowDir} ...' (or /wf probe|simplify) falls through to standalone mode instead of attaching as a compressed slice.`
    ];
  }
  return [];
}
async function run(input) {
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.validateOnWrite === false) return;
  const filePath = input?.tool_input?.file_path;
  const content = input?.tool_input?.content;
  if (!filePath || !isWorkflowMarkdownPath(filePath) && !isProjectContextMarkdownPath(filePath)) return;
  if (!content) return;
  if (isProjectContextMarkdownPath(filePath)) {
    validateProjectContextWrite({ filePath, content });
    return;
  }
  const info = workflowPathInfo(filePath);
  if (!info) {
    outputSystemMessage("Could not parse workflow directory from path. Skipping validation.");
    return;
  }
  const filename = basename(info.filename);
  if (isProbeEvidencePath(filePath)) return;
  const errors = [];
  const isProseLog = isProseLogPath(filePath);
  const inDesignNotes = info.storageRel.startsWith("design-notes/");
  if (!inDesignNotes && !isProseLog) {
    const filenameError = validateFilename(filename);
    if (filenameError) errors.push(filenameError);
  }
  if (isProseLog) {
  } else if (!hasFrontmatterFence(content)) {
    errors.push("Missing YAML frontmatter. All workflow files must start with --- delimited YAML frontmatter containing at minimum: schema, type, slug.");
  } else {
    const parsed = safeParseFrontmatter(content, { filePath });
    if (parsed.parseError) {
      errors.push(`YAML frontmatter parse error: ${parsed.parseError}`);
    } else if (!parsed.raw.trim()) {
      errors.push("Empty YAML frontmatter. Required fields: schema, type, slug.");
    } else {
      const { schema, type, slug } = parsed.data ?? {};
      if (!schema) {
        errors.push("Missing 'schema' field in frontmatter. Must be 'sdlc/v1'.");
      } else if (schema !== "sdlc/v1") {
        errors.push(`Invalid schema '${schema}'. Must be 'sdlc/v1'.`);
      }
      if (!type) {
        errors.push("Missing 'type' field in frontmatter. Expected values: index, intake, shape, slice, slice-index, plan, plan-index, implement, implement-index, verify, verify-index, review, review-command, handoff, ship, ship-run, ship-runs-index, retro, design, design-contract, design-critique, design-audit, design-augmentation, augmentation, rca, profile, announce, risk-register, estimate, docs-index, docs-discover, docs-audit, docs-plan, docs-generate, sync-report, recap, resume, skip-record, simplify-run, project-context, ship-plan.");
      }
      if (!slug) {
        errors.push("Missing 'slug' field in frontmatter.");
      } else if (slug !== info.slug) {
        errors.push(`Slug mismatch: frontmatter slug '${slug}' does not match workflow directory '${info.slug}'. The slug must remain stable across all files in a workflow.`);
      }
    }
  }
  if (errors.length === 0 && config.hooks.designDirectionGate !== false && isPlanArtifact(info.storageRel)) {
    const refusal = await designGate({ projectRoot, filePath, slug: info.slug });
    if (refusal) errors.push(refusal);
  }
  if (errors.length > 0) {
    process.stderr.write(`wf-validate: blocked write to ${filename} in workflow '${info.slug}'. Errors:
${formatList(errors)}

Fix these issues and retry the write.
`);
    blockToolCall();
  }
  const warnings = await registryWarnings({
    projectRoot,
    filePath: resolveProjectPath(projectRoot, filePath),
    workflowDir: info.slug,
    filename
  });
  if (warnings.length > 0) {
    outputSystemMessage(`wf-validate: write to ${filename} allowed. Advisory: ${warnings.join(" ")}`);
  }
}
async function designGate({ projectRoot, filePath, slug }) {
  try {
    const dir = dirname(resolveProjectPath(projectRoot, filePath));
    const indexText = await readTextIfExists(join(dir, "00-index.md"));
    if (indexText === null) return null;
    const index = safeParseFrontmatter(indexText, { filePath: join(dir, "00-index.md") }).data ?? null;
    const contractText = await readTextIfExists(join(dir, "02c-craft.md"));
    const contract = contractText === null ? null : safeParseFrontmatter(contractText, { filePath: join(dir, "02c-craft.md") }).data ?? {};
    const hasBrief = existsSync(join(dir, "02b-design.md"));
    return designGateRefusal({ index, hasBrief, contract, slug });
  } catch {
    return null;
  }
}
function validateProjectContextWrite({ filePath, content }) {
  const info = projectContextPathInfo(filePath);
  if (!info || !hasFrontmatterFence(content)) return;
  const parsed = safeParseFrontmatter(content, { filePath });
  const errors = [];
  if (parsed.parseError) {
    errors.push(`YAML frontmatter parse error: ${parsed.parseError}`);
  } else if (!parsed.raw.trim()) {
    errors.push("Empty YAML frontmatter. Remove the fence or provide schema/type.");
  } else {
    const { schema, type } = parsed.data ?? {};
    if (!schema) {
      errors.push("Missing 'schema' field in frontmatter. Must be 'sdlc/v1'.");
    } else if (schema !== "sdlc/v1") {
      errors.push(`Invalid schema '${schema}'. Must be 'sdlc/v1'.`);
    }
    if (!type) {
      errors.push(`Missing 'type' field in frontmatter. Expected '${info.expectedType}'.`);
    } else if (type !== info.expectedType) {
      errors.push(`Invalid type '${type}'. Expected '${info.expectedType}' for ${info.filename}.`);
    }
  }
  if (errors.length > 0) {
    process.stderr.write(`wf-validate: blocked write to project context file ${info.filename}. Errors:
${formatList(errors)}

Fix these issues and retry the write.
`);
    blockToolCall();
  }
}
function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
if (isEntry("pre-write-validate")) runStandalone("pre-write-validate", run);

export {
  run
};
