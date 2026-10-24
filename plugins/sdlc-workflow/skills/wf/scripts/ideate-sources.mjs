#!/usr/bin/env node
// The disk side of /wf intake ideate with sources (reference/intake/ideate/_sources.md):
// the argument kinds, the issue read through gh, the reference rows, and the coverage
// check. Fetched text is data. The script never writes to GitHub.
//   node "<skill-dir>/scripts/ideate-sources.mjs" <command> <projectRoot> ...
// Runs the source script, scripts/ideate-sources.mjs.
import { main } from '../../../scripts/ideate-sources.mjs';

process.exitCode = main(process.argv.slice(2));
