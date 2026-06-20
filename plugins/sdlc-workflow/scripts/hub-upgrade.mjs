#!/usr/bin/env node
// scripts/hub-upgrade.mjs — explicit controlled hub runtime upgrade (NATIVE-INTEROP
// "Controlled Runtime Upgrade" / Workstream C). Deliberately swaps the live
// machine-wide hub to a different shared runtime build, with rollback if the new
// runtime fails to come up healthy. SessionStart stays adoption-first; THIS is the
// only path that replaces a healthy hub on purpose.
//
//   node <runtimeRoot>/dist/hub-upgrade.mjs            # upgrade to THIS runtime
//   node scripts/hub-upgrade.mjs --plugin-root <path>  # upgrade to another build
//   ... --allow-downgrade --yes                        # force an explicit downgrade
//
// Exit 0 only on a real success (upgraded / already-current). A rollback,
// downgrade refusal, or abort exits non-zero — the machine is left healthy
// (rolled back to the previous runtime) but the upgrade did NOT take effect.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { controlledUpgrade } from '../lib/hub-lifecycle.mjs';

function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function hasFlag(name) { return process.argv.includes(name); }

const here = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(argValue('--plugin-root', resolve(here, '..')));
const allowDowngrade = hasFlag('--allow-downgrade');
const confirm = hasFlag('--yes') || hasFlag('--confirm');

const result = await controlledUpgrade({
  pluginRoot,
  allowDowngrade,
  confirm,
  log: (m) => process.stderr.write(`${m}\n`),
});

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
process.exit(result.action === 'upgraded' || result.action === 'already-current' ? 0 : 1);
