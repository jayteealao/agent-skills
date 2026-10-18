#!/usr/bin/env node
// The disk side of /wf prototype (reference/prototype.md): the worktree, the ledger check,
// the rolling report, the decide commits, and the exit. The model runs the rounds and
// edits the ledger; this script makes every git write. It never starts a round.
//   node "<skill-dir>/scripts/prototype.mjs" <command> <projectRoot> <slug> ...
// Runs the bundled dist/prototype.mjs, which carries its own dependencies.
// In a development checkout without dist/, it runs the source script.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = fileURLToPath(new URL('../../../dist/prototype.mjs', import.meta.url));
const source = fileURLToPath(new URL('../../../scripts/prototype.mjs', import.meta.url));
const { main } = await import(pathToFileURL(existsSync(bundle) ? bundle : source).href);
process.exitCode = main(process.argv.slice(2));
