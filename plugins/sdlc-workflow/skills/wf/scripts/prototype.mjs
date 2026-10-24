#!/usr/bin/env node
// The disk side of /wf loop prototype (reference/prototype.md): the worktree, the ledger check,
// the rolling report, the decide commits, and the exit. The model runs the rounds and
// edits the ledger; this script makes every git write. It never starts a round.
//   node "<skill-dir>/scripts/prototype.mjs" <command> <projectRoot> <slug> ...
// Runs the source script, scripts/prototype.mjs.
import { main } from '../../../scripts/prototype.mjs';

process.exitCode = main(process.argv.slice(2));
