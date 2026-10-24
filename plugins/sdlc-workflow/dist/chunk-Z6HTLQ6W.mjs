import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  validateBrainstormBoard,
  validateFrontmatter
} from "./chunk-ZQSE2SVB.mjs";
import {
  safeParseFrontmatter
} from "./chunk-5U76735W.mjs";
import {
  jsYaml
} from "./chunk-LFGT2BKG.mjs";

// lib/roster-edit.mjs
var FM = /^(﻿?---\r?\n)([\s\S]*?)(\r?\n---)/;
var flow = (v) => jsYaml.dump(v, { flowLevel: 0, lineWidth: -1 }).trimEnd();
var indentOf = (line) => /^ */.exec(line)[0].length;
var esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
function split(text) {
  const m = FM.exec(text);
  if (!m) return null;
  const eol = m[2].includes("\r\n") ? "\r\n" : "\n";
  return { m, eol, lines: m[2].split(/\r?\n/) };
}
var join = (text, s, lines) => text.replace(s.m[0], () => `${s.m[1]}${lines.join(s.eol)}${s.m[3]}`);
function entries(lines) {
  const at = lines.findIndex((l) => /^slices:\s*$/.test(l));
  if (at < 0) return null;
  let end = at + 1;
  while (end < lines.length && (!lines[end].trim() || /^\s/.test(lines[end]) || /^-/.test(lines[end]))) end++;
  const first = lines.slice(at + 1, end).find((l) => /^\s*- /.test(l));
  if (!first) return [];
  const indent = indentOf(first);
  const out = [];
  for (let i = at + 1; i < end; i++) {
    if (!(indentOf(lines[i]) === indent && lines[i].slice(indent).startsWith("- "))) continue;
    let j = i + 1;
    while (j < end && !(indentOf(lines[j]) === indent && lines[j].slice(indent).startsWith("- ")) && (indentOf(lines[j]) > indent || !lines[j].trim())) j++;
    while (j > i + 1 && !lines[j - 1].trim()) j--;
    const rest = lines[i].slice(indent + 2);
    let data = null;
    try {
      data = rest.trim().startsWith("{") ? jsYaml.load(rest) : jsYaml.load([" ".repeat(indent + 2) + rest, ...lines.slice(i + 1, j)].map((l) => l.slice(indent + 2)).join("\n"));
    } catch {
      data = null;
    }
    out.push({ start: i, end: j, indent, flow: rest.trim().startsWith("{"), data: data && typeof data === "object" ? data : null });
  }
  return out;
}
function rosterEntries(text) {
  const s = split(String(text ?? ""));
  if (!s) return [];
  return (entries(s.lines) ?? []).filter((e) => e.data && (e.data.slug || e.data.slice)).map((e) => ({
    slug: String(e.data.slug ?? e.data.slice),
    status: e.data.status ?? null,
    dependsOn: (Array.isArray(e.data["depends-on"]) ? e.data["depends-on"] : []).map(String),
    unit: e.data.unit ? String(e.data.unit) : null,
    source: e.data.source ? String(e.data.source) : null,
    extensionRound: Number.isFinite(Number(e.data["extension-round"])) ? Number(e.data["extension-round"]) : null
  }));
}
function editRosterEntry(text, slug, fields) {
  const s = split(String(text ?? ""));
  if (!s) return null;
  const e = (entries(s.lines) ?? []).find((x) => x.data && String(x.data.slug ?? x.data.slice) === slug);
  if (!e) return null;
  const lines = [...s.lines];
  if (e.flow) {
    lines[e.start] = `${" ".repeat(e.indent)}- ${flow({ ...e.data, ...fields })}`;
    return join(text, s, lines);
  }
  const keyIndent = e.indent + 2;
  let end = e.end;
  for (const [key, value] of Object.entries(fields)) {
    const head = new RegExp(`^ {${e.indent}}- ${esc(key)}:`);
    const body = new RegExp(`^ {${keyIndent}}${esc(key)}:`);
    let k = -1;
    for (let i = e.start; i < end; i++) if (i === e.start && head.test(lines[i]) || i > e.start && body.test(lines[i])) {
      k = i;
      break;
    }
    if (k < 0) {
      lines.splice(end, 0, `${" ".repeat(keyIndent)}${key}: ${flow(value)}`);
      end++;
      continue;
    }
    const prefix = k === e.start ? `${" ".repeat(e.indent)}- ` : " ".repeat(keyIndent);
    let c = k + 1;
    while (c < end && (indentOf(lines[c]) > keyIndent || lines[c].trim().startsWith("- ") && indentOf(lines[c]) === keyIndent)) c++;
    lines.splice(k, c - k, `${prefix}${key}: ${flow(value)}`);
    end -= c - k - 1;
  }
  return join(text, s, lines);
}
function setFrontmatterValue(text, key, value) {
  const s = split(String(text ?? ""));
  if (!s) return null;
  const lines = [...s.lines];
  const k = lines.findIndex((l) => new RegExp(`^${esc(key)}:`).test(l));
  const line = `${key}: ${flow(value)}`;
  if (k < 0) {
    lines.push(line);
    return join(text, s, lines);
  }
  let c = k + 1;
  while (c < lines.length && lines[c].trim() && (/^\s/.test(lines[c]) || /^- /.test(lines[c]))) c++;
  lines.splice(k, c - k, line);
  return join(text, s, lines);
}
function frontmatterValue(text, key) {
  const m = FM.exec(String(text ?? ""));
  if (!m) return void 0;
  try {
    return (jsYaml.load(m[2]) ?? {})[key];
  } catch {
    return void 0;
  }
}
function rosterWalkOrder(slices) {
  const name = (s) => s.slice ?? s.slug;
  const names = new Set(slices.map(name));
  const placed = /* @__PURE__ */ new Set();
  const out = [];
  let left = [...slices];
  while (left.length) {
    const next = left.find((s) => (s.dependsOn || []).every((d) => d === name(s) || !names.has(d) || placed.has(d)));
    if (!next) return [...out, ...left];
    out.push(next);
    placed.add(name(next));
    left = left.filter((s) => s !== next);
  }
  return out;
}
function closesCycle(slices, slice, after) {
  const deps = new Map(slices.map((s) => [s.slug, new Set(s.dependsOn ?? [])]));
  if (!deps.has(slice) || !deps.has(after)) return false;
  const seen = /* @__PURE__ */ new Set();
  const stack = [after];
  while (stack.length) {
    const n = stack.pop();
    if (n === slice) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const d of deps.get(n) ?? []) stack.push(d);
  }
  return false;
}

