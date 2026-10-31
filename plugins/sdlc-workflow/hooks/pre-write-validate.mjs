#!/usr/bin/env node
/**
 * PreToolUse(Write) validator for .ai/workflows/ artifacts:
 * - Refuse a Write or Edit into a nested .ai/ folder (lib/records-root.mjs nestedAiDir).
 * - Refuse a Write or Edit of a record file (state.yaml, slice-<s>.yaml, ...), of a store that
 *   one command writes (decisions.yaml, findings.yaml, steps.jsonl) or of an old record name
 *   beside the records, anywhere in the wf-dir, the records clone included: scripts write the
 *   records from drafts (lib/records.mjs). A file in a subfolder (evidence, notes) goes through.
 * - Refuse a write by a local .ai/workflows/ path in a linked project, and name the wf-dir path.
 * - Skip missing file_path.
 * - Skip non-.ai/workflows markdown paths.
 * - Skip Write inputs without content.
 * - Enforce NN-name.md / NNx-name.md plus risk-register, estimate, announce.
 * - Require YAML frontmatter with schema/type/slug.
 * - Require schema: sdlc/v1.
 * - Require frontmatter slug to match .ai/workflows/<slug>/.
 * - Exempt the po-answers.md prose log (see isProseLogPath).
 * - Warn, do not block, when .ai/workflows/INDEX.md is missing or lacks the slug row.
 * - Refuse a 04-plan*.md write while a needed design is unsettled (design lane human
 *   rule, lib/design-lane.mjs).
 * - Block with exit 2 + stderr on validation errors.
 *
 * Exports `run(input)` for the folded `pre-tool-use-all` entry. The standalone entry below stays one release.
 */

import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { checksModeOf } from '../lib/config.mjs';
import { designGateRefusal, isPlanArtifact, planSliceOf } from '../lib/design-lane.mjs';
import { missingDesignFiles } from '../lib/design-surface.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import { startedPacketRewriteError } from '../lib/packets.mjs';
import { hookConfig, hookProjectRoot, isEntry, refuseWrite, runStandalone } from '../lib/hook-runner.mjs';
import {
  formatList,
  hasFrontmatterFence,
  isFreeFormWorkflowPath,
  isProjectContextMarkdownPath,
  isProseLogPath,
  isWorkflowMarkdownPath,
  isPacketPath,
  isWorkSetPath,
  outputSystemMessage,
  projectContextPathInfo,
  readTextIfExists,
  resolveProjectPath,
  workflowPathInfo,
} from '../lib/hook-utils.mjs';
import { DRAFT_DIR, RECORD_FILE_RE, frontmatterOfDoc, hasDoc, locate } from '../lib/records.mjs';
import { evidenceDir, linkedLocalTarget, linkedProject, localRelOf, nestedAiDir, parseWorkflowPath, recordsRel, workflowDir, workflowDirOf, workflowsRoot } from '../lib/records-root.mjs';
import { EVIDENCE_LOG, maxFileBytes } from '../lib/run-files.mjs';
import { otherLease } from '../lib/leases.mjs';

function validateFilename(filename) {
  if (/^\d{2}[a-z]?-.+\.md$/.test(filename)) return null;
  if (['risk-register.md', 'estimate.md', 'announce.md'].includes(filename)) return null;
  // wf-meta skip records use stable prefix names rather than the NN convention
  // (skip-shape.md). The hotfix (hf-*) and refactor (rf-*) mini-pipelines were
  // retired by the compressed-lifecycle migration — new hotfix/refactor runs write
  // NN-prefixed standard artifacts (01-hotfix.md / 01-refactor.md, 02-shape.md…),
  // so `hf`/`rf` no longer need an exemption.
  if (/^skip-.+\.md$/.test(filename)) return null;
  return `Filename '${filename}' does not follow the NN-stagename.md convention (e.g., 01-intake.md, 04-plan.md). Use two-digit prefix + hyphen + name.`;
}

async function registryWarnings({ projectRoot, filePath, workflowDir, filename }) {
  if (filename !== '00-index.md') return [];

  const registry = join(workflowsRoot(projectRoot), 'INDEX.md');
  if (!existsSync(registry)) {
    return [
      `Global workflow registry .ai/workflows/INDEX.md is missing. Run /wf status once to bootstrap it - this enables positional slug detection (the no-flag way to attach a compressed slice to '${workflowDir}' via /wf intake/probe/simplify).`,
    ];
  }

  const registryText = await readTextIfExists(registry);
  if (registryText !== null && !new RegExp(`^${escapeRegex(workflowDir)}\\t`, 'm').test(registryText)) {
    return [
      `Slug '${workflowDir}' has no row in .ai/workflows/INDEX.md. Run /wf status to register it - until then, '/wf intake <mode> ${workflowDir} ...' (or /wf probe|simplify) falls through to standalone mode instead of attaching as a compressed slice.`,
    ];
  }

  return [];
}

