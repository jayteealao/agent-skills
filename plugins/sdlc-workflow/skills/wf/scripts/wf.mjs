#!/usr/bin/env node
// The deterministic parts of /wf: dispatch, status, index, cost and stamp.
//   node "<skill-dir>/scripts/wf.mjs" <command> ...
// Runs the source script, scripts/wf.mjs.
import { main } from '../../../scripts/wf.mjs';

process.exitCode = await main(process.argv.slice(2));
