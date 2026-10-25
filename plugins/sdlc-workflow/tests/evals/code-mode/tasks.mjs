// The tasks of the code-mode eval. Each task comes from one friction class of the agents, and
// two control tasks check that the library does not harm simple work. A `state` task is checked
// on the records at the end; an `answer` task is checked on the final answer of the agent.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { decisionsOf, liveDecisions } from '../../../lib/decisions.mjs';
import { openDeferrals } from '../../../lib/deferrals.mjs';
import { INDEX_NAME, frontmatterOfDoc } from '../../../lib/records.mjs';
import { readSteps } from '../../../lib/steps.mjs';
import { readFileSync } from 'node:fs';
import { BOARD_ITEMS, QUESTIONS, SLICES, SLUG, VERIFY } from './fixture.mjs';

const roster = (dir) => Object.fromEntries((frontmatterOfDoc(dir, '03-slice.md')?.slices ?? []).map((s) => [s.slug, s]));
const live = (dir) => liveDecisions(decisionsOf(dir), {});
const result = (pass, why) => ({ pass, why });

export const TASKS = [
  {
    id: 'verify-report', class: 'AE3', kind: 'answer',
    prompt: `Report the verify result and the convergence of every slice of the workflow ${SLUG}. Give one line for each slice, in the form "<slice>: <result> <convergence>", and "<slice>: none" for a slice with no verify record.`,
    check: (f, answer) => {
      const text = String(answer ?? '');
      const miss = SLICES.filter((s) => {
        const line = text.split(/\r?\n/).find((l) => new RegExp(`\\b${s}\\b`).test(l)) ?? '';
        return VERIFY[s] ? !VERIFY[s].every((w) => line.includes(w)) : !/none|no verify|not verified|missing/i.test(line);
      });
      return result(!miss.length, miss.length ? `wrong or missing lines: ${miss.join(', ')}` : 'every slice');
    },
  },
  {
    id: 'three-slices', class: 'AE1', kind: 'state',
    prompt: `In the workflow ${SLUG}, set the slices s4, s5 and s6 to in-progress in the slice roster. Then add one open deferral for slice s6: its acceptance criterion AC-2 waits for the payment API sandbox.`,
    check: (f) => {
      const r = roster(f.dir);
      const wrong = ['s4', 's5', 's6'].filter((s) => r[s]?.status !== 'in-progress');
      const kept = ['s1', 's2', 's3'].every((s) => r[s]?.status === ({ s3: 'in-progress' }[s] ?? 'complete'));
      const d = openDeferrals(f.dir).filter((x) => x.slice === 's6');
      return result(!wrong.length && kept && d.length === 1, `roster wrong: ${wrong.join(', ') || 'none'}; others kept: ${kept}; deferrals for s6: ${d.length}`);
    },
  },
  {
    id: 'five-answers', class: 'AE11', kind: 'state',
    prompt: `The person answered the five open questions of the workflow ${SLUG}: ${QUESTIONS.map(([k, q, a]) => `${k} "${q}" → ${a}`).join('; ')}. Record the five answers, by the person, and clear the open questions.`,
    check: (f) => {
      const l = live(f.dir);
      const wrong = QUESTIONS.filter(([k, , a]) => !l.some((d) => d.key === k && String(d.answer).toLowerCase() === a));
      const open = frontmatterOfDoc(f.dir, INDEX_NAME)?.['open-questions'] ?? [];
      return result(!wrong.length && !open.length, `answers wrong: ${wrong.map(([k]) => k).join(', ') || 'none'}; open questions left: ${open.length}`);
    },
  },
  {
    id: 'drop-slice', class: 'AE7', kind: 'state',
    prompt: `Drop the slice s5 of the workflow ${SLUG}. The reason: merged into s4.`,
    check: (f) => {
      const s = roster(f.dir).s5;
      return result(s?.status === 'dropped' && /merged/i.test(String(s?.['drop-reason'] ?? '')), `s5: ${JSON.stringify(s ?? null)}`);
    },
  },
  {
    id: 'board-group', class: 'AE12', kind: 'state',
    prompt: `On the brainstorm board of the workflow ${SLUG}, move the four items ${BOARD_ITEMS.join(', ')} into a new thread with the key sync and the name "Sync engine".`,
    check: (f) => {
      const board = JSON.parse(readFileSync(join(f.dir, 'brainstorm-board.json'), 'utf8'));
      const t = board.threads.find((x) => x.key === 'sync');
      const moved = BOARD_ITEMS.filter((k) => board.items.find((i) => i.key === k)?.thread === 'sync');
      return result(t?.name === 'Sync engine' && moved.length === 4, `thread: ${JSON.stringify(t ?? null)}; moved: ${moved.length}`);
    },
  },
  {
    id: 'after-stop', class: 'AE4', kind: 'answer',
    prompt: `A run of the workflow ${SLUG} stopped. Say the stage, the slice, the step where it stopped, and why it stopped. Change nothing.`,
    check: (f, answer) => {
      const t = String(answer ?? '').toLowerCase();
      const need = ['implement', 's3', 'step 3', 'question'];
      const miss = need.filter((w) => !t.includes(w));
      return result(!miss.length, miss.length ? `missing: ${miss.join(', ')}` : 'stage, slice, step and reason');
    },
  },
  {
    id: 'one-decision', class: 'control', kind: 'state',
    prompt: `Record one decision in the workflow ${SLUG}: the key cache, the question "Which cache?", the answer redis, by the person.`,
    check: (f) => {
      const d = live(f.dir).find((x) => x.key === 'cache');
      return result(String(d?.answer ?? '').toLowerCase() === 'redis', `cache: ${JSON.stringify(d ?? null)}`);
    },
  },
  {
    id: 'step-done', class: 'control', kind: 'state',
    prompt: `Step 3 of slice s3 of the workflow ${SLUG} is committed: its commit is HEAD. Record the step as done.`,
    check: (f) => {
      const head = execFileSync('git', ['-C', f.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const row = readSteps(f.dir).filter((r) => r.slice === 's3').at(-1);
      return result(row?.event === 'done' && row.step === 3 && row.sha === head, `last row: ${JSON.stringify(row ?? null)}`);
    },
  },
];

export const BULK = new Set(TASKS.filter((t) => t.class !== 'control').map((t) => t.id));
