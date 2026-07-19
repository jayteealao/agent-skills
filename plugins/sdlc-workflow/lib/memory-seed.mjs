// lib/memory-seed.mjs — seed a minimal, versioned `/wf` rules kernel into the
// agent memory files (MEMORY-SEED-PLAN).
//
// Structure (single canonical source):
//   AGENTS.md  — holds the LITERAL kernel behind a versioned fence. Codex reads
//                it natively; Claude reads it via an `@AGENTS.md` import.
//   CLAUDE.md  — holds only a `@AGENTS.md` import fence. Claude Code expands the
//                import into context at launch. The pointer is version-independent
//                (its body never changes when the kernel bumps).
//
// The `@import` directive is a Claude-Code-only feature and Codex does not expand
// it, so the kernel MUST live literally in AGENTS.md for Codex to see it — a
// dedicated third file would force duplication. Hence AGENTS.md is canonical.
//
// Contract: the plugin owns EXACTLY the fenced region in each file and never
// touches a byte outside it. Everything here is pure string surgery except the
// thin fs orchestrator at the bottom, which is fail-open (never throws).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Bump when the kernel body changes. A newer version replaces an older fence in
// place (version-gate, mirrors the render `.last-render` PLUGIN_VERSION idea).
export const KERNEL_VERSION = 1;

const FENCE = 'sdlc:wf-rules';
const IMPORT_FENCE = 'sdlc:wf-rules-import';

// ── AGENTS.md: the literal kernel ────────────────────────────────────────────

function agentsStart(v) {
  return `<!-- ${FENCE} v${v} START - managed by sdlc-workflow; edit outside this fence -->`;
}
function agentsEnd(v) {
  return `<!-- ${FENCE} v${v} END -->`;
}

// Each line POINTS AT a skill; it never restates one (single-source discipline,
// same rule _steering.md enforces). Keep this a kernel, not a manifesto.
function kernelBody() {
  return [
    '## Working in this repo (sdlc-workflow)',
    '',
    '- `/wf` is the lifecycle entry point. Workflow artifacts live under `.ai/`; treat rendered or',
    '  generated output as read-only — regenerate, don\'t hand-edit.',
    '- Ground facts in real source instead of guessing: reach for **study-sources** before asserting',
    '  how a library, framework, SDK, or API actually behaves.',
    '- Durable per-workflow constraints (vetoes, preferences) go in `.ai/workflows/<slug>/steer.md`.',
  ].join('\n');
}

export function renderAgentsBlock(v = KERNEL_VERSION) {
  return `${agentsStart(v)}\n${kernelBody()}\n${agentsEnd(v)}`;
}

// Matches ANY version of our fence so an older block can be replaced in place.
const AGENTS_FENCE_RE = new RegExp(
  `<!-- ${FENCE} v\\d+ START[\\s\\S]*?<!-- ${FENCE} v\\d+ END -->`,
);

/**
 * Given the current AGENTS.md text (or null if absent), return the text that
 * guarantees the current kernel fence is present, plus whether that changed the
 * file. Pure — no fs. Never touches bytes outside the fence.
 */
export function ensureAgentsKernel(content) {
  const block = renderAgentsBlock();
  if (content == null) {
    return { text: `${block}\n`, changed: true, action: 'created' };
  }
  const m = content.match(AGENTS_FENCE_RE);
  if (m) {
    if (eolEqual(m[0], block)) return { text: content, changed: false, action: 'current' };
    return { text: content.replace(AGENTS_FENCE_RE, block), changed: true, action: 'updated' };
  }
  return { text: appendBlock(content, block), changed: true, action: 'appended' };
}

// ── CLAUDE.md: the version-independent import pointer ─────────────────────────

const IMPORT_START = `<!-- ${IMPORT_FENCE} START - managed by sdlc-workflow; edit outside this fence -->`;
const IMPORT_BODY = '@AGENTS.md';
const IMPORT_END = `<!-- ${IMPORT_FENCE} END -->`;

export function renderImportBlock() {
  return `${IMPORT_START}\n${IMPORT_BODY}\n${IMPORT_END}`;
}

const IMPORT_FENCE_RE = new RegExp(
  `<!-- ${IMPORT_FENCE} START[\\s\\S]*?<!-- ${IMPORT_FENCE} END -->`,
);

/**
 * Guarantee CLAUDE.md imports AGENTS.md. Idempotency is smarter than pure
 * fence-presence: if the user already wrote an `@AGENTS.md` import by hand
 * (anywhere outside a code block), we no-op rather than add a duplicate. Pure.
 */
export function ensureClaudeImport(content) {
  const block = renderImportBlock();
  if (content == null) {
    return { text: `${block}\n`, changed: true, action: 'created' };
  }
  const m = content.match(IMPORT_FENCE_RE);
  if (m) {
    if (eolEqual(m[0], block)) return { text: content, changed: false, action: 'current' };
    return { text: content.replace(IMPORT_FENCE_RE, block), changed: true, action: 'updated' };
  }
  if (importsAgentsOutsideCode(content)) {
    return { text: content, changed: false, action: 'user-import' };
  }
  return { text: appendBlock(content, block), changed: true, action: 'appended' };
}

