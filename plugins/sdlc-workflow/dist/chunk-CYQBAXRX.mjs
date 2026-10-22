import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  ledgerProblems
} from "./chunk-CI2GKFZ3.mjs";
import {
  sourceItemProblems
} from "./chunk-AZ4QRSJA.mjs";
import {
  formatValidationErrors,
  validateBrainstormBoardFile,
  validateFrontmatterFile,
  validatePrototypeLedgerFile,
  validateSiblingYamlFile
} from "./chunk-GKIHU4J2.mjs";
import {
  designModesOf
} from "./chunk-JTJFHSOY.mjs";
import {
  blockToolCall,
  isEntry,
  runStandalone
} from "./chunk-BHLXNNOH.mjs";
import {
  loadConfig
} from "./chunk-QUEAOP62.mjs";
import {
  collectToolInputPaths,
  hasFrontmatterFence,
  isBrainstormBoardPath,
  isFreeFormWorkflowPath,
  isManagedArtifactMarkdownPath,
  isProjectContextMarkdownPath,
  isProseLogPath,
  isPrototypeLedgerPath,
  isShipPlanAuditPath,
  normalizePathForMatch,
  outputSystemMessage,
  projectRootFromInput,
  readTextIfExists,
  resolveProjectPath
} from "./chunk-OVD25SAL.mjs";
import {
  safeParseFrontmatter
} from "./chunk-5U76735W.mjs";

