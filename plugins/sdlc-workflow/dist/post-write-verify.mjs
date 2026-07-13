#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  collectToolInputPaths,
  hasFrontmatterFence,
  isManagedArtifactMarkdownPath,
  isProjectContextMarkdownPath,
  isProseLogPath,
  outputSystemMessage,
  projectRootFromInput,
  readStdinJson,
  readTextIfExists,
  resolveProjectPath
} from "./chunk-CDKEYATP.mjs";
import {
  logError
} from "./chunk-SCQPZLF2.mjs";
import {
  safeLoadFrontmatterFile,
  safeParseFrontmatter
} from "./chunk-5U76735W.mjs";
import {
  jsYaml
} from "./chunk-LFGT2BKG.mjs";
import "./chunk-UTP6CBAZ.mjs";
import {
  loadConfig
} from "./chunk-D55RRO3F.mjs";
import {
  require__,
  require_dist
} from "./chunk-FZ2GR6GF.mjs";
import {
  __toESM
} from "./chunk-SGA7NFMW.mjs";

// hooks/post-write-verify.mjs
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath as fileURLToPath2 } from "node:url";

// lib/schema-validator.mjs
var import__ = __toESM(require__(), 1);
var import_ajv_formats = __toESM(require_dist(), 1);
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
var __dirname = dirname(fileURLToPath(import.meta.url));
var DEFAULT_SCHEMA_PATH = resolve(__dirname, "..", "tests", "frontmatter.schema.json");
var schemaCache = /* @__PURE__ */ new Map();
var ajvCache = /* @__PURE__ */ new Map();
var validatorCache = /* @__PURE__ */ new Map();
function loadJsonSchemaSync(schemaPath = DEFAULT_SCHEMA_PATH) {
  const resolved = resolve(schemaPath);
  if (schemaCache.has(resolved)) return schemaCache.get(resolved);
  const schema = JSON.parse(readFileSync(resolved, "utf-8"));
  schemaCache.set(resolved, schema);
  return schema;
}
function ajvFor(schemaPath) {
  const resolved = resolve(schemaPath);
  if (ajvCache.has(resolved)) return ajvCache.get(resolved);
  const ajv = new import__.default({
    allErrors: true,
    strict: false,
    allowUnionTypes: true,
    validateSchema: false
  });
  (0, import_ajv_formats.default)(ajv);
  ajvCache.set(resolved, ajv);
  return ajv;
}
function resolveLocalRef(schema, refNode) {
  if (!refNode?.$ref?.startsWith("#/$defs/")) return refNode;
  const name = refNode.$ref.slice("#/$defs/".length);
  return schema.$defs?.[name] ?? refNode;
}
function typeSchemaMatches(typeSchema, typeValue) {
  if (!typeSchema) return false;
  if (Object.hasOwn(typeSchema, "const")) return typeSchema.const === typeValue;
  if (Array.isArray(typeSchema.enum)) return typeSchema.enum.includes(typeValue);
  return false;
}
function findFrontmatterBranch(schema, typeValue) {
  if (!typeValue) return null;
  for (const chunk of schema.allOf ?? []) {
    for (const branchRef of chunk.oneOf ?? []) {
      const branch = resolveLocalRef(schema, branchRef);
      if (typeSchemaMatches(branch?.properties?.type, typeValue)) {
        return branch;
      }
    }
  }
  return null;
}
function schemaWithDefs(rootSchema, subSchema) {
  return {
    ...subSchema,
    $schema: rootSchema.$schema,
    $defs: rootSchema.$defs ?? {}
  };
}
function compileValidator({ schemaPath = DEFAULT_SCHEMA_PATH, kind = "frontmatter", name = null }) {
  const cacheKey = `${resolve(schemaPath)}::${kind}::${name ?? "<root>"}`;
  if (validatorCache.has(cacheKey)) return validatorCache.get(cacheKey);
  const rootSchema = loadJsonSchemaSync(schemaPath);
  let schema;
  if (kind === "frontmatter" && name) {
    const branch = findFrontmatterBranch(rootSchema, name);
    schema = branch ? schemaWithDefs(rootSchema, branch) : rootSchema;
  } else if (kind === "sibling-yaml") {
    const branch = rootSchema.siblingYamlSchemas?.[name];
    schema = branch ? schemaWithDefs(rootSchema, branch) : null;
  } else {
    schema = rootSchema;
  }
  if (!schema) return null;
  const ajv = ajvFor(schemaPath);
  const validate = ajv.compile(schema);
  validatorCache.set(cacheKey, validate);
  return validate;
}
function normalizeAjvErrors(errors = []) {
  return errors.map((err) => ({
    path: err.instancePath || "/",
    message: err.message ?? "schema violation",
    keyword: err.keyword,
    schemaPath: err.schemaPath,
    params: err.params ?? {}
  }));
}
function validateFrontmatter(data, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      valid: false,
      type: null,
      errors: [{ path: "/", message: "frontmatter is not a YAML mapping", keyword: "type" }]
    };
  }
  const type = data.type ?? null;
  const validate = compileValidator({ schemaPath, kind: "frontmatter", name: type });
  const valid = validate(data);
  return {
    valid,
    type,
    errors: valid ? [] : normalizeAjvErrors(validate.errors)
  };
}
function validateSiblingYaml(data, { artifact = data?.artifact, schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      valid: false,
      artifact: artifact ?? null,
      errors: [{ path: "/", message: "sibling YAML is not a mapping", keyword: "type" }]
    };
  }
  const validate = compileValidator({ schemaPath, kind: "sibling-yaml", name: artifact });
  if (!validate) {
    return {
      valid: false,
      artifact: artifact ?? null,
      errors: [{ path: "/artifact", message: `no sibling YAML schema for artifact: ${artifact ?? "<missing>"}`, keyword: "required" }]
    };
  }
  const valid = validate(data);
  return {
    valid,
    artifact,
    errors: valid ? [] : normalizeAjvErrors(validate.errors)
  };
}
async function validateSiblingYamlFile(filePath, { schemaPath = DEFAULT_SCHEMA_PATH, artifact } = {}) {
  let data;
  try {
    data = jsYaml.load(await readFile(filePath, "utf-8"));
  } catch (err) {
    return {
      path: filePath,
      valid: false,
      artifact: artifact ?? null,
      errors: [{ path: "/", message: err.message ?? "YAML parse error", keyword: "parse" }]
    };
  }
  const result = validateSiblingYaml(data, { artifact: artifact ?? data?.artifact, schemaPath });
  return { path: filePath, ...result };
}
async function validateFrontmatterFile(filePath, { schemaPath = DEFAULT_SCHEMA_PATH } = {}) {
  const loaded = await safeLoadFrontmatterFile(filePath);
  if (loaded.parseError) {
    return {
      path: filePath,
      valid: false,
      type: null,
      errors: [{ path: "/", message: loaded.parseError, keyword: "parse" }],
      frontmatter: null
    };
  }
  const result = validateFrontmatter(loaded.data, { schemaPath });
  return {
    path: filePath,
    ...result,
    frontmatter: loaded.data
  };
}
function formatValidationErrors(errors = []) {
  return errors.map((err) => `${err.path || "/"}: ${err.message}`).join("\n");
}

