import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  buildLexicon,
  formatFindings,
  scanText
} from "./chunk-BHJIRDNF.mjs";
import {
  blockToolCall,
  isEntry,
  runStandalone
} from "./chunk-ZVYCLTPL.mjs";
import {
  normalizePathForMatch,
  outputSystemMessage,
  projectRootFromInput
} from "./chunk-Z76NJHKM.mjs";
import {
  loadConfig
} from "./chunk-XLUSO7MY.mjs";

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
async function run(input) {
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
    blockToolCall();
  }
  outputSystemMessage(message);
}
if (isEntry("leak-guard-write")) runStandalone("leak-guard-write", run);

export {
  isPublicDocPath,
  run
};
