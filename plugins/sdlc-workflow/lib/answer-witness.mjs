// An entry by the person that the host's question tool proves. The PostToolUse hook of
// AskUserQuestion (request_user_input on Codex) logs each answer of the person in answers.jsonl
// (lib/answers.mjs). A wf_decide call of the main session that records such an answer, with the
// question that was asked and the option the person picked, needs no second ask: the host already
// asked the person. wf_person stays for what the log cannot prove: an answer typed in the chat, a
// steer, an approval.
import { norm, readAnswerEvents } from './answers.mjs';

export const WITNESS_MS = 12 * 60 * 60_000;

const fold = (s) => norm(s).toLowerCase().replace(/[?.!:\s]+$/, '');

/** The entries of a decide add call, from `entries` (a list or its JSON text) or the single form. */
export function entriesOf(args) {
  let list = args?.entries;
  if (typeof list === 'string') { try { list = JSON.parse(list); } catch { return null; } }
  if (Array.isArray(list)) return list;
  if (list && typeof list === 'object') return [list];
  return [{ kind: args?.kind, key: args?.key, question: args?.question, answer: args?.answer, by: args?.by }];
}

/** Whether one logged answer is the answer of an entry: the same question, and the entry's answer starts with or holds the option. */
function matches(entry, q) {
  if (fold(entry.question) !== fold(q.question)) return false;
  const want = fold(entry.answer);
  const got = fold(q.answer);
  if (!want || !got) return false;
  return want === got || want.startsWith(got) || want.includes(got) || got.includes(want);
}

/**
 * Whether every entry by the person in a decide add call is an answer that this session's question
 * tool logged in the last 12 hours. False when no entry is by the person, when one is a steer or an
 * approval, or when one has no logged answer.
 */
export function witnessed(root, args, { session = null, now = Date.now(), events = null } = {}) {
  const list = entriesOf(args);
  if (!list || !list.length) return false;
  const person = list.filter((e) => e?.by === 'person');
  if (!person.length) return false;
  if (person.some((e) => e.kind && e.kind !== 'answer')) return false;
  const log = (events ?? readAnswerEvents(root)).filter((ev) => {
    const at = Date.parse(ev.at);
    if (!(at <= now && now - at <= WITNESS_MS)) return false;
    return !session || !ev.session || ev.session === session;
  });
  return person.every((e) => log.some((ev) => (ev.questions ?? []).some((q) => matches(e, q))));
}
