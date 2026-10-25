import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// The ownership check of the bundled pi packages: each tool has one owner, and the
// excluded pi-code tools are not registered. Every hook command that pi-code spawns
// inherits SDLC_HOST, so the plugin hooks know that pi runs them.
process.env.SDLC_HOST ??= "pi";

const EXPECTED_TOOLS = {
  web_search: "pi-web-access",
  source_check: "pi-web-access",
  web_fetch: "pi-web-access",
  get_search_content: "pi-web-access",
  Agent: "pi-subagents",
  SubagentWorkflow: "pi-subagents",
  get_subagent_result: "pi-subagents",
  steer_subagent: "pi-subagents",
  ask_user_question: "rpiv-ask-user-question",
} as const;

const FORBIDDEN_TOOLS = {
  fetch_content: "unaliased pi-web-access fetch tool",
  subagent: "pi-code subagent extension",
  question: "pi-code question extension",
} as const;

function normalizedSource(resource: { sourceInfo?: { path?: string; source?: string } }): string {
  return `${resource.sourceInfo?.path ?? resource.sourceInfo?.source ?? "unknown"}`.replaceAll("\\", "/");
}

/**
 * pi-code's Agent(...) scope matcher currently reads its own legacy `agent`
 * argument, while pi-subagents exposes Claude's `subagent_type` argument on its
 * literal `Agent` tool. Add a non-enumerable compatibility alias so scoped
 * PreToolUse/PostToolUse hooks can match without adding a non-Claude field to
 * the JSON payload delivered to hook commands.
 */
function synchronizeAgentScopeAlias(input: unknown): void {
  if (input === null || typeof input !== "object" || Array.isArray(input)) return;
  const record = input as Record<string, unknown>;
  if (typeof record.subagent_type !== "string") return;

  const descriptor = Object.getOwnPropertyDescriptor(record, "agent");
  if (descriptor && descriptor.enumerable) return;
  if (descriptor) {
    if (descriptor.writable) record.agent = record.subagent_type;
    return;
  }

  Object.defineProperty(record, "agent", {
    value: record.subagent_type,
    configurable: true,
    enumerable: false,
    writable: true,
  });
}

interface SubagentUsageEvent {
  id: string;
  type: string;
  status: string;
  toolUses: number;
  durationMs: number;
  usage?: unknown;
}

/**
 * Persist the authoritative billed-usage payload emitted by pi-subagents.
 * Deliberately omit its display-only `tokens` field (which excludes cacheRead)
 * and omit model because the lifecycle event does not provide one.
 */
function persistSubagentUsage(pi: ExtensionAPI, raw: unknown): void {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return;
  const event = raw as Partial<SubagentUsageEvent>;
  if (event.usage === undefined || event.usage === null || typeof event.usage !== "object") return;

  pi.appendEntry("sdlc:subagent-usage", {
    id: event.id,
    type: event.type,
    status: event.status,
    toolUses: event.toolUses,
    durationMs: event.durationMs,
    usage: event.usage,
  });
}

function inspectRuntime(pi: ExtensionAPI): { lines: string[]; problems: string[] } {
  const tools = new Map(pi.getAllTools().map((tool) => [tool.name, tool]));
  const lines: string[] = [];
  const problems: string[] = [];

  for (const [name, expectedOwner] of Object.entries(EXPECTED_TOOLS)) {
    const tool = tools.get(name);
    if (!tool) {
      const message = `missing: ${name} (expected ${expectedOwner})`;
      lines.push(message);
      problems.push(message);
      continue;
    }

    const source = normalizedSource(tool);
    if (!source.toLowerCase().includes(expectedOwner.toLowerCase())) {
      const message = `conflict: ${name} <- ${source} (expected ${expectedOwner})`;
      lines.push(message);
      problems.push(message);
      continue;
    }

    lines.push(`ok: ${name} <- ${source}`);
  }

  for (const [name, excludedOwner] of Object.entries(FORBIDDEN_TOOLS)) {
    const tool = tools.get(name);
    if (!tool) continue;
    const message = `conflict: excluded ${excludedOwner} registered ${name} from ${normalizedSource(tool)}`;
    lines.push(message);
    problems.push(message);
  }

  const agentCommands = pi.getCommands().filter((command) => /^agents(?::\d+)?$/.test(command.name));
  if (agentCommands.length !== 1) {
    const owners = agentCommands.map((command) => `${command.name} <- ${normalizedSource(command)}`).join(", ") || "none";
    const message = `conflict: expected one /agents command, found ${agentCommands.length}: ${owners}`;
    lines.push(message);
    problems.push(message);
  } else {
    const command = agentCommands[0];
    const source = normalizedSource(command);
    if (!source.toLowerCase().includes("pi-subagents")) {
      const message = `conflict: /${command.name} <- ${source} (expected pi-subagents)`;
      lines.push(message);
      problems.push(message);
    } else {
      lines.push(`ok: /${command.name} <- ${source}`);
    }
  }

  lines.push("note: pi-code command allowed-tools maps Agent to its excluded legacy subagent tool");
  lines.push("note: the bridges run the plugin's AskUserQuestion hooks for ask_user_question, and its SubagentStart context for Agent");
  lines.push("note: pi-code plan mode blocks ask_user_question because its allowlist names the excluded question tool");

  return { lines, problems };
}

export function inspectOwnership(pi: ExtensionAPI): { lines: string[]; problems: string[] } {
  return inspectRuntime(pi);
}

export default function unified(pi: ExtensionAPI) {
  let unsubscribeSubagentUsage: Array<() => void> = [];

  // This extension is listed before pi-code in the package manifest, so these
  // handlers prepare the input before pi-code evaluates its hook filters.
  pi.on("tool_call", (event) => {
    if (event.toolName === "Agent") synchronizeAgentScopeAlias(event.input);
  });
  pi.on("tool_result", (event) => {
    if (event.toolName === "Agent") synchronizeAgentScopeAlias(event.input);
  });

  pi.registerCommand("wf-ownership", {
    description: "Show the owner of each bundled tool and detect unexpected tool providers",
    handler: async (_args, ctx) => {
      const report = inspectRuntime(pi);
      ctx.ui.notify(report.lines.join("\n"), report.problems.length > 0 ? "warning" : "info");
    },
  });

  pi.on("session_start", async (_event, ctx) => {
    for (const unsubscribe of unsubscribeSubagentUsage) unsubscribe();
    const persist = (event: unknown) => persistSubagentUsage(pi, event);
    unsubscribeSubagentUsage = [
      pi.events.on("subagents:completed", persist),
      pi.events.on("subagents:failed", persist),
    ];

    const report = inspectRuntime(pi);
    if (report.problems.length > 0) {
      ctx.ui.notify(`sdlc-workflow: tool conflicts in the pi package:\n${report.problems.join("\n")}`, "warning");
    }
  });

  pi.on("session_shutdown", () => {
    for (const unsubscribe of unsubscribeSubagentUsage) unsubscribe();
    unsubscribeSubagentUsage = [];
  });
}
