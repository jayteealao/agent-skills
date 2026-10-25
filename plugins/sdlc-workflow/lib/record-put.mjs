// The put of one draft with the checks that span records: a plan draft must give the step
// record steps that it can read. `wf.mjs record put` and the wf library both put through here.
import { basename } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { safeParseFrontmatter } from './frontmatter.mjs';
import { putDraft } from './records.mjs';
import { planProblems } from './steps.mjs';

const PLAN_DRAFT = /^04-plan(-[^.]+)?\.md$/;

/** The refusals of a draft that `putDraft` does not check, each naming its line; [] when none. */
export function draftProblems(path) {
  const name = basename(path);
  if (!PLAN_DRAFT.test(name) || !existsSync(path)) return [];
  const text = readFileSync(path, 'utf8');
  if (safeParseFrontmatter(text, { filePath: path }).parseError) return [];
  // The whole file, so that each problem names the line of the draft.
  return planProblems(text).map((p) => `the plan: ${p}`);
}

/** Put one draft: the cross-record checks first, then the checks and the write of `putDraft`. */
export function putChecked(dir, path) {
  const problems = draftProblems(path);
  if (problems.length) return { name: basename(path), file: null, section: null, errors: problems };
  return putDraft(dir, path);
}
