import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/design-boards.mjs
import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
var BOARDS_SCHEMA = "sdlc/design-boards/v1";
var DESIGN_DIR = "design";
var MANIFEST = "boards.json";
var SHEET = "index.html";
var METHODS = Object.freeze(["html", "capture", "import", "canvas-export"]);
var NEEDS_PICTURES = /* @__PURE__ */ new Set(["visual", "new-surface"]);
var REVISION_WARN_BYTES = 5 * 1024 * 1024;
var PART = "[a-z0-9]+(?:-[a-z0-9]+)*";
var KEY_RE = new RegExp(`^(${PART})--(${PART})(?:--(${PART}))?$`);
var VIEWPORT_RE = /^(\d{2,5})x(\d{2,5})$/;
var posix = (p) => String(p).split("\\").join("/");
function namePart(text) {
  return String(text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function parseBoardKey(key) {
  const m = KEY_RE.exec(String(key ?? ""));
  return m ? { surface: m[1], state: m[2], viewport: m[3] ?? null } : null;
}
var isBoardKey = (key) => parseBoardKey(key) !== null;
function parseViewport(text) {
  const m = VIEWPORT_RE.exec(String(text ?? "").trim());
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}
var revisionDir = (n) => `r${n}`;
var frozenManifestPath = (n) => `${DESIGN_DIR}/${revisionDir(n)}/${MANIFEST}`;
function capturePath(slice, key) {
  const s = namePart(slice);
  if (!s) throw new Error("capture path: a slice is required");
  if (!isBoardKey(key)) throw new Error(`capture path: '${key}' is not a board key (<surface>--<state>[--<viewport>])`);
  return `${DESIGN_DIR}/captures/${s}/${key}.png`;
}
function needsPictures(index) {
  return NEEDS_PICTURES.has(String(index?.["ux-impact"] ?? "").trim());
}
function emptyManifest(slug, { method = "html", viewports = { desktop: "1280x800" } } = {}) {
  return { schema: BOARDS_SCHEMA, slug, revision: 0, method, viewports, boards: [], confirmed: [] };
}
function isInsidePath(rel) {
  const p = posix(rel);
  if (!p || isAbsolute(p) || /^[a-zA-Z]:/.test(p)) return false;
  return !p.split("/").includes("..");
}
function validateManifest(m) {
  const errors = [];
  if (!m || typeof m !== "object" || Array.isArray(m)) return ["the manifest is not a JSON object"];
  if (m.schema !== BOARDS_SCHEMA) errors.push(`schema must be '${BOARDS_SCHEMA}'`);
  if (typeof m.slug !== "string" || !m.slug) errors.push("slug is missing");
  if (!Number.isInteger(m.revision) || m.revision < 0) errors.push("revision must be an integer, 0 or more");
  if (m.method !== void 0 && !METHODS.includes(m.method)) errors.push(`method must be one of ${METHODS.join(", ")}`);
  const viewports = m.viewports ?? {};
  if (typeof viewports !== "object" || Array.isArray(viewports)) errors.push("viewports must be an object");
  else for (const [name, size] of Object.entries(viewports)) {
    if (!parseViewport(size)) errors.push(`viewport '${name}' must be <width>x<height>, not '${size}'`);
  }
  if (!Array.isArray(m.boards)) errors.push("boards must be a list");
  else {
    const seen = /* @__PURE__ */ new Set();
    m.boards.forEach((b, i) => {
      const at = `boards[${i}]`;
      if (!b || typeof b !== "object") {
        errors.push(`${at} is not an object`);
        return;
      }
      if (!isBoardKey(b.key)) errors.push(`${at}.key '${b.key}' is not <surface>--<state>[--<viewport>]`);
      else if (seen.has(b.key)) errors.push(`${at}.key '${b.key}' is listed twice`);
      seen.add(b.key);
      if (!b.html && !b.png) errors.push(`${at} (${b.key}) has neither html nor png`);
      for (const f of ["html", "png", "source"]) {
        if (b[f] && !isInsidePath(b[f])) errors.push(`${at}.${f} '${b[f]}' leaves the design folder`);
      }
      if (b.viewport && viewports && typeof viewports === "object" && !viewports[b.viewport]) {
        errors.push(`${at}.viewport '${b.viewport}' is not in viewports`);
      }
    });
  }
  if (m.confirmed !== void 0 && !Array.isArray(m.confirmed)) errors.push("confirmed must be a list");
  return errors;
}
function readManifest(file) {
  if (!existsSync(file)) return { manifest: null, errors: [`${posix(file)} does not exist`] };
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, "utf8"));
  } catch (e) {
    return { manifest: null, errors: [`${posix(file)} is not valid JSON: ${e.message}`] };
  }
  return { manifest, errors: validateManifest(manifest) };
}
function boardFiles(board) {
  if (board?.png) return [board.png];
  if (board?.html) return [board.html];
  return [];
}
function boardsRef(contract) {
  const ref = String(contract?.boards ?? "").trim();
  return ref ? posix(ref).replace(/^\.\//, "") : null;
}
function missingBoardFiles(workflowDir, contract) {
  const ref = boardsRef(contract);
  if (!ref) return [];
  if (!isInsidePath(ref)) return [`${ref} (the boards path leaves the workflow folder)`];
  const file = join(workflowDir, ...ref.split("/"));
  const { manifest, errors } = readManifest(file);
  if (!manifest) return [ref];
  if (errors.length) return [`${ref} (${errors[0]})`];
  if (!manifest.boards.length) return [`${ref} (the manifest lists no board)`];
  const base = posix(dirname(ref));
  const missing = [];
  for (const b of manifest.boards) {
    for (const f of boardFiles(b)) {
      if (!existsSync(join(dirname(file), ...posix(f).split("/")))) missing.push(`${base}/${posix(f)}`);
    }
  }
  return missing;
}
function frozenBoardsOf(workflowDir, contract) {
  const ref = boardsRef(contract);
  if (!ref || !isInsidePath(ref)) return null;
  const file = join(workflowDir, ...ref.split("/"));
  const { manifest, errors } = readManifest(file);
  if (!manifest || errors.length) return null;
  const last = (manifest.confirmed ?? []).at(-1) ?? null;
  const boards = [];
  for (const b of manifest.boards) {
    if (!b.png || !isInsidePath(b.png)) continue;
    const abs = join(dirname(file), ...posix(b.png).split("/"));
    if (!existsSync(abs)) continue;
    boards.push({ key: b.key, surface: b.surface, state: b.state, viewport: b.viewport ?? null, caption: b.caption ?? b.key, abs, file: `${b.key}.png` });
  }
  return {
    ref,
    revision: manifest.revision,
    boards,
    canvas: last?.canvas ?? contract?.canvas ?? null,
    canvasVersion: last?.["canvas-version"] ?? null,
    confirmedBy: last?.by ?? contract?.["direction-confirmed-by"] ?? null,
    confirmedAt: last?.at ?? null
  };
}
var ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c]);
var safeHref = (s) => /^https?:\/\//i.test(String(s ?? "")) || isInsidePath(s) ? esc(s) : "#";
function renderSheet(m, { generatedAt = "", frozen = false } = {}) {
  const last = (m.confirmed ?? []).at(-1) ?? null;
  const groups = /* @__PURE__ */ new Map();
  for (const b of m.boards ?? []) {
    if (!groups.has(b.surface)) groups.set(b.surface, []);
    groups.get(b.surface).push(b);
  }
  const board = (b) => {
    const pic = b.png ? `<a href="${safeHref(b.png)}"><img src="${safeHref(b.png)}" alt="${esc(b.caption ?? b.key)}" loading="lazy"></a>` : `<div class="none">No PNG${b.render ? `: ${esc(b.render)}` : ""}.${b.html ? ` Open <a href="${safeHref(b.html)}">${esc(b.html)}</a>.` : ""}</div>`;
    const meta = [b.state, b.viewport, b.sketch ? `from sketch ${b.sketch}` : null].filter(Boolean).map(esc).join(" \xB7 ");
    return `<figure id="${esc(b.key)}">${pic}<figcaption><b>${esc(b.caption ?? b.key)}</b><span>${meta}</span><code>${esc(b.key)}</code></figcaption></figure>`;
  };
  const sections = [...groups.entries()].map(([s, list]) => `<section><h2>${esc(s)}</h2><div class="grid">${list.map(board).join("")}</div></section>`).join("\n");
  const status = last ? `Revision ${esc(last.revision)} confirmed ${esc(last.at)} (${esc(last.by)})${frozen ? " \xB7 frozen copy" : ""}` : "Working boards \xB7 not confirmed yet";
  const canvas = last?.canvas ? ` \xB7 <a href="${safeHref(last.canvas)}">canvas</a>${last["canvas-version"] ? ` v${esc(last["canvas-version"])}` : ""}` : "";
  const viewports = Object.entries(m.viewports ?? {}).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(", ");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Design boards \xB7 ${esc(m.slug)}</title>
<style>
:root{color-scheme:light dark;--bg:#f6f6f4;--ink:#1c1d1f;--mute:#5f626a;--rule:#d9d9d4;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#141517;--ink:#e4e6ea;--mute:#a3a7ae;--rule:#2b2e33;--card:#1c1e21}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,Segoe UI,sans-serif}
header{padding:20px 24px;border-bottom:1px solid var(--rule)}h1{margin:0 0 4px;font-size:20px}header p{margin:0;color:var(--mute)}
a{color:inherit}section{padding:8px 24px 24px}h2{font-size:15px;text-transform:uppercase;letter-spacing:.06em;color:var(--mute);margin:20px 0 10px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));gap:16px}
figure{margin:0;background:var(--card);border:1px solid var(--rule);border-radius:8px;overflow:hidden}
figure img{display:block;width:100%;height:auto;border-bottom:1px solid var(--rule)}
.none{padding:40px 16px;color:var(--mute);text-align:center;border-bottom:1px solid var(--rule)}
figcaption{display:grid;gap:2px;padding:10px 12px}figcaption span{color:var(--mute);font-size:13px}figcaption code{font-size:12px;color:var(--mute)}
</style></head><body>
<header><h1>Design boards \xB7 ${esc(m.slug)}</h1><p>${status}${canvas}</p><p>${esc((m.boards ?? []).length)} boards \xB7 method ${esc(m.method ?? "html")} \xB7 viewports ${viewports || "none"}${generatedAt ? ` \xB7 written ${esc(generatedAt)}` : ""}</p></header>
${sections || "<section><p>No boards yet.</p></section>"}
</body></html>
`;
}
var BLOCK_HEAD = "# sdlc-workflow design record: tracked although .ai/ is ignored (DESIGN-BOARDS-PLAN D9)";
var STAR_BLOCK = [
  BLOCK_HEAD,
  "!.ai/design/",
  "!.ai/workflows/",
  ".ai/workflows/*",
  "!.ai/workflows/*/",
  ".ai/workflows/*/*",
  "!.ai/workflows/*/design/",
  ".ai/workflows/*/design/*",
  "!.ai/workflows/*/design/r*/"
];
var GLOB_BLOCK = [
  BLOCK_HEAD,
  "!.ai/design/",
  "!.ai/design/**",
  "!.ai/workflows/",
  "!.ai/workflows/*/",
  "!.ai/workflows/*/design/",
  "!.ai/workflows/*/design/r*/",
  "!.ai/workflows/*/design/r*/**"
];
function ignoreAdvice(pattern, ignored = pattern !== null) {
  if (!ignored) return { change: false, style: "tracked", block: "" };
  const p = String(pattern ?? "").trim().replace(/^\//, "");
  if (p === ".ai/*") return { change: true, style: "star", block: `${STAR_BLOCK.join("\n")}
` };
  if (p === ".ai/**/*" || p === ".ai/**") return { change: true, style: "globstar", block: `${GLOB_BLOCK.join("\n")}
` };
  if (p === ".ai/" || p === ".ai") return { change: true, style: "folder", replace: ".ai/*", block: `${STAR_BLOCK.join("\n")}
` };
  return { change: false, style: "other", pattern: p, manual: `the pattern '${p}' ignores the design record; add exceptions for .ai/design/ and .ai/workflows/*/design/r*/ by hand` };
}

export {
  DESIGN_DIR,
  MANIFEST,
  SHEET,
  METHODS,
  REVISION_WARN_BYTES,
  parseBoardKey,
  parseViewport,
  revisionDir,
  frozenManifestPath,
  capturePath,
  needsPictures,
  emptyManifest,
  readManifest,
  boardFiles,
  missingBoardFiles,
  frozenBoardsOf,
  renderSheet,
  ignoreAdvice
};
