#!/usr/bin/env node
// The disk side of /wf orchestrate (reference/orchestrate.md): the vision contract, the units,
// the dispatch of each agent, the verdicts of the validators, the state of the run, and the
// evidence page.
//   node "<skill-dir>/scripts/orchestrate.mjs" <command> <projectRoot> <slug> ...
// Runs the source script, scripts/orchestrate.mjs.
import { main } from '../../../scripts/orchestrate.mjs';

process.exitCode = main(process.argv.slice(2));
