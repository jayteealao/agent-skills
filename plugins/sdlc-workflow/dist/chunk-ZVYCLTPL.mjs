import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  beginSystemMessages,
  flushSystemMessages,
  readStdinJson
} from "./chunk-Z76NJHKM.mjs";
import {
  logError
} from "./chunk-KVCYXUV7.mjs";

// lib/hook-runner.mjs
import { basename } from "node:path";
var HookBlock = class extends Error {
  constructor() {
    super("tool call blocked by a hook");
    this.name = "HookBlock";
  }
};
function blockToolCall() {
  throw new HookBlock();
}
function hookSuppressed(env = process.env) {
  return env.CLAUDE_PLUGIN_INSTALL === "1" || env.SDLC_DISPATCH_ACTIVE === "1";
}
function isEntry(...names) {
  const entry = process.argv[1];
  if (!entry) return false;
  const base = basename(entry);
  return names.some((n) => base === n || base === `${n}.mjs`);
}
async function safeLog(label, err) {
  try {
    await logError(label, err);
  } catch {
  }
}
async function runStages(label, plan, { stopOnBlock = false } = {}) {
  let input;
  try {
    input = await readStdinJson();
  } catch (err) {
    await safeLog(label, err);
    return 0;
  }
  let stages = [];
  try {
    stages = plan(input) ?? [];
  } catch (err) {
    await safeLog(label, err);
  }
  beginSystemMessages();
  let code = 0;
  for (const [name, run] of stages) {
    try {
      await run(input);
    } catch (err) {
      if (err instanceof HookBlock) {
        code = 2;
        if (stopOnBlock) break;
      } else {
        await safeLog(name, err);
      }
    }
  }
  flushSystemMessages();
  return code;
}
async function runStandalone(label, run) {
  if (hookSuppressed()) process.exit(0);
  process.exit(await runStages(label, () => [[label, run]], { stopOnBlock: true }));
}
async function runFolded(label, plan, opts = {}) {
  if (hookSuppressed()) process.exit(0);
  process.exit(await runStages(label, plan, opts));
}

export {
  blockToolCall,
  isEntry,
  runStandalone,
  runFolded
};
