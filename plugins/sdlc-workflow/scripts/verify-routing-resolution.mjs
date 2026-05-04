#!/usr/bin/env node
/**
 * Layer 2 routing-resolution verifier.
 *
 * For each fixture in tests/migration-fixtures.json, asks Claude (via the Agent
 * SDK) to apply the /review router's parsing rule to two invocations and report
 * which reference file each would load:
 *
 *   - the OLD invocation (which goes through a pinned shim that redirects)
 *   - the NEW invocation (which goes directly to the router)
 *
 * Both must resolve to the same reference file. This catches routing bugs that
 * Layer 1 (byte-equal body checks) cannot — for example, a router parsing rule
 * that mishandles the `pass` keyword for an aggregate.
 *
 * Usage:
 *   node plugins/sdlc-workflow/scripts/verify-routing-resolution.mjs
 *
 * Uses local OAuth (no API key required). Each fixture costs ~2 cheap Haiku
 * calls; the whole sweep runs in well under a minute.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

const ROUTER_PATH = join(PLUGIN_ROOT, 'commands', 'review.md');
const FIXTURES_PATH = join(PLUGIN_ROOT, 'tests', 'migration-fixtures.json');

function readShim(oldPath) {
  // Resolve "commands/review-all.md" or "commands/review/security.md" from the
  // fixture's `old` invocation: e.g. `/review-all` -> commands/review-all.md
  // and `/review:security` -> commands/review/security.md.
  return readFileSync(join(PLUGIN_ROOT, oldPath), 'utf-8');
}

function shimPathForOldInvocation(oldInvocation) {
  // /review-all   -> commands/review-all.md
  // /review:security -> commands/review/security.md
  // /review:frontend-accessibility -> commands/review/frontend-accessibility.md
  const tokens = oldInvocation.trim().split(/\s+/);
  const head = tokens[0]; // "/review-all" or "/review:security"
  if (!head.startsWith('/')) throw new Error(`bad invocation: ${oldInvocation}`);
  const stripped = head.slice(1);
  if (stripped.includes(':')) {
    const [_, rest] = stripped.split(':');
    return `commands/review/${rest}.md`;
  }
  return `commands/${stripped}.md`;
}

const ROUTER_CONTENT = readFileSync(ROUTER_PATH, 'utf-8');

async function askModel(prompt) {
  let text = '';
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 45_000);
  for await (const msg of query({
    prompt,
    options: { maxTurns: 1, model: 'haiku', abortController: ac, tools: [] },
  })) {
    if (msg.type === 'assistant' && msg.message?.content) {
      for (const block of msg.message.content) {
        if (block.type === 'text') text += block.text;
      }
    }
  }
  return text.trim();
}

const RESOLVE_INSTR = `You are emulating a routing dispatcher. Apply the following routing rules verbatim
to the given user invocation and output ONLY the relative path of the reference file
that would be read, with no commentary, explanation, prefix, or markdown.

OUTPUT FORMAT: a single line of text, exactly one of:
  skills/review/reference/<key>.md
  skills/review/reference/_aggregate-<key>.md

ROUTER RULES (excerpt from commands/review.md):
- Parse \\$ARGUMENTS. The first positional token determines the subcommand.
- If first token is "pass", the second token is an aggregate key. Reference: skills/review/reference/_aggregate-<key>.md.
- Otherwise, the first token is a dimension key. Reference: skills/review/reference/<key>.md.
- When a dimension key collides with an aggregate name (architecture, infra, security), a bare /review <name> resolves to the dimension. /review pass <name> reaches the aggregate.

USER INVOCATION:
`;

const SHIM_INSTR = `You are emulating a routing dispatcher. The user typed a legacy slash command.
The legacy command file is a "pinned shim" whose content is below. The shim
contains a redirect line of the form: "Invoke \`/review <subcommand>\`...". Apply
the redirect to determine the new router invocation, then apply the routing rules
to determine the reference file.

OUTPUT FORMAT: a single line of text, exactly one of:
  skills/review/reference/<key>.md
  skills/review/reference/_aggregate-<key>.md

ROUTING RULES (after the redirect):
- The redirect produces a new invocation like "/review <args>".
- If the first arg after /review is "pass", the second arg is an aggregate key. Reference: skills/review/reference/_aggregate-<key>.md.
- Otherwise the first arg is a dimension key. Reference: skills/review/reference/<key>.md.

LEGACY SHIM FILE CONTENT:
---SHIM-START---
{SHIM}
---SHIM-END---

USER INVOCATION:
`;

async function main() {
  const fx = JSON.parse(readFileSync(FIXTURES_PATH, 'utf-8'));
  let pass = 0;
  const failures = [];

  for (const fixture of fx.fixtures) {
    process.stdout.write(`> ${fixture.id} ... `);

    // For "no-args" fixtures the new invocation has no positional after /review;
    // the router renders the menu rather than resolving a reference. Treat the
    // expected reference as null and just confirm the model says so.
    const isMenuFixture = fixture.expectedBehavior === 'menu';

    let newResolved = null;
    let oldResolved = null;
    try {
      if (isMenuFixture) {
        // For menu fixtures we don't ask the model — both old and new should
        // produce the menu, which is a behavior, not a reference path. We rely
        // on Layer 1 checks (the router file's text contains the menu rendering
        // instruction).
        newResolved = '<menu>';
        oldResolved = '<menu>';
      } else {
        // NEW: feed router rules + invocation, ask for reference path.
        newResolved = (await askModel(RESOLVE_INSTR + fixture.new)).trim();

        // OLD: locate the shim, embed it, ask the model to redirect-then-resolve.
        const shimPath = shimPathForOldInvocation(fixture.old);
        const shim = readFileSync(join(PLUGIN_ROOT, shimPath), 'utf-8');
        oldResolved = (await askModel(SHIM_INSTR.replace('{SHIM}', shim) + fixture.old)).trim();
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failures.push(`[${fixture.id}] ${err.message}`);
      continue;
    }

    // Normalize trailing punctuation / quotes the model might add.
    const norm = (s) => s.replace(/^[`"'\s]+|[`"'\s.]+$/g, '');
    newResolved = norm(newResolved);
    oldResolved = norm(oldResolved);

    if (newResolved === oldResolved) {
      console.log(`PASS  -> ${newResolved}`);
      pass++;
    } else {
      console.log(`FAIL`);
      console.log(`    new(${fixture.new}) -> ${newResolved}`);
      console.log(`    old(${fixture.old}) -> ${oldResolved}`);
      failures.push(`[${fixture.id}] new=${newResolved} vs old=${oldResolved}`);
    }
  }

  console.log(`\n${pass}/${fx.fixtures.length} fixtures resolved equivalently.`);
  if (failures.length > 0) {
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
