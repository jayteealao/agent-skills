import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/stdin.mjs
async function readStdin() {
  let text = "";
  process.stdin.setEncoding("utf-8");
  for await (const chunk of process.stdin) {
    text += chunk;
  }
  return text;
}
function normalizeHookPayload(input) {
  if (!input || typeof input !== "object") return input;
  const aliases = [
    ["toolInput", "tool_input"],
    ["toolName", "tool_name"],
    ["hookEventName", "hook_event_name"]
  ];
  for (const [camel, snake] of aliases) {
    if (input[snake] === void 0 && input[camel] !== void 0) {
      input[snake] = input[camel];
    }
  }
  return input;
}
var INVALID_JSON_HEX_BYTES = 200;
function describeInvalidJson(text, err, { bytes = INVALID_JSON_HEX_BYTES } = {}) {
  const buf = Buffer.from(String(text ?? ""), "utf-8");
  const head = buf.subarray(0, bytes).toString("hex");
  return `invalid hook JSON on stdin: ${err?.message ?? err}; ${buf.length} bytes; first ${Math.min(bytes, buf.length)} bytes hex: ${head}`;
}
async function readStdinJson({ emptyValue = {} } = {}) {
  const text = (await readStdin()).trim();
  if (!text) return emptyValue;
  try {
    return normalizeHookPayload(JSON.parse(text));
  } catch (err) {
    err.message = describeInvalidJson(text, err);
    throw err;
  }
}

export {
  readStdinJson
};