// True if `@AGENTS.md` / `@./AGENTS.md` appears anywhere that Claude would treat
// as a real import — i.e. NOT inside a fenced code block or inline code span,
// where the `@` directive is left literal.
function importsAgentsOutsideCode(content) {
  const bare = stripInlineCode(stripFencedCode(content));
  return /@\.?\/?AGENTS\.md(?![\w./-])/.test(bare);
}

function stripFencedCode(md) {
  const lines = String(md).split(/\r?\n/);
  const out = [];
  let inFence = false;
  let mark = '';
  for (const line of lines) {
    const m = line.match(/^\s*(`{3,}|~{3,})/);
    if (m) {
      if (!inFence) { inFence = true; mark = m[1][0]; }
      else if (line.trimStart().startsWith(mark.repeat(3))) { inFence = false; }
      continue; // drop the fence line either way
    }
    if (!inFence) out.push(line);
  }
  return out.join('\n');
}

function stripInlineCode(md) {
  return String(md).replace(/`[^`\n]*`/g, '');
}

// Append `block` after existing content, separated by exactly one blank line and
// with a single trailing newline. Empty/whitespace-only content → just the block.
function appendBlock(content, block) {
  const base = String(content).replace(/\s*$/, '');
  return base ? `${base}\n\n${block}\n` : `${block}\n`;
}

// Equal ignoring line-ending style. The blocks we render use LF, but a memory
// file that has been through a CRLF checkout (git autocrlf on Windows) stores
// the fence with CRLF — without this the "is current" check would fail forever
// and rewrite the file every session (silent perpetual churn). CRLF is preserved
// on a match; we simply recognise it as current rather than normalising it.
function eolEqual(a, b) {
  return String(a).replace(/\r\n?/g, '\n') === String(b).replace(/\r\n?/g, '\n');
}

// ── fs orchestrator (fail-open) ──────────────────────────────────────────────

/**
 * Ensure the kernel is seeded in `projectRoot`. Only runs in sdlc-engaged repos
 * (those with `.ai/workflows/`) so the plugin never edits the memory files of an
 * unrelated repo it merely happens to be installed in. Returns a result describing
 * what changed; `notice` is a one-time user-facing message set only on the FIRST
 * insert into a repo (gated by the `.ai/.wf-rules-seeded` marker). Never throws.
 *
 * `deps.fs` is injectable for tests; defaults to node:fs.
 */
export function seedMemoryKernel(projectRoot, config = {}, deps = {}) {
  const fs = deps.fs ?? { existsSync, mkdirSync, readFileSync, writeFileSync };
  const result = { enabled: true, seeded: false, changed: false, firstInsert: false, targets: [], notice: null };
  try {
    if (config?.memory?.seedRules === false) { result.enabled = false; return result; }
    if (!fs.existsSync(join(projectRoot, '.ai', 'workflows'))) return result;

    const markerPath = join(projectRoot, '.ai', '.wf-rules-seeded');
    const markerExisted = fs.existsSync(markerPath);

    const agentsPath = join(projectRoot, 'AGENTS.md');
    const claudePath = join(projectRoot, 'CLAUDE.md');

    const agents = ensureAgentsKernel(readIf(fs, agentsPath));
    if (agents.changed) { fs.writeFileSync(agentsPath, agents.text, 'utf-8'); result.targets.push('AGENTS.md'); }

    const claude = ensureClaudeImport(readIf(fs, claudePath));
    if (claude.changed) { fs.writeFileSync(claudePath, claude.text, 'utf-8'); result.targets.push('CLAUDE.md'); }

    result.seeded = true;
    result.changed = agents.changed || claude.changed;

    // Marker gates the one-time notice — write it once we've ensured the seed so
    // subsequent sessions (incl. silent version bumps) never re-announce.
    if (!markerExisted) {
      try {
        fs.mkdirSync(join(projectRoot, '.ai'), { recursive: true });
        fs.writeFileSync(markerPath, `seeded ${nowIso()}\n`, 'utf-8');
      } catch { /* marker is best-effort; a failed write just re-announces next time */ }
      if (result.changed) {
        result.firstInsert = true;
        result.notice = buildNotice(result.targets);
      }
    }
    return result;
  } catch {
    return result; // fail-open — seeding must never break session start
  }
}

function readIf(fs, p) {
  try { return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null; } catch { return null; }
}

function nowIso() {
  try { return new Date().toISOString(); } catch { return ''; }
}

function buildNotice(targets) {
  const files = targets.length ? targets.join(' + ') : 'AGENTS.md';
  return (
    `sdlc-workflow seeded a \`/wf\` rules block into ${files} (AGENTS.md is canonical; CLAUDE.md imports it). ` +
    `The plugin owns only the fenced region — edit freely outside it, or set \`memory.seedRules: false\` in ` +
    `\`.ai/sdlc-config.json\` to disable.`
  );
}
