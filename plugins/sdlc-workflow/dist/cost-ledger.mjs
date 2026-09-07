#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  appendCostRow,
  collectTurn,
  readCursor,
  writeCursor
} from "./chunk-H5LFYXT6.mjs";
import {
  projectRootFromInput,
  readStdinJson
} from "./chunk-Z76NJHKM.mjs";
import {
  logError
} from "./chunk-KVCYXUV7.mjs";
import "./chunk-DOKC4AFB.mjs";
import {
  loadConfig
} from "./chunk-XLUSO7MY.mjs";
import {
  sdlcHomeDir
} from "./chunk-O3FUA7PQ.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-LFGT2BKG.mjs";
import "./chunk-SGA7NFMW.mjs";

// hooks/cost-ledger.mjs
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
function parseHookArgs(argv = process.argv.slice(2)) {
  const out = { pluginRoot: null, pluginData: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--plugin-root" && argv[i + 1]) out.pluginRoot = argv[++i];
    else if (argv[i] === "--plugin-data" && argv[i + 1]) out.pluginData = argv[++i];
  }
  return out;
}
function findCodexRollout(sessionId, codexHome = process.env.CODEX_HOME || join(homedir(), ".codex")) {
  const root = join(codexHome, "sessions");
  if (!sessionId || !existsSync(root)) return null;
  let best = null;
  const walk = (dir, depth) => {
    let names = [];
    try {
      names = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const d of names) {
      const p = join(dir, d.name);
      if (d.isDirectory()) {
        if (depth < 3) walk(p, depth + 1);
        continue;
      }
      if (!d.name.startsWith("rollout-") || !d.name.endsWith(".jsonl") || !d.name.includes(sessionId)) continue;
      const m = statSync(p).mtimeMs;
      if (!best || m > best.mtime) best = { path: p, mtime: m };
    }
  };
  walk(root, 0);
  return best?.path ?? null;
}
function hostName(transcriptHost, env) {
  if (transcriptHost === "pi" || transcriptHost === "codex") return transcriptHost;
  return env.SDLC_HOST === "codex" ? "codex" : "claude";
}
async function runCostLedger({ input, cursorDir, env = process.env, now = () => /* @__PURE__ */ new Date() }) {
  const sessionId = input?.session_id;
  if (!sessionId) return { wrote: false, reason: "no session_id" };
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks?.costLedger === false) return { wrote: false, reason: "disabled" };
  let transcript = typeof input.transcript_path === "string" && input.transcript_path ? input.transcript_path : null;
  if (!transcript) transcript = findCodexRollout(sessionId, env.CODEX_HOME || void 0);
  if (!transcript || !existsSync(transcript)) return { wrote: false, reason: "no transcript" };
  const cursor = readCursor(cursorDir, sessionId);
  const turn = collectTurn({ transcriptPath: transcript, subagentsDir: join(dirname(transcript), sessionId, "subagents"), cursor });
  cursor.turn = (cursor.turn ?? 0) + 1;
  let wrote = false;
  let ledger;
  if (turn.hadUsage && turn.attributed?.slug) {
    const a = turn.attributed;
    const root = a.root && isAbsolute(a.root) ? a.root : resolve(projectRoot, a.root ?? join(".ai", "workflows"));
    ledger = appendCostRow(join(root, a.slug), {
      ts: now().toISOString(),
      host: hostName(turn.host, env),
      session: sessionId,
      turn: cursor.turn,
      key: a.key ?? null,
      slug: a.slug,
      slice: a.slice ?? null,
      main: turn.main,
      subagents: turn.subagents,
      external: []
    });
    wrote = true;
  }
  writeCursor(cursorDir, sessionId, cursor);
  return { wrote, reason: wrote ? "row" : turn.hadUsage ? "no slug" : "no usage", ledger };
}
async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === "1") return;
  if (process.env.SDLC_DISPATCH_ACTIVE === "1") return;
  const args = parseHookArgs();
  const input = await readStdinJson();
  if (!input || typeof input !== "object") return;
  const pluginData = typeof input.sdlc_plugin_data === "string" && input.sdlc_plugin_data || args.pluginData;
  const cursorDir = pluginData ? join(resolve(pluginData), "cost-cursor") : join(sdlcHomeDir(), "cost-cursor");
  let projectRoot = process.cwd();
  try {
    projectRoot = projectRootFromInput(input);
    await runCostLedger({ input, cursorDir });
  } catch (err) {
    try {
      await logError("cost-ledger", err, { projectRoot, context: { session: input.session_id ?? null } });
    } catch {
    }
  }
}
var isMain = process.argv[1] && (import.meta.url === pathToFileURL(resolve(process.argv[1])).href || fileURLToPath(import.meta.url) === resolve(process.argv[1]));
if (isMain) {
  main().finally(() => process.exit(0));
}
export {
  findCodexRollout,
  parseHookArgs,
  runCostLedger
};
