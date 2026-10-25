#!/usr/bin/env node
// The deterministic parts of /wf, in code.
//   node "<skill-dir>/scripts/wf.mjs" <command> ...
//   node "<skill-dir>/scripts/wf.mjs" help [<command>]   (every command, or the forms and flags of one)
// Runs the source script, scripts/wf.mjs.
import { main } from '../../../scripts/wf.mjs';

process.exitCode = await main(process.argv.slice(2));
