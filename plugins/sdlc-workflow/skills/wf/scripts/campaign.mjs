#!/usr/bin/env node
// The disk side of /wf campaign (reference/campaign.md): the serial walk over
// one list, its gates, and the migration of an old campaign.
//   node "<skill-dir>/scripts/campaign.mjs" <command> <projectRoot> <brainstorm-slug> ...
// Runs the bundled dist/campaign.mjs, which carries its own dependencies.
// In a development checkout without dist/, it runs the source script.
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const bundle = fileURLToPath(new URL('../../../dist/campaign.mjs', import.meta.url));
const source = fileURLToPath(new URL('../../../scripts/campaign.mjs', import.meta.url));
const { main } = await import(pathToFileURL(existsSync(bundle) ? bundle : source).href);
process.exitCode = main(process.argv.slice(2));
