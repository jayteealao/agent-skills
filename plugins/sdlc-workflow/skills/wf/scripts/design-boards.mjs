#!/usr/bin/env node
// The design boards of a workflow (reference/design/_boards.md): render board HTML to
// PNG, write the contact sheet, freeze a confirmed revision, check the boards that
// 02c-craft.md names, name verify captures, import outside design work, and keep the
// design record tracked.
//   node "<skill-dir>/scripts/design-boards.mjs" <command> <projectRoot> <slug> ...
// Runs the bundled dist/design-boards.mjs, which carries its own dependencies.
// In a development checkout without dist/, it runs the source script.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = fileURLToPath(new URL('../../../dist/design-boards.mjs', import.meta.url));
const source = fileURLToPath(new URL('../../../scripts/design-boards.mjs', import.meta.url));
const { main } = await import(pathToFileURL(existsSync(bundle) ? bundle : source).href);
process.exitCode = await main(process.argv.slice(2));
