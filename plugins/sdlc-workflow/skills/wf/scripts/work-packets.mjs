#!/usr/bin/env node
// Check and write a brainstorm's work set (intake/brainstorm/_work.md).
//   node "<skill-dir>/scripts/work-packets.mjs" check <workflow-dir>
//   node "<skill-dir>/scripts/work-packets.mjs" write <workflow-dir>
// Runs the bundled dist/work-packets.mjs, which carries its own dependencies.
// In a development checkout without dist/, it runs the source script.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = fileURLToPath(new URL('../../../dist/work-packets.mjs', import.meta.url));
const source = fileURLToPath(new URL('../../../scripts/work-packets.mjs', import.meta.url));
const { main } = await import(pathToFileURL(existsSync(bundle) ? bundle : source).href);
process.exitCode = main(process.argv.slice(2));
