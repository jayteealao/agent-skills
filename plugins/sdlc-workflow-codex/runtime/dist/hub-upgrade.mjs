#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  controlledUpgrade
} from "./chunk-UDJ5LSSN.mjs";
import "./chunk-K6PBZI5W.mjs";
import "./chunk-ZMYLXAL2.mjs";
import "./chunk-SBPANAAT.mjs";
import "./chunk-IEXKPLNM.mjs";
import "./chunk-DVISHXT5.mjs";
import "./chunk-NTSUEAI6.mjs";
import "./chunk-5U76735W.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// scripts/hub-upgrade.mjs
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
function argValue(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
function hasFlag(name) {
  return process.argv.includes(name);
}
var here = dirname(fileURLToPath(import.meta.url));
var pluginRoot = resolve(argValue("--plugin-root", resolve(here, "..")));
var allowDowngrade = hasFlag("--allow-downgrade");
var confirm = hasFlag("--yes") || hasFlag("--confirm");
var result = await controlledUpgrade({
  pluginRoot,
  allowDowngrade,
  confirm,
  log: (m) => process.stderr.write(`${m}
`)
});
process.stdout.write(`${JSON.stringify(result, null, 2)}
`);
process.exit(result.action === "upgraded" || result.action === "already-current" ? 0 : 1);
