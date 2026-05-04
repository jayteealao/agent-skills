#!/usr/bin/env node
/**
 * Layer 2 routing-resolution verifier.
 *
 * For each fixture in tests/migration-fixtures.json, asks Claude (via the Agent
 * SDK) to apply the router's parsing rule to the invocation and report which
 * reference file it would load. The resolved path must equal the fixture's
 * expectedReferencePath.
 *
 * Generic across routers: pass --router <key> to load
 * commands/<key>.md as the routing rule and the matching fixtures file.
 *
 *   node plugins/sdlc-workflow/scripts/verify-routing-resolution.mjs
 *   node plugins/sdlc-workflow/scripts/verify-routing-resolution.mjs --router review
 *
 * Uses local OAuth (no API key required). Each fixture costs ~1 cheap Haiku call.
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { query } from '@anthropic-ai/claude-agent-sdk';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = resolve(__dirname, '..');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { router: 'review' };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--router') opts.router = args[++i];
    else if (args[i] === '--fixtures') opts.fixtures = args[++i];
  }
  return opts;
}

function extractRoutingSection(routerText) {
  // Pull out everything from "# Step 0" through end-of-file. That's the
  // routing rule the router applies. Falls back to the full body if the
  // markers are missing.
  const m = routerText.match(/(# Step 0[\s\S]+)$/);
  return m ? m[1] : routerText;
}

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

function buildPrompt({ routingSection, invocation }) {
  return `You are emulating a routing dispatcher. Apply the routing rules below verbatim
to the user invocation and output ONLY the relative path of the reference file
that would be read, with no commentary, prefix, or markdown.

OUTPUT FORMAT: a single line of text — a path like
  skills/<router>/reference/<key>.md
or, if the invocation is empty / asks the dispatcher to render a menu, the
literal string:
  <menu>

ROUTING RULES (excerpted from the router file):
${routingSection}

USER INVOCATION:
${invocation}`;
}

async function main() {
  const opts = parseArgs();
  // Skill-mode routers (v9.0.0-alpha.1+) live at skills/<key>/SKILL.md with no
  // commands/<key>.md file. Command-mode routers (legacy v8.x) live at
  // commands/<key>.md. Resolve in skill-first order so post-v9 callers Just Work.
  const skillPath = join(PLUGIN_ROOT, 'skills', opts.router, 'SKILL.md');
  const commandPath = join(PLUGIN_ROOT, 'commands', `${opts.router}.md`);
  const routerPath = existsSync(skillPath) ? skillPath : commandPath;
  // Default fixtures path: review uses the historical migration-fixtures.json
  // (kept as-is so existing CI invocations don't break). Other routers default
  // to tests/<router>-fixtures.json. --fixtures overrides either default.
  const defaultFixtures = opts.router === 'review'
    ? join(PLUGIN_ROOT, 'tests', 'migration-fixtures.json')
    : join(PLUGIN_ROOT, 'tests', `${opts.router}-fixtures.json`);
  const fixturesPath = opts.fixtures
    ? resolve(opts.fixtures)
    : defaultFixtures;

  if (!existsSync(routerPath)) {
    console.error(`Router file not found: tried ${skillPath} and ${commandPath}`);
    process.exit(1);
  }
  if (!existsSync(fixturesPath)) {
    console.error(`Fixtures file not found: ${fixturesPath}`);
    process.exit(1);
  }

  const routerText = readFileSync(routerPath, 'utf-8');
  const routingSection = extractRoutingSection(routerText);
  const fx = JSON.parse(readFileSync(fixturesPath, 'utf-8'));

  let pass = 0;
  const failures = [];

  for (const fixture of fx.fixtures) {
    process.stdout.write(`> ${fixture.id} ... `);

    let resolved;
    try {
      resolved = await askModel(buildPrompt({ routingSection, invocation: fixture.invocation }));
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failures.push(`[${fixture.id}] ${err.message}`);
      continue;
    }

    const norm = (s) => s.replace(/^[`"'\s]+|[`"'\s.]+$/g, '');
    resolved = norm(resolved);

    const expected =
      fixture.expectedBehavior === 'menu' ? '<menu>' : norm(fixture.expectedReferencePath || '');

    if (resolved === expected) {
      console.log(`PASS  -> ${resolved}`);
      pass++;
    } else {
      console.log(`FAIL`);
      console.log(`    invocation(${fixture.invocation}) -> ${resolved}`);
      console.log(`    expected:                          ${expected}`);
      failures.push(`[${fixture.id}] got=${resolved} want=${expected}`);
    }
  }

  console.log(`\n${pass}/${fx.fixtures.length} fixtures resolved correctly.`);
  if (failures.length > 0) {
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
