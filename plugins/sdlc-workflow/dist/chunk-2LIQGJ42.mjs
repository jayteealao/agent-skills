import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  validateBrainstormBoard,
  validateFrontmatter
} from "./chunk-4HMFV4P2.mjs";
import {
  safeParseFrontmatter
} from "./chunk-5U76735W.mjs";
import {
  jsYaml
} from "./chunk-LFGT2BKG.mjs";

// lib/work-packets.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
var PACKET_FORMS = Object.freeze(["intake", "investigate", "discover", "fix", "hotfix", "task", "extension"]);
var TARGETED_FORMS = Object.freeze(["extension", "fix", "hotfix"]);
var STARTED_STATES = Object.freeze(["prepared", "routed"]);
var SIZE_SOFT_LIMIT = 25;
var SIZE_HARD_LIMIT = 40;
var SIZE_SMALL_LIMIT = 10;
var SCRATCH_RE = /(?:^|[\s`'"(/\\])\.scratch[/\\]/;
var SIGNATURE_LINE_RE = /^(?:revision|generated-at):.*$/gm;
function isPacketPiece(piece) {
  return PACKET_FORMS.includes(piece?.shape);
}
function isWriteNowPiece(piece) {
  return piece?.shape === "write-now";
}
function isStartedState(state) {
  return STARTED_STATES.includes(state);
}
function byKey(list = []) {
  const map = /* @__PURE__ */ new Map();
  for (const entry of list) if (entry?.key) map.set(entry.key, entry);
  return map;
}
function ordered(pieces) {
  return [...pieces].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || String(a.key).localeCompare(String(b.key)));
}
function isLive(item) {
  return item && !item["replaced-by"] && item.scope !== "cut" && item.scope !== "later";
}
function carriedDecisionItems(board, piece) {
  const items = byKey(board.items);
  return (piece.items ?? []).map((key) => items.get(key)).filter((item) => item?.kind === "decision" && isLive(item));
}
function sizeOf(count) {
  if (count > SIZE_HARD_LIMIT) return "too-large";
  if (count > SIZE_SOFT_LIMIT) return "large";
  if (count > SIZE_SMALL_LIMIT) return "medium";
  return "small";
}
function packetFileName(piece) {
  return `${piece.slug ?? piece.key}.md`;
}
function boardCitations(board) {
  const out = [];
  for (const item of board.items ?? []) {
    if (typeof item.evidence === "string") out.push({ where: `items.${item.key}.evidence`, text: item.evidence });
  }
  for (const piece of board.work ?? []) {
    for (const ref of piece.references ?? []) out.push({ where: `work.${piece.key}.references`, text: ref });
  }
  for (const brief of board.briefs ?? []) {
    if (typeof brief.source === "string") out.push({ where: `briefs.${brief.key}.source`, text: brief.source });
  }
  return out;
}
function findIgnoredCitations(board, { isIgnored = null } = {}) {
  const hits = [];
  for (const citation of boardCitations(board)) {
    if (SCRATCH_RE.test(citation.text) || citation.text.startsWith(".scratch/")) {
      hits.push(citation);
      continue;
    }
    if (isIgnored) {
      const path = citation.text.replace(/[#:].*$/, "").trim();
      if (path && !/^[a-z]+:\/\//i.test(path) && !/^F\d+$/.test(path) && isIgnored(path)) hits.push(citation);
    }
  }
  return hits;
}
function findDependencyCycle(pieces) {
  const graph = new Map(pieces.map((p) => [p.key, p["depends-on"] ?? []]));
  const state = /* @__PURE__ */ new Map();
  const stack = [];
  const visit = (key) => {
    if (state.get(key) === "done") return null;
    if (state.get(key) === "open") return [...stack.slice(stack.indexOf(key)), key];
    state.set(key, "open");
    stack.push(key);
    for (const next of graph.get(key) ?? []) {
      if (!graph.has(next)) continue;
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(key, "done");
    return null;
  };
  for (const key of graph.keys()) {
    const cycle = visit(key);
    if (cycle) return cycle;
  }
  return null;
}
function dependencyClosure(pieces, key) {
  const graph = byKey(pieces);
  const seen = /* @__PURE__ */ new Set();
  const walk = (k) => {
    for (const next of graph.get(k)?.["depends-on"] ?? []) {
      if (seen.has(next)) continue;
      seen.add(next);
      walk(next);
    }
  };
  walk(key);
  return seen;
}
function neededBy(pieces, key) {
  return ordered(pieces.filter((p) => (p["depends-on"] ?? []).includes(key)));
}
function computeWaves(board) {
  const pieces = ordered((board.work ?? []).filter(isPacketPiece));
  const keys = new Set(pieces.map((p) => p.key));
  const placed = /* @__PURE__ */ new Map();
  const waves = [];
  let remaining = pieces;
  while (remaining.length) {
    const wave = remaining.filter((p) => (p["depends-on"] ?? []).filter((k) => keys.has(k)).every((k) => placed.has(k)));
    if (!wave.length) break;
    for (const p of wave) placed.set(p.key, waves.length);
    waves.push(wave.map((p) => p.slug ?? p.key));
    remaining = remaining.filter((p) => !placed.has(p.key));
  }
  return waves;
}
function checkWorkSet(board, { isIgnored = null } = {}) {
  const errors = [];
  const warnings = [];
  const pieces = board.work ?? [];
  const pieceKeys = byKey(pieces);
  const items = byKey(board.items);
  const shape = validateBrainstormBoard(board);
  if (!shape.valid) {
    for (const e of shape.errors) errors.push(`board schema: ${e.path || "/"} ${e.message}`);
  }
  const slugs = /* @__PURE__ */ new Map();
  for (const piece of pieces.filter(isPacketPiece)) {
    if (!piece.slug) errors.push(`piece ${piece.key}: no slug. Agree the slug that the packet opens (3.3).`);
    else if (slugs.has(piece.slug)) errors.push(`pieces ${slugs.get(piece.slug)} and ${piece.key} open the same slug ${piece.slug}.`);
    else slugs.set(piece.slug, piece.key);
    if (TARGETED_FORMS.includes(piece.shape) && !piece["target-slug"]) {
      errors.push(`piece ${piece.key}: form ${piece.shape} needs target-slug, the existing workflow it changes.`);
    }
  }
  for (const piece of pieces) {
    for (const dep of piece["depends-on"] ?? []) {
      if (dep === piece.key) errors.push(`piece ${piece.key} depends on itself.`);
      else if (!pieceKeys.has(dep)) errors.push(`piece ${piece.key} depends on ${dep}, which is not a piece of work.`);
    }
  }
  const cycle = findDependencyCycle(pieces);
  if (cycle) errors.push(`the dependencies form a cycle: ${cycle.join(" -> ")}.`);
  for (const piece of pieces) {
    const closure = dependencyClosure(pieces, piece.key);
    for (const line of piece.expects ?? []) {
      const source = pieceKeys.get(line.from);
      const provided = source?.provides?.some((p) => p.key === line.key);
      if (!source || !provided) {
        errors.push(`piece ${piece.key} expects ${line.from}/${line.key} ("${line.text}"), and no piece provides it.`);
      } else if (!closure.has(line.from)) {
        errors.push(`piece ${piece.key} expects ${line.from}/${line.key}, but ${line.from} does not come earlier: add it to depends-on.`);
      }
    }
  }
  const homes = /* @__PURE__ */ new Map();
  for (const piece of pieces) {
    for (const key of piece.items ?? []) {
      if (!items.has(key)) {
        errors.push(`piece ${piece.key} names item ${key}, which is not on the board.`);
        continue;
      }
      if (!homes.has(key)) homes.set(key, []);
      homes.get(key).push(piece);
    }
  }
  for (const item of board.items ?? []) {
    if (item.kind !== "decision" || item.scope !== "keep" || item["replaced-by"]) continue;
    const owners = homes.get(item.key) ?? [];
    if (!owners.length) {
      errors.push(`kept decision ${item.key} ("${item.text}") lands in no piece of work.`);
    } else if (owners.length > 1) {
      const unshared = owners.filter((p) => !(p.shared ?? []).includes(item.key));
      if (unshared.length) {
        errors.push(`kept decision ${item.key} lands in ${owners.map((p) => p.key).join(", ")}: mark it shared on each, or keep one.`);
      }
    }
  }
  for (const piece of pieces.filter(isPacketPiece)) {
    const count = carriedDecisionItems(board, piece).length;
    const size = sizeOf(count);
    if (size === "too-large" && !isStartedState(piece.state)) {
      errors.push(`piece ${piece.key} carries ${count} decisions, more than ${SIZE_HARD_LIMIT}: split it with the person before 3.4 confirms.`);
    } else if (size === "large" && !isStartedState(piece.state)) {
      warnings.push(`piece ${piece.key} carries ${count} decisions, more than ${SIZE_SOFT_LIMIT}: propose a split; the person may keep it whole.`);
    }
  }
  for (const piece of pieces.filter(isWriteNowPiece)) {
    if (piece.state === "written" && !(piece["written-files"] ?? []).length) {
      errors.push(`write-now piece ${piece.key} is written but records no written-files.`);
    }
    if (piece.state !== "written" && piece.state !== "proposed") {
      errors.push(`write-now piece ${piece.key} has state ${piece.state}; it is proposed or written.`);
    }
  }
  for (const hit of findIgnoredCitations(board, { isIgnored })) {
    errors.push(`${hit.where} cites ${hit.text}, a gitignored path: copy it into references/ or record a pointer row, then cite the reference id.`);
  }
  return { errors, warnings };
}
function dump(data) {
  return jsYaml.dump(data, { lineWidth: -1, noRefs: true, quotingType: '"' }).trimEnd();
}
function itemLine(item, { withWhy = false } = {}) {
  const parts = [`- **${item.key}** \u2014 ${item.text}`];
  if (withWhy && item.why) parts.push(` Why: ${item.why}`);
  if (item["accepted-risk"]) parts.push(` Accepted risk: ${item["accepted-risk"]}`);
  if (item.evidence) parts.push(` Evidence: \`${item.evidence}\`.`);
  parts.push(` ([board](../brainstorm-board.json#${item.key}))`);
  return parts.join("");
}
function itemsOfKind(board, piece, kinds, predicate = () => true) {
  const items = byKey(board.items);
  return (piece.items ?? []).map((k) => items.get(k)).filter((i) => i && kinds.includes(i.kind) && predicate(i));
}
function threadItems(board, piece, predicate) {
  const threads = new Set(piece.threads ?? []);
  const own = new Set(piece.items ?? []);
  return (board.items ?? []).filter((i) => threads.has(i.thread) && !own.has(i.key) && predicate(i));
}
function researchLink(id, researchFiles) {
  const file = researchFiles.find((f) => f === `${id}.md` || f.startsWith(`${id}-`));
  return file ? `[${id}](../research/${file})` : id;
}
function referenceLink(ref) {
  return /^F\d+$/.test(ref) ? `[${ref}](../references/index.md#${ref.toLowerCase()})` : `\`${ref}\``;
}
function startCommand(slug, piece) {
  return `/wf intake .ai/workflows/${slug}/work/${packetFileName(piece)}`;
}
function packetSketches(board, piece) {
  const sketches = byKey(board.sketches);
  return (piece.sketches ?? []).map((key) => {
    const s = sketches.get(key) ?? {};
    const path = s.path ? String(s.path).startsWith(".ai/") ? s.path : `.ai/workflows/${board.slug}/${s.path}` : null;
    return { key, path, link: s.link ?? null, ...s.caption ? { caption: s.caption } : {} };
  });
}
function packetFrontmatter(board, piece, { revision = 1, generatedAt = null } = {}) {
  const decisions = carriedDecisionItems(board, piece);
  const shared = new Set(piece.shared ?? []);
  const keysOf = (list) => list.map((i) => i.key);
  return {
    schema: "sdlc/v1",
    type: "work-packet",
    slug: board.slug,
    key: piece.key,
    "work-slug": piece.slug ?? piece.key,
    title: piece.title,
    form: piece.shape,
    "target-slug": piece["target-slug"] ?? null,
    amends: piece.amends ?? null,
    urgency: piece.urgency ?? "normal",
    revision,
    "origin-brainstorm": board.slug,
    order: piece.order ?? 1,
    "depends-on": piece["depends-on"] ?? [],
    provides: piece.provides ?? [],
    expects: piece.expects ?? [],
    "carried-decisions": decisions.map((i) => ({
      key: i.key,
      text: i.text,
      ...i.why ? { why: i.why } : {},
      session: i.session ?? null,
      "decided-at": i["decided-at"] ?? null,
      ...shared.has(i.key) ? { shared: true } : {}
    })),
    "open-ideas": keysOf([
      ...itemsOfKind(board, piece, ["idea", "question"], isLive),
      ...threadItems(board, piece, (i) => i.kind === "question" && (i.state === "open" || i.state === "for-plan") || i.kind === "tension" && i.state === "open")
    ]),
    findings: keysOf(itemsOfKind(board, piece, ["finding"], isLive)),
    assumptions: keysOf(itemsOfKind(board, piece, ["assumption"], isLive)),
    later: keysOf(threadItems(board, piece, (i) => i.scope === "later")),
    research: piece.research ?? [],
    references: piece.references ?? [],
    "ux-impact": piece["ux-impact"] ?? "none",
    design: piece["design-form"] ?? "none",
    ...piece.sketches?.length ? { sketches: packetSketches(board, piece) } : {},
    size: sizeOf(decisions.length),
    state: isStartedState(piece.state) ? piece.state : "proposed",
    "routed-to": piece["routed-to"] ?? null,
    ...generatedAt ? { "generated-at": generatedAt } : {}
  };
}
function renderPacket(board, piece, { revision = 1, generatedAt = null, researchFiles = [] } = {}) {
  const fm = packetFrontmatter(board, piece, { revision, generatedAt });
  const pieces = board.work ?? [];
  const pieceKeys = byKey(pieces);
  const decisions = carriedDecisionItems(board, piece);
  const open = itemsOfKind(board, piece, ["idea", "question"], isLive);
  const openTensions = threadItems(board, piece, (i) => i.kind === "tension" && i.state === "open");
  const openQuestions = threadItems(board, piece, (i) => i.kind === "question" && (i.state === "open" || i.state === "for-plan"));
  const findings = itemsOfKind(board, piece, ["finding"], isLive);
  const assumptions = [
    ...itemsOfKind(board, piece, ["assumption"], isLive),
    ...threadItems(board, piece, (i) => i.kind === "assumption" && i.state !== "rejected")
  ];
  const risks = decisions.filter((i) => i["accepted-risk"]);
  const later = threadItems(board, piece, (i) => i.scope === "later");
  const cut = threadItems(board, piece, (i) => i.scope === "cut");
  const linkTo = (key) => {
    const other = pieceKeys.get(key);
    if (!other) return `\`${key}\``;
    if (isWriteNowPiece(other)) return `${other.title} (written in the brainstorm session; state ${other.state})`;
    return `[${other.title}](${packetFileName(other)})`;
  };
  const none = "- None.";
  const lines = [];
  lines.push("---", dump(fm), "---", "");
  lines.push(`# ${piece.title}`, "");
  lines.push(`The board wins where this packet and the board differ: [brainstorm-board.json](../brainstorm-board.json), [01-brainstorm.md](../01-brainstorm.md). The work set: [index.md](index.md).`, "");
  lines.push("## Start", "");
  lines.push(`Form: \`${piece.shape}\`${piece["target-slug"] ? ` on \`${piece["target-slug"]}\`` : ""}. Order: ${piece.order ?? 1}. Size: ${fm.size}, carried decisions: ${decisions.length}.`, "");
  const deps = piece["depends-on"] ?? [];
  if (deps.length) lines.push(`Start after: ${deps.map(linkTo).join("; ")}.`, "");
  lines.push("```", startCommand(board.slug, piece), "```", "");
  lines.push("## What the person decided", "");
  lines.push("Intake shows these decisions with their dates, and the person confirms or changes each group. Intake does not re-word them.", "");
  if (decisions.length) {
    for (const item of decisions) {
      const when = [item.session ? `session ${item.session}` : null, item["decided-at"] ?? null].filter(Boolean).join(", ");
      lines.push(`${itemLine(item, { withWhy: true })}${when ? ` (${when})` : ""}${(piece.shared ?? []).includes(item.key) ? " Shared with another packet." : ""}`);
    }
  } else lines.push(none);
  lines.push("");
  lines.push("## What is still open", "");
  const openAll = [...open, ...openQuestions, ...openTensions];
  lines.push(...openAll.length ? openAll.map((i) => itemLine(i)) : [none], "");
  lines.push("## What we found", "");
  lines.push("Intake re-verifies each finding against the current code. A contradicted finding becomes a known unknown.", "");
  lines.push(...findings.length ? findings.map((i) => itemLine(i)) : [none], "");
  lines.push("## What we assume", "");
  const assumeLines = [...assumptions.map((i) => itemLine(i)), ...risks.map((i) => `- Accepted risk with **${i.key}**: ${i["accepted-risk"]}`)];
  lines.push(...assumeLines.length ? assumeLines : [none], "");
  lines.push("## Provides and expects", "");
  const contract = [
    ...(piece.provides ?? []).map((p) => `- Provides \`${p.key}\`: ${p.text}`),
    ...(piece.expects ?? []).map((e) => `- Expects \`${e.key}\` from ${linkTo(e.from)}: ${e.text}`)
  ];
  lines.push(...contract.length ? contract : [none], "");
  lines.push("## Depends on / needed by", "");
  const after = neededBy(pieces, piece.key);
  lines.push(`- Depends on: ${deps.length ? deps.map(linkTo).join("; ") : "nothing"}.`);
  lines.push(`- Needed by: ${after.length ? after.map((p) => linkTo(p.key)).join("; ") : "nothing"}.`, "");
  lines.push("## Left for later and cut", "");
  const leftLines = [
    ...later.map((i) => `${itemLine(i)} Left for later.`),
    ...cut.map((i) => `${itemLine(i)} Cut${i.reason ? `: ${i.reason}` : ""}.`)
  ];
  lines.push(...leftLines.length ? leftLines : [none], "");
  lines.push("## Sources", "");
  const sources = [
    ...(piece.research ?? []).map((id) => `- Research: ${researchLink(id, researchFiles)}`),
    ...(piece.references ?? []).map((ref) => `- Reference: ${referenceLink(ref)}`),
    ...(fm.sketches ?? []).map((sk) => `- Sketch \`${sk.key}\`: ${sk.path ? `\`${sk.path}\`` : "no file"}${sk.link ? ` ([canvas](${sk.link}))` : ""}${sk.caption ? ` \u2014 ${sk.caption}` : ""}`)
  ];
  lines.push(...sources.length ? sources : [none], "");
  return lines.join("\n");
}
function renderWorkIndex(board, { revision = 1, generatedAt = null } = {}) {
  const pieces = ordered(board.work ?? []);
  const packets = pieces.filter(isPacketPiece);
  const writeNow = pieces.filter(isWriteNowPiece);
  const waves = computeWaves(board);
  const fm = {
    schema: "sdlc/v1",
    type: "work-set",
    slug: board.slug,
    "work-set": packets.length > 1 ? "multi" : packets.length === 1 ? "single" : "none",
    "work-revision": revision,
    slugs: packets.map((p) => p.slug ?? p.key),
    waves,
    written: writeNow.filter((p) => p.state === "written").map((p) => p.key),
    ...generatedAt ? { "generated-at": generatedAt } : {}
  };
  const lines = ["---", dump(fm), "---", ""];
  lines.push(`# Work set: ${board.topic ?? board.slug}`, "");
  lines.push("The board wins where this file and the board differ: [brainstorm-board.json](../brainstorm-board.json). Changes by revision: [changes.md](changes.md).", "");
  lines.push("## Packets", "");
  if (packets.length) {
    lines.push("| Order | Packet | Form | Size | State | Depends on |", "|---|---|---|---|---|---|");
    for (const p of packets) {
      const size = sizeOf(carriedDecisionItems(board, p).length);
      lines.push(`| ${p.order ?? ""} | [${p.title}](${packetFileName(p)}) | ${p.shape}${p["target-slug"] ? ` on \`${p["target-slug"]}\`` : ""} | ${size} | ${isStartedState(p.state) ? p.state : "proposed"} | ${(p["depends-on"] ?? []).join(", ") || "\u2014"} |`);
    }
  } else lines.push("- None.");
  lines.push("");
  lines.push("## Written in the brainstorm session", "");
  if (writeNow.length) {
    for (const p of writeNow) {
      const files = (p["written-files"] ?? []).map((f) => `\`${f.path}\`${f.section ? ` (${f.section})` : ""}`).join(", ");
      lines.push(`- **${p.key}** \u2014 ${p.title}. State: ${p.state}.${files ? ` Files: ${files}.` : ""}`);
    }
  } else lines.push("- None.");
  lines.push("");
  lines.push("## Contracts", "");
  const rows = [];
  for (const p of packets) {
    for (const e of p.expects ?? []) {
      const source = pieces.find((x) => x.key === e.from);
      const provided = source?.provides?.find((x) => x.key === e.key);
      rows.push(`| ${p.key} | ${e.text} | ${e.from} | ${provided ? provided.text : "**no match**"} |`);
    }
  }
  if (rows.length) lines.push("| Packet | Expects | From | Provides |", "|---|---|---|---|", ...rows);
  else lines.push("- None.");
  lines.push("");
  lines.push("## Waves", "");
  if (waves.length) waves.forEach((wave, i) => lines.push(`${i + 1}. ${wave.map((s) => `\`${s}\``).join(", ")}`));
  else lines.push("- None.");
  lines.push("");
  lines.push("## Start commands", "");
  if (packets.length) {
    lines.push("In order. A packet starts after every packet it depends on is done.", "");
    for (const p of packets) lines.push(`${p.order ?? ""}. \`${startCommand(board.slug, p)}\``);
  } else lines.push("- None.");
  lines.push("");
  return lines.join("\n");
}
function renderResearchIndex(board, notes) {
  const lines = ["# Research notes", "", "Each line: the note, its question, and the board items that cite it.", ""];
  if (!notes.length) lines.push("- None.");
  for (const note of notes) {
    const id = note.data?.id ?? note.file.replace(/-.*$/, "").replace(/\.md$/, "");
    const citing = (board.items ?? []).filter((i) => typeof i.evidence === "string" && i.evidence.includes(`research/${note.file}`)).map((i) => i.key);
    const pieces = (board.work ?? []).filter((p) => (p.research ?? []).includes(id)).map((p) => p.key);
    const cites = [...citing, ...pieces.map((k) => `work:${k}`)];
    lines.push(`- [${id}](${note.file}) \u2014 ${note.data?.question ?? "(no question recorded)"} \u2014 cited by: ${cites.length ? cites.join(", ") : "nothing yet"}`);
  }
  lines.push("");
  return lines.join("\n");
}
function signature(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(SIGNATURE_LINE_RE, "").trim();
}
function startedPacketRewriteError(oldText, newText) {
  const before = safeParseFrontmatter(oldText);
  if (!before.data || !isStartedState(before.data.state)) return null;
  const after = safeParseFrontmatter(newText);
  if (!after.data) return null;
  const strip = (data) => {
    const copy = { ...data };
    for (const k of ["state", "routed-to", "decision-changed", "generated-at"]) delete copy[k];
    return JSON.stringify(copy);
  };
  if (strip(before.data) !== strip(after.data) || signature(before.content) !== signature(after.content)) {
    return `packet ${before.data.key ?? ""} is ${before.data.state}: a started packet is never rewritten. A new decision about its slug becomes a new packet (extension, fix, or hotfix) with amends: ${before.data.key ?? "<key>"}.`;
  }
  return null;
}
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function readResearchNotes(dir) {
  const research = join(dir, "research");
  if (!existsSync(research)) return [];
  return readdirSync(research).filter((f) => /^R\d+.*\.md$/.test(f)).sort().map((file) => ({ file, data: safeParseFrontmatter(readFileSync(join(research, file), "utf8")).data ?? {} }));
}
function readExistingPackets(workDir) {
  const out = /* @__PURE__ */ new Map();
  if (!existsSync(workDir)) return out;
  for (const file of readdirSync(workDir)) {
    if (!file.endsWith(".md") || file === "index.md" || file === "changes.md") continue;
    const text = readFileSync(join(workDir, file), "utf8");
    const data = safeParseFrontmatter(text).data;
    if (data?.type === "work-packet") out.set(data.key ?? file, { file, text, data });
  }
  return out;
}
function stamp(now) {
  return (now ?? /* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function writeWorkSet(dir, { now = null, isIgnored = null, dryRun = false } = {}) {
  const boardPath = join(dir, "brainstorm-board.json");
  const board = readJson(boardPath);
  const check = checkWorkSet(board, { isIgnored });
  if (check.errors.length) return { ok: false, ...check };
  const workDir = join(dir, "work");
  const historyDir = join(dir, "history");
  const at = stamp(now);
  const existing = readExistingPackets(workDir);
  const indexPath = join(workDir, "index.md");
  const oldIndex = existsSync(indexPath) ? safeParseFrontmatter(readFileSync(indexPath, "utf8")).data ?? {} : {};
  const oldRevision = Number.isInteger(oldIndex["work-revision"]) ? oldIndex["work-revision"] : 0;
  const revision = oldRevision + 1;
  const researchFiles = readResearchNotes(dir).map((n) => n.file);
  const added = [];
  const changed = [];
  const kept = [];
  const historyOnly = [];
  const writes = [];
  const packets = ordered((board.work ?? []).filter(isPacketPiece));
  for (const piece of packets) {
    const text = renderPacket(board, piece, { revision, generatedAt: at, researchFiles });
    const fm = packetFrontmatter(board, piece, { revision, generatedAt: at });
    const shape = validateFrontmatter(fm);
    if (!shape.valid) return { ok: false, errors: shape.errors.map((e) => `packet ${piece.key}: ${e.path} ${e.message}`), warnings: check.warnings };
    const prior = existing.get(piece.key);
    existing.delete(piece.key);
    if (prior && (isStartedState(prior.data.state) || isStartedState(piece.state))) {
      kept.push(piece.key);
      if (signature(prior.text) !== signature(text)) {
        historyOnly.push(piece.key);
        writes.push({ path: join(historyDir, `work-${piece.key}.r${revision}.md`), text });
      }
      continue;
    }
    if (!prior) added.push(piece.key);
    else if (signature(prior.text) !== signature(text)) changed.push(piece.key);
    else continue;
    writes.push({ path: join(workDir, packetFileName(piece)), text, removeFirst: prior && prior.file !== packetFileName(piece) ? join(workDir, prior.file) : null });
  }
  const cut = [];
  const pendingCut = [];
  for (const [key, prior] of existing) {
    if (isStartedState(prior.data.state)) pendingCut.push(key);
    else cut.push({ key, file: prior.file });
  }
  const priorWritten = new Set(oldIndex.written ?? []);
  const writtenNow = (board.work ?? []).filter((p) => isWriteNowPiece(p) && p.state === "written" && !priorWritten.has(p.key));
  const changedSet = added.length || changed.length || cut.length || historyOnly.length || writtenNow.length;
  const finalRevision = changedSet || !oldRevision ? revision : oldRevision;
  if (!changedSet && oldRevision) {
    return { ok: true, revision: oldRevision, added, changed, kept, cut: [], pendingCut, writtenNow: [], warnings: check.warnings, unchanged: true };
  }
  if (!dryRun) {
    mkdirSync(workDir, { recursive: true });
    for (const w of writes) {
      mkdirSync(join(w.path, ".."), { recursive: true });
      if (w.removeFirst) mkdirSync(historyDir, { recursive: true });
      if (w.removeFirst && existsSync(w.removeFirst)) renameSync(w.removeFirst, join(historyDir, `work-${w.removeFirst.split(/[\\/]/).pop().replace(/\.md$/, "")}.r${oldRevision || 1}.md`));
      writeFileSync(w.path, w.text);
    }
    for (const c of cut) {
      mkdirSync(historyDir, { recursive: true });
      renameSync(join(workDir, c.file), join(historyDir, `work-${c.key}.r${oldRevision || 1}.md`));
    }
    const notes = readResearchNotes(dir);
    if (notes.length || existsSync(join(dir, "research"))) {
      mkdirSync(join(dir, "research"), { recursive: true });
      writeFileSync(join(dir, "research", "index.md"), renderResearchIndex(board, notes));
    }
    const entry = [
      `## Revision ${finalRevision} \u2014 ${at}`,
      "",
      ...added.map((k) => `- Added: \`${k}\`.`),
      ...changed.map((k) => `- Changed: \`${k}\`.`),
      ...cut.map((c) => `- Cut: \`${c.key}\` (moved to history/).`),
      ...pendingCut.map((k) => `- Pending cut: \`${k}\` is started; the person decides whether to remove the work.`),
      ...historyOnly.map((k) => `- Started, not rewritten: \`${k}\`; the regenerated text is in history/work-${k}.r${finalRevision}.md.`),
      ...writtenNow.map((p) => `- Written in the session: \`${p.key}\` \u2014 ${(p["written-files"] ?? []).map((f) => `\`${f.path}\``).join(", ")}.`),
      ""
    ].join("\n");
    const changesPath = join(workDir, "changes.md");
    if (!existsSync(changesPath)) writeFileSync(changesPath, "# Work set changes\n\nOne entry per revision of the work set. The campaign reads this file.\n\n");
    appendFileSync(changesPath, entry);
    writeFileSync(indexPath, renderWorkIndex(board, { revision: finalRevision, generatedAt: at }));
  }
  return { ok: true, revision: finalRevision, added, changed, kept, cut: cut.map((c) => c.key), pendingCut, writtenNow: writtenNow.map((p) => p.key), warnings: check.warnings };
}

export {
  checkWorkSet,
  startedPacketRewriteError,
  writeWorkSet
};
