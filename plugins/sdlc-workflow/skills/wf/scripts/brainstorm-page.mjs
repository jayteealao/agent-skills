#!/usr/bin/env node
// The brainstorm page (reference/intake/brainstorm.md 2.9): write brainstorm-page.html
// beside the board from brainstorm-board.json and 01-brainstorm.md.
//   node "<skill-dir>/scripts/brainstorm-page.mjs" <projectRoot> <slug>
// Runs the bundled dist/brainstorm-page.mjs, which carries its own dependencies.
// In a development checkout without dist/, it runs the source script.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = fileURLToPath(new URL('../../../dist/brainstorm-page.mjs', import.meta.url));
const source = fileURLToPath(new URL('../../../scripts/brainstorm-page.mjs', import.meta.url));
const { main } = await import(pathToFileURL(existsSync(bundle) ? bundle : source).href);
process.exitCode = await main(process.argv.slice(2));