// lib/limitation-lexicon.mjs
var LIMITATION_RE = /does not (exist|ship|expose)|is(n'?t| not) (available|exposed|supported)|no longer (exists|available|exposed|supported)|(API|method|function|field|prop(?:erty)?) is missing|not (?:a )?(?:real|valid) (?:API|method|export)|was removed (?:from|in)\b/i;
var CITATION_MARKER_RE = /source:|node_modules\/|\brepro:|\bissue:\s*#?\d|https?:\/\/|study-sources|\.d\.ts\b/i;
var SUPPRESSION_RE = /\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable|#\s*type:\s*ignore|#\s*noqa|@SuppressWarnings|#pragma warning disable|\/\/\s*nolint|@Suppress\b/;
var DEBT_MARKER_RE = /sdlc-debt:/i;
var MECHANISM_RE = /\b(state[- ]machine|scheduler|queue|cache|pipeline|orchestrator|regex)\b/i;
function lines(text) {
  return String(text ?? "").split(/\r?\n/);
}
function markerWithin(ls, i, window, marker) {
  const lo = Math.max(0, i - window), hi = Math.min(ls.length - 1, i + window);
  for (let j = lo; j <= hi; j++) if (marker.test(ls[j])) return true;
  return false;
}
function findUncitedLimitationClaims(text, { onlyComments = true } = {}) {
  const ls = lines(text);
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    if (!LIMITATION_RE.test(line)) continue;
    if (onlyComments && !/^\s*(\/\/|\/\*|\*|#|<!--|--)/.test(line) && !/\/\/|\/\*|#\s|<!--/.test(line)) continue;
    if (markerWithin(ls, i, 3, CITATION_MARKER_RE)) continue;
    out.push({ line: i + 1, text: line.trim().slice(0, 200) });
  }
  return out;
}
function findUnmarkedSuppressions(text) {
  const ls = lines(text);
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    if (!SUPPRESSION_RE.test(ls[i])) continue;
    if (markerWithin(ls, i, 2, DEBT_MARKER_RE)) continue;
    out.push({ line: i + 1, text: ls[i].trim().slice(0, 200) });
  }
  return out;
}
function findUnownedMechanisms(acText, decisionText) {
  const found = /* @__PURE__ */ new Set();
  const dt = String(decisionText ?? "").toLowerCase();
  for (const line of lines(acText)) {
    let m;
    const re = new RegExp(MECHANISM_RE.source, "ig");
    while (m = re.exec(line)) {
      const noun = m[1].toLowerCase().replace(/[- ]/g, " ");
      if (!dt.includes(noun) && !dt.includes(noun.replace(" ", "-")) && !dt.includes(noun.replace(" ", ""))) {
        found.add(m[1].toLowerCase());
      }
    }
  }
  return [...found];
}

// hooks/post-write-verify.mjs
var RICH_TIER_TYPES = /* @__PURE__ */ new Set([
  "review",
  "plan",
  "design",
  "ship-run",
  "rca",
  "benchmark",
  "experiment",
  "instrument",
  "profile",
  "simplify-run",
  "review-command",
  "design-audit",
  "design-critique",
  // v9.71 — craft's visual contract gains its own rich layer (02c-craft.yaml +
  // .html.fragment, type: design-contract). Reverses the Gap-D "no interactive
  // layer" call now that craft authors a coverage-grid fragment. Reminder-gated
  // only; NOT in SIBLING_YAML_VALIDATED_TYPES (no real corpus to hard-validate yet).
  "design-contract"
]);
var SIBLING_YAML_VALIDATED_TYPES = /* @__PURE__ */ new Set([
  "plan",
  "review",
  "design",
  "simplify-run",
  "ship-run"
]);
function fragmentOwningType(text) {
  if (!text) return null;
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fence) return null;
  const block = fence[1];
  const typeMatch = /(?:^|\n)\s*type:\s*["']?([A-Za-z0-9-]+)/.exec(block);
  const type = typeMatch ? typeMatch[1] : null;
  if (type !== "augmentation") return type;
  const augMatch = /(?:^|\n)\s*augmentation-type:\s*["']?([A-Za-z0-9-]+)/.exec(block);
  return augMatch ? augMatch[1] : type;
}
function fragmentEscaped(text) {
  if (!text) return false;
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fence) return false;
  return /(?:^|\n)\s*fragment:\s*["']?(none|skip|n\/a)["']?\s*(?:#.*)?$/im.test(fence[1]);
}
async function enforceSiblingFragments(paths, config) {
  if (config.hooks?.remindMissingFragments === false) return;
  const blocking = [];
  const nudges = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (!type || !RICH_TIER_TYPES.has(type)) continue;
    if (fragmentEscaped(text)) continue;
    const stem = path.absolute.replace(/\.md$/, "");
    const fileStem = path.original.replace(/\\/g, "/").split("/").at(-1).replace(/\.md$/, "");
    const hasYaml = existsSync(`${stem}.yaml`);
    const hasFragment = existsSync(`${stem}.html.fragment`);
    if (!hasYaml) {
      const missing = [`${fileStem}.yaml`];
      if (!hasFragment) missing.push(`${fileStem}.html.fragment`);
      blocking.push({ rel: path.original, type, missing });
    } else if (!hasFragment) {
      nudges.push({ rel: path.original, type, missing: [`${fileStem}.html.fragment`] });
    }
  }
  if (blocking.length) {
    const lines2 = blocking.map((r) => `  - ${r.rel} (type: ${r.type}) \u2014 missing ${r.missing.join(" + ")}`);
    process.stderr.write(
      `wf-postwrite-verify: rich-tier artifact written without its mandatory sibling .yaml:

${lines2.join("\n")}

The sunflower view GATES the whole rich page (file-change topology, files-touched
table, verdict heatmap, risk callouts, etc.) on the sibling .yaml \u2014 without it the
page silently degrades to plain prose. Author the siblings NOW, while this artifact
is still in context:
  1. Write <stem>.yaml \u2014 the structured data (schema: siblingYamlSchemas.<type> in
     plugins/sdlc-workflow/tests/frontmatter.schema.json).
  2. Write <stem>.html.fragment \u2014 the body-only interactive layer.
Full contract: plugins/sdlc-workflow/reference/fragment-author-contract.md.
If this artifact legitimately has no structured data to project, set
\`fragment: none\` in its frontmatter to opt out.
`
    );
    process.exit(2);
  }
  if (nudges.length) {
    const lines2 = nudges.map((r) => `  - ${r.rel} (type: ${r.type}) \u2014 missing ${r.missing.join(" + ")}`);
    outputSystemMessage(
      `wf: rich-tier artifact(s) have their sibling .yaml but no .html.fragment:
${lines2.join("\n")}
The page already renders rich from the .yaml; the .html.fragment only adds the interactive layer (collapsible rows, filters, copy controls). Author it per reference/fragment-author-contract.md if this artifact warrants interactivity.`
    );
  }
}
async function validateSiblingYamls(paths, config, schemaPath) {
  if (config.hooks?.validateSiblingYaml === false) return;
  const failures = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (!type || !SIBLING_YAML_VALIDATED_TYPES.has(type)) continue;
    const yamlPath = `${path.absolute.replace(/\.md$/, "")}.yaml`;
    if (!existsSync(yamlPath)) continue;
    const result = await validateSiblingYamlFile(yamlPath, { schemaPath, artifact: type });
    if (!result.valid) {
      failures.push({ rel: `${path.original.replace(/\.md$/, "")}.yaml`, result });
    }
  }
  if (!failures.length) return;
  for (const f of failures) {
    process.stderr.write(`wf-postwrite-verify: sibling YAML validation FAILED for ${f.rel}

`);
    process.stderr.write(`${formatValidationErrors(f.result.errors)}

`);
  }
  process.stderr.write("The sibling .yaml does not conform to siblingYamlSchemas.<type>\n");
  process.stderr.write("(see plugins/sdlc-workflow/tests/frontmatter.schema.json). The sunflower view\n");
  process.stderr.write("reads this file to build the rich page; a malformed shape degrades the figure.\n");
  process.stderr.write("Fix the issues above, then continue.\n");
  process.exit(2);
}
var SHADOW_DEFERRAL_RE = /(deferred to (?:the )?(?:user|manual|operator)\b|deferred to manual user|UNVERIFIED[ -]INTERACTIVE|will be verified (?:interactively )?(?:during|in|at)\b|decidable by static reasoning|deferred to user verification)/i;
function blockVerifyResultGate(rel, message) {
  process.stderr.write(
    `wf-postwrite-verify: verify result gate BLOCKED ${rel}

${message}

This gate (AC-VERIFIABILITY recommendations R7) makes the "verified but actually
broken" pass mechanically impossible. Re-Edit the frontmatter to reconcile result
with the acceptance evidence, then continue. Opt out with hooks.verifyResultGate: false.
`
  );
  process.exit(2);
}
async function enforceVerifyResultGate(paths, config) {
  const resultGate = config.hooks?.verifyResultGate !== false;
  const proseLint = config.hooks?.verifyDeferralLint !== false;
  const mockGate = config.hooks?.mockEvidenceGate !== false;
  if (!resultGate && !proseLint && !mockGate) return;
  const warnings = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    if (fragmentOwningType(text) !== "verify") continue;
    const { data, content } = safeParseFrontmatter(text, { filePath: path.absolute });
    if (!data || data.result !== "pass") continue;
    if (mockGate) {
      const mock = data["metric-acceptance-mock-rung"];
      if (typeof mock === "number" && mock > 0) {
        blockVerifyResultGate(
          path.original,
          `result: pass but metric-acceptance-mock-rung (${mock}) > 0. At least one user-observable AC's highest evidence-rung is cited-mock / uncited-mock / static \u2014 a mock or static analysis does not evidence user-observable behaviour. Climb the constraint-resolution ladder to a live/headless/emulator rung, or take the deferral path (interactive-verification: deferred + a 00-index runtime-evidence-deferrals entry), then set result: partial. Opt out with hooks.mockEvidenceGate: false.`
        );
      }
    }
    if (resultGate) {
      const met = data["metric-acceptance-met"];
      const total = data["metric-acceptance-total"];
      if (typeof met === "number" && typeof total === "number" && total > 0 && met < total) {
        blockVerifyResultGate(
          path.original,
          `result: pass but metric-acceptance-met (${met}) < metric-acceptance-total (${total}). A passing slice must meet EVERY acceptance criterion. Either evidence the unmet AC(s) and raise metric-acceptance-met to ${total}, or set result to \`partial\` / \`fail\`. If an unmet AC is user-observable and this environment cannot evidence it, set interactive-verification: deferred (result becomes \`partial\`) and register a 00-index runtime-evidence-deferrals entry.`
        );
      }
      if (data["interactive-verification"] === "deferred") {
        blockVerifyResultGate(
          path.original,
          "result: pass but interactive-verification: deferred. A deferred user-observable AC has no runtime evidence, so the slice cannot pass \u2014 set result: partial. (`/wf ship` then hard-blocks until a probe/re-verify run clears the deferral.)"
        );
      }
    }
    if (proseLint) {
      const hit = SHADOW_DEFERRAL_RE.exec(content || "");
      if (hit) warnings.push({ rel: path.original, phrase: hit[0].trim() });
    }
  }
  if (warnings.length) {
    const lines2 = warnings.map((w) => `  - ${w.rel}: found "${w.phrase}" while result: pass`);
    outputSystemMessage(
      `wf: possible prose-only deferral in a passing verify artifact:
${lines2.join("\n")}
A user-observable AC that was "deferred to user/manual", left "UNVERIFIED-INTERACTIVE", punted to a later slice, or "decided by static reasoning" is NOT met by a runtime drive. If that is what happened, set result: partial + interactive-verification: deferred (with the rungs tried in the defer-reason) and register the deferral in 00-index runtime-evidence-deferrals \u2014 do not leave it as a silent pass. Disable this lint with hooks.verifyDeferralLint: false.`
    );
  }
}
function newTextFromInput(input) {
  const ti = input?.tool_input ?? {};
  if (typeof ti.content === "string") return ti.content;
  if (typeof ti.new_string === "string") return ti.new_string;
  if (Array.isArray(ti.edits)) return ti.edits.map((e) => e?.new_string ?? "").join("\n");
  return "";
}
function enforceCodeFileLints(input, config, artifactPaths) {
  const limitationLint = config.hooks?.limitationClaimLint !== false;
  const debtLint = config.hooks?.suppressionDebtLint !== false;
  if (!limitationLint && !debtLint) return;
  const artifactSet = new Set((artifactPaths ?? []).map((p) => p.original));
  const paths = collectToolInputPaths(input).filter(
    (p) => !artifactSet.has(p) && !isManagedArtifactMarkdownPath(p) && !isProseLogPath(p)
  );
  if (!paths.length) return;
  const text = newTextFromInput(input);
  if (!text.trim()) return;
  const lines2 = [];
  if (limitationLint) {
    for (const hit of findUncitedLimitationClaims(text)) {
      lines2.push(`  - limitation claim without a citation (line ${hit.line}): "${hit.text}"`);
    }
  }
  if (debtLint) {
    for (const hit of findUnmarkedSuppressions(text)) {
      lines2.push(`  - suppression without an sdlc-debt: marker (line ${hit.line}): "${hit.text}"`);
    }
  }
  if (!lines2.length) return;
  outputSystemMessage(
    `wf: intent-fidelity code lints (advisory) on ${paths.join(", ")}:
${lines2.join("\n")}
A "does not exist / not exposed / was removed" comment is a HYPOTHESIS \u2014 cite the installed source (a study-sources read of node_modules/, a repro, an issue, or a URL) within \xB13 lines, or delete it; never replicate an in-repo limitation comment into new code without re-verifying it. A new \`as any\` / \`@ts-ignore\` / \`eslint-disable\` needs an \`sdlc-debt:\` marker so the debt lifecycle (verify/retro/simplify) inherits it. Opt out: hooks.limitationClaimLint / hooks.suppressionDebtLint.`
  );
}
async function enforceNamedMechanismLint(paths, config) {
  if (config.hooks?.namedMechanismLint === false) return;
  const warns = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (type !== "shape" && type !== "slice") continue;
    const { content } = safeParseFrontmatter(text, { filePath: path.absolute });
    if (!content) continue;
    const acLines = [];
    const decisionLines = [];
    let inAc = false;
    for (const line of content.split(/\r?\n/)) {
      if (/^#{1,4}\s/.test(line)) inAc = /acceptance criteria|verification|test/i.test(line);
      (inAc ? acLines : decisionLines).push(line);
    }
    const unowned = findUnownedMechanisms(acLines.join("\n"), decisionLines.join("\n"));
    if (unowned.length) warns.push({ rel: path.original, nouns: unowned });
  }
  if (warns.length) {
    const lines2 = warns.map((w) => `  - ${w.rel}: ${w.nouns.join(", ")}`);
    outputSystemMessage(
      `wf: named-mechanism lint (advisory) \u2014 a mechanism named in an AC/verification line has no owning decision in the artifact body:
${lines2.join("\n")}
A test may not name a machine the design does not own. State the mechanism in the body (what it is, what it replaces, why) and adjudicate it if it touches a RIM or PO directive, or drop it from the AC. Opt out: hooks.namedMechanismLint: false.`
    );
  }
}
var PLUGIN_ROOT = fileURLToPath2(new URL("..", import.meta.url));
async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === "1") return;
  if (process.env.SDLC_DISPATCH_ACTIVE === "1") return;
  const input = await readStdinJson();
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.verifyOnWrite === false) return;
  const schemaPath = join(PLUGIN_ROOT, "tests", "frontmatter.schema.json");
  const paths = collectToolInputPaths(input).filter((path) => isManagedArtifactMarkdownPath(path)).map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) })).filter(({ absolute }) => absolute && existsSync(absolute));
  enforceCodeFileLints(input, config, paths);
  if (!paths.length) return;
  const failures = [];
  for (const path of paths) {
    if (isProseLogPath(path.original)) continue;
    if (isProjectContextMarkdownPath(path.original)) {
      const text = await readTextIfExists(path.absolute);
      if (!hasFrontmatterFence(text)) continue;
    }
    const result = await validateFrontmatterFile(path.absolute, { schemaPath });
    if (!result.valid) failures.push({ path, result });
  }
  if (!failures.length) {
    await enforceVerifyResultGate(paths, config);
    await enforceNamedMechanismLint(paths, config);
    await validateSiblingYamls(paths, config, schemaPath);
    await enforceSiblingFragments(paths, config);
    return;
  }
  for (const failure of failures) {
    process.stderr.write(`wf-postwrite-verify: frontmatter validation FAILED for ${failure.path.original}

`);
    process.stderr.write(`${formatValidationErrors(failure.result.errors)}

`);
  }
  process.stderr.write("The file was written but does not conform to the sdlc/v1 schema\n");
  process.stderr.write("(see plugins/sdlc-workflow/tests/frontmatter.schema.json).\n");
  process.stderr.write("Re-Edit the frontmatter to fix the issues above, then continue.\n");
  process.exit(2);
}
main().catch(async (err) => {
  try {
    await logError("post-write-verify", err);
  } catch {
  }
  process.exit(0);
});