export async function run(input) {
  const projectRoot = hookProjectRoot(input);
  const config = await hookConfig(input);
  if (checksModeOf(config) === 'off') return;

  const filePath = input?.tool_input?.file_path;
  const content = input?.tool_input?.content;
  const nested = filePath ? nestedAiDir(filePath, projectRoot) : null;
  if (nested) {
    refuseWrite(checksModeOf(config), `wf-validate: blocked a write into the nested folder ${nested}.\nThe records of this project live in ${workflowsRoot(projectRoot)}. Write there, by an absolute path.`);
    return;
  }
  const refusal = filePath ? capRefusal(filePath, content, projectRoot) ?? linkedWriteRefusal(filePath, projectRoot) ?? recordWriteRefusal(filePath, projectRoot) ?? leaseRefusal(filePath, projectRoot) : null;
  if (refusal) {
    refuseWrite(checksModeOf(config), refusal);
    return;
  }
  if (!filePath || (!isWorkflowMarkdownPath(filePath) && !isProjectContextMarkdownPath(filePath))) return;
  if (!content) return;

  if (isProjectContextMarkdownPath(filePath)) {
    validateProjectContextWrite({ filePath, content, mode: checksModeOf(config) });
    return;
  }

  const info = workflowPathInfo(filePath);
  if (!info) {
    outputSystemMessage('Could not parse workflow directory from path. Skipping validation.');
    return;
  }

  const filename = basename(info.filename);
  // probe-evidence/, verify-evidence/, a brainstorm's research/ and references/,
  // work/changes.md, and history/ snapshots are free-form (no filename
  // convention, no frontmatter) — see isFreeFormWorkflowPath in hook-utils.
  if (isFreeFormWorkflowPath(filePath)) return;
  const errors = [];
  // po-answers.md is the frontmatter-less product-owner prose log — exempt from
  // both the filename convention and the frontmatter requirement. See isProseLogPath.
  const isProseLog = isProseLogPath(filePath);
  // design-notes/ holds per-sub-command transformation artifacts whose
  // names (animate-<ts>.md, extract.md, etc.) deliberately skip the
  // NN-stagename convention (they carry the design-augmentation type instead).
  const inDesignNotes = info.storageRel.startsWith('design-notes/');
  // work/<packet-slug>.md packets and work/index.md carry a schema type but are named
  // for the slug they open.
  const inWorkSet = isWorkSetPath(filePath);
  if (!inDesignNotes && !isProseLog && !inWorkSet) {
    const filenameError = validateFilename(filename);
    if (filenameError) errors.push(filenameError);
  }

  if (isProseLog) {
    // po-answers.md carries no frontmatter by design — skip the frontmatter checks.
  } else if (!hasFrontmatterFence(content)) {
    errors.push('Missing YAML frontmatter. All workflow files must start with --- delimited YAML frontmatter containing at minimum: schema, type, slug.');
  } else {
    const parsed = safeParseFrontmatter(content, { filePath });
    if (parsed.parseError) {
      errors.push(`YAML frontmatter parse error: ${parsed.parseError}`);
    } else if (!parsed.raw.trim()) {
      errors.push('Empty YAML frontmatter. Required fields: schema, type, slug.');
    } else {
      const { schema, type, slug } = parsed.data ?? {};
      if (!schema) {
        errors.push("Missing 'schema' field in frontmatter. Must be 'sdlc/v1'.");
      } else if (schema !== 'sdlc/v1') {
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

  // A started packet is never rewritten: the campaign walk owns it, and only its state changes.
  if (errors.length === 0 && isPacketPath(filePath)) {
    const prior = await readTextIfExists(resolveProjectPath(projectRoot, filePath));
    const refusal = prior === null ? null : startedPacketRewriteError(prior, content);
    if (refusal) errors.push(refusal);
  }

  const recordRel = info.storageRel.startsWith(`${DRAFT_DIR}/`) ? info.storageRel.slice(DRAFT_DIR.length + 1) : info.storageRel;
  if (errors.length === 0 && isPlanArtifact(recordRel)) {
    const refusal = await designGate({ projectRoot, filePath, slug: info.slug, storageRel: recordRel });
    if (refusal) errors.push(refusal);
  }

  if (errors.length > 0) {
    refuseWrite(checksModeOf(config), `wf-validate: blocked write to ${filename} in workflow '${info.slug}'. Errors:\n${formatList(errors)}\n\nFix these issues and retry the write.\n`);
    return;
  }

  const warnings = await registryWarnings({
    projectRoot,
    filePath: resolveProjectPath(projectRoot, filePath),
    workflowDir: info.slug,
    filename,
  });
  if (warnings.length > 0) {
    outputSystemMessage(`wf-validate: write to ${filename} allowed. Advisory: ${warnings.join(' ')}`);
  }
}

// Scripts write the records. An agent writes a draft, .draft/<old name>.md, and
// `wf.mjs record put` checks it and writes its section; `wf.mjs record set` changes a field.
// So a Write or Edit of a record file, or of an old record name beside the records, is refused.
// The log of the person's answers (lib/answers.mjs) is refused too: only the question hook
// appends to it.
const ANSWER_LOG = /(?:^|\/)\.ai\/(?:workflows|run)\/answers\.jsonl$/;

// The manifest and the layout of the design surface, and the design records (comments,
// approval pictures, check results), have script writers only.
const DESIGN_SCRIPT_FILE = /(?:^|\/)\.ai\/design\/(?:screens|layout|references)\.json$/;

function recordWriteRefusal(filePath, projectRoot) {
  const abs = resolveProjectPath(projectRoot, filePath);
  if (DESIGN_SCRIPT_FILE.test(String(abs).replace(/\\/g, '/'))) {
    return 'wf-validate: blocked a write to the design manifest, layout or references. Add or change a screen with `node <plugin root>/skills/wf/scripts/wf.mjs design screen add <root> <key> ...`, a reference with `... design refs add <root> <key> --file <path>`, and the viewports with `... design viewports <root> <name>=<W>x<H> ...`; the canvas saves the layout.\n';
  }
  if (ANSWER_LOG.test(String(abs).replace(/\\/g, '/'))) {
    return 'wf-validate: blocked a write to answers.jsonl. The question hook writes each answer event of the person; no agent writes it.\n';
  }
  const info = workflowPathInfo(abs);
  const cli = 'node <plugin root>/skills/wf/scripts/wf.mjs';
  if (info && info.slug === '_design') {
    return 'wf-validate: blocked a write to the design records. Comments come through the canvas, and `wf.mjs design` writes the approvals and the check results.\n';
  }
  if (info && /^inbox\//.test(info.storageRel)) {
    return `wf-validate: blocked a write to the inbox of workflow '${info.slug}'. Post a message with \`${cli} msg post <root> ${info.slug} --kind <kind> --text "<text>"\`.\n`;
  }
  if (!info || info.storageRel.includes('/')) return null;
  if (RECORD_FILE_RE.test(info.filename)) {
    return `wf-validate: blocked a write to ${info.filename} in workflow '${info.slug}'. Scripts write the record files.\n` +
      `fix: \`${cli} record set <root> ${info.slug} <old name> key=value\` changes a field, \`${cli} record edit <root> ${info.slug} <old name> --section <heading> --from <file>\` changes a section, ` +
      `or write a draft in <wf-dir>/${DRAFT_DIR}/ and run \`${cli} record put <root> ${info.slug}\`.\n`;
  }
  const store = SCRIPT_STORES[info.filename];
  if (store) {
    return `wf-validate: blocked a write to ${info.filename} in workflow '${info.slug}'. One command writes this file.\n` +
      `fix: \`${cli} ${store.replace('<slug>', info.slug)}\`\n`;
  }
  if (locate(info.filename)) {
    return `wf-validate: blocked a write to ${info.filename} in workflow '${info.slug}'. The records are YAML files that scripts write.\n` +
      `fix: write the record as the draft ${DRAFT_DIR}/${info.filename} in the same folder, then run \`${cli} record put <root> ${info.slug}\`.\n`;
  }
  return null;
}

// The files of a workflow that one command writes, each with that command. An agent never
// writes them by hand, in the local folder or in the records clone.
const SCRIPT_STORES = Object.freeze({
  'decisions.yaml': 'decide add <root> <slug> --answer "<answer>" --key <key> --question "<question>"',
  'findings.yaml': 'findings add <root> <slug> <found.json> --source review',
  'steps.jsonl': 'step <start|done|stop|complete> <root> <slug> <slice> ...',
});

// A workflow folder holds only files that sync, so a file over the size cap (records.max-file-mb)
// is refused there. A trace, a video or a large log goes to the evidence folder of the project,
// and the next records commit lists it in the record.
function capRefusal(filePath, content, projectRoot) {
  if (typeof content !== 'string') return null;
  const bytes = Buffer.byteLength(content);
  const limit = maxFileBytes();
  if (bytes <= limit) return null;
  const abs = resolveProjectPath(projectRoot, filePath);
  const info = parseWorkflowPath(abs);
  if (!info) return null;
  const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `wf-validate: blocked a write of ${mb(bytes)} to ${abs}. A workflow file stays under ${mb(limit)} (records.max-file-mb), so every record syncs. ` +
    `Write a trace, a video or a large log to ${evidenceDir(projectRoot, info.slug)} instead; the next records commit lists it in ${EVIDENCE_LOG}.\n`;
}

// A linked project keeps each workflow in its wf-dir in the records clone, the drafts too. A file
// written by its local path in .ai/workflows/ would never reach the records repo, and a later
// reader would look for it in the wf-dir. So the write is refused, and the refusal names the place.
function linkedWriteRefusal(filePath, projectRoot) {
  const abs = resolveProjectPath(projectRoot, filePath);
  const target = linkedLocalTarget(projectRoot, abs);
  if (!target) return null;
  const slug = localRelOf(projectRoot, abs)?.split('/')[0] ?? '';
  const where = slug && !slug.includes('.') ? `The wf-dir of this workflow is ${workflowDir(projectRoot, slug)}. ` : '';
  return `wf-validate: blocked a write to ${abs}. This project keeps its workflows in the records repo clone, not in .ai/workflows/. ${where}` +
    `A draft goes to <wf-dir>/${DRAFT_DIR}/.\nfix: write the file at ${target}.\n`;
}

// The lease names the one machine that writes a workflow now. The hook reads the lease ref that
// the last sync fetched, with no network call, and refuses a write into the folder of a workflow
// whose lease another machine holds.
function leaseRefusal(filePath, projectRoot) {
  const project = linkedProject(projectRoot);
  if (!project) return null;
  const abs = resolveProjectPath(projectRoot, filePath);
  const inHome = recordsRel(abs)?.split('/');
  const local = localRelOf(projectRoot, abs)?.split('/');
  const slug = inHome?.[0] === project ? inHome[1] : local && local.length > 1 ? local[0] : null;
  if (!slug || slug.startsWith('.') || slug.startsWith('_')) return null;
  const other = otherLease(projectRoot, slug);
  if (!other) return null;
  return `wf-validate: blocked a write to ${abs}. The lease of '${slug}' belongs to ${other.machine}${other.host ? ` (${other.host})` : ''} until ${other.expires}: another computer writes this workflow now. Stop the stage, and tell the person.\n`;
}

// Design lane human rule: read the slug's index, 02b-design.md presence, and the
// 02c-craft.md frontmatter of the workflow of the plan being written, and the board files that
// 02c-craft.md `boards:` lists. A per-slice plan also
// reads 03-slice-<slice>.md: a slice with `ux-impact: none` needs no design. Fail
// open on any read or parse problem — this gate guards a decision, not the file format.
async function designGate({ projectRoot, filePath, slug, storageRel }) {
  try {
    const dir = workflowDirOf(resolveProjectPath(projectRoot, filePath));
    const index = frontmatterOfDoc(dir, '00-index.md');
    if (!index) return null;
    const contract = frontmatterOfDoc(dir, '02c-craft.md');
    const hasBrief = hasDoc(dir, '02b-design.md');
    const sliceSlug = planSliceOf(storageRel);
    const slice = sliceSlug === null ? null : frontmatterOfDoc(dir, `03-slice-${sliceSlug}.md`);
    // A contract that names its screens or its boards is settled only when those files exist.
    const missingBoards = missingDesignFiles(projectRoot, dir, contract);
    return designGateRefusal({ index, hasBrief, contract, slug, slice, sliceSlug, missingBoards });
  } catch {
    return null;
  }
}

function validateProjectContextWrite({ filePath, content, mode }) {
  const info = projectContextPathInfo(filePath);
  if (!info || !hasFrontmatterFence(content)) return;

  const parsed = safeParseFrontmatter(content, { filePath });
  const errors = [];
  if (parsed.parseError) {
    errors.push(`YAML frontmatter parse error: ${parsed.parseError}`);
  } else if (!parsed.raw.trim()) {
    errors.push('Empty YAML frontmatter. Remove the fence or provide schema/type.');
  } else {
    const { schema, type } = parsed.data ?? {};
    if (!schema) {
      errors.push("Missing 'schema' field in frontmatter. Must be 'sdlc/v1'.");
    } else if (schema !== 'sdlc/v1') {
      errors.push(`Invalid schema '${schema}'. Must be 'sdlc/v1'.`);
    }
    if (!type) {
      errors.push(`Missing 'type' field in frontmatter. Expected '${info.expectedType}'.`);
    } else if (type !== info.expectedType) {
      errors.push(`Invalid type '${type}'. Expected '${info.expectedType}' for ${info.filename}.`);
    }
  }

  if (errors.length > 0) {
    refuseWrite(mode, `wf-validate: blocked write to project context file ${info.filename}. Errors:\n${formatList(errors)}\n\nFix these issues and retry the write.\n`);
    return;
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (isEntry('pre-write-validate')) runStandalone('pre-write-validate', run);
