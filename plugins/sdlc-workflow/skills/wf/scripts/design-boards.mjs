#!/usr/bin/env node
// The board tool of the older design layout, before the design surface: it reads and
// checks the frozen boards of a workflow, and renders terminal captures to HTML (ansi,
// reference/design/_surface.md). `wf.mjs design migrate` turns the boards into screens.
//   node "<skill-dir>/scripts/design-boards.mjs" <command> <projectRoot> <slug> ...
// Runs the source script, scripts/design-boards.mjs.
import { main } from '../../../scripts/design-boards.mjs';

process.exitCode = await main(process.argv.slice(2));
