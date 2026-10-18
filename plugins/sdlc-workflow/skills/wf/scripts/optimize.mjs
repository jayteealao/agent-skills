#!/usr/bin/env node
// The disk side of /wf loop optimize (reference/optimize.md): the baseline, the trials, the
// branch rounds, the checkpoints, the finish, and the ledger. The model proposes and
// edits; this script makes every git write, every measurement, and every keep or revert.
//   node "<skill-dir>/scripts/optimize.mjs" <command> <projectRoot> <slug> ...
// Runs the bundled dist/optimize.mjs, which carries its own dependencies.
// In a development checkout without dist/, it runs the source script.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = fileURLToPath(new URL('../../../dist/optimize.mjs', import.meta.url));
const source = fileURLToPath(new URL('../../../scripts/optimize.mjs', import.meta.url));
const { main } = await import(pathToFileURL(existsSync(bundle) ? bundle : source).href);
process.exitCode = main(process.argv.slice(2));
