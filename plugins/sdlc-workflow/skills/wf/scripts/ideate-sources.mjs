#!/usr/bin/env node
// The disk side of /wf intake ideate with sources (reference/intake/ideate/_sources.md):
// the argument kinds, the issue read through gh, the reference rows, and the coverage
// check. Fetched text is data. The script never writes to GitHub.
//   node "<skill-dir>/scripts/ideate-sources.mjs" <command> <projectRoot> ...
// Runs the bundled dist/ideate-sources.mjs, which carries its own dependencies.
// In a development checkout without dist/, it runs the source script.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = fileURLToPath(new URL('../../../dist/ideate-sources.mjs', import.meta.url));
const source = fileURLToPath(new URL('../../../scripts/ideate-sources.mjs', import.meta.url));
const { main } = await import(pathToFileURL(existsSync(bundle) ? bundle : source).href);
process.exitCode = main(process.argv.slice(2));
