// The check of the pi package: the manifest, the pins, the version, and (once npm install
// ran in pi/) the upstream tool contracts that the extensions depend on.
//   node pi/scripts/check.mjs
import { existsSync } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFile(resolve(root, path), "utf8");
const manifest = JSON.parse(await read("package.json"));
const plugin = JSON.parse(await readFile(resolve(root, "..", "package.json"), "utf8"));

if (manifest.version !== plugin.version) {
  throw new Error(`pi/package.json version ${manifest.version} is not the plugin version ${plugin.version}`);
}
for (const [name, range] of Object.entries(manifest.dependencies ?? {})) {
  if (!/^\d+\.\d+\.\d+$/.test(range)) throw new Error(`Dependency ${name} must be pinned to an exact version, not ${range}`);
}

const requiredPaths = [
  "extensions/index.ts",
  "extensions/unified.ts",
  "extensions/bridges.ts",
  "node_modules/pi-web-access/dist/index.js",
  "node_modules/pi-code/extensions",
  "node_modules/@tintinweb/pi-subagents/src/index.ts",
  "node_modules/@juicesharp/rpiv-ask-user-question/index.ts",
];
const requiredManifestEntries = [
  "./extensions",
  "./node_modules/pi-web-access/dist",
  "./node_modules/pi-code/extensions",
  "./node_modules/@tintinweb/pi-subagents/src/index.ts",
  "./node_modules/@juicesharp/rpiv-ask-user-question/index.ts",
];
const requiredExclusions = [
  "-node_modules/pi-code/extensions/web.ts",
  "-node_modules/pi-code/extensions/subagent/index.ts",
  "-node_modules/pi-code/extensions/question.ts",
];
const upstreamConflictFiles = [
  "node_modules/pi-code/extensions/web.ts",
  "node_modules/pi-code/extensions/subagent/index.ts",
  "node_modules/pi-code/extensions/question.ts",
];

for (const path of requiredPaths.filter((p) => !p.startsWith("node_modules/"))) {
  await access(resolve(root, path));
}

const configured = manifest.pi?.extensions;
if (!Array.isArray(configured)) throw new Error("package.json must define pi.extensions");

for (const entry of requiredManifestEntries) {
  if (!configured.includes(entry)) throw new Error(`Missing required extension entry: ${entry}`);
}
const unifiedIndex = configured.indexOf("./extensions");
const piCodeIndex = configured.indexOf("./node_modules/pi-code/extensions");
if (unifiedIndex === -1 || piCodeIndex === -1 || unifiedIndex >= piCodeIndex) {
  throw new Error("The unified compatibility handlers must load before pi-code");
}
for (const exclusion of requiredExclusions) {
  if (!configured.includes(exclusion)) throw new Error(`Missing required exclusion: ${exclusion}`);
}

const dependencies = Object.keys(manifest.dependencies ?? {});
const bundled = new Set([...(manifest.bundledDependencies ?? []), ...(manifest.bundleDependencies ?? [])]);
for (const dependency of ["pi-code", "pi-web-access", "@tintinweb/pi-subagents", "@juicesharp/rpiv-ask-user-question"]) {
  if (!dependencies.includes(dependency)) throw new Error(`Missing dependency: ${dependency}`);
  if (!bundled.has(dependency)) throw new Error(`Dependency is not bundled: ${dependency}`);
}

if (!manifest.peerDependencies?.["@earendil-works/pi-coding-agent"]) {
  throw new Error("@earendil-works/pi-coding-agent must be declared as a peer dependency");
}

if (!existsSync(resolve(root, "node_modules"))) {
  console.log("sdlc-workflow-pi manifest, pins and version are valid; the upstream checks need npm install in pi/");
  process.exit(0);
}
for (const path of [...requiredPaths, ...upstreamConflictFiles]) {
  await access(resolve(root, path));
}
for (const [name, version] of Object.entries(manifest.dependencies)) {
  const installed = JSON.parse(await read(`node_modules/${name}/package.json`)).version;
  if (installed !== version) throw new Error(`${name} ${installed} is installed; the pin is ${version}. Run npm install in pi/`);
}

