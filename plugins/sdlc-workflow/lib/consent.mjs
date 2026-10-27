// The consent that lets the model start /wf for a workflow or a list.
//
// The person gives it once, as an answer to the host question tool. The hook writes the answer
// event to answers.jsonl (lib/answers.mjs), and `grantConsent` writes the consent into the index
// only when that event exists and its answer is a yes. A work packet workflow also runs under
// the consent of its list: the workflow that holds the packet file.
import { findAnswer, norm } from './answers.mjs';
import { INDEX_NAME, frontmatterOfDoc, setFields } from './records.mjs';
import { workflowDir } from './records-root.mjs';

export const CONSENT_FIELD = 'model-invocation';

/** The question that the person answers. */
export const consentQuestion = (slug) => `May I start the next steps of ${slug} on my own, without a /wf command from you each time?`;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Whether a question asks the consent for `slug`: after `norm()`, it holds the words "start the
 * next steps" and the slug as a whole word. A question with added words still counts; a question
 * about another slug, or one without those words, does not.
 */
export function isConsentQuestion(text, slug) {
  const t = norm(text).toLowerCase();
  if (!t.includes('start the next steps')) return false;
  return new RegExp(`(?:^|[^a-z0-9_-])${escapeRe(String(slug).toLowerCase())}(?:$|[^a-z0-9_-])`).test(t);
}

/** The list workflow of a work packet workflow, from its `origin-packet` path, or null. */
export function listOf(index) {
  const m = /(?:^|\/)([^/]+)\/work\/[^/]+\.md$/.exec(String(index?.['origin-packet'] ?? '').replace(/\\/g, '/'));
  return m ? m[1] : null;
}

const granted = (index) => {
  const c = index?.[CONSENT_FIELD];
  return c && typeof c === 'object' && c.granted === true ? c : null;
};

/**
 * Whether the model may start /wf for `slug`: `{ ok, via, consent }`. `via` is the slug whose
 * consent counts: the workflow itself, or its list.
 */
export function checkConsent(projectRoot, slug) {
  const index = frontmatterOfDoc(workflowDir(projectRoot, slug), INDEX_NAME);
  if (!index) return { ok: false, via: null, consent: null, reason: `no workflow ${slug}` };
  const own = granted(index);
  if (own) return { ok: true, via: slug, consent: own };
  const list = listOf(index);
  const of = list ? granted(frontmatterOfDoc(workflowDir(projectRoot, list), INDEX_NAME)) : null;
  if (of) return { ok: true, via: list, consent: of };
  return { ok: false, via: null, consent: null, reason: 'no consent recorded', question: consentQuestion(list ?? slug), for: list ?? slug };
}

/**
 * Record the consent of the person for `slug`, from the newest answer event to the consent
 * question. Without that event, or with an answer that is not a yes, nothing is written.
 */
export function grantConsent(projectRoot, slug, { since = null, now = new Date() } = {}) {
  const dir = workflowDir(projectRoot, slug);
  if (!frontmatterOfDoc(dir, INDEX_NAME)) return { ok: false, reason: `no workflow ${slug}` };
  const question = consentQuestion(slug);
  const answer = findAnswer(projectRoot, (text) => isConsentQuestion(text, slug), { since });
  if (!answer) return { ok: false, reason: 'no answer event for the consent question', question };
  if (!/^\s*yes\b/i.test(answer.answer)) return { ok: false, reason: `the person answered: ${answer.answer}`, question };
  const consent = { granted: true, by: 'person', at: now.toISOString().replace(/\.\d{3}Z$/, 'Z'), answer: answer.answer, 'answered-at': answer.at, host: answer.host };
  setFields(dir, INDEX_NAME, { [CONSENT_FIELD]: consent });
  return { ok: true, consent };
}

/** Withdraw the consent of `slug`. */
export function revokeConsent(projectRoot, slug) {
  const dir = workflowDir(projectRoot, slug);
  if (!frontmatterOfDoc(dir, INDEX_NAME)) return { ok: false, reason: `no workflow ${slug}` };
  setFields(dir, INDEX_NAME, { [CONSENT_FIELD]: null });
  return { ok: true };
}
