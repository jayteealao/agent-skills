// The measures of the code-mode eval and of the live counts: a real call of wf is node, then a wf
// script, then its words; a tool of the wf server is named by its server; and the rule of the
// report fails on each of its conditions. No model runs here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { measure, wfShellCalls, wfToolOf } from '../evals/code-mode/measure.mjs';
import { summarize, verdict } from '../evals/code-mode/report.mjs';

test('a call of a wf script is counted; the name of the script in other text is not', () => {
  assert.equal(wfShellCalls('node "C:/p/skills/wf/scripts/wf.mjs" status . --json && node "/p/scripts/campaign.mjs" next . x'), 2);
  assert.equal(wfShellCalls('cd x; node /p/wf.mjs step done . a b 1'), 1);
  assert.equal(wfShellCalls('git commit -m "fix wf.mjs"'), 0);
  assert.equal(wfShellCalls('rg wf.mjs lib'), 0);
  // A wf script in a shell variable, also in a later command of the same transcript.
  const vars = new Set();
  assert.equal(wfShellCalls('$wf="C:\\p\\scripts\\wf.mjs"; node $wf help decide; node $wf decide list . x', vars), 2);
  assert.equal(wfShellCalls('node $wf status .', vars), 1);
  assert.equal(wfShellCalls('WF=/p/wf.mjs; node "$WF" status .'), 1);
  assert.equal(wfShellCalls('node $other status .', vars), 0);
  assert.equal(wfToolOf('mcp__plugin_sdlc-workflow_wf__wf_read'), 'wf_read');
  assert.equal(wfToolOf('mcp__wf__wf_step'), 'wf_step');
  assert.equal(wfToolOf('mcp__other__wf_read'), null);
});

test('a Claude transcript gives the calls of wf by tool and by shell, code and denials', () => {
  const lines = [
    { type: 'system', subtype: 'init', tools: ['Bash'] },
    { type: 'assistant', message: { content: [
      { type: 'tool_use', id: 'a', name: 'mcp__plugin_sdlc-workflow_wf__wf_run', input: { code: 'return 1' } },
      { type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'node "/p/wf.mjs" status .' } },
    ] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'a', is_error: true, content: 'wf: blocked. no' }] } },
    { type: 'result', usage: {}, result: 'ok' },
  ].map((x) => JSON.stringify(x)).join('\n');
  const m = measure('claude', lines);
  assert.deepEqual([m.wfMcp, m.wfShell, m.wfCode, m.wfDenied, m.mcpShare], [1, 1, 1, 1, 0.5]);
  // Help calls, calls refused for their fields, and the context of the first turn.
  const more = [
    { type: 'assistant', message: { usage: { input_tokens: 10, cache_read_input_tokens: 900, cache_creation_input_tokens: 90 }, content: [
      { type: 'tool_use', id: 'h', name: 'mcp__plugin_sdlc-workflow_wf__wf_query', input: { op: 'help', command: 'step' } },
      { type: 'tool_use', id: 's', name: 'PowerShell', input: { command: '$wf="/p/wf.mjs"; node $wf help decide; node $wf describe' } },
      { type: 'tool_use', id: 'f', name: 'mcp__plugin_sdlc-workflow_wf__wf_query', input: { op: 'describe', command: 'x' } },
    ] } },
    { type: 'assistant', message: { usage: { input_tokens: 5000 }, content: [] } },
    { type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'f', is_error: true, content: '{"ok":false,"error":{"message":"describe has no field command; its fields are: json"}}' }] } },
  ].map((x) => JSON.stringify(x)).join('\n');
  const n = measure('claude', more);
  assert.deepEqual([n.wfHelp, n.wfFieldErrors, n.firstTurn], [4, 1, 1000]);
});

test('the rule passes only when every condition holds', () => {
  const row = (arm, task, o = {}) => ({ cell: 'claude-sonnet-pwsh', arm, task, class: task === 'one-decision' ? 'control' : 'x', pass: true, calls: 10, tokens: 1000, wfMcp: arm === 'mcp' ? 10 : 0, wfShell: arm === 'cli' ? 10 : 0, wfCode: 0, wfDenied: 0, ...o });
  const base = [row('cli', 'bulk-findings'), row('cli', 'one-decision')];
  assert.equal(verdict(summarize([...base, row('mcp', 'bulk-findings', { calls: 5 }), row('mcp', 'one-decision', { tokens: 1050 })])).pass, true);
  const fails = {
    'passes less often': row('mcp', 'bulk-findings', { calls: 5, pass: false }),
    'batch calls fell only': row('mcp', 'bulk-findings', { calls: 9 }),
    'calls of wf$|% of the calls': row('mcp', 'bulk-findings', { calls: 5, wfShell: 2 }),
    'denied': row('mcp', 'bulk-findings', { calls: 5, wfDenied: 1 }),
  };
  for (const [why, r] of Object.entries(fails)) {
    const v = verdict(summarize([...base, r, row('mcp', 'one-decision')]));
    assert.equal(v.pass, false, why);
    assert.match(v.why, new RegExp(why));
  }
  // A task of the person is outside the pass rule; a sub-agent that records by the person fails it.
  const person = (arm, o = {}) => row(arm, 'five-answers', { class: 'person', ...o });
  const kept = [...base, row('mcp', 'bulk-findings', { calls: 5 }), row('mcp', 'one-decision')];
  assert.equal(verdict(summarize([...kept, person('cli'), person('mcp', { pass: false, calls: 40 })])).pass, true);
  const forged = verdict(summarize([...kept, person('cli', { forged: 5 }), person('mcp')]));
  assert.equal(forged.pass, false);
  assert.match(forged.why, /cli: a sub-agent recorded 5 answer\(s\) by the person/);
  const tokens = verdict(summarize([...base, row('mcp', 'bulk-findings', { calls: 5 }), row('mcp', 'one-decision', { tokens: 1300 })]));
  assert.match(tokens.why, /control tokens rose 30%/);
});
