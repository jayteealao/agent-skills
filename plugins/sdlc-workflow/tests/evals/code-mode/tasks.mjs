// The tasks of the code-mode eval. Each task comes from one friction class of the agents, and
// two control tasks check that the library does not harm simple work. A `state` task is checked
// on the records at the end; an `answer` task is checked on the final answer of the agent.
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { decisionsOf, liveDecisions } from '../../../lib/decisions.mjs';
import { openDeferrals } from '../../../lib/deferrals.mjs';
import { INDEX_NAME, frontmatterOfDoc } from '../../../lib/records.mjs';
import { readSteps } from '../../../lib/steps.mjs';
import { existsSync, readFileSync } from 'node:fs';
import { readLedger } from '../../../lib/findings.mjs';
import { BOARD_ITEMS, FINDINGS, QUESTIONS, SLICES, SLUG, SUITE_MARKER, VERIFY } from './fixture.mjs';

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

  {
    id: 'three-reads', class: 'reads', kind: 'answer',
    prompt: `Report three facts of the workflow ${SLUG}: its current stage, the status of slice s4 in the slice roster, and the convergence of the verify record of slice s2. Change nothing.`,
    check: (f, answer) => {
      const t = String(answer ?? '').toLowerCase();
      const miss = ['implement', 'defined', 'escalated'].filter((w) => !t.includes(w));
      return result(!miss.length, miss.length ? `missing: ${miss.join(', ')}` : 'the three facts');
    },
  },
  {
    id: 'ten-findings', class: 'reads', kind: 'answer',
    prompt: `The workflow ${SLUG} has ten open findings. Give the ids of the findings of severity HIGH, and no other id. Change nothing.`,
    check: (f, answer) => {
      const want = FINDINGS.map((sev, n) => (sev === 'HIGH' ? `COR-${n + 1}` : null)).filter(Boolean);
      const named = [...new Set([...String(answer ?? '').matchAll(/\bCOR-(\d+)\b/g)].map((m) => `COR-${m[1]}`))];
      const miss = want.filter((id) => !named.includes(id));
      const extra = named.filter((id) => !want.includes(id));
      return result(!miss.length && !extra.length, `missing: ${miss.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`);
    },
  },
  {
    id: 'steps-loop', class: 'loop', kind: 'state',
    prompt: `Finish the steps of slice s3 of the workflow ${SLUG}. Step 3 is committed: its commit is HEAD. Steps 4 (Docs), 5 (Tests) and 6 (Cleanup) need no code change: start each one and record it as done with no change, in order.`,
    check: (f) => {
      const head = execFileSync('git', ['-C', f.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const rows = readSteps(f.dir).filter((r) => r.slice === 's3');
      const done = (n) => rows.find((r) => r.event === 'done' && r.step === n);
      const started = (n) => rows.some((r) => r.event === 'start' && r.step === n);
      const bad = [];
      if (done(3)?.sha !== head) bad.push('step 3 at HEAD');
      for (const n of [4, 5, 6]) if (!started(n) || !done(n)) bad.push(`step ${n}`);
      return result(!bad.length, bad.length ? `wrong: ${bad.join(', ')}` : 'steps 3 to 6');
    },
  },
  {
    id: 'held-question', class: 'hold', kind: 'state',
    prompt: `You are the implement stage of slice s3 of the workflow ${SLUG}, and you need the person to choose the retry limit. Hold the question "Which retry limit?" under the key retry-limit, with the options 3 and 5, and 3 recommended. Do not answer it, and do not wait for the answer.`,
    check: (f) => {
      const open = frontmatterOfDoc(f.dir, INDEX_NAME)?.['open-questions'] ?? [];
      const q = open.find((x) => x.key === 'retry-limit');
      const answered = live(f.dir).some((d) => d.key === 'retry-limit' && d.answer != null && String(d.answer).trim() !== '');
      return result(Boolean(q) && !answered, `held: ${JSON.stringify(q ?? null)}; answered: ${answered}`);
    },
  },
  {
    id: 'suite-run', class: 'job', kind: 'state',
    prompt: `Run the fast suite of the test profile of this repository, so that its real time is recorded in the profile.`,
    check: (f) => {
      const ran = existsSync(join(f.root, SUITE_MARKER));
      const fast = JSON.parse(readFileSync(join(f.root, '.ai', 'sdlc-config.json'), 'utf8')).testProfile?.fast ?? {};
      return result(ran && typeof fast.measuredSeconds === 'number', `ran: ${ran}; measured: ${fast.measuredSeconds ?? 'none'}`);
    },
  },
  {
    id: 'bulk-findings', class: 'bulk', kind: 'state',
    prompt: `The commit HEAD of this repository fixed the findings COR-1 to COR-6 of the workflow ${SLUG}. Mark those six as fixed with that commit, and leave the other four open.`,
    check: (f) => {
      const head = execFileSync('git', ['-C', f.root, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
      const by = Object.fromEntries(readLedger(f.dir).findings.map((x) => [x.id, x]));
      // A short sha of HEAD is the same commit.
      const atHead = (c) => typeof c === 'string' && c.length >= 7 && head.startsWith(c);
      const right = (id, n) => (n < 6 ? by[id]?.status === 'fixed' && atHead(by[id]?.commit) : by[id]?.status === 'open');
      const wrong = FINDINGS.map((_, n) => `COR-${n + 1}`).filter((id, n) => !right(id, n));
      return result(!wrong.length, `wrong: ${wrong.join(', ') || 'none'}`);
    },
  },
];

export const BULK = new Set(TASKS.filter((t) => t.class !== 'control').map((t) => t.id));
