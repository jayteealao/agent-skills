// WF-CAMPAIGN-PLAN section 10 and 17.4 — what yolo does under /wf campaign. Every
// agent that reads steering also reads the context file fresh, by path; breaking a
// campaign contract line is intent-bearing (class 6); the review adds a
// campaign-contract scout; the stop check reads the campaign's control file too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const pluginRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const src = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'workflows', 'yolo.js'), 'utf8');
const classes = readFileSync(path.join(pluginRoot, 'skills', 'wf', 'reference', '_decision-classes.md'), 'utf8');

function extractFn(name) {
  const m = new RegExp(`function\\s+${name}\\s*\\(`).exec(src);
  assert.ok(m, `no function ${name}`);
  let paren = 0;
  let at = m.index + m[0].length - 1;
  for (; at < src.length; at++) { if (src[at] === '(') paren++; else if (src[at] === ')' && --paren === 0) break; }
  let depth = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) {
    if (src[j] === '{') depth++;
    else if (src[j] === '}' && --depth === 0) return src.slice(m.index, j + 1);
  }
  throw new Error(name);
}

const campaignClause = new Function('referenceRoot', `${extractFn('campaignClause')}; return campaignClause`)('/ref');
const stopCheckClause = new Function(`${extractFn('stopCheckClause')}; return stopCheckClause`)();

test('outside a campaign, no agent gets a campaign clause', () => {
  assert.equal(campaignClause(null, 'writer'), '');
});

test('a writer reads the context file fresh and stops on a contract line', () => {
  const c = campaignClause('/r/.ai/workflows/b/work/campaign/context/engine.md', 'writer');
  assert.match(c, /context file is \/r\/\.ai\/workflows\/b\/work\/campaign\/context\/engine\.md\. Read that file NOW, in full/);
  assert.match(c, /never from a copy/);
  assert.match(c, /"3\. Succeeding slugs" as a Known Constraint/);
  assert.match(c, /intent-bearing\s+\(class 6 in \/ref\/_decision-classes\.md, "changes a campaign contract line"\)/);
  assert.match(c, /build on the as-built\s+line, not on the packet/);
  assert.match(campaignClause('/c.md', 'classify'), /'intent-bearing' \(class 6\)/);
  assert.match(campaignClause('/c.md', 'refute'), /refuted only when the diff meets that line/);
  assert.match(campaignClause('/c.md', 'scout'), /Never recommend or take an action that breaks a succeeding expects line/);
});

test('the clause rides on every steering clause, so every agent that reads steer.md reads the context', () => {
  assert.match(src, /const steer = \(role\) => steeringClause\(STEER_PATH, role, `\$\{referenceRoot\}\/_steering\.md`\) \+ campaignClause\(CONTEXT_PATH, role\)/);
  assert.match(src, /const CONTEXT_PATH = OPT\.contextPath/);
});

test('class 6 is in the single source of decision classes', () => {
  assert.match(classes, /6\. \*\*Changes a campaign contract line\*\*/);
  assert.doesNotMatch(src, /five tests/, 'the classifier counts six tests');
});

test('the review adds a campaign-contract scout only under a campaign', () => {
  const review = extractFn('driveReview');
  assert.match(review, /const contractScout = CONTEXT_PATH/);
  assert.match(review, /label: 'scout:campaign-contract'/);
  assert.match(review, /\[\.\.\.scouts, steeringScout, contractScout\]/);
  assert.match(review, /a later slice can still meet it/, 'a per-slice review reports only a contradiction');
});

test('the stop check reads the campaign control file and keeps wave requests for the campaign session', () => {
  const own = stopCheckClause('/r/s/.control.json', '/r/s/.driver-journal.jsonl');
  assert.doesNotMatch(own, /scope/, 'a plain yolo run reads only its own control file');
  const c = stopCheckClause('/r/s/.control.json', '/r/s/.driver-journal.jsonl', '/r/b/work/campaign/.control.json', 'engine');
  assert.match(c, /Then read \/r\/b\/work\/campaign\/\.control\.json the same way/);
  assert.match(c, /"scope"\s+is "campaign", or when its "scope" is "slug" and its "slug" is "engine"/);
  assert.match(c, /"scope" "wave"\s+is for the campaign session: ignore it here/);
  assert.match(c, /A request in\s+that file always applies/);
});
