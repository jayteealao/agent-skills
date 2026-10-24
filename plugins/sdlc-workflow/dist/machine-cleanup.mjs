#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  runMachineCleanup
} from "./chunk-UMHCTFEX.mjs";
import {
  logError
} from "./chunk-TIGAJNZN.mjs";
import "./chunk-BSVWX5RF.mjs";
import "./chunk-ZGVOYTOL.mjs";

// hooks/machine-cleanup.mjs
if (process.env.CLAUDE_PLUGIN_INSTALL !== "1" && process.env.SDLC_DISPATCH_ACTIVE !== "1") {
  try {
    const { notice } = runMachineCleanup();
    if (notice && process.env.SDLC_HOST !== "codex") process.stdout.write(`${JSON.stringify({ systemMessage: notice })}
`);
  } catch (err) {
    await logError("machine-cleanup", err).catch(() => {
    });
  }
}
process.exit(0);
