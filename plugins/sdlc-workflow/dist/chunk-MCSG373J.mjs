import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  formatValidationErrors,
  validateBrainstormBoardFile,
  validateFrontmatterFile,
  validateSiblingYamlFile
} from "./chunk-4HMFV4P2.mjs";
import {
  blockToolCall,
  isEntry,
  runStandalone
} from "./chunk-QAWMADB5.mjs";
import {
  loadConfig
} from "./chunk-KNXRJRUP.mjs";
import {
  collectToolInputPaths,
  hasFrontmatterFence,
  isBrainstormBoardPath,
  isFreeFormWorkflowPath,
  isManagedArtifactMarkdownPath,
  isProjectContextMarkdownPath,
  isProseLogPath,
  isShipPlanAuditPath,
  normalizePathForMatch,
  outputSystemMessage,
  projectRootFromInput,
  readTextIfExists,
  resolveProjectPath
} from "./chunk-JNFVGADR.mjs";
import {
  safeParseFrontmatter
} from "./chunk-5U76735W.mjs";

// hooks/post-write-verify.mjs
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// lib/limitation-lexicon.mjs
var LIMITATION_RE = /does not (exist|ship|expose)|is(n'?t| not) (available|exposed|supported)|no longer (exists|available|exposed|supported)|(API|method|function|field|prop(?:erty)?) is missing|not (?:a )?(?:real|valid) (?:API|method|export)|was removed (?:from|in)\b/i;
var CITATION_MARKER_RE = /source:|node_modules\/|\brepro:|\bissue:\s*#?\d|https?:\/\/|study-sources|\.d\.ts\b/i;
var SUPPRESSION_RE = /\bas any\b|@ts-ignore|@ts-expect-error|eslint-disable|#\s*type:\s*ignore|#\s*noqa|@SuppressWarnings|#pragma warning disable|\/\/\s*nolint|@Suppress\b/;
var DEBT_MARKER_RE = /sdlc-debt:/i;
var MECHANISM_RE = /\b(state[- ]machine|scheduler|queue|cache|pipeline|orchestrator|regex)\b/i;
function lines(text) {
  return String(text ?? "").split(/\r?\n/);
}
function markerWithin(ls, i, window, marker) {
  const lo = Math.max(0, i - window), hi = Math.min(ls.length - 1, i + window);
  for (let j = lo; j <= hi; j++) if (marker.test(ls[j])) return true;
  return false;
}
function findUncitedLimitationClaims(text, { onlyComments = true } = {}) {
  const ls = lines(text);
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    const line = ls[i];
    if (!LIMITATION_RE.test(line)) continue;
    if (onlyComments && !/^\s*(\/\/|\/\*|\*|#|<!--|--)/.test(line) && !/\/\/|\/\*|#\s|<!--/.test(line)) continue;
    if (markerWithin(ls, i, 3, CITATION_MARKER_RE)) continue;
    out.push({ line: i + 1, text: line.trim().slice(0, 200) });
  }
  return out;
}
function findUnmarkedSuppressions(text) {
  const ls = lines(text);
  const out = [];
  for (let i = 0; i < ls.length; i++) {
    if (!SUPPRESSION_RE.test(ls[i])) continue;
    if (markerWithin(ls, i, 2, DEBT_MARKER_RE)) continue;
    out.push({ line: i + 1, text: ls[i].trim().slice(0, 200) });
  }
  return out;
}
function findUnownedMechanisms(acText, decisionText) {
  const found = /* @__PURE__ */ new Set();
  const dt = String(decisionText ?? "").toLowerCase();
  for (const line of lines(acText)) {
    let m;
    const re = new RegExp(MECHANISM_RE.source, "ig");
    while (m = re.exec(line)) {
      const noun = m[1].toLowerCase().replace(/[- ]/g, " ");
      if (!dt.includes(noun) && !dt.includes(noun.replace(" ", "-")) && !dt.includes(noun.replace(" ", ""))) {
        found.add(m[1].toLowerCase());
      }
    }
  }
  return [...found];
}

// lib/explainer-check.mjs
var EXPLAINER_SUFFIX = ".explainer.html.fragment";
function isExplainerFragmentPath(p) {
  return String(p ?? "").replace(/\\/g, "/").endsWith(EXPLAINER_SUFFIX);
}
var EXPLAINER_SNIPPETS = Object.freeze([
  "sequence",
  "comparison",
  "cycle",
  "dependency",
  "layout",
  "trend",
  "states",
  "steps"
]);
var SLICE_STEM_RE = /^(?:03-slice|04-plan|05-implement|06-verify|07-review)-.+$/;
var BODY_MIN_WORDS = Object.freeze({ stage: 250, slice: 150 });
var MIN_VISUALS = Object.freeze({ stage: 2, slice: 1 });
function explainerKind(fileName) {
  const base = String(fileName ?? "").replace(/\\/g, "/").split("/").pop();
  if (!base.endsWith(EXPLAINER_SUFFIX)) return null;
  const stem = base.slice(0, -EXPLAINER_SUFFIX.length);
  return SLICE_STEM_RE.test(stem) ? "slice" : "stage";
}
var ATTR_RE = /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
function parseAttrs(attrText) {
  const attrs = {};
  if (!attrText) return attrs;
  for (const m of attrText.matchAll(ATTR_RE)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return attrs;
}
var VOID_TAGS = /* @__PURE__ */ new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
var RAW_TEXT_TAGS = /* @__PURE__ */ new Set(["script", "style"]);
var IMPLIED_END = /* @__PURE__ */ new Set(["p", "li", "dt", "dd", "tr", "td", "th", "option", "thead", "tbody", "tfoot"]);
var WRAPPER_TAGS = /* @__PURE__ */ new Set(["div", "section", "article", "main"]);
function parseFragmentTree(text) {
  const root = { type: "el", tag: "#root", children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const TOKEN = /<!--([\s\S]*?)-->|<\/([a-zA-Z][\w:-]*)\s*>|<([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)|(<)/g;
  let m;
  while ((m = TOKEN.exec(text)) !== null) {
    const [, comment, closeTag, openTag, attrText, selfClose, txt, stray] = m;
    if (comment !== void 0) {
      top().children.push({ type: "comment", text: comment });
    } else if (closeTag) {
      const tag = closeTag.toLowerCase();
      let i = stack.length - 1;
      while (i > 0 && stack[i].tag !== tag && IMPLIED_END.has(stack[i].tag)) i--;
      if (i === 0 || stack[i].tag !== tag) {
        throw new Error(`unexpected </${tag}> (open element: <${top().tag}>)`);
      }
      stack.length = i;
    } else if (openTag) {
      const tag = openTag.toLowerCase();
      const el = { type: "el", tag, attrs: parseAttrs(attrText), children: [] };
      top().children.push(el);
      if (RAW_TEXT_TAGS.has(tag)) {
        const end = text.toLowerCase().indexOf(`</${tag}`, TOKEN.lastIndex);
        if (end === -1) throw new Error(`unclosed <${tag}>`);
        el.children.push({ type: "text", text: text.slice(TOKEN.lastIndex, end) });
        const close = text.indexOf(">", end);
        TOKEN.lastIndex = close === -1 ? text.length : close + 1;
      } else if (!selfClose && !VOID_TAGS.has(tag)) {
        stack.push(el);
      }
    } else if (txt !== void 0) {
      top().children.push({ type: "text", text: txt });
    } else if (stray) {
      if (text.startsWith("<!--", m.index)) throw new Error("unclosed comment");
      top().children.push({ type: "text", text: "<" });
    }
  }
  const unclosed = stack.slice(1).filter((el) => !IMPLIED_END.has(el.tag));
  if (unclosed.length) throw new Error(`unclosed <${unclosed[unclosed.length - 1].tag}>`);
  return root;
}
function isBlank(node) {
  return node.type === "text" && !node.text.trim();
}
var INCLUDE_RE = /^\s*@include\s+(explainer\/([a-z][a-z0-9-]*))\s*([\s\S]*?)\s*$/;
function isExplainerInclude(node) {
  return node.type === "comment" && /^\s*@include\s+explainer\//.test(node.text);
}
function includeName(node) {
  return INCLUDE_RE.exec(node.text)?.[2] ?? null;
}
function isKnownInclude(node) {
  return isExplainerInclude(node) && EXPLAINER_SNIPPETS.includes(includeName(node));
}
var attr = (node, name) => node?.type === "el" ? node.attrs?.[name] : void 0;
var hasAttr = (node, name) => attr(node, name) !== void 0;
var INTERACTIVE_ATTRS = ["data-ex-steps", "data-ex-slider", "data-ex-toggle"];
function* elementsOf(node) {
  for (const child of node.children ?? []) {
    if (child.type !== "el") continue;
    yield child;
    yield* elementsOf(child);
  }
}
function* nodesOf(node) {
  for (const child of node.children ?? []) {
    yield child;
    if (child.type === "el") yield* nodesOf(child);
  }
}
function isVisual(node) {
  if (isExplainerInclude(node)) return true;
  if (node.type !== "el" || node.tag === "p") return false;
  if (node.tag === "svg" || node.tag === "figure") return true;
  const self = [node, ...elementsOf(node)];
  return self.some((el) => el.tag === "svg" || INTERACTIVE_ATTRS.some((a) => hasAttr(el, a))) || [...nodesOf(node)].some(isKnownInclude);
}
function describe(node) {
  if (isExplainerInclude(node)) return `@include ${node.text.trim().split(/\s+/)[1]}`;
  if (node.type === "el") return `<${node.tag}>`;
  return "text";
}
var SUMMARY_MAX_SENTENCES = 3;
var SUMMARY_MAX_WORDS = 70;
function textOf(node) {
  if (!node) return "";
  if (node.type === "text") return node.text;
  if (node.type !== "el" || RAW_TEXT_TAGS.has(node.tag)) return "";
  const inner = node.children.map(textOf).join("");
  return SPACED_TAGS.has(node.tag) ? ` ${inner} ` : inner;
}
var SPACED_TAGS = /* @__PURE__ */ new Set([
  "p",
  "li",
  "ul",
  "ol",
  "div",
  "section",
  "article",
  "figure",
  "figcaption",
  "table",
  "tr",
  "td",
  "th",
  "dl",
  "dt",
  "dd",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "button",
  "label",
  "br",
  "svg",
  "g",
  "text",
  "tspan",
  "title",
  "desc"
]);
function plainText(node) {
  return textOf(node).replace(/&nbsp;/gi, " ").replace(/&[a-z]+;|&#\d+;/gi, "x").replace(/\s+/g, " ").trim();
}
function countSentences(text) {
  return String(text ?? "").trim().split(/(?<=[.!?])["')\]]*\s+/).filter((s) => /\w/.test(s)).length;
}
function countWords(text) {
  return String(text ?? "").trim().split(/\s+/).filter((w) => /\w/.test(w)).length;
}
function isMostlyNumbers(text) {
  const tokens = String(text ?? "").trim().split(/\s+/).filter((w) => /\w/.test(w));
  if (!tokens.length) return false;
  return tokens.filter((w) => /\d/.test(w)).length * 2 > tokens.length;
}
function* commentsOf(node) {
  for (const child of node.children ?? []) {
    if (child.type === "comment") yield child;
    else if (child.type === "el") yield* commentsOf(child);
  }
}
function checkExplainerInclude(commentText) {
  const m = INCLUDE_RE.exec(commentText);
  if (!m) return [];
  const [, name, short, payload] = m;
  if (!EXPLAINER_SNIPPETS.includes(short)) {
    return [`explainer: @include ${name} is not a known snippet (use one of ${EXPLAINER_SNIPPETS.join(", ")}, or a free <svg>)`];
  }
  let data = {};
  if (payload) {
    try {
      data = JSON.parse(payload);
    } catch (err) {
      return [`explainer: @include ${name} JSON does not parse (${err.message}); the renderer cannot expand it`];
    }
  }
  const warns = [];
  if (name === "explainer/comparison") {
    const bars = Array.isArray(data?.bars) ? data.bars : [];
    if (bars.length < 2) {
      warns.push(`explainer: @include ${name} has ${bars.length} bar${bars.length === 1 ? "" : "s"}; a comparison needs at least two (write one fact as a sentence)`);
    } else {
      const values = new Set(bars.map((b) => Number(b?.value)));
      if (values.size === 1) {
        warns.push(`explainer: @include ${name} bars all have the value ${[...values][0]}; that is a list, not a chart (use a list or a sentence)`);
      }
    }
  }
  return warns;
}
var COLOUR_ATTRS = ["fill", "stroke", "stop-color", "flood-color", "lighting-color", "color"];
var COLOUR_PROP_RE = /(?:^|[;{\s])(fill|stroke|stop-color|flood-color|lighting-color|color|background(?:-color)?)\s*:\s*([^;}"]+)/gi;
var COLOUR_KEYWORDS = /^(?:none|currentcolor|transparent|inherit|initial|unset|revert|context-fill|context-stroke)$/i;
function isHardColour(value) {
  const v = String(value ?? "").trim().replace(/\s*!important$/i, "");
  if (!v || COLOUR_KEYWORDS.test(v)) return false;
  if (/^var\(/i.test(v) || /^url\(/i.test(v)) return false;
  return true;
}
function hardColoursIn(svg) {
  const found = [];
  for (const el of [svg, ...elementsOf(svg)]) {
    for (const a of COLOUR_ATTRS) {
      if (isHardColour(attr(el, a))) found.push(`${a}="${attr(el, a)}"`);
    }
    const css = [attr(el, "style") ?? ""];
    if (el.tag === "style") css.push(textOf({ ...el, tag: "x" }));
    for (const text of css) {
      for (const m of text.matchAll(COLOUR_PROP_RE)) {
        if (isHardColour(m[2])) found.push(`${m[1]}: ${m[2].trim()}`);
      }
    }
  }
  return found;
}
function checkFreeSvg(svg, n) {
  const warns = [];
  if (![...elementsOf(svg)].some((el) => el.tag === "title")) {
    warns.push(`explainer: <svg> #${n} has no <title>; give it a <title> that names what it shows`);
  }
  const hard = hardColoursIn(svg);
  if (hard.length) {
    warns.push(`explainer: <svg> #${n} hard-codes colours (${[...new Set(hard)].slice(0, 3).join(", ")}); use theme tokens, var(--\u2026), so it follows light and dark`);
  }
  return warns;
}
function checkInteractive(tree) {
  const warns = [];
  const els = [...elementsOf(tree)];
  const groups = (name) => new Set(els.filter((el) => hasAttr(el, name)).map((el) => attr(el, name)));
  const frames = groups("data-ex-frames");
  const panels = groups("data-ex-panel");
  for (const g of groups("data-ex-slider")) {
    if (!frames.has(g)) warns.push(`explainer: slider data-ex-slider="${g}" has no [data-ex-frames="${g}"]; add the precomputed frames`);
  }
  for (const g of groups("data-ex-toggle")) {
    if (!panels.has(g)) warns.push(`explainer: toggle data-ex-toggle="${g}" has no [data-ex-panel="${g}"]; add a panel for each button`);
  }
  for (const el of els.filter((e) => hasAttr(e, "data-ex-steps"))) {
    const steps = [...elementsOf(el)].filter((e) => hasAttr(e, "data-ex-step")).length;
    if (steps < 2) warns.push(`explainer: a [data-ex-steps] block has ${steps} [data-ex-step]; a step-through needs at least two`);
  }
  return warns;
}
function collectVisuals(tree) {
  let count = 0;
  const svgs = [];
  const groups = /* @__PURE__ */ new Set();
  const walk = (node, inInteractive) => {
    for (const child of node.children ?? []) {
      if (child.type === "comment") {
        if (isKnownInclude(child) && !inInteractive) count++;
        continue;
      }
      if (child.type !== "el") continue;
      let inside = inInteractive;
      if (hasAttr(child, "data-ex-steps")) {
        if (!inInteractive) count++;
        inside = true;
      }
      for (const [a, kind] of [["data-ex-slider", "slider"], ["data-ex-toggle", "toggle"]]) {
        if (hasAttr(child, a) && !groups.has(`${kind}:${attr(child, a)}`)) {
          groups.add(`${kind}:${attr(child, a)}`);
          count++;
        }
      }
      if (hasAttr(child, "data-ex-frames") || hasAttr(child, "data-ex-panel")) inside = true;
      if (child.tag === "svg") {
        svgs.push(child);
        if (!inside) count++;
        continue;
      }
      walk(child, inside);
    }
  };
  walk(tree, false);
  return { count, svgs };
}
var NO_VISUAL_RE = /^\s*no-visual\s*:\s*\S/;
function checkExplainer(text, fileName = null) {
  const errs = [];
  const warns = [];
  let tree;
  try {
    tree = parseFragmentTree(String(text ?? ""));
  } catch (err) {
    errs.push(`explainer does not parse: ${err.message}`);
    return { errs, warns };
  }
  const kind = explainerKind(fileName);
  const lower = String(text).toLowerCase();
  for (const tag of ["<html", "<head", "<body"]) {
    if (new RegExp(`${tag}[\\s>]`).test(lower)) warns.push(`explainer: remove ${tag}> (a fragment is not a full document)`);
  }
  if (/<script[\s>]/.test(lower)) {
    warns.push("explainer: remove the <script>; the view runs one script (assets/explainer.js) and inline scripts never run (CSP script-src 'self'); use data-ex-* markup for interaction");
  }
  const blocksOf = (el) => el.children.filter((n) => !isBlank(n) && !(n.type === "comment" && !isExplainerInclude(n)) && !(n.type === "el" && n.tag === "style"));
  let blocks = blocksOf(tree);
  while (blocks.length === 1 && blocks[0].type === "el" && WRAPPER_TAGS.has(blocks[0].tag) && !INTERACTIVE_ATTRS.some((a) => hasAttr(blocks[0], a))) {
    blocks = blocksOf(blocks[0]);
  }
  if (!blocks.length) {
    warns.push("explainer: empty \u2014 open with a plain summary paragraph");
    return { errs, warns };
  }
  const isP = (n) => n?.type === "el" && n.tag === "p";
  const isList = (n) => n?.type === "el" && (n.tag === "ul" || n.tag === "ol");
  const hasSummary = isP(blocks[0]);
  if (!hasSummary) {
    warns.push(`explainer: open with a plain summary <p> (first element is ${describe(blocks[0])})`);
  } else {
    const summary = plainText(blocks[0]);
    const sentences = countSentences(summary);
    const words = countWords(summary);
    if (sentences > SUMMARY_MAX_SENTENCES) {
      warns.push(`explainer: the summary <p> has ${sentences} sentences; keep it to two or ${SUMMARY_MAX_SENTENCES} and move detail below it`);
    }
    if (words > SUMMARY_MAX_WORDS) {
      warns.push(`explainer: the summary <p> has ${words} words; keep it under about ${SUMMARY_MAX_WORDS} and move detail below it`);
    }
  }
  for (const c of commentsOf(tree)) {
    if (isExplainerInclude(c)) warns.push(...checkExplainerInclude(c.text));
  }
  const { count: visuals, svgs } = collectVisuals(tree);
  svgs.forEach((svg, i) => warns.push(...checkFreeSvg(svg, i + 1)));
  warns.push(...checkInteractive(tree));
  if (kind) {
    const body = blocks.slice(hasSummary ? 1 : 0).map(plainText).join(" ");
    const bodyWords = countWords(body);
    const floor = BODY_MIN_WORDS[kind];
    if (bodyWords < floor) {
      warns.push(`explainer: the body has ${bodyWords} words beyond the summary; a ${kind === "slice" ? "per-slice" : "stage"} explainer needs about ${floor} \u2014 explain what was built or decided, how it works, why (and what was rejected), and what it means`);
    }
    const escaped = [...commentsOf(tree)].some((c) => NO_VISUAL_RE.test(c.text));
    if (!escaped && visuals < MIN_VISUALS[kind]) {
      warns.push(`explainer: ${visuals} visual${visuals === 1 ? "" : "s"}; a ${kind === "slice" ? "per-slice explainer needs at least one" : "stage explainer normally has two or more"} \u2014 add a visual for each part with structure, or say in the text why there is none (<!-- no-visual: <reason> -->)`);
    }
  }
  const GROUP_ATTRS = [...INTERACTIVE_ATTRS, "data-ex-panel", "data-ex-frames"];
  const interactive = (n) => n?.type === "el" && [n, ...elementsOf(n)].some((el) => GROUP_ATTRS.some((a) => hasAttr(el, a)));
  const continuesGroup = (n, prev) => n.type === "el" && (hasAttr(n, "data-ex-panel") || hasAttr(n, "data-ex-frames")) && interactive(prev);
  blocks.forEach((n, i) => {
    if (!isVisual(n)) return;
    if (continuesGroup(n, blocks[i - 1])) return;
    if (!isP(blocks[i - 1])) {
      warns.push(`explainer: put one <p> sentence before ${describe(n)} #${blocks.slice(0, i + 1).filter(isVisual).length} that says what it shows`);
    }
  });
  const last = blocks[blocks.length - 1];
  if (!(isP(last) || isList(last)) || blocks.length < 2) {
    warns.push("explainer: close with a short recap <p> or list");
  } else if (isMostlyNumbers(plainText(last).replace(/^recap:?\s*/i, ""))) {
    warns.push("explainer: the recap is mostly numbers; restate the ideas, not the counts");
  }
  return { errs, warns };
}

// hooks/post-write-verify.mjs
var RICH_TIER_TYPES = /* @__PURE__ */ new Set([
  "review",
  "plan",
  "design",
  "ship-run",
  "rca",
  "benchmark",
  "experiment",
  "instrument",
  "profile",
  "simplify-run",
  "review-command",
  "design-audit",
  "design-critique",
  // v9.71 — craft's visual contract gains its own rich layer (02c-craft.yaml +
  // .html.fragment, type: design-contract). Reverses the Gap-D "no interactive
  // layer" call now that craft authors a coverage-grid fragment. Reminder-gated
  // only; NOT in SIBLING_YAML_VALIDATED_TYPES (no real corpus to hard-validate yet).
  "design-contract"
]);
var SIBLING_YAML_VALIDATED_TYPES = /* @__PURE__ */ new Set([
  "plan",
  "review",
  "design",
  "simplify-run",
  "ship-run"
]);
function fragmentOwningType(text) {
  if (!text) return null;
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fence) return null;
  const block = fence[1];
  const typeMatch = /(?:^|\n)\s*type:\s*["']?([A-Za-z0-9-]+)/.exec(block);
  const type = typeMatch ? typeMatch[1] : null;
  if (type !== "augmentation") return type;
  const augMatch = /(?:^|\n)\s*augmentation-type:\s*["']?([A-Za-z0-9-]+)/.exec(block);
  return augMatch ? augMatch[1] : type;
}
function fragmentEscaped(text) {
  if (!text) return false;
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!fence) return false;
  return /(?:^|\n)\s*fragment:\s*["']?(none|skip|n\/a)["']?\s*(?:#.*)?$/im.test(fence[1]);
}
async function enforceSiblingFragments(paths, config) {
  if (config.hooks?.remindMissingFragments === false) return;
  const blocking = [];
  const nudges = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (!type || !RICH_TIER_TYPES.has(type)) continue;
    if (fragmentEscaped(text)) continue;
    const stem = path.absolute.replace(/\.md$/, "");
    const fileStem = path.original.replace(/\\/g, "/").split("/").at(-1).replace(/\.md$/, "");
    const hasYaml = existsSync(`${stem}.yaml`);
    const hasFragment = existsSync(`${stem}.html.fragment`);
    if (!hasYaml) {
      const missing = [`${fileStem}.yaml`];
      if (!hasFragment) missing.push(`${fileStem}.html.fragment`);
      blocking.push({ rel: path.original, type, missing });
    } else if (!hasFragment) {
      nudges.push({ rel: path.original, type, missing: [`${fileStem}.html.fragment`] });
    }
  }
  if (blocking.length) {
    const lines2 = blocking.map((r) => `  - ${r.rel} (type: ${r.type}) \u2014 missing ${r.missing.join(" + ")}`);
    process.stderr.write(
      `wf-postwrite-verify: rich-tier artifact written without its mandatory sibling .yaml:

${lines2.join("\n")}

The sunflower view GATES the whole rich page (file-change topology, files-touched
table, verdict heatmap, risk callouts, etc.) on the sibling .yaml \u2014 without it the
page silently degrades to plain prose. Author the siblings NOW, while this artifact
is still in context:
  1. Write <stem>.yaml \u2014 the structured data (schema: siblingYamlSchemas.<type> in
     plugins/sdlc-workflow/tests/frontmatter.schema.json).
  2. Write <stem>.html.fragment \u2014 the body-only interactive layer.
Full contract: plugins/sdlc-workflow/reference/fragment-author-contract.md.
If this artifact legitimately has no structured data to project, set
\`fragment: none\` in its frontmatter to opt out.
`
    );
    blockToolCall();
  }
  if (nudges.length) {
    const lines2 = nudges.map((r) => `  - ${r.rel} (type: ${r.type}) \u2014 missing ${r.missing.join(" + ")}`);
    outputSystemMessage(
      `wf: rich-tier artifact(s) have their sibling .yaml but no .html.fragment:
${lines2.join("\n")}
The page already renders rich from the .yaml; the .html.fragment only adds the interactive layer (collapsible rows, filters, copy controls). Author it per reference/fragment-author-contract.md if this artifact warrants interactivity.`
    );
  }
}
async function validateSiblingYamls(paths, config, schemaPath) {
  if (config.hooks?.validateSiblingYaml === false) return;
  const failures = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (!type || !SIBLING_YAML_VALIDATED_TYPES.has(type)) continue;
    const yamlPath = `${path.absolute.replace(/\.md$/, "")}.yaml`;
    if (!existsSync(yamlPath)) continue;
    let schemaName = type;
    if (type === "rca" && /^status:\s*ready-for-fix-routing\s*$/m.test(text ?? "")) {
      schemaName = "rca-diagnosis";
    }
    const result = await validateSiblingYamlFile(yamlPath, { schemaPath, artifact: schemaName });
    if (!result.valid) {
      failures.push({ rel: `${path.original.replace(/\.md$/, "")}.yaml`, result });
    }
  }
  if (!failures.length) return;
  for (const f of failures) {
    process.stderr.write(`wf-postwrite-verify: sibling YAML validation FAILED for ${f.rel}

`);
    process.stderr.write(`${formatValidationErrors(f.result.errors)}

`);
  }
  process.stderr.write("The sibling .yaml does not conform to siblingYamlSchemas.<type>\n");
  process.stderr.write("(see plugins/sdlc-workflow/tests/frontmatter.schema.json). The sunflower view\n");
  process.stderr.write("reads this file to build the rich page; a malformed shape degrades the figure.\n");
  process.stderr.write("Fix the issues above, then continue.\n");
  blockToolCall();
}
var SHADOW_DEFERRAL_RE = /(deferred to (?:the )?(?:user|manual|operator)\b|deferred to manual user|UNVERIFIED[ -]INTERACTIVE|will be verified (?:interactively )?(?:during|in|at)\b|decidable by static reasoning|deferred to user verification)/i;
function blockVerifyResultGate(rel, message) {
  process.stderr.write(
    `wf-postwrite-verify: verify result gate BLOCKED ${rel}

${message}

This gate blocks a pass that the acceptance evidence does not support.
Re-Edit the frontmatter to reconcile result
with the acceptance evidence, then continue. Opt out with hooks.verifyResultGate: false.
`
  );
  blockToolCall();
}
async function enforceVerifyResultGate(paths, config) {
  const resultGate = config.hooks?.verifyResultGate !== false;
  const proseLint = config.hooks?.verifyDeferralLint !== false;
  const mockGate = config.hooks?.mockEvidenceGate !== false;
  if (!resultGate && !proseLint && !mockGate) return;
  const warnings = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    if (fragmentOwningType(text) !== "verify") continue;
    const { data, content } = safeParseFrontmatter(text, { filePath: path.absolute });
    if (!data || data.result !== "pass") continue;
    if (mockGate) {
      const mock = data["metric-acceptance-mock-rung"];
      if (typeof mock === "number" && mock > 0) {
        blockVerifyResultGate(
          path.original,
          `result: pass but metric-acceptance-mock-rung (${mock}) > 0. At least one user-observable AC's highest evidence-rung is cited-mock / uncited-mock / static / asserted \u2014 a mock, a static analysis, or an unverified claim of success does not evidence user-observable behaviour. Climb the constraint-resolution ladder to a live/headless/emulator rung (for a task AC: re-read the system of record \u2014 live \u2014 or record a cited attestation \u2014 attested), or take the deferral path (interactive-verification: deferred + a 00-index runtime-evidence-deferrals entry), then set result: partial. Opt out with hooks.mockEvidenceGate: false.`
        );
      }
    }
    if (resultGate) {
      const met = data["metric-acceptance-met"];
      const total = data["metric-acceptance-total"];
      if (typeof met === "number" && typeof total === "number" && total > 0 && met < total) {
        blockVerifyResultGate(
          path.original,
          `result: pass but metric-acceptance-met (${met}) < metric-acceptance-total (${total}). A passing slice must meet EVERY acceptance criterion. Either evidence the unmet AC(s) and raise metric-acceptance-met to ${total}, or set result to \`partial\` / \`fail\`. If an unmet AC is user-observable and this environment cannot evidence it, set interactive-verification: deferred (result becomes \`partial\`) and register a 00-index runtime-evidence-deferrals entry.`
        );
      }
      if (data["interactive-verification"] === "deferred") {
        blockVerifyResultGate(
          path.original,
          "result: pass but interactive-verification: deferred. A deferred user-observable AC has no runtime evidence, so the slice cannot pass \u2014 set result: partial. (`/wf ship` then hard-blocks until a probe/re-verify run clears the deferral.)"
        );
      }
    }
    if (proseLint) {
      const hit = SHADOW_DEFERRAL_RE.exec(content || "");
      if (hit) warnings.push({ rel: path.original, phrase: hit[0].trim() });
    }
  }
  if (warnings.length) {
    const lines2 = warnings.map((w) => `  - ${w.rel}: found "${w.phrase}" while result: pass`);
    outputSystemMessage(
      `wf: possible prose-only deferral in a passing verify artifact:
${lines2.join("\n")}
A user-observable AC that was "deferred to user/manual", left "UNVERIFIED-INTERACTIVE", punted to a later slice, or "decided by static reasoning" is NOT met by a runtime drive. If that is what happened, set result: partial + interactive-verification: deferred (with the rungs tried in the defer-reason) and register the deferral in 00-index runtime-evidence-deferrals \u2014 do not leave it as a silent pass. Disable this lint with hooks.verifyDeferralLint: false.`
    );
  }
}
function newTextFromInput(input) {
  const ti = input?.tool_input ?? {};
  if (typeof ti.content === "string") return ti.content;
  if (typeof ti.new_string === "string") return ti.new_string;
  if (Array.isArray(ti.edits)) return ti.edits.map((e) => e?.new_string ?? "").join("\n");
  return "";
}
function enforceCodeFileLints(input, config, artifactPaths) {
  const limitationLint = config.hooks?.limitationClaimLint !== false;
  const debtLint = config.hooks?.suppressionDebtLint !== false;
  if (!limitationLint && !debtLint) return;
  const artifactSet = new Set((artifactPaths ?? []).map((p) => p.original));
  const paths = collectToolInputPaths(input).filter(
    (p) => !artifactSet.has(p) && !isManagedArtifactMarkdownPath(p) && !isProseLogPath(p)
  );
  if (!paths.length) return;
  const text = newTextFromInput(input);
  if (!text.trim()) return;
  const lines2 = [];
  if (limitationLint) {
    for (const hit of findUncitedLimitationClaims(text)) {
      lines2.push(`  - limitation claim without a citation (line ${hit.line}): "${hit.text}"`);
    }
  }
  if (debtLint) {
    for (const hit of findUnmarkedSuppressions(text)) {
      lines2.push(`  - suppression without an sdlc-debt: marker (line ${hit.line}): "${hit.text}"`);
    }
  }
  if (!lines2.length) return;
  outputSystemMessage(
    `wf: intent-fidelity code lints (advisory) on ${paths.join(", ")}:
${lines2.join("\n")}
A "does not exist / not exposed / was removed" comment is a HYPOTHESIS \u2014 cite the installed source (a study-sources read of node_modules/, a repro, an issue, or a URL) within \xB13 lines, or delete it; never replicate an in-repo limitation comment into new code without re-verifying it. A new \`as any\` / \`@ts-ignore\` / \`eslint-disable\` needs an \`sdlc-debt:\` marker so the debt lifecycle (verify/retro/simplify) inherits it. Opt out: hooks.limitationClaimLint / hooks.suppressionDebtLint.`
  );
}
async function enforceIntakeLedgerLint(paths, config) {
  if (config.hooks?.intakeLedgerLint === false) return;
  const warns = [];
  for (const path of paths) {
    const base = path.original.replace(/\\/g, "/").split("/").at(-1);
    if (base !== "01-intake.md") continue;
    const text = await readTextIfExists(path.absolute);
    if (fragmentOwningType(text) !== "intake") continue;
    const indexPath = path.absolute.replace(/01-intake\.md$/, "00-index.md");
    const indexText = await readTextIfExists(indexPath);
    if (!indexText) continue;
    const { data: idx } = safeParseFrontmatter(indexText, { filePath: indexPath });
    const missing = [];
    const bodyHasRims = /(^|\n)\s*-\s*\*\*RIM-\d+/.test(text || "");
    const idxRisks = idx?.["intent-risks"];
    const risksDeclared = Array.isArray(idxRisks) ? idxRisks.length > 0 : idxRisks === "none-declared";
    if (!bodyHasRims && !risksDeclared) missing.push("intent-risks (RIM ledger)");
    const bodyHasCharter = /(^|\n)\s*-\s*\*\*C\d+\*\*/.test(text || "");
    const idxCharter = idx?.charter;
    const charterDeclared = Array.isArray(idxCharter) ? idxCharter.length > 0 : idxCharter === "none-declared";
    if (!bodyHasCharter && !charterDeclared) missing.push("charter");
    if (missing.length) warns.push({ rel: path.original, missing });
  }
  if (warns.length) {
    const lines2 = warns.map((w) => `  - ${w.rel}: missing ${w.missing.join(" + ")}`);
    outputSystemMessage(
      `wf: intake ledger lint (advisory) \u2014 a default-mode intake landed without its intent ledger:
${lines2.join("\n")}
A default intake may not be SILENTLY ledger-less: author RIM entries (## Risks if Misunderstood, the Step 6a misreading pass) and 3-7 charter commitments into 00-index.md, or declare the explicit escape \`intent-risks: none-declared\` / \`charter: none-declared\` with a one-line reason in the body. Otherwise shape's Step 9a will STOP and backfill the ledger before adjudicating. Opt out: hooks.intakeLedgerLint: false.`
    );
  }
}
async function enforceNamedMechanismLint(paths, config) {
  if (config.hooks?.namedMechanismLint === false) return;
  const warns = [];
  for (const path of paths) {
    if (isProseLogPath(path.original) || isProjectContextMarkdownPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    const type = fragmentOwningType(text);
    if (type !== "shape" && type !== "slice") continue;
    const { content } = safeParseFrontmatter(text, { filePath: path.absolute });
    if (!content) continue;
    const acLines = [];
    const decisionLines = [];
    let inAc = false;
    for (const line of content.split(/\r?\n/)) {
      if (/^#{1,4}\s/.test(line)) inAc = /acceptance criteria|verification|test/i.test(line);
      (inAc ? acLines : decisionLines).push(line);
    }
    const unowned = findUnownedMechanisms(acLines.join("\n"), decisionLines.join("\n"));
    if (unowned.length) warns.push({ rel: path.original, nouns: unowned });
  }
  if (warns.length) {
    const lines2 = warns.map((w) => `  - ${w.rel}: ${w.nouns.join(", ")}`);
    outputSystemMessage(
      `wf: named-mechanism lint (advisory) \u2014 a mechanism named in an AC/verification line has no owning decision in the artifact body:
${lines2.join("\n")}
A test may not name a machine the design does not own. State the mechanism in the body (what it is, what it replaces, why) and adjudicate it if it touches a RIM or PO directive, or drop it from the AC. Opt out: hooks.namedMechanismLint: false.`
    );
  }
}
var TRIAGE_SEVERITIES = /* @__PURE__ */ new Set(["BLOCKER", "HIGH"]);
function auditTriageViolation(data) {
  const findings = Array.isArray(data?.findings) ? data.findings : [];
  const severe = findings.filter(
    (f) => f && String(f.status ?? "open").toLowerCase() === "open" && TRIAGE_SEVERITIES.has(String(f.severity ?? "").toUpperCase())
  );
  if (!severe.length) return null;
  const status = String(data?.["triage-status"] ?? "").toLowerCase();
  if (status === "awaiting-user") {
    const since = Number(data?.["awaiting-since"]);
    const lastRun = Number(data?.["last-run"]);
    if (Number.isInteger(since) && Number.isInteger(lastRun) && since === lastRun) return null;
    const shownSince = data?.["awaiting-since"] === void 0 ? "(missing)" : String(data["awaiting-since"]);
    const shownRun = Number.isInteger(lastRun) ? String(lastRun) : "(missing)";
    return {
      reason: `triage-status is \`awaiting-user\` but \`awaiting-since\` is ${shownSince} while \`last-run\` is ${shownRun}: the escape lasts one run. Ask the gate again in this run and set \`awaiting-since: ${Number.isInteger(lastRun) ? lastRun : "<last-run>"}\`, or record the decisions. Open: ` + severe.map((f) => f.id ?? "<no id>").join(", "),
      count: severe.length
    };
  }
  if (status === "complete") {
    const untriaged = severe.filter((f) => String(f.triage ?? "").toLowerCase() !== "accept");
    if (!untriaged.length) return null;
    return {
      reason: `triage-status is \`complete\` but ${untriaged.length} open BLOCKER/HIGH finding(s) carry no \`triage: accept\`: ` + untriaged.map((f) => f.id ?? "<no id>").join(", "),
      count: untriaged.length
    };
  }
  return {
    reason: `${severe.length} open BLOCKER/HIGH finding(s) and triage-status is \`${status || "(missing)"}\`: ` + severe.map((f) => f.id ?? "<no id>").join(", "),
    count: severe.length
  };
}
async function enforceShipPlanAuditTriage(paths, config) {
  if (config.hooks?.shipPlanAuditTriageGate === false) return;
  for (const path of paths) {
    const text = await readTextIfExists(path.absolute);
    if (!hasFrontmatterFence(text)) continue;
    const { data } = safeParseFrontmatter(text, { filePath: path.absolute });
    if (!data || String(data.kind ?? "") !== "ship-plan-audit") continue;
    const violation = auditTriageViolation(data);
    if (!violation) continue;
    process.stderr.write(
      `wf-postwrite-verify: ship-plan audit triage gate BLOCKED ${path.original}

${violation.reason}

Step 5 of reference/ship-plan/audit.md requires a gate question for every open BLOCKER/HIGH finding
before the ledger is finalized. Ask the gate now (per reference/_gate-question.md), then record each
decision in the ledger: accept -> \`triage: accept\` on the finding; acknowledge -> \`status: acknowledged\`
+ the reason; reject -> drop the finding. Then set \`triage-status: complete\`. If the turn must end while
the user answers, set \`triage-status: awaiting-user\` and \`awaiting-since: <last-run>\` instead; that escape
lasts one run. Opt out with hooks.shipPlanAuditTriageGate: false.
`
    );
    blockToolCall();
  }
}
async function validateBrainstormBoards(paths, config, schemaPath) {
  if (config.hooks?.validateBrainstormBoard === false) return;
  const failures = [];
  for (const path of paths) {
    const result = await validateBrainstormBoardFile(path.absolute, { schemaPath });
    if (!result.valid) failures.push({ path, result });
  }
  if (!failures.length) return;
  for (const f of failures) {
    process.stderr.write(`wf-postwrite-verify: brainstorm board validation FAILED for ${f.path.original}

`);
    process.stderr.write(`${formatValidationErrors(f.result.errors)}

`);
  }
  process.stderr.write("The board does not conform to $defs.brainstormBoard\n");
  process.stderr.write("(see plugins/sdlc-workflow/tests/frontmatter.schema.json and\n");
  process.stderr.write("skills/wf/reference/intake/brainstorm/_artifact.md). Fix the board, then continue.\n");
  blockToolCall();
}
var INDEX_SIZE_WARN_BYTES = 20480;
var INDEX_STAGE_HEAD_CHARS = 4e3;
var INDEX_COMMENT_PROSE_MAX_WORDS = 8;
function isWorkflowIndexPath(filePath) {
  return /(?:^|\/)\.ai\/workflows\/[^/]+\/00-index\.md$/.test(normalizePathForMatch(filePath));
}
function indexLintWarnings(text, byteSize = Buffer.byteLength(String(text ?? ""), "utf8")) {
  const source = String(text ?? "");
  const warnings = [];
  if (byteSize > INDEX_SIZE_WARN_BYTES) {
    warnings.push(
      `00-index.md is ${byteSize} bytes, over the ${INDEX_SIZE_WARN_BYTES}-byte limit. Keep current state in the index; move YAML comment prose, old next-step commentary and finished sub-pass notes to index-history.jsonl (one JSON object per line: {"at","kind","text","stage"}). Keep the deferral list, intent risks, charter and revisions ledger in the index.`
    );
  }
  const fence = /^---\r?\n([\s\S]*?)\r?\n---/.exec(source);
  if (fence) {
    const prose = [];
    for (const line of fence[1].split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("#")) continue;
      const words = trimmed.replace(/^#+/, "").trim().split(/\s+/).filter(Boolean);
      if (words.length > INDEX_COMMENT_PROSE_MAX_WORDS) prose.push(trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed);
    }
    if (prose.length) {
      warnings.push(
        `00-index.md frontmatter carries ${prose.length} YAML comment line(s) of prose (a \`#\` comment of more than ${INDEX_COMMENT_PROSE_MAX_WORDS} words), e.g. "${prose[0]}". Move this commentary to index-history.jsonl (kind: note or next-commentary) and keep only structured keys in the index.`
      );
    }
  }
  const stageRe = /^current-stage:\s*\S/m;
  if (!stageRe.test(source.slice(0, INDEX_STAGE_HEAD_CHARS)) && stageRe.test(source)) {
    warnings.push(
      `\`current-stage:\` is not in the first ${INDEX_STAGE_HEAD_CHARS} characters of 00-index.md. The subagent-start hook reads only that many characters, so it cannot see the stage. Move \`current-stage:\` near the top of the frontmatter.`
    );
  }
  return warnings;
}
async function enforceIndexLint(paths, config) {
  if (config.hooks?.indexLint === false) return;
  const lines2 = [];
  for (const path of paths) {
    if (!isWorkflowIndexPath(path.original)) continue;
    const text = await readTextIfExists(path.absolute);
    if (text === null) continue;
    let size;
    try {
      size = statSync(path.absolute).size;
    } catch {
      size = void 0;
    }
    for (const w of indexLintWarnings(text, size)) lines2.push(`  - ${path.original}: ${w}`);
  }
  if (!lines2.length) return;
  outputSystemMessage(`wf: index lint (advisory):
${lines2.join("\n")}
Opt out: hooks.indexLint: false.`);
}
var EXPLAINER_STEM_PATTERNS = Object.freeze([
  /^01-(?:intake|fix|hotfix|refactor|update-deps|rca|discover|investigate|ideate|adopt|audit|task|simplify|profile)$/,
  /^02-shape$/,
  /^02c-craft$/,
  /^03-slice(?:-.+)?$/,
  /^04-plan-.+$/,
  /^04b-instrument$/,
  /^04c-experiment$/,
  /^05-implement-.+$/,
  /^05c-benchmark$/,
  /^06-verify-.+$/,
  /^07-review(?:-.+)?$/,
  /^07-design-(?:audit|critique)$/,
  /^08-handoff$/,
  /^09-ship-run-.+$/,
  /^10-retro$/,
  /^99-close$/
]);
var STAGE_FILE_RE = /(?:^|\/)\.ai\/(?:workflows\/[^/]+|simplify(?:\/[^/]+)*|profiles(?:\/[^/]+)*)\/([^/]+)\.md$/;
function explainerStemFor(filePath, type = null) {
  const normalized = normalizePathForMatch(filePath);
  if (/(?:^|\/)history\//.test(normalized)) return null;
  const m = STAGE_FILE_RE.exec(normalized);
  if (!m) return null;
  const stem = m[1];
  if (!EXPLAINER_STEM_PATTERNS.some((re) => re.test(stem))) return null;
  if (type === "review-command") return null;
  return stem;
}
async function enforceExplainerPresence(paths, config) {
  if (config.hooks?.remindMissingFragments === false) return;
  const missing = [];
  for (const path of paths) {
    const text = await readTextIfExists(path.absolute);
    const stem = explainerStemFor(path.original, fragmentOwningType(text));
    if (!stem) continue;
    if (existsSync(path.absolute.replace(/\.md$/, EXPLAINER_SUFFIX))) continue;
    missing.push(`Write the explainer ${stem}${EXPLAINER_SUFFIX} per _story-arc.md before you finish the stage.`);
  }
  if (!missing.length) return;
  outputSystemMessage(`wf: ${missing.join("\n")}
Opt out: hooks.remindMissingFragments: false.`);
}
async function lintExplainers(paths, config) {
  if (config.hooks?.remindMissingFragments === false) return;
  const lines2 = [];
  for (const path of paths) {
    const text = await readTextIfExists(path.absolute);
    if (text === null) continue;
    const { errs, warns } = checkExplainer(text, path.original);
    for (const w of [...errs, ...warns]) lines2.push(`  - ${path.original}: ${w}`);
  }
  if (!lines2.length) return;
  outputSystemMessage(
    `wf: explainer check (advisory, rules in _story-arc.md):
${lines2.join("\n")}
Opt out: hooks.remindMissingFragments: false.`
  );
}
var PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
async function run(input) {
  const projectRoot = projectRootFromInput(input);
  const config = await loadConfig(projectRoot);
  if (config.hooks.verifyOnWrite === false) return;
  const schemaPath = join(PLUGIN_ROOT, "tests", "frontmatter.schema.json");
  const paths = collectToolInputPaths(input).filter((path) => isManagedArtifactMarkdownPath(path)).filter((path) => !isFreeFormWorkflowPath(path)).map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) })).filter(({ absolute }) => absolute && existsSync(absolute));
  enforceCodeFileLints(input, config, paths);
  const auditPaths = collectToolInputPaths(input).filter((path) => isShipPlanAuditPath(path)).map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) })).filter(({ absolute }) => absolute && existsSync(absolute));
  if (auditPaths.length) await enforceShipPlanAuditTriage(auditPaths, config);
  const boardPaths = collectToolInputPaths(input).filter((path) => isBrainstormBoardPath(path)).map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) })).filter(({ absolute }) => absolute && existsSync(absolute));
  if (boardPaths.length) await validateBrainstormBoards(boardPaths, config, schemaPath);
  const explainerPaths = collectToolInputPaths(input).filter((path) => isExplainerFragmentPath(path) && /(?:^|\/)\.ai\//.test(normalizePathForMatch(path))).map((path) => ({ original: path, absolute: resolveProjectPath(projectRoot, path) })).filter(({ absolute }) => absolute && existsSync(absolute));
  if (explainerPaths.length) await lintExplainers(explainerPaths, config);
  if (!paths.length) return;
  await enforceIndexLint(paths, config);
  await enforceExplainerPresence(paths, config);
  const failures = [];
  for (const path of paths) {
    if (isProseLogPath(path.original)) continue;
    if (isProjectContextMarkdownPath(path.original)) {
      const text = await readTextIfExists(path.absolute);
      if (!hasFrontmatterFence(text)) continue;
    }
    const result = await validateFrontmatterFile(path.absolute, { schemaPath });
    if (!result.valid) failures.push({ path, result });
  }
  if (!failures.length) {
    await enforceVerifyResultGate(paths, config);
    await enforceIntakeLedgerLint(paths, config);
    await enforceNamedMechanismLint(paths, config);
    await validateSiblingYamls(paths, config, schemaPath);
    await enforceSiblingFragments(paths, config);
    return;
  }
  for (const failure of failures) {
    process.stderr.write(`wf-postwrite-verify: frontmatter validation FAILED for ${failure.path.original}

`);
    process.stderr.write(`${formatValidationErrors(failure.result.errors)}

`);
  }
  process.stderr.write("The file was written but does not conform to the sdlc/v1 schema\n");
  process.stderr.write("(see plugins/sdlc-workflow/tests/frontmatter.schema.json).\n");
  process.stderr.write("Re-Edit the frontmatter to fix the issues above, then continue.\n");
  blockToolCall();
}
if (isEntry("post-write-verify")) runStandalone("post-write-verify", run);

export {
  auditTriageViolation,
  INDEX_SIZE_WARN_BYTES,
  INDEX_STAGE_HEAD_CHARS,
  INDEX_COMMENT_PROSE_MAX_WORDS,
  indexLintWarnings,
  EXPLAINER_STEM_PATTERNS,
  explainerStemFor,
  run
};
