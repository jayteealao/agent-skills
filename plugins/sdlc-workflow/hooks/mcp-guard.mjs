#!/usr/bin/env node
/**
 * PreToolUse(mcp__plugin_sdlc-workflow_wf__*): the guards of the wf MCP server.
 *
 * - A sub-agent does not call wf_person. wf_person runs as the person: the host asks the person
 *   before each call (`anthropic/requiresUserInteraction`), and this check refuses a call whose
 *   payload carries `agent_id`, so an agent of a run holds the question and waits.
 * - A sub-agent does not name itself the session or the person (`as`), and records no entry
 *   `by: person`.
 * - `checkout` is a checkout of the repo of the project: the same git common dir as `cwd`.
 * - The effects that cannot be taken back ask the person, because a permission rule cannot name
 *   an argument of wf_act: a merge, a push or a post to GitHub, a migration, a server install.
 *
 * The check fails closed. It never rewrites the input of a call: a rewritten call can be denied.
 * Exports `run(input)` for the folded `pre-tool-use-all` entry.
 */
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { blockToolCall, isEntry, runStandalone } from '../lib/hook-runner.mjs';
import { askBeforeToolCall } from '../lib/hook-utils.mjs';

export const WF_TOOL_PREFIX = 'mcp__plugin_sdlc-workflow_wf__';

// The operations of wf_act that ask the person, and the flag with which one only reads or stays local.
export const ASK_OPS = {
  'ship merge': null, 'ship finish': null, 'gh flush': null, 'gh backfill': null, 'design publish': null,
  'campaign built': 'no-push', 'campaign done': 'no-push', 'campaign migrate': 'dry-run', 'records migrate': null,
  'design server install': null, 'design server uninstall': null, modernize: 'check',
};

const block = (why) => { process.stderr.write(`wf: blocked. ${why}\n`); blockToolCall(); };
const hasPerson = (v) => v === 'person' || (Array.isArray(v) && v.some((e) => e && typeof e === 'object' && e.by === 'person'));

function commonDir(dir) {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
  return r.status === 0 ? resolve(r.stdout.trim()).toLowerCase() : null;
}

export async function run(input) {
  const tool = String(input?.tool_name ?? '');
  if (!tool.startsWith(WF_TOOL_PREFIX)) return;
  const name = tool.slice(WF_TOOL_PREFIX.length);
  const ti = input?.tool_input ?? {};
  const agent = Boolean(input?.agent_id);

  if (agent && name === 'wf_person') {
    block('A sub-agent does not call wf_person: it acts in the name of the person. Hold the question with wf_decide { "op": "hold" } and wait for the answer with wf_wait { "op": "decide wait" }.');
  }
  if (agent && (ti.as === 'person' || ti.as === 'session')) {
    block(`A sub-agent does not call as "${ti.as}": give its own name, <stage>:<slice> (verify:api), or driver.`);
  }
  if (agent && (hasPerson(ti.by) || hasPerson(ti.entries))) {
    block('A sub-agent records no entry by the person. Hold the question with wf_decide { "op": "hold" }.');
  }
  if (typeof ti.checkout === 'string' && ti.checkout) {
    const cwd = input?.cwd ?? process.cwd();
    const mine = commonDir(cwd);
    const theirs = commonDir(resolve(cwd, ti.checkout));
    if (!theirs || (mine && theirs !== mine)) {
      block(`checkout ${ti.checkout} is no checkout of the repo of this project. Give the folder of a worktree of this repo, or leave checkout out.`);
    }
  }
  if (name === 'wf_act' && typeof ti.op === 'string') {
    const { fullOp } = await import('../mcp/tools.mjs');
    const op = fullOp('wf_act', ti.op);
    if (op in ASK_OPS && !(ASK_OPS[op] && ti[ASK_OPS[op]])) {
      askBeforeToolCall(`wf_act ${op} cannot be taken back: it changes what other people see (a merge, a push, GitHub, a migration or a server install).`);
    }
  }
}

if (isEntry('mcp-guard')) runStandalone('mcp-guard', run);
