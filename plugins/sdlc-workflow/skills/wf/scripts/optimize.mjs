#!/usr/bin/env node
// The disk side of /wf loop optimize (reference/optimize.md): the baseline, the trials, the
// branch rounds, the checkpoints, the finish, and the ledger. The model proposes and
// edits; this script makes every git write, every measurement, and every keep or revert.
//   node "<skill-dir>/scripts/optimize.mjs" <command> <projectRoot> <slug> ...
// Runs the source script, scripts/optimize.mjs.
import { main } from '../../../scripts/optimize.mjs';

process.exitCode = main(process.argv.slice(2));