const webAccessManifest = JSON.parse(await read("node_modules/pi-web-access/package.json"));
const piCodeWeb = await read("node_modules/pi-code/extensions/web.ts");
const piCodeSubagent = await read("node_modules/pi-code/extensions/subagent/index.ts");
const piCodeQuestion = await read("node_modules/pi-code/extensions/question.ts");
const piCodePlanMode = await read("node_modules/pi-code/extensions/plan-mode/index.ts");
const askUserQuestion = await read("node_modules/@juicesharp/rpiv-ask-user-question/ask-user-question.ts");
const tintinToolNames = await read("node_modules/@tintinweb/pi-subagents/src/agent-runner.ts");
const tintinIndex = await read("node_modules/@tintinweb/pi-subagents/src/index.ts");
const claudeToolNames = await read("node_modules/pi-code/extensions/internal/claude-tool-names.ts");
const scopeRules = await read("node_modules/pi-code/extensions/internal/scope-rules.ts");

if (!Array.isArray(webAccessManifest.pi?.extensions) || !webAccessManifest.pi.extensions.includes("./dist")) {
  throw new Error("pi-web-access entry point changed; update the ./node_modules/pi-web-access/dist manifest entry");
}
if (!piCodeWeb.includes("name: 'web_search'")) {
  throw new Error("pi-code web tool changed; review whether its exclusion is still necessary");
}
if (!piCodeSubagent.includes("name: 'subagent'")) {
  throw new Error("pi-code subagent tool changed; review whether its exclusion is still necessary");
}
if (!piCodeQuestion.includes("name: 'question'")) {
  throw new Error("pi-code question tool changed; review whether its exclusion is still necessary");
}
if (!askUserQuestion.includes('ASK_USER_QUESTION_TOOL_NAME = "ask_user_question"')) {
  throw new Error("rpiv-ask-user-question tool name changed; review EXPECTED_TOOLS in extensions/unified.ts and the bridge in extensions/bridges.ts");
}
if (!piCodePlanMode.includes("'question', 'plan_mode_complete']")) {
  throw new Error("pi-code plan mode tool allowlist changed; review the ask_user_question plan-mode note");
}
for (const name of ["Agent", "SubagentWorkflow", "get_subagent_result", "steer_subagent"]) {
  if (!tintinToolNames.includes(`\"${name}\"`)) {
    throw new Error(`pi-subagents no longer declares expected tool: ${name}`);
  }
}
for (const channel of ["subagents:completed", "subagents:failed"]) {
  if (!tintinIndex.includes(`pi.events.emit(\"${channel}\", eventData)`)) {
    throw new Error(`pi-subagents no longer emits expected usage lifecycle event: ${channel}`);
  }
}
for (const field of ["id: record.id", "type: record.type", "status: record.status", "toolUses: record.toolUses", "durationMs", "usage,"]) {
  if (!tintinIndex.includes(field)) {
    throw new Error(`pi-subagents lifecycle payload changed; missing expected source field: ${field}`);
  }
}
if (!claudeToolNames.includes("{ claude: 'WebFetch', pi: 'web_fetch' }")) {
  throw new Error("pi-code WebFetch mapping changed; review the pi-web-access toolNames alias");
}
if (!claudeToolNames.includes("{ claude: 'Agent', pi: 'subagent', aliases: ['Task'] }")) {
  throw new Error("pi-code Agent mapping changed; review Agent hook and allowed-tools compatibility");
}
if (!claudeToolNames.includes("{ claude: 'AskUserQuestion', pi: 'question' }")) {
  throw new Error("pi-code AskUserQuestion mapping changed; review ask_user_question hook and allowed-tools compatibility");
}
if (!scopeRules.includes("typeof record?.agent === 'string' ? record.agent : undefined")) {
  throw new Error("pi-code Agent scope input changed; review or remove synchronizeAgentScopeAlias");
}

console.log("sdlc-workflow-pi manifest, pins, version, exclusions and upstream tool contracts are valid");
