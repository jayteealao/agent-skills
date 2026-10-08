#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  appendCostRow,
  collectTurn,
  readCursor,
  writeCursor
} from "./chunk-5OCA23PS.mjs";
import {
  readStdinJson
} from "./chunk-YYMENX7Z.mjs";
import {
  logError
} from "./chunk-PG46O7HW.mjs";
import {
  loadConfig
} from "./chunk-KNXRJRUP.mjs";
import {
  projectRootFromInput,
  sdlcHomeDir
} from "./chunk-J4EY6FXU.mjs";
import "./chunk-5U76735W.mjs";
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
  const mainRoot = resolve(projectRoot, ".ai", "workflows");
  const [own, ...others] = turn.groups ?? [{ attributed: turn.attributed, main: turn.main, subagents: turn.subagents }];
  const ownDir = (a) => {
    if (!a?.slug) return null;
    const root = a.root && isAbsolute(a.root) ? a.root : resolve(projectRoot, a.root ?? join(".ai", "workflows"));
    return join(root, a.slug);
  };
  const byDir = /* @__PURE__ */ new Map();
  const turnRow = { attributed: own.attributed, main: own.main, subagents: [...own.subagents] };
  if (ownDir(own.attributed)) byDir.set(ownDir(own.attributed), turnRow);
  for (const g of others) {
    const dir = join(mainRoot, g.attributed.slug);
    if (!existsSync(dir)) {
      turnRow.subagents.push(...g.subagents);
      continue;
    }
    if (!byDir.has(dir)) byDir.set(dir, { attributed: g.attributed, main: null, subagents: [] });
    byDir.get(dir).subagents.push(...g.subagents);
  }
  const ts = now().toISOString();
  const ledgers = [];
  for (const [dir, r] of byDir) {
    if (!r.main && !r.subagents.length) continue;
    ledgers.push(appendCostRow(dir, {
      ts,
      host: hostName(turn.host, env),
      session: sessionId,
      turn: cursor.turn,
      key: r.attributed.key ?? null,
      slug: r.attributed.slug,
      slice: r.attributed.slice ?? null,
      main: r.main,
      subagents: r.subagents,
      external: []
    }));
  }
  const wrote = ledgers.length > 0;
  const ledger = ledgers[0];
  writeCursor(cursorDir, sessionId, cursor);
  return { wrote, reason: wrote ? "row" : turn.hadUsage ? "no slug" : "no usage", ledger, ledgers };
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
