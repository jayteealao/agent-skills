// The answer events of the host question tool, as a log that a hook writes.
//
// A host hook sees each answer event: Claude Code's PostToolUse on AskUserQuestion, pi's
// tool_result on ask_user_question (the bridge sends it in Claude Code's shape), and Codex's
// PostToolUse on request_user_input. The hook appends one line per event to answers.jsonl in
// the local records folder of the project: the answers of a session stay on its machine. A script that must know what the person answered (the
// model-invocation consent, a confirmed design direction) reads the log, never the agent's word.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { localWorkflowsRoot } from './records-root.mjs';

export const ANSWERS_FILE = 'answers.jsonl';

export const answersPath = (projectRoot) => join(localWorkflowsRoot(projectRoot), ANSWERS_FILE);

const text = (v) => (Array.isArray(v) ? v.map(text).filter(Boolean).join(', ') : v == null ? '' : String(v));

function jsonOf(v) {
  if (typeof v !== 'string') return v;
  try { return JSON.parse(v); } catch { return v; }
}

/**
 * One hook payload → `{ tool, questions: [{ question, header, answer }] }`, or null when the
 * payload is not an answer event. A question that has no answer is left out.
 */
export function answerEventOf(payload) {
  const tool = payload?.tool_name ?? payload?.toolName;
  if (tool !== 'AskUserQuestion' && tool !== 'request_user_input') return null;
  const input = jsonOf(payload.tool_input ?? payload.toolInput) ?? {};
  const response = jsonOf(payload.tool_response ?? payload.toolResponse) ?? {};
  const asked = Array.isArray(input.questions) ? input.questions : [];
  const answers = jsonOf(response.answers) ?? {};
  const questions = [];
  for (const q of asked) {
    const question = text(q?.question);
    if (!question) continue;
    // Claude Code keys the answer by the question text; Codex keys it by the question id.
    let a = answers[question];
    if (a === undefined && q.id != null) a = answers[q.id];
    if (a && typeof a === 'object' && !Array.isArray(a)) a = a.answers ?? a.answer ?? a.selected;
    const answer = text(a);
    if (answer) questions.push({ question, header: text(q.header) || null, answer });
  }
  return questions.length ? { tool, questions } : null;
}

/** Append one answer event. The log is written only in a project that has a records folder. */
export function appendAnswerEvent(projectRoot, event, { host = null, session = null, now = new Date() } = {}) {
  const root = localWorkflowsRoot(projectRoot);
  if (!existsSync(root)) return false;
  mkdirSync(root, { recursive: true });
  const row = { at: now.toISOString(), host, session, tool: event.tool, questions: event.questions };
  appendFileSync(join(root, ANSWERS_FILE), `${JSON.stringify(row)}\n`);
  return true;
}

/** Every answer event of the project, oldest first. A line that does not parse is skipped. */
export function readAnswerEvents(projectRoot) {
  const file = answersPath(projectRoot);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

export const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * The newest answer to a question, or null. `question` is the exact text (white space aside),
 * or a function that takes the normalized text of a question and says whether it matches. With
 * `since`, an older event does not count.
 */
export function findAnswer(projectRoot, question, { since = null } = {}) {
  const want = typeof question === 'function' ? null : norm(question);
  const matches = typeof question === 'function' ? question : (text) => text === want;
  const after = since ? Date.parse(since) : null;
  for (const ev of readAnswerEvents(projectRoot).reverse()) {
    if (after != null && Date.parse(ev.at) < after) continue;
    const hit = (ev.questions ?? []).find((q) => matches(norm(q.question)));
    if (hit) return { at: ev.at, host: ev.host ?? null, session: ev.session ?? null, ...hit };
  }
  return null;
}
