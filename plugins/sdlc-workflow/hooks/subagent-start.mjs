#!/usr/bin/env node
// hooks/subagent-start.mjs — Codex SubagentStart adapter.
//
// Injects per-child workflow context via `additionalContext`: the active
// workflow slug(s) + current stage from `.ai/workflows/INDEX.md`, the
// child-side write discipline, and the External Output Boundary reminder.
//
// Deliberately MINIMAL (CODEX-REMEDIATION-PLAN H3): this hook is the Codex
// landing site for the feedback-loops W6 standing-instructions (steer.md)
// propagation contract. When W6 lands, its steering rows are injected HERE —
// do not grow an independent steering contract in this file.
// Always exits 0 — context injection must never block a spawn.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { emitAdditionalContext, findProjectRoot, readEvent, workflowsRootOf } from './_adapter.mjs';

const MAX_SLUGS = 3;
// The schema's slug shape (`$defs.slug`). INDEX.md is plain text in the repo, so a row that
// does not match is skipped: it never reaches a path join or the injected context.
const SLUG = /^[a-z0-9][a-z0-9-]{0,79}$/;
const STAGE = /^[a-z0-9][a-z0-9-]{0,39}$/;

function activeWorkflows(projectRoot) {
  // INDEX.md rows: slug<TAB>status<TAB>workflow-type<TAB>branch<TAB>updated-at
  let text;
  try {
    text = readFileSync(join(workflowsRootOf(projectRoot), 'INDEX.md'), 'utf-8');
  } catch {
    return [];
  }
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split('\t');
    if (cells.length < 2) continue;
    const [slug, status] = cells.map((c) => c.trim());
    if (slug === 'slug' || !SLUG.test(slug)) continue;
    if (status === 'active') rows.push({ slug, stage: currentStage(projectRoot, slug) });
  }
  return rows;
}

// The stage is in state.yaml (the record layout) or in the head of 00-index.md (the old one).
function currentStage(projectRoot, slug) {
  for (const name of ['state.yaml', '00-index.md']) {
    try {
      const head = readFileSync(join(workflowsRootOf(projectRoot), slug, name), 'utf-8').slice(0, 4000);
      const stage = /^current-stage:\s*["']?([^"'\s]+)/m.exec(head)?.[1] ?? null;
      return stage && STAGE.test(stage) ? stage : null;
    } catch {
      // the next layout
    }
  }
  return null;
}

function main() {
  const event = readEvent() ?? {};
  const projectRoot = findProjectRoot(event.cwd);
  const active = activeWorkflows(projectRoot);
  if (!active.length) return; // no workflow context to inject — stay silent

  const listed = active.slice(0, MAX_SLUGS)
    .map((w) => (w.stage ? `\`${w.slug}\` (stage: ${w.stage})` : `\`${w.slug}\``))
    .join(', ');
  const more = active.length > MAX_SLUGS ? ` (+${active.length - MAX_SLUGS} more)` : '';

  emitAdditionalContext(
    'SubagentStart',
    `SDLC workflow context — active workflow(s): ${listed}${more}. ` +
      `You are a subagent: read artifacts under \`${workflowsRootOf(projectRoot).replace(/\\/g, '/')}/<slug>/\` for context, but do NOT ` +
      'write workflow artifacts, acquire leases, or ask the user gate questions — the coordinating ' +
      'parent owns writes and gates; return findings as text. External Output Boundary: never leak ' +
      'workflow-internal paths, stage names, slice slugs, or artifact contents into external-facing ' +
      'output (PR bodies, commit messages, published docs, issue comments) — translate to product language.',
  );
}

try { main(); } finally { process.exit(0); }
