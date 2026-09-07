#!/usr/bin/env node
// scripts/doctor.mjs — `npm run doctor` (WIDE-VIEW-REPAIR-PLAN §14.2.1, W11.1).
//
// Prints one table: installed plugin version per host, the hub's version and
// build, the runtime store, ephemeral registry roots, the tailnet state, and
// the hub port's owner. Exit 1 when an installed host is not at the shipped
// version (the install gap the plan names); exit 0 otherwise.
//
//   node scripts/doctor.mjs             table on stdout
//   node scripts/doctor.mjs --json      report as JSON
//   node scripts/doctor.mjs --out FILE  also write the table to FILE (and FILE.json)
//   node scripts/doctor.mjs --advisory  always exit 0 (tray, docs recording)
//   node scripts/doctor.mjs --no-hub    skip the health probe

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { formatDoctorTable, runDoctor } from '../lib/doctor.mjs';

const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  const out = { json: false, out: null, advisory: false, probeHub: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--advisory') out.advisory = true;
    else if (a === '--no-hub') out.probeHub = false;
    else if (a === '--out') out.out = argv[++i] ?? null;
    else if (a.startsWith('--out=')) out.out = a.slice(6);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const report = await runDoctor({ pluginRoot: PLUGIN_ROOT, probeHub: args.probeHub });
const table = formatDoctorTable(report);

if (args.out) {
  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  writeFileSync(args.out, `sdlc doctor · ${report.at}\n\n${table}\n`);
  writeFileSync(`${args.out}.json`, `${JSON.stringify(report, null, 2)}\n`);
}
process.stdout.write(args.json ? `${JSON.stringify(report, null, 2)}\n` : `${table}\n`);
process.exit(args.advisory || report.ok ? 0 : 1);