// lib/packets.mjs
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync, appendFileSync } from "node:fs";
import { join as join2 } from "node:path";
var PACKET_FORMS = Object.freeze(["intake", "investigate", "discover", "rca", "fix", "hotfix", "task", "extension"]);
var BUILD_FORMS = Object.freeze(["intake", "fix", "hotfix", "extension"]);
var TARGETED_FORMS = Object.freeze(["extension", "fix", "hotfix"]);
var PACKET_STATES = Object.freeze(["written", "open", "built", "done", "dropped"]);
var STARTED_STATES = Object.freeze(["open", "built", "done", "dropped"]);
var SLICE_TARGET = 10;
var SLICE_MIN = 6;
var SLICE_MAX = 14;
var UX_IMPACTS = Object.freeze(["none", "visual", "flow", "new-surface"]);
var SCRATCH_RE = /(?:^|[\s`'"(/\\])\.scratch[/\\]/;
var SIGNATURE_LINE_RE = /^(?:revision|list-revision|generated-at):.*$/gm;
var DEFAULT_FILES = Object.freeze({ board: "brainstorm-board.json", lead: "01-brainstorm.md" });
var IDEATE_FILES = Object.freeze({ board: "ideate-work.json", lead: "01-ideate.md" });
function filesFor(boardFile = DEFAULT_FILES.board) {
  if (boardFile === IDEATE_FILES.board) return IDEATE_FILES;
  return { board: boardFile, lead: DEFAULT_FILES.lead };
}
var listBranch = (sourceSlug) => `packets/${sourceSlug}`;
var endBranch = (sourceSlug, key) => `packets/${sourceSlug}--${key}`;
function isPacket(packet) {
  return PACKET_FORMS.includes(packet?.shape);
}
function isBuildPacket(packet) {
  return BUILD_FORMS.includes(packet?.shape ?? packet?.form);
}
function isWriteNowPacket(packet) {
  return packet?.shape === "write-now";
}
function isStartedState(state) {
  return STARTED_STATES.includes(state);
}
function byKey(list2 = []) {
  const map = /* @__PURE__ */ new Map();
  for (const entry of list2) if (entry?.key) map.set(entry.key, entry);
  return map;
}
function ordered(packets) {
  return [...packets].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || String(a.key).localeCompare(String(b.key)));
}
function isLive(item) {
  return item && !item["replaced-by"] && item.scope !== "cut" && item.scope !== "later";
}
var list = (v) => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
function carriedDecisionItems(board, packet) {
  const items = byKey(board.items);
  return (packet.items ?? []).map((key) => items.get(key)).filter((item) => item?.kind === "decision" && isLive(item));
}
function packetFileName(packet) {
  return `${packet.slug ?? packet.key}.md`;
}
function tryOutOf(packet) {
  if ((packet["ux-impact"] ?? "none") !== "none") return "yes";
  return packet["try-out"] === "yes" || packet["try-out"] === true ? "yes" : "no";
}
function boardCitations(board) {
  const out = [];
  for (const item of board.items ?? []) {
    if (typeof item.evidence === "string") out.push({ where: `items.${item.key}.evidence`, text: item.evidence });
  }
  for (const packet of board.work ?? []) {
    for (const ref of packet.references ?? []) out.push({ where: `work.${packet.key}.references`, text: ref });
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
function sequenceErrors(packets) {
  const errors = [];
  const seen = /* @__PURE__ */ new Map();
  for (const packet of packets) {
    if (!Number.isInteger(packet.order) || packet.order < 1) {
      errors.push(`packet ${packet.key}: no order. Agree its place in the list with the person.`);
      continue;
    }
    if (seen.has(packet.order)) errors.push(`packets ${seen.get(packet.order)} and ${packet.key} have the same order ${packet.order}: the list order is strict.`);
    else seen.set(packet.order, packet.key);
    if (packet.order > 1 && !String(packet["why-here"] ?? "").trim()) errors.push(`packet ${packet.key} (order ${packet.order}): no why-here. Record why it comes after the packets before it, in the person's words.`);
  }
  const n = packets.length;
  for (let i = 1; i <= n; i++) if (!seen.has(i) && seen.size) errors.push(`the list has no packet with order ${i}: the orders are 1 to ${n}, each used once.`);
  return errors;
}
var writtenUp = (packet) => isStartedState(packet.state) || packet.migrated;
function checkList(board, { isIgnored = null } = {}) {
  const errors = [];
  const warnings = [];
  const packets = board.work ?? [];
  const items = byKey(board.items);
  const shape = validateBrainstormBoard(board);
  if (!shape.valid) {
    for (const e of shape.errors) errors.push(`board schema: ${e.path || "/"} ${e.message}`);
  }
  const slugs = /* @__PURE__ */ new Map();
  for (const packet of packets.filter(isPacket)) {
    if (!packet.slug) errors.push(`packet ${packet.key}: no slug. Agree the slug that the packet opens.`);
    else if (slugs.has(packet.slug)) errors.push(`packets ${slugs.get(packet.slug)} and ${packet.key} open the same slug ${packet.slug}.`);
    else slugs.set(packet.slug, packet.key);
    if (TARGETED_FORMS.includes(packet.shape) && !packet["target-slug"]) {
      errors.push(`packet ${packet.key}: form ${packet.shape} needs target-slug, the existing workflow it changes.`);
    }
  }
  errors.push(...sequenceErrors(packets));
  const homes = /* @__PURE__ */ new Map();
  for (const packet of packets) {
    if (packet.state === "dropped") continue;
    for (const key of packet.items ?? []) {
      if (!items.has(key)) {
        errors.push(`packet ${packet.key} names item ${key}, which is not on the board.`);
        continue;
      }
      if (!homes.has(key)) homes.set(key, []);
      homes.get(key).push(packet);
    }
  }
  for (const item of board.items ?? []) {
    if (item.kind !== "decision" || item.scope !== "keep" || item["replaced-by"]) continue;
    const owners = homes.get(item.key) ?? [];
    if (!owners.length) errors.push(`kept decision ${item.key} ("${item.text}") lands in no packet.`);
    else if (owners.length > 1) errors.push(`kept decision ${item.key} lands in ${owners.map((p) => p.key).join(", ")}: put it in exactly one packet.`);
  }
  let buildNotStarted = 0;
  for (const packet of packets.filter(isBuildPacket)) {
    if (writtenUp(packet) || packet.state === "dropped") continue;
    buildNotStarted++;
    if (!String(packet.goal ?? "").trim()) errors.push(`packet ${packet.key}: no goal. Write the goal of the packet.`);
    if (!list(packet["acceptance-criteria"]).length) errors.push(`packet ${packet.key}: no acceptance criteria. Write each checkable criterion.`);
    if (!UX_IMPACTS.includes(packet["ux-impact"])) errors.push(`packet ${packet.key}: no ux-impact. Propose one; the person confirms it.`);
    else if (packet["ux-impact-confirmed"] !== true) errors.push(`packet ${packet.key}: ux-impact ${packet["ux-impact"]} is not confirmed by the person.`);
    if (packet["try-out"] === "no" && (packet["ux-impact"] ?? "none") !== "none") errors.push(`packet ${packet.key}: try-out no with ux-impact ${packet["ux-impact"]}: a packet with a user-facing change gets a try-out (D37).`);
    const est = packet["estimated-slices"];
    if (!Number.isInteger(est)) warnings.push(`packet ${packet.key}: no estimated-slices. Estimate the capability slices; the target is ${SLICE_TARGET}.`);
    else if (est > SLICE_MAX) warnings.push(`packet ${packet.key}: about ${est} slices, above ${SLICE_MAX}. Propose a split at a point where the first part is complete; the person may keep it.`);
    else if (est < SLICE_MIN) warnings.push(`packet ${packet.key}: about ${est} slices, below ${SLICE_MIN}. Propose a merge with a packet of the same family; the person may keep it.`);
  }
  for (const packet of packets.filter(isPacket)) {
    if (writtenUp(packet) || packet.state === "dropped") continue;
    const carried = carriedDecisionItems(board, packet);
    const undated = carried.filter((i) => i.session == null || !i["decided-at"]);
    if (undated.length) {
      warnings.push(`packet ${packet.key}: ${undated.length} carried decision(s) have no session or decided-at (${undated.slice(0, 3).map((i) => i.key).join(", ")}${undated.length > 3 ? ", \u2026" : ""}): write both on each decision.`);
    }
    if (carried.length && !touchingItems(board, packet, "finding").length) {
      warnings.push(`packet ${packet.key} carries ${carried.length} decisions and no finding: put the findings that bear on them in its items or on its threads, or say why there are none.`);
    }
  }
  if (buildNotStarted && board.stack?.["user-confirmed"] !== true) {
    errors.push("the list has build packets and no confirmed stack. Detect the stack, confirm it with the person, and write it to the board with user-confirmed: true.");
  }
  const sketchKeys = new Set((board.sketches ?? []).map((s) => s?.key).filter(Boolean));
  const placed = new Set(packets.flatMap((p) => p.sketches ?? []));
  for (const sketch of board.sketches ?? []) {
    if (sketch?.state === "idea") {
      errors.push(`sketch ${sketch.key} ("${sketch.caption ?? ""}") is still an idea: carry it into a packet, drop it, or keep it as a reference.`);
    } else if (sketch?.state === "carried" && !placed.has(sketch.key)) {
      errors.push(`carried sketch ${sketch.key} ("${sketch.caption ?? ""}") is in no packet: name it in the sketches of the packet it serves, or drop it.`);
    }
  }
  for (const packet of packets) {
    for (const key of packet.sketches ?? []) {
      if (!sketchKeys.has(key)) errors.push(`packet ${packet.key} names sketch ${key}, which is not on the board.`);
    }
  }
  for (const packet of packets.filter(isWriteNowPacket)) {
    if (packet.state === "written" && !(packet["written-files"] ?? []).length) {
      errors.push(`write-now packet ${packet.key} is written but records no written-files.`);
    }
    if (packet.state !== "written" && packet.state !== "proposed") {
      errors.push(`write-now packet ${packet.key} has state ${packet.state}; it is proposed or written.`);
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
function itemLine(item, { withWhy = false, boardFile = DEFAULT_FILES.board } = {}) {
  const parts = [`- **${item.key}** \u2014 ${item.text}`];
  if (withWhy && item.why) parts.push(` Why: ${item.why}`);
  if (item["accepted-risk"]) parts.push(` Accepted risk: ${item["accepted-risk"]}`);
  if (item.evidence) parts.push(` Evidence: \`${item.evidence}\`.`);
  parts.push(` ([board](../${boardFile}#${item.key}))`);
  return parts.join("");
}
function itemsOfKind(board, packet, kinds, predicate = () => true) {
  const items = byKey(board.items);
  return (packet.items ?? []).map((k) => items.get(k)).filter((i) => i && kinds.includes(i.kind) && predicate(i));
}
function threadItems(board, packet, predicate) {
  const threads = new Set(packet.threads ?? []);
  const own = new Set(packet.items ?? []);
  return (board.items ?? []).filter((i) => threads.has(i.thread) && !own.has(i.key) && predicate(i));
}
function touchingItems(board, packet, kind, predicate = isLive) {
  const own = itemsOfKind(board, packet, [kind], predicate);
  const seen = new Set(own.map((i) => i.key));
  const threads = new Set(packet.threads ?? []);
  const decisions = new Set(carriedDecisionItems(board, packet).map((i) => i.key));
  const more = (board.items ?? []).filter((i) => i && i.kind === kind && !seen.has(i.key) && predicate(i) && (threads.has(i.thread) || Array.isArray(i.between) && i.between.some((k) => decisions.has(k))));
  return [...own, ...more];
}
var liveAssumption = (i) => isLive(i) && i.state !== "rejected";
var openTension = (i) => i.state === "open" && !i["replaced-by"];
function researchLink(id, researchFiles) {
  const file = researchFiles.find((f) => f === `${id}.md` || f.startsWith(`${id}-`));
  return file ? `[${id}](../research/${file})` : id;
}
function referenceLink(ref) {
  return /^F\d+$/.test(ref) ? `[${ref}](../references/index.md#${ref.toLowerCase()})` : `\`${ref}\``;
}
function packetSketches(board, packet) {
  const sketches = byKey(board.sketches);
  return (packet.sketches ?? []).map((key) => {
    const s = sketches.get(key) ?? {};
    const raw = s.path ? String(s.path).split("\\").join("/") : "";
    const at = raw.indexOf("#");
    const file = at < 0 ? raw : raw.slice(0, at);
    const anchor = at < 0 ? "" : raw.slice(at);
    const path = file ? `${file.startsWith(".ai/") ? file : `.ai/workflows/${board.slug}/${file.replace(/^\.\//, "")}`}${anchor}` : null;
    const canvas = s.canvas && typeof s.canvas === "object" ? s.canvas : null;
    return {
      key,
      path,
      link: canvas?.link ?? s.link ?? null,
      ...s.caption ? { caption: s.caption } : {},
      ...canvas ? { canvas } : {}
    };
  });
}
function packetFrontmatter(board, packet, { revision = 1, generatedAt = null, state = null } = {}) {
  const decisions = carriedDecisionItems(board, packet);
  const keysOf = (l) => l.map((i) => i.key);
  const build = isBuildPacket(packet);
  return {
    schema: "sdlc/v1",
    type: "packet",
    slug: board.slug,
    key: packet.key,
    "packet-slug": packet.slug ?? packet.key,
    title: packet.title,
    form: packet.shape,
    "target-slug": packet["target-slug"] ?? null,
    amends: packet.amends ?? null,
    urgency: packet.urgency ?? "normal",
    revision,
    "origin-source": board.slug,
    order: packet.order ?? 1,
    ...packet["why-here"] ? { "why-here": packet["why-here"] } : {},
    state: state ?? (isStartedState(packet.state) ? packet.state : "written"),
    "carried-decisions": decisions.map((i) => ({
      key: i.key,
      text: i.text,
      ...i.why ? { why: i.why } : {},
      session: i.session ?? null,
      "decided-at": i["decided-at"] ?? null
    })),
    "open-ideas": keysOf([
      ...itemsOfKind(board, packet, ["idea", "question"], isLive),
      ...threadItems(board, packet, (i) => i.kind === "question" && (i.state === "open" || i.state === "for-plan")),
      ...touchingItems(board, packet, "tension", openTension)
    ]),
    findings: keysOf(touchingItems(board, packet, "finding")),
    assumptions: keysOf(touchingItems(board, packet, "assumption", liveAssumption)),
    later: keysOf(threadItems(board, packet, (i) => i.scope === "later")),
    research: packet.research ?? [],
    references: packet.references ?? [],
    "ux-impact": packet["ux-impact"] ?? "none",
    ...build ? { "try-out": tryOutOf(packet) } : {},
    ...Number.isInteger(packet["estimated-slices"]) ? { "estimated-slices": packet["estimated-slices"] } : {},
    "design-form": packet["design-form"] ?? "none",
    ...packet.sketches?.length ? { sketches: packetSketches(board, packet) } : {},
    ...packet.migrated ? { migrated: packet.migrated } : {},
    ...generatedAt ? { "generated-at": generatedAt } : {}
  };
}
function bullets(l) {
  return l.length ? l.map((x) => `- ${x}`) : ["- None."];
}
function renderPacket(board, packet, { revision = 1, generatedAt = null, researchFiles = [], files = DEFAULT_FILES, state = null } = {}) {
  const fm = packetFrontmatter(board, packet, { revision, generatedAt, state });
  const packets = board.work ?? [];
  const packetKeys = byKey(packets);
  const decisions = carriedDecisionItems(board, packet);
  const open = itemsOfKind(board, packet, ["idea", "question"], isLive);
  const openTensions = touchingItems(board, packet, "tension", openTension);
  const openQuestions = threadItems(board, packet, (i) => i.kind === "question" && (i.state === "open" || i.state === "for-plan"));
  const findings = touchingItems(board, packet, "finding");
  const assumptions = touchingItems(board, packet, "assumption", liveAssumption);
  const risks = decisions.filter((i) => i["accepted-risk"]);
  const later = threadItems(board, packet, (i) => i.scope === "later");
  const cut = threadItems(board, packet, (i) => i.scope === "cut");
  const linkTo = (key) => {
    const other = packetKeys.get(key);
    if (!other) return `\`${key}\``;
    if (isWriteNowPacket(other)) return `${other.title} (written in the brainstorm session; state ${other.state})`;
    return `[${other.title}](${packetFileName(other)})`;
  };
  const none = "- None.";
  const lines = [];
  lines.push("---", dump(fm), "---", "");
  lines.push(`# ${packet.title}`, "");
  lines.push(`The board wins where this packet and the board differ: [${files.board}](../${files.board}), [${files.lead}](../${files.lead}). The list: [index.md](index.md).`, "");
  lines.push("## Place in the list", "");
  lines.push(`Form: \`${packet.shape}\`${packet["target-slug"] ? ` on \`${packet["target-slug"]}\`` : ""}. Order: ${packet.order ?? 1}. Carried decisions: ${decisions.length}.${Number.isInteger(packet["estimated-slices"]) ? ` Estimated slices: ${packet["estimated-slices"]}.` : ""}`, "");
  const before = (packet.order ?? 1) > 1 ? packets.find((p) => p.order === packet.order - 1) : null;
  if (before) lines.push(`Comes after: ${linkTo(before.key)}, because ${String(packet["why-here"] ?? "").trim().replace(/\.$/, "")}.`, "");
  lines.push(isBuildPacket(packet) ? `The campaign walk builds this packet: \`/wf campaign ${board.slug}\`.` : `The campaign walk routes this packet to its own command (form \`${packet.shape}\`).`, "");
  lines.push("## Goal", "", String(packet.goal ?? "").trim() || "- None.", "");
  lines.push("## In scope", "", ...bullets(list(packet["in-scope"])), "");
  lines.push("## Out of scope", "", ...bullets(list(packet["out-of-scope"])), "");
  lines.push("## Acceptance criteria", "");
  const acs = list(packet["acceptance-criteria"]);
  lines.push(...acs.length ? acs.map((ac, i) => `- **AC-${i + 1}** \u2014 ${ac}`) : [none], "");
  lines.push("## Constraints", "", ...bullets(list(packet.constraints)), "");
  lines.push("## Risks", "", ...bullets(list(packet.risks)), "");
  lines.push("## What the person decided", "");
  lines.push("The campaign copies these decisions word for word into the workflow folder. Nobody re-words them.", "");
  if (decisions.length) {
    for (const item of decisions) {
      const when = [item.session ? `session ${item.session}` : null, item["decided-at"] ?? null].filter(Boolean).join(", ");
      lines.push(`${itemLine(item, { withWhy: true, boardFile: files.board })}${when ? ` (${when})` : ""}`);
    }
  } else lines.push(none);
  lines.push("");
  lines.push("## What is still open", "");
  const openAll = [...open, ...openQuestions, ...openTensions];
  lines.push(...openAll.length ? openAll.map((i) => itemLine(i, { boardFile: files.board })) : [none], "");
  lines.push("## What we found", "");
  lines.push(...findings.length ? findings.map((i) => itemLine(i, { boardFile: files.board })) : [none], "");
  lines.push("## What we assume", "");
  const assumeLines = [...assumptions.map((i) => itemLine(i, { boardFile: files.board })), ...risks.map((i) => `- Accepted risk with **${i.key}**: ${i["accepted-risk"]}`)];
  lines.push(...assumeLines.length ? assumeLines : [none], "");
  lines.push("## Left for later and cut", "");
  const leftLines = [
    ...later.map((i) => `${itemLine(i, { boardFile: files.board })} Left for later.`),
    ...cut.map((i) => `${itemLine(i, { boardFile: files.board })} Cut${i.reason ? `: ${i.reason}` : ""}.`)
  ];
  lines.push(...leftLines.length ? leftLines : [none], "");
  lines.push("## Sources", "");
  const sources = [
    ...(packet.research ?? []).map((id) => `- Research: ${researchLink(id, researchFiles)}`),
    ...(packet.references ?? []).map((ref) => `- Reference: ${referenceLink(ref)}`),
    ...(fm.sketches ?? []).map((sk) => `- Sketch \`${sk.key}\`: ${sk.path ? `\`${sk.path}\`` : "no file"}${sk.link ? ` ([canvas](${sk.link}))` : ""}${sk.caption ? ` \u2014 ${sk.caption}` : ""}`)
  ];
  lines.push(...sources.length ? sources : [none], "");
  return lines.join("\n");
}
function renderListIndex(board, { revision = 1, generatedAt = null, files = DEFAULT_FILES, states = {} } = {}) {
  const packets = ordered(board.work ?? []);
  const own = packets.filter(isPacket);
  const writeNow = packets.filter(isWriteNowPacket);
  const fm = {
    schema: "sdlc/v1",
    type: "list",
    slug: board.slug,
    "list-revision": revision,
    "list-branch": listBranch(board.slug),
    packets: own.map((p) => p.key),
    slugs: own.map((p) => p.slug ?? p.key),
    written: writeNow.filter((p) => p.state === "written").map((p) => p.key),
    ...board.stack ? { stack: board.stack } : {},
    ...generatedAt ? { "generated-at": generatedAt } : {}
  };
  const lines = ["---", dump(fm), "---", ""];
  lines.push(`# List: ${board.topic ?? board.slug}`, "");
  lines.push(`The board wins where this file and the board differ: [${files.board}](../${files.board}). Changes by revision: [changes.md](changes.md).`, "");
  lines.push("## Packets", "");
  if (own.length) {
    lines.push("| Order | Packet | Form | State | Try-out | Why here |", "|---|---|---|---|---|---|");
    for (const p of own) {
      const state = states[p.key] ?? (isStartedState(p.state) ? p.state : "written");
      lines.push(`| ${p.order ?? ""} | [${p.title}](${packetFileName(p)}) | ${p.shape}${p["target-slug"] ? ` on \`${p["target-slug"]}\`` : ""} | ${state} | ${isBuildPacket(p) ? tryOutOf(p) : "\u2014"} | ${String(p["why-here"] ?? "").trim() || "\u2014"} |`);
    }
  } else lines.push("- None.");
  lines.push("");
  lines.push("## Written in the brainstorm session", "");
  if (writeNow.length) {
    for (const p of writeNow) {
      const wf = (p["written-files"] ?? []).map((f) => `\`${f.path}\`${f.section ? ` (${f.section})` : ""}`).join(", ");
      lines.push(`- **${p.key}** \u2014 ${p.title}. State: ${p.state}.${wf ? ` Files: ${wf}.` : ""}`);
    }
  } else lines.push("- None.");
  lines.push("");
  lines.push("## Build the list", "");
  lines.push(own.length ? `Type \`/wf campaign ${board.slug}\`. The walk builds the packets in order, one at a time, on the branch \`${listBranch(board.slug)}\`.` : "- Nothing to build.", "");
  return lines.join("\n");
}
function renderResearchIndex(board, notes) {
  const lines = ["# Research notes", "", "Each line: the note, its question, and the board items that cite it.", ""];
  if (!notes.length) lines.push("- None.");
  for (const note of notes) {
    const id = note.data?.id ?? note.file.replace(/-.*$/, "").replace(/\.md$/, "");
    const citing = (board.items ?? []).filter((i) => typeof i.evidence === "string" && i.evidence.includes(`research/${note.file}`)).map((i) => i.key);
    const packets = (board.work ?? []).filter((p) => (p.research ?? []).includes(id)).map((p) => p.key);
    const cites = [...citing, ...packets.map((k) => `work:${k}`)];
    lines.push(`- [${id}](${note.file}) \u2014 ${note.data?.question ?? "(no question recorded)"} \u2014 cited by: ${cites.length ? cites.join(", ") : "nothing yet"}`);
  }
  lines.push("");
  return lines.join("\n");
}
function signature(text) {
  return String(text ?? "").replace(/\r\n/g, "\n").replace(SIGNATURE_LINE_RE, "").trim();
}
function packetContent(text) {
  const p = safeParseFrontmatter(String(text ?? ""));
  if (!p.data) return signature(text);
  const d = { ...p.data };
  for (const k of ["revision", "generated-at", "state"]) delete d[k];
  return `${JSON.stringify(d)}
${signature(p.content)}`;
}
function latestHistoryCopy(historyDir, key) {
  let names = [];
  try {
    names = readdirSync(historyDir);
  } catch {
    return null;
  }
  const prefix = `work-${key}.r`;
  let best = null;
  for (const n of names) {
    if (!n.startsWith(prefix) || !n.endsWith(".md")) continue;
    const r = Number(n.slice(prefix.length, -3));
    if (Number.isInteger(r) && (!best || r > best.r)) best = { r, n };
  }
  return best ? readFileSync(join2(historyDir, best.n), "utf8") : null;
}
function startedPacketRewriteError(oldText, newText) {
  const before = safeParseFrontmatter(oldText);
  if (!before.data || before.data.type !== "packet" || !isStartedState(before.data.state)) return null;
  const after = safeParseFrontmatter(newText);
  if (!after.data) return null;
  const strip = (data) => {
    const copy = { ...data };
    for (const k of ["state", "order", "generated-at"]) delete copy[k];
    return JSON.stringify(copy);
  };
  if (strip(before.data) !== strip(after.data) || signature(before.content) !== signature(after.content)) {
    return `packet ${before.data.key ?? ""} is ${before.data.state}: a started packet is never rewritten. A change to it is a new packet (extension, fix, or hotfix) with amends: ${before.data.key ?? "<key>"}.`;
  }
  return null;
}
function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}
function readResearchNotes(dir) {
  const research = join2(dir, "research");
  if (!existsSync(research)) return [];
  return readdirSync(research).filter((f) => /^R\d+.*\.md$/.test(f)).sort().map((file) => ({ file, data: safeParseFrontmatter(readFileSync(join2(research, file), "utf8")).data ?? {} }));
}
function readWorkFiles(workDir) {
  const packets = /* @__PURE__ */ new Map();
  const legacyPackets = [];
  if (!existsSync(workDir)) return { packets, legacyPackets };
  for (const file of readdirSync(workDir)) {
    if (!file.endsWith(".md") || file === "index.md" || file === "changes.md" || file === "migration.md") continue;
    const text = readFileSync(join2(workDir, file), "utf8");
    const data = safeParseFrontmatter(text).data;
    if (data?.type === "packet") packets.set(data.key ?? file, { file, text, data });
    else if (data?.type === "work-packet") legacyPackets.push(file);
  }
  return { packets, legacyPackets };
}
function stamp(now) {
  return (now ?? /* @__PURE__ */ new Date()).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function writeList(dir, { now = null, isIgnored = null, dryRun = false, boardFile = DEFAULT_FILES.board } = {}) {
  const files = filesFor(boardFile);
  const board = readJson(join2(dir, files.board));
  const check = checkList(board, { isIgnored });
  if (check.errors.length) return { ok: false, ...check };
  const workDir = join2(dir, "work");
  const historyDir = join2(dir, "history");
  const at = stamp(now);
  const { packets: existing, legacyPackets: oldPackets } = readWorkFiles(workDir);
  const indexPath = join2(workDir, "index.md");
  const oldIndex = existsSync(indexPath) ? safeParseFrontmatter(readFileSync(indexPath, "utf8")).data ?? {} : {};
  const oldRevision = oldIndex.type === "list" && Number.isInteger(oldIndex["list-revision"]) ? oldIndex["list-revision"] : 0;
  const revision = oldRevision + 1;
  const researchFiles = readResearchNotes(dir).map((n) => n.file);
  const added = [];
  const changed = [];
  const kept = [];
  const historyOnly = [];
  const reordered = [];
  const writes = [];
  const states = {};
  for (const packet of ordered((board.work ?? []).filter(isPacket))) {
    const prior = existing.get(packet.key);
    existing.delete(packet.key);
    const state = prior && PACKET_STATES.includes(prior.data.state) ? prior.data.state : isStartedState(packet.state) ? packet.state : "written";
    states[packet.key] = state;
    const text = renderPacket(board, packet, { revision, generatedAt: at, researchFiles, files, state });
    const shape = validateFrontmatter(packetFrontmatter(board, packet, { revision, generatedAt: at, state }));
    if (!shape.valid) return { ok: false, errors: shape.errors.map((e) => `packet ${packet.key}: ${e.path} ${e.message}`), warnings: check.warnings };
    if (prior && isStartedState(prior.data.state)) {
      kept.push(packet.key);
      if (Number.isInteger(packet.order) && prior.data.order !== packet.order) {
        const moved = setFrontmatterValue(prior.text, "order", packet.order);
        if (moved) {
          writes.push({ path: join2(workDir, prior.file), text: moved });
          reordered.push(packet.key);
        }
      }
      if (packetContent(latestHistoryCopy(historyDir, packet.key) ?? prior.text) !== packetContent(text)) {
        historyOnly.push(packet.key);
        writes.push({ path: join2(historyDir, `work-${packet.key}.r${revision}.md`), text });
      }
      continue;
    }
    if (!prior) added.push(packet.key);
    else if (signature(prior.text) !== signature(text)) changed.push(packet.key);
    else continue;
    writes.push({ path: join2(workDir, packetFileName(packet)), text, removeFirst: prior && prior.file !== packetFileName(packet) ? join2(workDir, prior.file) : null });
  }
  const cut = [];
  const pendingCut = [];
  for (const [key, prior] of existing) {
    if (isStartedState(prior.data.state)) pendingCut.push(key);
    else cut.push({ key, file: prior.file });
  }
  const priorWritten = new Set(oldIndex.written ?? []);
  const writtenNow = (board.work ?? []).filter((p) => isWriteNowPacket(p) && p.state === "written" && !priorWritten.has(p.key));
  const changedSet = added.length || changed.length || cut.length || historyOnly.length || reordered.length || writtenNow.length || oldPackets.length || oldIndex.type !== "list";
  const finalRevision = changedSet || !oldRevision ? revision : oldRevision;
  if (!changedSet && oldRevision) {
    return { ok: true, revision: oldRevision, added, changed, kept, cut: [], pendingCut, writtenNow: [], archivedPackets: [], warnings: check.warnings, unchanged: true };
  }
  if (!dryRun) {
    mkdirSync(workDir, { recursive: true });
    if (oldPackets.length) {
      const archive = join2(workDir, "archive", "packets");
      mkdirSync(archive, { recursive: true });
      for (const f of oldPackets) renameSync(join2(workDir, f), join2(archive, f));
    }
    for (const w of writes) {
      mkdirSync(join2(w.path, ".."), { recursive: true });
      if (w.removeFirst) mkdirSync(historyDir, { recursive: true });
      if (w.removeFirst && existsSync(w.removeFirst)) renameSync(w.removeFirst, join2(historyDir, `work-${w.removeFirst.split(/[\\/]/).pop().replace(/\.md$/, "")}.r${oldRevision || 1}.md`));
      writeFileSync(w.path, w.text);
    }
    for (const c of cut) {
      mkdirSync(historyDir, { recursive: true });
      renameSync(join2(workDir, c.file), join2(historyDir, `work-${c.key}.r${oldRevision || 1}.md`));
    }
    const notes = readResearchNotes(dir);
    if (notes.length || existsSync(join2(dir, "research"))) {
      mkdirSync(join2(dir, "research"), { recursive: true });
      writeFileSync(join2(dir, "research", "index.md"), renderResearchIndex(board, notes));
    }
    const entry = [
      `## Revision ${finalRevision} \u2014 ${at}`,
      "",
      ...added.map((k) => `- Added: \`${k}\`.`),
      ...changed.map((k) => `- Changed: \`${k}\`.`),
      ...cut.map((c) => `- Cut: \`${c.key}\` (moved to history/).`),
      ...pendingCut.map((k) => `- Pending cut: \`${k}\` is started; the person decides whether to remove the work.`),
      ...historyOnly.map((k) => `- Started, not rewritten: \`${k}\`; the regenerated text is in history/work-${k}.r${finalRevision}.md.`),
      ...reordered.map((k) => `- Started, moved in the order: \`${k}\` is now order ${(board.work ?? []).find((p) => p.key === k)?.order}.`),
      ...writtenNow.map((p) => `- Written in the session: \`${p.key}\` \u2014 ${(p["written-files"] ?? []).map((f) => `\`${f.path}\``).join(", ")}.`),
      ...oldPackets.length ? [`- Old work packets moved to work/archive/packets/: ${oldPackets.map((f) => `\`${f}\``).join(", ")}.`] : [],
      ""
    ].join("\n");
    const changesPath = join2(workDir, "changes.md");
    if (!existsSync(changesPath)) writeFileSync(changesPath, "# List changes\n\nOne entry per revision of the list.\n\n");
    appendFileSync(changesPath, entry);
    writeFileSync(indexPath, renderListIndex(board, { revision: finalRevision, generatedAt: at, files, states }));
  }
  return { ok: true, revision: finalRevision, added, changed, kept, reordered, cut: cut.map((c) => c.key), pendingCut, writtenNow: writtenNow.map((p) => p.key), archivedPackets: oldPackets, warnings: check.warnings };
}

export {
  rosterEntries,
  editRosterEntry,
  setFrontmatterValue,
  frontmatterValue,
  rosterWalkOrder,
  closesCycle,
  BUILD_FORMS,
  PACKET_STATES,
  DEFAULT_FILES,
  IDEATE_FILES,
  listBranch,
  endBranch,
  isStartedState,
  checkList,
  startedPacketRewriteError,
  readWorkFiles,
  writeList
};
