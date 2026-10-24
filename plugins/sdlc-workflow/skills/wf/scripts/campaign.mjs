#!/usr/bin/env node
// The disk side of /wf campaign (reference/campaign.md): the serial walk over
// one list, its gates, and the migration of an old campaign.
//   node "<skill-dir>/scripts/campaign.mjs" <command> <projectRoot> <brainstorm-slug> ...
// Runs the source script, scripts/campaign.mjs.
import { main } from '../../../scripts/campaign.mjs';

process.exitCode = main(process.argv.slice(2));
