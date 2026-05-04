#!/usr/bin/env node
/**
 * Router shim generator for sdlc-workflow.
 *
 * Reads a router-metadata.json describing each old-command -> new-router-invocation
 * mapping, and writes a 10-line shim file at the old command path that redirects
 * to the new router invocation. Adapted from impeccable's pin.mjs (.scratch/impeccable/
 * plugin/skills/impeccable/scripts/pin.mjs).
 *
 * Usage:
 *   node plugins/sdlc-workflow/scripts/router-shim.mjs <router-key>
 *
 *   <router-key> is the router slug (e.g. "review", "wf-quick"). The script reads
 *   plugins/sdlc-workflow/skills/<router-key>/router-metadata.json which must contain:
 *   {
 *     "router": "/review",
 *     "shims": [
 *       { "oldPath": "commands/review-all.md",
 *         "subcommand": "all",
 *         "description": "...verbatim from original...",
 *         "argumentHint": "[scope] [target]" },
 *       ...
 *     ]
 *   }
 *
 *   Writes (or overwrites) each oldPath as a shim. Idempotent: re-running on an
 *   already-shimmed file refreshes the shim. Refuses to overwrite a non-shim file
 *   (safety against clobbering work-in-progress edits).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');
const PIN_MARKER = '<!-- sdlc-workflow-pinned-shim -->';

function shimBody({ name, description, argumentHint, router, subcommand }) {
  // Description and argument-hint are quoted with JSON.stringify to handle
  // any embedded quotes/newlines in the source description.
  return `---
name: ${name}
description: ${JSON.stringify(description)}
argument-hint: ${JSON.stringify(argumentHint)}
disable-model-invocation: true
---
${PIN_MARKER}

This file is a pinned shortcut for \`${router} ${subcommand}\`.

Invoke \`${router} ${subcommand}\`, passing along any arguments provided here, and follow its instructions.
`;
}

function isShim(content) {
  return content.includes(PIN_MARKER);
}

function shimPathToCommandName(oldPath) {
  // commands/review-all.md            -> review-all
  // commands/review/architecture.md   -> review:architecture
  const rel = oldPath.replace(/\\/g, '/').replace(/^commands\//, '').replace(/\.md$/, '');
  return rel.replace(/\//g, ':');
}

function main() {
  const routerKey = process.argv[2];
  if (!routerKey) {
    console.error('Usage: node router-shim.mjs <router-key>');
    process.exit(1);
  }

  const metadataPath = join(PLUGIN_ROOT, 'skills', routerKey, 'router-metadata.json');
  if (!existsSync(metadataPath)) {
    console.error(`Metadata not found: ${metadataPath}`);
    process.exit(1);
  }

  const meta = JSON.parse(readFileSync(metadataPath, 'utf-8'));
  const { router, shims } = meta;

  let written = 0;
  let skipped = 0;
  for (const shim of shims) {
    const absPath = join(PLUGIN_ROOT, shim.oldPath);
    if (existsSync(absPath)) {
      const existing = readFileSync(absPath, 'utf-8');
      if (!isShim(existing)) {
        // First-time shimming: this means we are about to *replace* a real
        // command file. Refuse unless --force is set, so re-running the script
        // doesn't accidentally clobber edits made between runs.
        if (!process.argv.includes('--force')) {
          console.error(`REFUSE: ${shim.oldPath} is not a shim. Pass --force to overwrite (this is the first migration pass).`);
          skipped++;
          continue;
        }
      }
    }
    mkdirSync(dirname(absPath), { recursive: true });
    const name = shimPathToCommandName(shim.oldPath);
    const body = shimBody({
      name,
      description: shim.description,
      argumentHint: shim.argumentHint,
      router,
      subcommand: shim.subcommand,
    });
    writeFileSync(absPath, body, 'utf-8');
    written++;
    console.log(`  shim: ${shim.oldPath} -> ${router} ${shim.subcommand}`);
  }
  console.log(`\nWrote ${written} shim(s); skipped ${skipped}.`);
}

main();
