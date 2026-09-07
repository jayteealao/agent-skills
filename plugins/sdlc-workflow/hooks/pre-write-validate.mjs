#!/usr/bin/env node
/**
 * PreToolUse(Write) validator for .ai/workflows/ artifacts:
 * - Skip missing file_path.
 * - Skip non-.ai/workflows markdown paths.
 * - Skip Write inputs without content.
 * - Enforce NN-name.md / NNx-name.md plus risk-register, estimate, announce.
 * - Require YAML frontmatter with schema/type/slug.
 * - Require schema: sdlc/v1.
 * - Require frontmatter slug to match .ai/workflows/<slug>/.
 * - Exempt the po-answers.md prose log (see isProseLogPath).
 * - Warn, do not block, when .ai/workflows/INDEX.md is missing or lacks the slug row.
 * - Block with exit 2 + stderr on validation errors.
 *
 * Exports `run(input)` for the folded `pre-tool-use-all` entry (WIDE-VIEW
 * §14.2.6). The standalone entry below stays one release.
 */

import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { loadConfig } from '../lib/config.mjs';
import { safeParseFrontmatter } from '../lib/frontmatter.mjs';
import { blockToolCall, isEntry, runStandalone } from '../lib/hook-runner.mjs';
import {
  formatList,
  hasFrontmatterFence,
  isProjectContextMarkdownPath,
  isProbeEvidencePath,
  isProseLogPath,
  isWorkflowMarkdownPath,
  outputSystemMessage,
  projectContextPathInfo,
  projectRootFromInput,
  readTextIfExists,
  resolveProjectPath,
  workflowPathInfo,
} from '../lib/hook-utils.mjs';

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

  const registry = join(projectRoot, '.ai', 'workflows', 'INDEX.md');
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
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.validateOnWrite === false) return;

  const filePath = input?.tool_input?.file_path;
  const content = input?.tool_input?.content;
  if (!filePath || (!isWorkflowMarkdownPath(filePath) && !isProjectContextMarkdownPath(filePath))) return;
  if (!content) return;

  if (isProjectContextMarkdownPath(filePath)) {
    validateProjectContextWrite({ filePath, content });
    return;
  }

  const info = workflowPathInfo(filePath);
  if (!info) {
    outputSystemMessage('Could not parse workflow directory from path. Skipping validation.');
    return;
  }

  const filename = basename(info.filename);
  // probe-evidence/ evidence files are free-form (no filename convention, no
  // frontmatter) — see isProbeEvidencePath in hook-utils.
  if (isProbeEvidencePath(filePath)) return;
  const errors = [];
  // po-answers.md is the frontmatter-less product-owner prose log — exempt from
  // both the filename convention and the frontmatter requirement. See isProseLogPath.
  const isProseLog = isProseLogPath(filePath);
  // design-notes/ holds per-sub-command transformation artifacts whose
  // names (animate-<ts>.md, extract.md, etc.) deliberately skip the
  // NN-stagename convention (they carry the design-augmentation type instead).
  const inDesignNotes = info.storageRel.startsWith('design-notes/');
  if (!inDesignNotes && !isProseLog) {
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

  if (errors.length > 0) {
    process.stderr.write(`wf-validate: blocked write to ${filename} in workflow '${info.slug}'. Errors:\n${formatList(errors)}\n\nFix these issues and retry the write.\n`);
    blockToolCall();
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

function validateProjectContextWrite({ filePath, content }) {
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
    process.stderr.write(`wf-validate: blocked write to project context file ${info.filename}. Errors:\n${formatList(errors)}\n\nFix these issues and retry the write.\n`);
    blockToolCall();
  }
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

if (isEntry('pre-write-validate')) runStandalone('pre-write-validate', run);
