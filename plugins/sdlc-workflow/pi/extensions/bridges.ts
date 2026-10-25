import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// pi-code runs the plugin's hooks/hooks.json, but it maps AskUserQuestion to its excluded
// question tool, and it has no runner for SubagentStart or SubagentStop. These bridges run
// the hooks.json entries of those three events for the bundled tools: rpiv's
// ask_user_question and pi-subagents' Agent.

/** The plugin root: this package sits at <plugin root>/pi/. */
export const PLUGIN_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const HOOK_TIMEOUT_MS = 30_000;

interface HookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
}

/** The commands that hooks.json registers for one event, and for one tool when the event has a matcher. */
export function hookCommands(pluginRoot: string, event: string, toolName?: string): Array<{ command: string; timeoutMs: number }> {
  let config: { hooks?: Record<string, HookEntry[]> };
  try {
    config = JSON.parse(readFileSync(join(pluginRoot, "hooks", "hooks.json"), "utf8"));
  } catch {
    return [];
  }
  const out: Array<{ command: string; timeoutMs: number }> = [];
  for (const entry of config.hooks?.[event] ?? []) {
    if (entry.matcher && toolName !== undefined && !new RegExp(`^(?:${entry.matcher})$`).test(toolName)) continue;
    for (const hook of entry.hooks ?? []) {
      if (hook.type !== "command" || typeof hook.command !== "string") continue;
      out.push({
        command: hook.command.replaceAll("${CLAUDE_PLUGIN_ROOT}", pluginRoot),
        timeoutMs: typeof hook.timeout === "number" ? hook.timeout * 1000 : HOOK_TIMEOUT_MS,
      });
    }
  }
  return out;
}

/** Run one hook command with its JSON payload on stdin. A hook that fails never blocks the tool. */
export function runHook(pluginRoot: string, command: string, payload: unknown, cwd: string, timeoutMs: number): { code: number | null; stdout: string } {
  const r = spawnSync(command, {
    shell: true,
    cwd,
    input: JSON.stringify(payload),
    encoding: "utf8",
    timeout: timeoutMs,
    env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, SDLC_HOST: "pi" },
    windowsHide: true,
  });
  return { code: r.status, stdout: r.stdout ?? "" };
}

/** The additionalContext lines that hooks print, in the shape Claude Code reads. */
export function additionalContextOf(stdout: string): string[] {
  const out: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim().startsWith("{")) continue;
    try {
      const o = JSON.parse(line);
      const text = o?.hookSpecificOutput?.additionalContext;
      if (typeof text === "string" && text.trim()) out.push(text.trim());
    } catch {
      // Not a JSON line: the hook printed plain text.
    }
  }
  return out;
}

interface RpivAnswer {
  question?: string;
  kind?: string;
  answer?: string | null;
  selected?: string[];
  notes?: string;
}

/**
 * rpiv's answers as the `answers` map of Claude Code's AskUserQuestion response: each
 * question text maps to the chosen label, the typed text, or the selected labels.
 * A cancelled questionnaire has no answers.
 */
export function claudeAnswers(details: unknown): Record<string, string> {
  const d = details as { answers?: RpivAnswer[]; cancelled?: boolean } | undefined;
  if (!d || d.cancelled === true || !Array.isArray(d.answers)) return {};
  const out: Record<string, string> = {};
  for (const a of d.answers) {
    if (!a || typeof a.question !== "string") continue;
    const value = a.kind === "multi" ? (a.selected ?? []).join(", ") : (a.answer ?? "");
    if (value) out[a.question] = a.notes ? `${value} (notes: ${a.notes})` : value;
  }
  return out;
}

