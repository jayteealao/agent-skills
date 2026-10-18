import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/ideate.mjs
var LENSES = Object.freeze(["quality", "performance", "security", "dx", "feature", "architecture"]);
var RESERVED = Object.freeze(["research", "issues"]);
var RESULTS = Object.freeze(["applies", "already-used", "not-applicable", "blocked-by-version", "needs-verification", "already-fixed", "duplicate-of", "withdrawn"]);
var ISSUE_ONLY = /* @__PURE__ */ new Set(["already-fixed", "duplicate-of"]);
var MAX_ISSUES = 100;
function splitArgs(text) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while (m = re.exec(String(text ?? ""))) {
    if (m[1] !== void 0 || m[2] !== void 0) out.push({ token: m[1] ?? m[2], quoted: true });
    else out.push({ token: m[3], quoted: false });
  }
  return out;
}
var ISSUE_URL = /^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/issues(?:[/?#]|$)/i;
var URL_RE = /^https?:\/\//i;
var DEP_RE = /^(@?[a-z0-9][\w.-]*(?:\/[\w.-]+)?)@(v?\d[\w.+-]*|latest|next)$/i;
function classifyArgs(input, { isIdeateSlug = () => false, isFile = () => false } = {}) {
  const tokens = Array.isArray(input) ? input.map((t) => typeof t === "string" ? { token: t, quoted: false } : t) : splitArgs(input);
  const kinds = [];
  const out = { mode: "new", slug: null, rest: [], sources: [], research: false, count: null, lenses: [], topic: [], kinds };
  if (tokens.length && !tokens[0].quoted && isIdeateSlug(tokens[0].token)) {
    out.mode = "resume";
    out.slug = tokens[0].token;
    out.rest = tokens.slice(1).map((t) => t.token);
    kinds.push({ token: tokens[0].token, kind: "slug" });
    if (out.rest[0] === "refresh") out.mode = "refresh";
    else if (out.rest.length) out.mode = "pick";
    return out;
  }
  for (const { token, quoted } of tokens) {
    let kind;
    if (quoted) kind = "topic";
    else if (ISSUE_URL.test(token)) kind = "issues";
    else if (URL_RE.test(token)) kind = "web";
    else if (isFile(token)) kind = "document";
    else if (DEP_RE.test(token)) kind = "dependency";
    else if (token === "issues" || token.startsWith("issues:")) kind = "issues";
    else if (token === "research") kind = "research";
    else if (/^\d+$/.test(token)) kind = "count";
    else if (LENSES.includes(token.toLowerCase())) kind = "lens";
    else kind = "topic";
    kinds.push({ token, kind });
    if (["issues", "web", "document", "dependency"].includes(kind)) out.sources.push({ kind, origin: token });
    else if (kind === "research") out.research = true;
    else if (kind === "count") out.count = Number(token);
    else if (kind === "lens") out.lenses.push(token.toLowerCase());
    else out.topic.push(token);
  }
  return out;
}
var slugWord = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
function focusSlug(parsed) {
  if (parsed.lenses.length) return parsed.lenses.join("-");
  if (parsed.topic.length) return slugWord(parsed.topic.join(" ")) || "all";
  if (parsed.sources.length || parsed.research) return "sources";
  return "all";
}
function sourceItemProblems(fm) {
  const out = [];
  if (!fm || typeof fm !== "object") return out;
  const sources = Array.isArray(fm.sources) ? fm.sources : [];
  const items = Array.isArray(fm["source-items"]) ? fm["source-items"] : [];
  const ideas = Array.isArray(fm.ideas) ? fm.ideas : [];
  const sourceIds = new Set(sources.map((s) => s?.id));
  const kindOf = new Map(sources.map((s) => [s?.id, s?.kind]));
  const ideaIds = new Set(ideas.map((i) => i?.id));
  const itemIds = /* @__PURE__ */ new Set();
  for (const it of items) {
    const id = it?.id ?? "<no id>";
    if (itemIds.has(id)) out.push(`source item ${id}: the id is used twice`);
    itemIds.add(id);
    const src = String(id).split("-")[0];
    if (!sourceIds.has(src)) out.push(`source item ${id}: names source ${src}, which is not in sources`);
    if (!it?.result) {
      out.push(`source item ${id}: has no result. Give it one of ${RESULTS.join(", ")}`);
      continue;
    }
    if (!RESULTS.includes(it.result)) {
      out.push(`source item ${id}: result ${it.result} is not one of ${RESULTS.join(", ")}`);
      continue;
    }
    if (ISSUE_ONLY.has(it.result) && kindOf.get(src) !== "issues") out.push(`source item ${id}: ${it.result} is for issue items only`);
    if (it.result === "applies" && it.idea && !ideaIds.has(it.idea)) out.push(`source item ${id}: names idea ${it.idea}, which is not in ideas`);
    if (it.result === "duplicate-of" && it["duplicate-of"] && !items.some((x) => x.id === it["duplicate-of"])) out.push(`source item ${id}: duplicate-of names ${it["duplicate-of"]}, which is not a source item`);
  }
  for (const s of sources) {
    if (s?.state !== "read") continue;
    const n = items.filter((it) => String(it?.id).startsWith(`${s.id}-`)).length;
    if (Number.isInteger(s.items) && s.items !== n) out.push(`source ${s.id}: items is ${s.items}, but the roster holds ${n} items of it`);
  }
  for (const idea of ideas) {
    for (const ref of idea?.["source-items"] ?? []) if (!itemIds.has(ref)) out.push(`idea ${idea.id}: names source item ${ref}, which is not in source-items`);
  }
  return out;
}
function redactIssue(issue) {
  const reactions = Array.isArray(issue?.reactionGroups) ? issue.reactionGroups.reduce((n, g) => n + (Number(g?.users?.totalCount ?? g?.totalCount ?? 0) || 0), 0) : Number(issue?.reactions ?? 0) || 0;
  const comments = Array.isArray(issue?.comments) ? issue.comments.length : Number(issue?.comments ?? 0) || 0;
  return {
    number: issue?.number ?? null,
    title: String(issue?.title ?? ""),
    labels: (issue?.labels ?? []).map((l) => typeof l === "string" ? l : l?.name).filter(Boolean),
    state: issue?.state ?? null,
    url: issue?.url ?? null,
    "created-at": issue?.createdAt ?? null,
    "updated-at": issue?.updatedAt ?? null,
    comments,
    reactions,
    summary: null
  };
}
function issueQuery(origin, remoteRepo = null) {
  const s = String(origin ?? "");
  if (s === "issues") return { kind: "list", repo: remoteRepo, search: null };
  if (s.startsWith("issues:")) return { kind: "list", repo: remoteRepo, search: s.slice(7) };
  const m = s.match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s?#]+)\/issues(?:\/(\d+))?(?:\?(.*))?/i);
  if (!m) return null;
  const repo = `${m[1]}/${m[2]}`;
  if (m[3]) return { kind: "view", repo, number: Number(m[3]) };
  const q = new URLSearchParams(m[4] ?? "").get("q");
  return { kind: "list", repo, search: q ? q.replace(/\bis:issue\b/g, "").trim() || null : null };
}

export {
  MAX_ISSUES,
  classifyArgs,
  focusSlug,
  sourceItemProblems,
  redactIssue,
  issueQuery
};
