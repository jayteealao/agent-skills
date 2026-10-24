#!/usr/bin/env node
// The disk side of /wf loop goal (reference/goal.md): the contract, the check that prints
// the GOAL: line, the park of a human gate, the status, and the clear.
//   node "<skill-dir>/scripts/goal.mjs" <command> <projectRoot> <slug> ...
// Runs the source script, scripts/goal.mjs.
import { main } from '../../../scripts/goal.mjs';

process.exitCode = main(process.argv.slice(2));