// hooks/post-write-verify.mjs
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

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
var RICH_TIER_TYPES = /* @__PURE__ */ new Set(["review", "review-command", "plan"]);
var SIBLING_YAML_VALIDATED_TYPES = /* @__PURE__ */ new Set(["plan", "review"]);
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
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (!type || !RICH_TIER_TYPES.has(type)) continue;
    if (fragmentEscaped(text)) continue;
    const stem = path.absolute.replace(/\.md$/, "");
    const fileStem = path.original.replace(/\\/g, "/").split("/").at(-1).replace(/\.md$/, "");
    if (!existsSync(`${stem}.yaml`)) blocking.push({ rel: path.original, type, missing: [`${fileStem}.yaml`] });
  }
  if (blocking.length) {
    const lines2 = blocking.map((r) => `  - ${r.rel} (type: ${r.type}) \u2014 missing ${r.missing.join(" + ")}`);
    process.stderr.write(
      `wf-postwrite-verify: artifact written without its mandatory sibling .yaml:

${lines2.join("\n")}

Later stages read this .yaml: the review .yaml is the findings ledger, and the plan
.yaml carries the files and edges that the sibling-plan table and the campaign read.
Write <stem>.yaml NOW, while this artifact is still in context. The schema is
siblingYamlSchemas.<type> in plugins/sdlc-workflow/tests/frontmatter.schema.json.
If this artifact has no findings or no file changes, set \`fragment: none\` in its
frontmatter to opt out.
`
    );
    blockToolCall();
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
    let schemaName = type;
    if (type === "rca" && /^status:\s*ready-for-fix-routing\s*$/m.test(text ?? "")) {
      schemaName = "rca-diagnosis";
    }
    const result = await validateSiblingYamlFile(yamlPath, { schemaPath, artifact: schemaName });
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
  blockToolCall();
}
var SHADOW_DEFERRAL_RE = /(deferred to (?:the )?(?:user|manual|operator)\b|deferred to manual user|UNVERIFIED[ -]INTERACTIVE|will be verified (?:interactively )?(?:during|in|at)\b|decidable by static reasoning|deferred to user verification)/i;
function blockVerifyResultGate(rel, message) {
  process.stderr.write(
    `wf-postwrite-verify: verify result gate BLOCKED ${rel}

${message}

This gate blocks a pass that the acceptance evidence does not support.
Re-Edit the frontmatter to reconcile result
with the acceptance evidence, then continue. Opt out with hooks.verifyResultGate: false.
`
  );
  blockToolCall();
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
          `result: pass but metric-acceptance-mock-rung (${mock}) > 0. At least one user-observable AC's highest evidence-rung is cited-mock / uncited-mock / static / asserted \u2014 a mock, a static analysis, or an unverified claim of success does not evidence user-observable behaviour. Climb the constraint-resolution ladder to a live/headless/emulator rung (for a task AC: re-read the system of record \u2014 live \u2014 or record a cited attestation \u2014 attested), or take the deferral path (interactive-verification: deferred + a 00-index runtime-evidence-deferrals entry), then set result: partial. Opt out with hooks.mockEvidenceGate: false.`
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
async function enforceIntakeLedgerLint(paths, config) {
  if (config.hooks?.intakeLedgerLint === false) return;
  const warns = [];
  for (const path of paths) {
    const base = path.original.replace(/\\/g, "/").split("/").at(-1);
    if (base !== "01-intake.md") continue;
    const text = await readTextIfExists(path.absolute);
    if (fragmentOwningType(text) !== "intake") continue;
    const indexPath = path.absolute.replace(/01-intake\.md$/, "00-index.md");
    const indexText = await readTextIfExists(indexPath);
    if (!indexText) continue;
    const { data: idx } = safeParseFrontmatter(indexText, { filePath: indexPath });
    const missing = [];
    const bodyHasRims = /(^|\n)\s*-\s*\*\*RIM-\d+/.test(text || "");
    const idxRisks = idx?.["intent-risks"];
    const risksDeclared = Array.isArray(idxRisks) ? idxRisks.length > 0 : idxRisks === "none-declared";
    if (!bodyHasRims && !risksDeclared) missing.push("intent-risks (RIM ledger)");
    const bodyHasCharter = /(^|\n)\s*-\s*\*\*C\d+\*\*/.test(text || "");
    const idxCharter = idx?.charter;
    const charterDeclared = Array.isArray(idxCharter) ? idxCharter.length > 0 : idxCharter === "none-declared";
    if (!bodyHasCharter && !charterDeclared) missing.push("charter");
    if (missing.length) warns.push({ rel: path.original, missing });
  }
  if (warns.length) {
    const lines2 = warns.map((w) => `  - ${w.rel}: missing ${w.missing.join(" + ")}`);
    outputSystemMessage(
      `wf: intake ledger lint (advisory) \u2014 a default-mode intake landed without its intent ledger:
${lines2.join("\n")}
A default intake may not be SILENTLY ledger-less: author RIM entries (## Risks if Misunderstood, the Step 6a misreading pass) and 3-7 charter commitments into 00-index.md, or declare the explicit escape \`intent-risks: none-declared\` / \`charter: none-declared\` with a one-line reason in the body. Otherwise shape's Step 9a will STOP and backfill the ledger before adjudicating. Opt out: hooks.intakeLedgerLint: false.`
    );
  }
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
var TRIAGE_SEVERITIES = /* @__PURE__ */ new Set(["BLOCKER", "HIGH"]);
function auditTriageViolation(data) {
  const findings = Array.isArray(data?.findings) ? data.findings : [];
  const severe = findings.filter(
    (f) => f && String(f.status ?? "open").toLowerCase() === "open" && TRIAGE_SEVERITIES.has(String(f.severity ?? "").toUpperCase())
  );
  if (!severe.length) return null;
  const status = String(data?.["triage-status"] ?? "").toLowerCase();
  if (status === "awaiting-user") {
    const since = Number(data?.["awaiting-since"]);
    const lastRun = Number(data?.["last-run"]);
    if (Number.isInteger(since) && Number.isInteger(lastRun) && since === lastRun) return null;
    const shownSince = data?.["awaiting-since"] === void 0 ? "(missing)" : String(data["awaiting-since"]);
    const shownRun = Number.isInteger(lastRun) ? String(lastRun) : "(missing)";
    return {
      reason: `triage-status is \`awaiting-user\` but \`awaiting-since\` is ${shownSince} while \`last-run\` is ${shownRun}: the escape lasts one run. Ask the gate again in this run and set \`awaiting-since: ${Number.isInteger(lastRun) ? lastRun : "<last-run>"}\`, or record the decisions. Open: ` + severe.map((f) => f.id ?? "<no id>").join(", "),
      count: severe.length
    };
  }
  if (status === "complete") {
    const untriaged = severe.filter((f) => String(f.triage ?? "").toLowerCase() !== "accept");
    if (!untriaged.length) return null;
    return {
      reason: `triage-status is \`complete\` but ${untriaged.length} open BLOCKER/HIGH finding(s) carry no \`triage: accept\`: ` + untriaged.map((f) => f.id ?? "<no id>").join(", "),
      count: untriaged.length
    };
  }
  return {
    reason: `${severe.length} open BLOCKER/HIGH finding(s) and triage-status is \`${status || "(missing)"}\`: ` + severe.map((f) => f.id ?? "<no id>").join(", "),
    count: severe.length
  };
}
async function enforceShipPlanAuditTriage(paths, config) {
  if (config.hooks?.shipPlanAuditTriageGate === false) return;
  for (const path of paths) {
    const text = await readTextIfExists(path.absolute);
    if (!hasFrontmatterFence(text)) continue;
    const { data } = safeParseFrontmatter(text, { filePath: path.absolute });
    if (!data || String(data.kind ?? "") !== "ship-plan-audit") continue;
    const violation = auditTriageViolation(data);
    if (!violation) continue;
    process.stderr.write(
      `wf-postwrite-verify: ship-plan audit triage gate BLOCKED ${path.original}

${violation.reason}

Step 5 of reference/ship-plan/audit.md requires a gate question for every open BLOCKER/HIGH finding
before the ledger is finalized. Ask the gate now (per reference/_gate-question.md), then record each
decision in the ledger: accept -> \`triage: accept\` on the finding; acknowledge -> \`status: acknowledged\`
+ the reason; reject -> drop the finding. Then set \`triage-status: complete\`. If the turn must end while
the user answers, set \`triage-status: awaiting-user\` and \`awaiting-since: <last-run>\` instead; that escape
lasts one run. Opt out with hooks.shipPlanAuditTriageGate: false.
`
    );
    blockToolCall();
  }
}
async function validateBrainstormBoards(paths, config, schemaPath) {
  if (config.hooks?.validateBrainstormBoard === false) return;
  const failures = [];
  for (const path of paths) {
    const result = await validateBrainstormBoardFile(path.absolute, { schemaPath });
    if (!result.valid) failures.push({ path, result });
  }
  if (!failures.length) return;
  for (const f of failures) {
    process.stderr.write(`wf-postwrite-verify: brainstorm board validation FAILED for ${f.path.original}

`);
    process.stderr.write(`${formatValidationErrors(f.result.errors)}

`);
  }
  process.stderr.write("The board does not conform to $defs.brainstormBoard\n");
  process.stderr.write("(see plugins/sdlc-workflow/tests/frontmatter.schema.json and\n");
  process.stderr.write("skills/wf/reference/intake/brainstorm/_artifact.md). Fix the board, then continue.\n");
  blockToolCall();
}
async function validatePrototypeLedgers(paths, config, schemaPath) {
  if (config.hooks?.validatePrototypeLedger === false) return;
  const failures = [];
  for (const path of paths) {
    const result = await validatePrototypeLedgerFile(path.absolute, { schemaPath });
    let rules = [];
    if (result.valid) {
      try {
        rules = ledgerProblems(JSON.parse(readFileSync(path.absolute, "utf-8")));
      } catch {
        rules = [];
      }
    }
    if (!result.valid || rules.length) failures.push({ path, result, rules });
  }
  if (!failures.length) return;
  for (const f of failures) {
    process.stderr.write(`wf-postwrite-verify: proof ledger validation FAILED for ${f.path.original}

`);
    if (!f.result.valid) process.stderr.write(`${formatValidationErrors(f.result.errors)}

`);
    for (const r of f.rules) process.stderr.write(`  - ${r}
`);
  }
  process.stderr.write("The ledger does not conform to $defs.prototypeLedger and the ledger rules\n");
  process.stderr.write("(see plugins/sdlc-workflow/tests/frontmatter.schema.json and\n");
  process.stderr.write("skills/wf/reference/prototype.md). Fix the ledger, then continue.\n");
  blockToolCall();
}
async function enforceSourceCoverage(paths, config) {
  if (config.hooks?.ideateSourceCoverage === false) return;
  const failures = [];
  for (const path of paths) {
    if (!/(?:^|\/)01-ideate\.md$/.test(normalizePathForMatch(path.original))) continue;
    const text = await readTextIfExists(path.absolute);
    if (!text) continue;
    const fm = safeParseFrontmatter(text).data;
    if (fm?.type !== "ideation" || !fm.sources && !fm["source-items"]) continue;
    const problems = sourceItemProblems(fm);
    if (problems.length) failures.push({ path, problems });
  }
  if (!failures.length) return;
  for (const f of failures) {
    process.stderr.write(`wf-postwrite-verify: source coverage FAILED for ${f.path.original}
`);
    for (const p of f.problems) process.stderr.write(`  - ${p}
`);
  }
  process.stderr.write("Every source item needs exactly one result (skills/wf/reference/intake/ideate/_sources.md).\n");
  process.stderr.write("Give each named item its result, then continue.\n");
  blockToolCall();
}
var INDEX_SIZE_WARN_BYTES = 20480;
var INDEX_STAGE_HEAD_CHARS = 4e3;
var INDEX_COMMENT_PROSE_MAX_WORDS = 8;
function isWorkflowIndexPath(filePath) {
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/00-index\.md$/.test(normalizePathForMatch(filePath));
}
function indexLintWarnings(text, byteSize = Buffer.byteLength(String(text ?? ""), "utf8")) {
  const source = String(text ?? "");
  const warnings = [];
  if (byteSize > INDEX_SIZE_WARN_BYTES) {
    warnings.push(
      `00-index.md is ${byteSize} bytes, over the ${INDEX_SIZE_WARN_BYTES}-byte limit. Keep current state in the index; move YAML comment prose, old next-step commentary and finished sub-pass notes to index-history.jsonl (one JSON object per line: {"at","kind","text","stage"}). Keep the deferral list, intent risks, charter and revisions ledger in the index.`
    );
  }
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (fence) {
    const prose = [];
    for (const line of fence[1].split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("#")) continue;
      const words = trimmed.replace(/^#+/, "").trim().split(/\s+/).filter(Boolean);
      if (words.length > INDEX_COMMENT_PROSE_MAX_WORDS) prose.push(trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed);
    }
    if (prose.length) {
      warnings.push(
        `00-index.md frontmatter carries ${prose.length} YAML comment line(s) of prose (a \`#\` comment of more than ${INDEX_COMMENT_PROSE_MAX_WORDS} words), e.g. "${prose[0]}". Move this commentary to index-history.jsonl (kind: note or next-commentary) and keep only structured keys in the index.`
      );
    }
  }
  const stageRe = /^current-stage:\s*\S/m;
  if (!stageRe.test(source.slice(0, INDEX_STAGE_HEAD_CHARS)) && stageRe.test(source)) {
    warnings.push(
      `\`current-stage:\` is not in the first ${INDEX_STAGE_HEAD_CHARS} characters of 00-index.md. The subagent-start hook reads only that many characters, so it cannot see the stage. Move \`current-stage:\` near the top of the frontmatter.`
    );
  }
  return warnings;
}
var DESIGN_MODE_TYPES = /* @__PURE__ */ new Set(["design", "design-contract", "design-augmentation"]);
function designModeAdvice(fm) {
  if (!fm || !DESIGN_MODE_TYPES.has(fm.type)) return null;
  const { from, modes, register } = designModesOf(fm);
  if (from !== "register") return null;
  const field = fm.type === "design-contract" || fm.type === "design" ? "`surface-modes:` (surface \u2192 design mode)" : "`design-mode:`";
  return `carries \`register: ${register}\`, read as design mode \`${modes[0].mode}\`. \`register\` is deprecated: each surface now has its own design mode (persuade, operate, read, or experience). Write ${field} instead.`;
}
async function enforceDesignModeLint(paths, config) {
  if (config.hooks?.designModeLint === false) return;
  const lines2 = [];
  for (const path of paths) {
    const text = await readTextIfExists(path.absolute);
    if (!text) continue;
    const { data } = safeParseFrontmatter(text, { filePath: path.absolute });
    const advice = designModeAdvice(data);
    if (advice) lines2.push(`  - ${path.original} ${advice}`);
  }
  if (!lines2.length) return;
  outputSystemMessage(`wf: design mode (advisory):
${lines2.join("\n")}
Opt out: hooks.designModeLint: false.`);
}
async function enforceIndexLint(paths, config) {
  if (config.hooks?.indexLint === false) return;
  const lines2 = [];
  for (const path of paths) {
    if (!isWorkflowIndexPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    if (text === null) continue;
    let size;
    try {
      size = statSync(path.absolute).size;
    } catch {
      size = void 0;
    }
    for (const w of indexLintWarnings(text, size)) lines2.push(`  - ${path.original}: ${w}`);
  }
  if (!lines2.length) return;
  outputSystemMessage(`wf: index lint (advisory):
${lines2.join("\n")}
Opt out: hooks.indexLint: false.`);
}
var PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
async function run(input) {
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.verifyOnWrite === false) return;
  const schemaPath = join(PLUGIN_ROOT, "tests", "frontmatter.schema.json");
  const paths = collectToolInputPaths(input).filter((path) => isManagedArtifactMarkdownPath(path)).filter((path) => !isFreeFormWorkflowPath(path)).map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) })).filter(({ absolute }) => absolute && existsSync(absolute));
  enforceCodeFileLints(input, config, paths);
  const auditPaths = collectToolInputPaths(input).filter((path) => isShipPlanAuditPath(path)).map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) })).filter(({ absolute }) => absolute && existsSync(absolute));
  if (auditPaths.length) await enforceShipPlanAuditTriage(auditPaths, config);
  const boardPaths = collectToolInputPaths(input).filter((path) => isBrainstormBoardPath(path)).map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) })).filter(({ absolute }) => absolute && existsSync(absolute));
  if (boardPaths.length) await validateBrainstormBoards(boardPaths, config, schemaPath);
  const ledgerPaths = collectToolInputPaths(input).filter((path) => isPrototypeLedgerPath(path)).map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) })).filter(({ absolute }) => absolute && existsSync(absolute));
  if (ledgerPaths.length) await validatePrototypeLedgers(ledgerPaths, config, schemaPath);
  if (!paths.length) return;
  await enforceIndexLint(paths, config);
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
    await enforceSourceCoverage(paths, config);
    await enforceIntakeLedgerLint(paths, config);
    await enforceNamedMechanismLint(paths, config);
    await enforceDesignModeLint(paths, config);
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
  blockToolCall();
}
if (isEntry("post-write-verify")) runStandalone("post-write-verify", run);

export {
  auditTriageViolation,
  INDEX_SIZE_WARN_BYTES,
  INDEX_STAGE_HEAD_CHARS,
  INDEX_COMMENT_PROSE_MAX_WORDS,
  indexLintWarnings,
  designModeAdvice,
  run
};