/** The plugin versions in the Claude Code plugin cache, which pi-code loads the skills from. */
export function cachedPluginVersions(home = homedir()): string[] {
  const dir = join(home, ".claude", "plugins", "cache", "agent-skills-marketplace", "sdlc-workflow");
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** The version of this package. */
export function packageVersion(): string {
  try {
    return JSON.parse(readFileSync(join(PLUGIN_ROOT, "pi", "package.json"), "utf8")).version ?? "";
  } catch {
    return "";
  }
}

/** The run modes in which no person can answer a question. */
export const NO_REPLY_MODES = ["print", "json"];
export const NO_REPLY_NOTE =
  "This is a non-interactive run: no person can reply to a question. At a gate, use rung 3 of the gate-question " +
  "ladder: take the documented default, record the decision and its assumption, and continue. An intent-bearing gate " +
  "has no default: record it as awaiting input and stop.";

export default function bridges(pi: ExtensionAPI) {
  installBridges(pi, PLUGIN_ROOT);
}

/** The three bridges, over the hooks.json of `pluginRoot`. */
export function installBridges(pi: ExtensionAPI, pluginRoot: string) {
  // SubagentStart: the hooks' additionalContext goes in front of the child's prompt.
  pi.on("tool_call", (event, ctx) => {
    if (event.toolName !== "Agent") return;
    const input = event.input as Record<string, unknown>;
    if (typeof input.prompt !== "string") return;
    const payload = { hook_event_name: "SubagentStart", agent_type: input.subagent_type ?? "general-purpose", cwd: ctx.cwd };
    const context = hookCommands(pluginRoot, "SubagentStart")
      .flatMap((h) => additionalContextOf(runHook(pluginRoot, h.command, payload, ctx.cwd, h.timeoutMs).stdout));
    if (context.length) input.prompt = `${context.join("\n\n")}\n\n${input.prompt}`;
  });

  // PostToolUse on AskUserQuestion: the hooks see the answers in Claude Code's shape.
  pi.on("tool_result", (event, ctx) => {
    if (event.toolName !== "ask_user_question" || event.isError) return;
    const payload = {
      hook_event_name: "PostToolUse",
      tool_name: "AskUserQuestion",
      tool_input: event.input,
      tool_response: { answers: claudeAnswers((event as { details?: unknown }).details) },
      cwd: ctx.cwd,
    };
    for (const h of hookCommands(pluginRoot, "PostToolUse", "AskUserQuestion")) runHook(pluginRoot, h.command, payload, ctx.cwd, h.timeoutMs);
  });

  // Print and JSON modes take no reply: the model must know, so that a gate takes its default.
  pi.on("before_agent_start", (event, ctx) => {
    if (!NO_REPLY_MODES.includes(ctx.mode)) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${NO_REPLY_NOTE}` };
  });

  // SubagentStop: pi-subagents reports a top-level child's end on its event bus.
  let unsubscribe: Array<() => void> = [];
  const stop = (raw: unknown) => {
    const e = (raw ?? {}) as { id?: string; type?: string; status?: string };
    const cwd = process.cwd();
    const payload = { hook_event_name: "SubagentStop", agent_id: e.id, agent_type: e.type, status: e.status, cwd };
    for (const h of hookCommands(pluginRoot, "SubagentStop")) runHook(pluginRoot, h.command, payload, cwd, h.timeoutMs);
  };

  pi.on("session_start", async (_event, ctx) => {
    for (const u of unsubscribe) u();
    unsubscribe = [pi.events.on("subagents:completed", stop), pi.events.on("subagents:failed", stop)];
    // The stable entry point ~/.sdlc/bin/wf.mjs follows the plugin of this session. The seed-memory
    // hook writes it; the memory seed itself is off on pi.
    spawnSync("node", [join(pluginRoot, "hooks", "seed-memory.mjs")], {
      input: "{}",
      timeout: HOOK_TIMEOUT_MS,
      windowsHide: true,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: pluginRoot, SDLC_HOST: "pi", SDLC_DISABLE_MEMORY_SEED: "1" },
    });
    // pi-code reads the skills from the Claude Code plugin cache: its version must be this package's.
    const version = packageVersion();
    const cached = cachedPluginVersions();
    if (version && !cached.includes(version)) {
      ctx.ui.notify(
        `sdlc-workflow: this pi package is ${version}, but the Claude Code plugin cache holds ${cached.join(", ") || "no version"}. ` +
          "Install the same version of the plugin.",
        "warning",
      );
    }
  });

  pi.on("session_shutdown", () => {
    for (const u of unsubscribe) u();
    unsubscribe = [];
  });
}
