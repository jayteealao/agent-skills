#!/usr/bin/env node
// The design boards of a workflow (reference/design/_boards.md): render board HTML to
// PNG, write the contact sheet, freeze a confirmed revision, check the boards that
// 02c-craft.md names, name verify captures, import outside design work, check canvas
// records (canvas-stale), render terminal captures (ansi), and keep the
// design record tracked.
//   node "<skill-dir>/scripts/design-boards.mjs" <command> <projectRoot> <slug> ...
// Runs the source script, scripts/design-boards.mjs.
import { main } from '../../../scripts/design-boards.mjs';

process.exitCode = await main(process.argv.slice(2));
