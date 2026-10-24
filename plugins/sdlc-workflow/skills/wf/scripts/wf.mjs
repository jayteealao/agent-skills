#!/usr/bin/env node
// The deterministic parts of /wf: dispatch, status, index, cost and stamp.
//   node "<skill-dir>/scripts/wf.mjs" <command> ...
// Runs the bundled dist/wf.mjs, which carries its own dependencies.
// In a development checkout without dist/, it runs the source script.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = fileURLToPath(new URL('../../../dist/wf.mjs', import.meta.url));
const source = fileURLToPath(new URL('../../../scripts/wf.mjs', import.meta.url));
const { main } = await import(pathToFileURL(existsSync(bundle) ? bundle : source).href);
process.exitCode = await main(process.argv.slice(2));
