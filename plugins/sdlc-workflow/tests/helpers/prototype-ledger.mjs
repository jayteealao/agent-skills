// A well-formed prototype ledger, shared by the lib test and the hook test.
import { newLedger } from '../../lib/prototype.mjs';

export function proof(id, round, over = {}) {
  return {
    id, round, question: `Does ${id} hold?`, setup: { seeds: [1] },
    evidence: { measured: [{ name: 'time', value: 3.2, unit: 's' }], estimated: [{ name: 'cost', value: 0.02, unit: 'USD', basis: 'the GPU price list' }] },
    repro: { 'same-process': 'pass', 'fresh-process': 'pass' }, verdict: 'pass', licenses: [{ item: 'model A', license: 'MIT' }], files: [`poc/${id}.py`], ...over,
  };
}

export function ledger() {
  const l = newLedger({ slug: 'faces', idea: 'Can a fitted head model give believable faces?', branch: 'poc/faces', baseBranch: 'main', worktree: 'C:/w', at: '2026-10-18T10:00:00Z' });
  l.rounds.push({ id: 'R-01', kind: 'prove', request: 'Prove out all steps', question: 'Do the stages work?', proofs: ['P-01', 'P-02'] });
  l.proofs.push(proof('P-01', 'R-01'), proof('P-02', 'R-01', { verdict: 'unresolved', files: ['poc/aging.py', '.scratch/prototype/tmp.png'] }));
  l.rounds.push({ id: 'R-02', kind: 'generalize', request: 'Different identity, no manual input from you', question: 'Does stage 1 hold on a held-out input?', proofs: ['P-03'] });
  l.proofs.push(proof('P-03', 'R-02'));
  l.rounds.push({ id: 'R-03', kind: 'decide', request: 'Really happy with stage 1', question: 'Accept stage 1?', files: ['poc/config.json'] });
  l.decisions.push({ id: 'D-01', round: 'R-03', component: 'the stage 1 fit', proofs: ['P-01'], generalized: true, 'generalize-proof': 'P-03', words: 'Really happy with stage 1' });
  l.pipeline.push({ stage: 'Fit', component: 'the stage 1 fit', decision: 'D-01', settings: 'strength 0.6', time: { value: 3.2, unit: 's', kind: 'measured' }, cost: { value: 0.02, unit: 'USD', kind: 'estimated' } });
  return l;
}
