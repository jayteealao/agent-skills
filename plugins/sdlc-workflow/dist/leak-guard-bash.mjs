#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  buildLexicon,
  formatFindings,
  scanText
} from "./chunk-OEH2BR3U.mjs";
import {
  outputSystemMessage,
  projectRootFromInput,
  readStdinJson
} from "./chunk-D5PYFUZC.mjs";
import {
  logError
} from "./chunk-SCQPZLF2.mjs";
import "./chunk-UTP6CBAZ.mjs";
import {
  loadConfig
} from "./chunk-LGV2OZL4.mjs";
import "./chunk-FZ2GR6GF.mjs";
import "./chunk-SGA7NFMW.mjs";

// hooks/leak-guard-bash.mjs
var PUBLISH_COMMANDS = /\bgit\s+commit\b|\bgit\s+tag\b|\bgh\s+pr\s+create\b|\bgh\s+release\s+(?:create|edit)\b/;
var TEXT_FLAGS = /(?:^|\s)(?:-m|-t|-b|-n|--message|--title|--body|--notes)(?:=|\s+)("(?:[^"\\]|\\.)*"|'[^']*'|\$'(?:[^'\\]|\\.)*'|\S+)/g;
function extractOutwardText(command) {
  const s = String(command ?? "");
  if (!PUBLISH_COMMANDS.test(s)) return [];
  const texts = [];
  let m;
  TEXT_FLAGS.lastIndex = 0;
  while (m = TEXT_FLAGS.exec(s)) {
    let value = m[1];
    if (value.startsWith('"') && value.endsWith('"') || value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1);
    } else if (value.startsWith("$'")) {
      value = value.slice(2, -1);
    }
    texts.push(value);
  }
  const heredoc = s.match(/<<-?\s*'?EOF'?\n([\s\S]*?)\nEOF/);
  if (heredoc) texts.push(heredoc[1]);
  return texts;
}
async function main() {
  if (process.env.CLAUDE_PLUGIN_INSTALL === "1") return;
  if (process.env.SDLC_DISPATCH_ACTIVE === "1") return;
  const input = await readStdinJson();
  const command = input?.tool_input?.command;
  if (!command || !PUBLISH_COMMANDS.test(String(command))) return;
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.semantic?.enabled !== true) return;
  const texts = extractOutwardText(command);
  if (!texts.length) return;
  const lexicon = buildLexicon();
  const findings = texts.flatMap((t) => scanText(t, lexicon));
  if (!findings.length) return;
  const summary = formatFindings(findings);
  const message = `External Output Boundary: outward-facing text in this command contains internal workflow vocabulary \u2014 ${summary}. Translate to product language (user-visible change, rationale, verification, risk) before publishing; the rule lives in skills/wf/reference/_output-boundary.md.`;
  if (config.semantic?.mode === "enforce") {
    console.error(message);
    process.exit(2);
  }
  outputSystemMessage(message);
}
main().catch((err) => {
  logError("leak-guard-bash", err);
  process.exit(0);
});
export {
  extractOutwardText
};
