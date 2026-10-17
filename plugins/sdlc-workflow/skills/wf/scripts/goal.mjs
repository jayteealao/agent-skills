#!/usr/bin/env node
// The disk side of /wf goal (reference/goal.md): the contract, the check that prints
// the GOAL: line, the park of a human gate, the status, and the clear.
//   node "<skill-dir>/scripts/goal.mjs" <command> <projectRoot> <slug> ...
// Runs the bundled dist/goal.mjs, which carries its own dependencies.
// In a development checkout without dist/, it runs the source script.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = fileURLToPath(new URL('../../../dist/goal.mjs', import.meta.url));
const source = fileURLToPath(new URL('../../../scripts/goal.mjs', import.meta.url));
const { main } = await import(pathToFileURL(existsSync(bundle) ? bundle : source).href);
process.exitCode = main(process.argv.slice(2));
