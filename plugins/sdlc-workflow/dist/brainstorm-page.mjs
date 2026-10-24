#!/usr/bin/env node
import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  SHEET_CSS,
  esc,
  safeHref
} from "./chunk-6NAHF4FM.mjs";
import "./chunk-ZGVOYTOL.mjs";

// scripts/brainstorm-page.mjs
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// lib/brainstorm-page.mjs
var PAGE_FILE = "brainstorm-page.html";
var PAGE_CSS = `
main{max-width:980px}
section p,section li{max-width:72ch}
ul.items{margin:0;padding-left:20px}ul.items li{margin:0 0 8px}
.tag{display:inline-block;margin-left:6px;padding:0 6px;border:1px solid var(--rule);border-radius:4px;font-size:12px;color:var(--mute)}
.why,.note{color:var(--mute)}
h3{font-size:15px;margin:16px 0 6px}
.story{margin:0 0 12px}.story b{display:block;font-size:13px;color:var(--mute)}
.stale{border-left:3px solid #c19c00;padding-left:8px}
`;
var byKey = (list2 = []) => new Map((list2 ?? []).filter((e) => e?.key).map((e) => [e.key, e]));
var isLive = (i) => i && !i["replaced-by"] && i.scope !== "cut";
var IMAGE_RE = /\.(png|jpe?g|gif|webp|svg)$/i;
var PACKET_FORMS = /* @__PURE__ */ new Set(["intake", "investigate", "discover", "rca", "fix", "hotfix", "task", "extension"]);
function documentSections(text) {
  const body = String(text ?? "").replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---\n?/, "").replace(/<!--[\s\S]*?-->/g, "");
  const out = /* @__PURE__ */ new Map();
  let head = null;
  let lines = [];
  const flush = () => {
    if (head !== null) out.set(head, lines.join("\n").trim());
  };
  for (const line of body.split("\n")) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m && !line.startsWith("###")) {
      flush();
      head = m[1];
      lines = [];
    } else if (head !== null) lines.push(line);
  }
  flush();
  return out;
}
function inline(text) {
  return esc(text).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>");
}
function blockHtml(text) {
  const out = [];
  let list2 = [];
  let para = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list2.length) out.push(`<ul class="items">${list2.map((l) => `<li>${inline(l)}</li>`).join("")}</ul>`);
    list2 = [];
  };
  for (const line of String(text ?? "").split("\n")) {
    const t = line.trim();
    if (!t) {
      flushPara();
      flushList();
      continue;
    }
    const h = /^###\s+(.+)$/.exec(t);
    if (h) {
      flushPara();
      flushList();
      out.push(`<h3>${inline(h[1])}</h3>`);
      continue;
    }
    const li = /^[-*]\s+(.+)$/.exec(t);
    if (li) {
      flushPara();
      list2.push(li[1]);
      continue;
    }
    flushList();
    para.push(t);
  }
  flushPara();
  flushList();
  return out.join("\n");
}
var section = (title, inner, id = null) => `<section${id ? ` id="${esc(id)}"` : ""}><h2>${esc(title)}</h2>${inner}</section>`;
var list = (rows) => rows.length ? `<ul class="items">${rows.join("")}</ul>` : '<p class="note">None.</p>';
var tag = (text) => `<span class="tag">${esc(text)}</span>`;
function sketchHref(board, path) {
  if (!path) return null;
  const p = String(path).split("\\").join("/");
  const own = `.ai/workflows/${board.slug}/`;
  if (p.startsWith(own)) return p.slice(own.length);
  if (p.startsWith(".ai/")) return null;
  return p.replace(/^\.\//, "");
}
function areaGroups(board) {
  const areas = [...board.areas ?? []];
  const threads = byKey(board.threads);
  const areaOf = (item) => threads.get(item.thread)?.area ?? null;
  const known = new Set(areas.map((a) => a.key));
  return { areas, areaOf, known };
}
function decisionLine(item, replaced) {
  const tags = [
    item.core ? tag("core") : "",
    item.scope === "later" ? tag("left for later") : "",
    item.scope === "pending-cut" ? tag("cut waits for you") : ""
  ].join("");
  const parts = [`${esc(item.text)}${tags}`];
  if (item.why) parts.push(`<span class="why">Why: ${esc(item.why)}</span>`);
  if (item["accepted-risk"]) parts.push(`<span class="why">Accepted risk: ${esc(item["accepted-risk"])}</span>`);
  for (const old of replaced) parts.push(`<span class="why">This replaced: ${esc(old.text)}</span>`);
  return `<li id="${esc(item.key)}">${parts.join("<br>")}</li>`;
}
function sketchFigure(board, s) {
  const href = sketchHref(board, s.path);
  const file = href ? href.split("#")[0] : null;
  const link = s.canvas?.link ?? s.link ?? null;
  const pic = file && IMAGE_RE.test(file) ? `<a href="${safeHref(href)}"><img src="${safeHref(file)}" alt="${esc(s.caption ?? "")}" loading="lazy"></a>` : `<div class="none">${href ? `Open <a href="${safeHref(href)}">${esc(href)}</a>.` : s.path ? `The file is <code>${esc(s.path)}</code>.` : "No file."}</div>`;
  const meta = [s.state ? esc(s.state) : null, link ? `<a href="${safeHref(link)}">canvas</a>` : null].filter(Boolean).join(" \xB7 ");
  return `<figure id="${esc(s.key)}">${pic}<figcaption><b>${esc(s.caption ?? "")}</b><span>${meta}</span></figcaption></figure>`;
}
function renderBrainstormPage(board, doc = "", { generatedAt = "" } = {}) {
  const b = board ?? {};
  const sections = documentSections(doc);
  const items = b.items ?? [];
  const replacedBy = /* @__PURE__ */ new Map();
  for (const i of items) if (i["replaced-by"]) replacedBy.set(i["replaced-by"], [...replacedBy.get(i["replaced-by"]) ?? [], i]);
  const out = [];
  const summary = sections.get("The Brainstorm");
  out.push(section("Where we are", summary ? blockHtml(summary) : '<p class="note">No summary yet.</p>', "summary"));
  const stories = [...b.stories ?? []].sort((x, y) => (y.session ?? 0) - (x.session ?? 0));
  const sessionsDoc = sections.get("Sessions");
  out.push(section("Sessions", stories.length ? stories.map((s) => `<div class="story" id="session-${esc(s.session)}"><b>Session ${esc(s.session)}</b>${esc(s.text)}</div>`).join("") : sessionsDoc ? blockHtml(sessionsDoc) : '<p class="note">No session story yet.</p>', "sessions"));
  const { areas, areaOf, known } = areaGroups(b);
  out.push(section("Areas", list(areas.map((a) => {
    const meta2 = [a.side ? `${a.side} side` : null, a.state, a.scope ? `scope: ${a.scope}` : null].filter(Boolean).join(" \xB7 ");
    return `<li id="${esc(a.key)}"><b>${esc(a.name)}</b>${meta2 ? ` <span class="why">${esc(meta2)}</span>` : ""}${a.brief ? `<br>${esc(a.brief)}` : ""}</li>`;
  })), "areas"));
  const decisions = items.filter((i) => i.kind === "decision" && isLive(i));
  const groups = [...areas.map((a) => ({ name: a.name, key: a.key })), { name: "Other", key: null }];
  const decisionHtml = groups.map((g) => {
    const mine = decisions.filter((i) => g.key ? areaOf(i) === g.key : !known.has(areaOf(i)));
    if (!mine.length) return "";
    mine.sort((x, y) => Number(Boolean(y.core)) - Number(Boolean(x.core)));
    return `<h3>${esc(g.name)}</h3><ul class="items">${mine.map((i) => decisionLine(i, replacedBy.get(i.key) ?? [])).join("")}</ul>`;
  }).join("");
  out.push(section("Decisions", decisionHtml || '<p class="note">None yet.</p>', "decisions"));
  const ideas = items.filter((i) => i.kind === "idea" && isLive(i));
  const questions = items.filter((i) => i.kind === "question" && (i.state === "open" || i.state === "for-plan"));
  out.push(section("Ideas still open", list([
    ...ideas.map((i) => `<li id="${esc(i.key)}">${esc(i.text)}${i.source ? ` <span class="why">(${i.source === "person" ? "yours" : "the agent"})</span>` : ""}</li>`),
    ...questions.map((i) => `<li id="${esc(i.key)}">${esc(i.text)}${tag(i.state === "for-plan" ? "for the plan" : "open question")}</li>`)
  ]), "ideas"));
  const findings = items.filter((i) => i.kind === "finding" && !i["replaced-by"]);
  out.push(section("What we found", list(findings.map((i) => {
    const src = i.evidence ? `<br><span class="why">Source: ${/^https?:\/\//i.test(i.evidence) ? `<a href="${safeHref(i.evidence)}">${esc(i.evidence)}</a>` : `<code>${esc(i.evidence)}</code>`}</span>` : "";
    return `<li id="${esc(i.key)}">${esc(i.text)}${i.check && i.check !== "verified" ? tag(i.check) : ""}${src}</li>`;
  })), "findings"));
  const tensions = items.filter((i) => i.kind === "tension" && i.state === "open" && !i["replaced-by"]);
  const risks = decisions.filter((i) => i["accepted-risk"]).sort((x, y) => Number(Boolean(y["top-risk"])) - Number(Boolean(x["top-risk"])));
  out.push(section("Open tensions and accepted risks", list([
    ...tensions.map((i) => `<li id="${esc(i.key)}">${esc(i.text)}${tag("open tension")}</li>`),
    ...risks.map((i) => `<li>${esc(i["accepted-risk"])}${i["top-risk"] ? tag("top risk") : ""}<br><span class="why">With: ${esc(i.text)}</span></li>`)
  ]), "risks"));
  const sketches = (b.sketches ?? []).filter((s) => s?.key);
  if (sketches.length || b.focus === "design") {
    out.push(section("Sketches", sketches.length ? `<div class="grid">${sketches.map((s) => sketchFigure(b, s)).join("")}</div>` : '<p class="note">No sketch yet.</p>', "sketches"));
  }
  const packets = [...b.work ?? []].sort((x, y) => (x.order ?? 1e9) - (y.order ?? 1e9) || String(x.key).localeCompare(String(y.key)));
  out.push(section("Work packets", list(packets.map((p) => {
    const packet = PACKET_FORMS.has(p.shape) ? `work/${p.slug ?? p.key}.md` : null;
    const files = (p["written-files"] ?? []).map((f) => `<code>${esc(f.path)}</code>`).join(", ");
    const meta2 = [p.order ? `${p.order}.` : null, p.shape === "write-now" ? "written in the session" : p.shape, p.state].filter(Boolean).join(" \xB7 ");
    const stale = p.stale ? `${tag("stale")}${p["stale-because"] ? `<br><span class="why">Stale because ${esc(p["stale-because"])}</span>` : ""}` : "";
    const title2 = packet ? `<a href="${safeHref(packet)}">${esc(p.title)}</a>` : esc(p.title);
    return `<li id="${esc(p.key)}"${p.stale ? ' class="stale"' : ""}><b>${title2}</b> <span class="why">${esc(meta2)}</span>${stale}${files ? `<br><span class="why">Files: ${files}</span>` : ""}${p["why-here"] ? `<br><span class="why">After the packet before it, because ${esc(String(p["why-here"]).replace(/\.$/, ""))}.</span>` : ""}</li>`;
  })), "work"));
  const title = b.topic ?? b.slug ?? "Brainstorm";
  const meta = [
    b.sessions ? `${b.sessions} session${b.sessions === 1 ? "" : "s"}` : null,
    b.focus === "design" ? "design focus" : null,
    b["updated-at"] ? `updated ${b["updated-at"]}` : null,
    generatedAt ? `written ${generatedAt}` : null
  ].filter(Boolean).map(esc).join(" \xB7 ");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Brainstorm \xB7 ${esc(title)}</title>
<style>
${SHEET_CSS}${PAGE_CSS.trimStart()}</style></head><body>
<header><h1>Brainstorm \xB7 ${esc(title)}</h1><p>${meta}</p><p>This page presents the board. The board and the document hold the truth: <a href="brainstorm-board.json">brainstorm-board.json</a>, <a href="01-brainstorm.md">01-brainstorm.md</a>.</p></header>
<main>
${out.join("\n")}
</main>
</body></html>
`;
}

// scripts/brainstorm-page.mjs
var USAGE = "usage: brainstorm-page.mjs <projectRoot> <slug>";
var posix = (p) => String(p).split("\\").join("/");
function writeAtomic(file, text) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}
function writePage(root, slug, { now = /* @__PURE__ */ new Date() } = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(String(slug ?? ""))) throw new Error(`'${slug}' is not a workflow slug`);
  const dir = join(root, ".ai", "workflows", slug);
  const boardFile = join(dir, "brainstorm-board.json");
  if (!existsSync(boardFile)) throw new Error(`no brainstorm board .ai/workflows/${slug}/brainstorm-board.json`);
  let board;
  try {
    board = JSON.parse(readFileSync(boardFile, "utf8"));
  } catch (e) {
    throw new Error(`brainstorm-board.json is not valid JSON: ${e.message}`);
  }
  const docFile = join(dir, "01-brainstorm.md");
  const doc = existsSync(docFile) ? readFileSync(docFile, "utf8") : "";
  const page = join(dir, PAGE_FILE);
  writeAtomic(page, renderBrainstormPage(board, doc, { generatedAt: now.toISOString().replace(/\.\d{3}Z$/, "Z") }));
  return {
    ok: true,
    page: posix(relative(root, page)),
    absolute: posix(page),
    document: existsSync(docFile),
    sketches: (board.sketches ?? []).length,
    packets: (board.work ?? []).length
  };
}
function main(argv = process.argv.slice(2)) {
  const [rootArg, slug] = argv.filter((a) => !a.startsWith("--"));
  if (!rootArg || !slug) {
    process.stderr.write(`${USAGE}
`);
    return 2;
  }
  let out;
  try {
    out = writePage(resolve(rootArg), slug);
  } catch (e) {
    out = { ok: false, error: e.message };
  }
  process.stdout.write(`${JSON.stringify(out, null, 2)}
`);
  return out.ok ? 0 : 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
export {
  main,
  writePage
};
