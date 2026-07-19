#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  buildLexicon,
  formatFindings,
  scanText
} from "./chunk-OEH2BR3U.mjs";
import {
  normalizePathForMatch,
  outputSystemMessage,
  projectRootFromInput,
  readStdinJson
} from "./chunk-CDKEYATP.mjs";
import {
  logError
} from "./chunk-SCQPZLF2.mjs";
import "./chunk-UTP6CBAZ.mjs";
import {
  loadConfig
} from "./chunk-D55RRO3F.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-SGA7NFMW.mjs";

// hooks/leak-guard-write.mjs
function isPublicDocPath(filePath, roots) {
  const n = normalizePathForMatch(filePath);
  if (!n) return false;
  for (const root of roots) {
    if (n.includes(`/${root}`) || n.startsWith(root)) return false;
  }
  const base = n.split("/").at(-1);
  if (/^(README|CHANGELOG|CONTRIBUTING)[^/]*$/i.test(base)) return true;
  if (/(?:^|\/)docs\//.test(n)) return true;
  return false;
}
async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === "1") return;
  if (process.env.SDLC_DISPATCH_ACTIVE === "1") return;
  const input = await readStdinJson();
  const filePath = input?.tool_input?.file_path;
  const parts = [
    input?.tool_input?.content,
    input?.tool_input?.new_string,
    ...Array.isArray(input?.tool_input?.edits) ? input.tool_input.edits.map((e) => e?.new_string) : []
  ].filter((t) => typeof t === "string" && t.length);
  if (!filePath || !parts.length) return;
  const content = parts.join("\n");
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.semantic?.enabled !== true) return;
  const lexicon = buildLexicon();
  if (!isPublicDocPath(filePath, lexicon.roots)) return;
  const findings = scanText(content, lexicon);
  if (!findings.length) return;
  const summary = formatFindings(findings);
  const message = `External Output Boundary: \`${filePath}\` is a public documentation path but the written content contains internal workflow vocabulary \u2014 ${summary}. Translate to product language before publishing; the rule lives in skills/wf/reference/_output-boundary.md.`;
  if (config.semantic?.mode === "enforce") {
    console.error(message);
    process.exit(2);
  }
  outputSystemMessage(message);
}
main().catch((err) => {
  logError("leak-guard-write", err);
  process.exit(0);
});
export {
  isPublicDocPath
};
