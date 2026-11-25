// The registry: which tool of the wf MCP server runs each operation of wf.mjs, and what the
// operation does. Tools follow the effect, because a permission applies to a whole tool:
//
//   wf_context  where the work stands, and what to do next (read)
//   wf_read     records, decisions, findings and messages (read)
//   wf_query    every other read, and read-only code
//   wf_run      writes of the records of this computer, and code that writes them
//   wf_step     the steps of a slice
//   wf_decide   answers, holds and the decisions of a stage
//   wf_wait     a wait for an answer, a message, a job or the next event of a run
//   wf_job      a long run: a suite, a check, a drive, a job
//   wf_act      effects outside the records: git, GitHub, servers, the records repo, setup
//   wf_person   what only the person does: consent, approvals, rules, standing answers
//
// `read` names the flag with which a writing operation only reads (`index --check`): a read tool
// runs it only with that flag. A test holds every operation of wf.mjs to one row.
import { allOps } from './forms.mjs';

const ROWS = {
  wf_context: 'dispatch | brief | requires | status',
  wf_read: 'record get | record list | record where | decide list | decide answered | findings list | findings table | findings metrics | talk read | talk list | msg list | msg read | inbox | design comments | step where',
  wf_query: `help | describe | skill-dir | target | cost | stamp | doctor | base check | slice-files | ship facts | defer check | progress show
    | profile show | profile timebox | profile hooks | consent check | standing suggest | standing list | standing check
    | rule list | rule candidates | records status | lease show | board digest | page brief | page check | gh status | talk resources | talk jobs
    | design next | design status | design doctor | design list | design tokens | design components | design versions | design approved
    | design state | design refs check | design capture-path | design server status | design server url | record evidence`,
  wf_run: `record put | record draft | record edit | record set | record stage-done | record migrate | findings add | findings set
    | board add | board apply | board set | board prose | board render | board adopt | board move | board regroup | board remove
    | slice drop | slice move | progress set | talk post | talk reply | talk close | talk ping | talk claim | talk release | msg post
    | page put | profile set | profile record | profile budget | index
    | design init | design foundation | design component add | design component link | design component remove | design component spec
    | design components scan | design components none | design components verify | design screen add | design screen remove | design screen rename
    | design explore add | design tokens import | design track | design review-done | design round | design restore | design rounds drop
    | design viewports | design areas | design refs add | design comments reply | design comments add | design migrate`,
  wf_step: 'step start | step done | step check | step stop | step retry | step complete',
  wf_decide: 'decide add | decide hold | decide drop | decide end | decide tidy | decide import',
  wf_wait: 'decide wait | talk wait | progress watch',
  wf_job: 'drive | profile run | receipt | talk job | design check | design captures | design review-pack',
  wf_act: `records link | records sync | records push | records close | records retry | records dismiss | records migrate
    | lease claim | lease release | lease decline | gh flush | gh backfill | setup | modernize | close | ship ready | ship merge | ship finish
    | worktree add | worktree remove | design publish | design server start | design server stop | design server install | design server uninstall`,
  wf_person: 'consent grant | consent revoke | rule add | rule end | rule adopt | standing set | standing clear | standing decline | design approve | design waive',
};

// The flag with which an operation that writes only reads, so a read tool may run it.
const READ_WITH = { index: 'check', 'record evidence': null, 'design track': 'check', 'design migrate': 'check', 'board render': 'check', receipt: 'check', modernize: 'check', 'decide tidy': null };

// Removed: code goes to wf_query and wf_run.
const NO_TOOL = new Set(['run']);

export const TOOLS = Object.keys(ROWS);
export const READ_TOOLS = new Set(['wf_context', 'wf_read', 'wf_query']);

let table = null;
/** The row of each operation: `{ op, tool, readWith }`. */
export function registry() {
  if (table) return table;
  table = new Map();
  for (const [tool, list] of Object.entries(ROWS)) {
    for (const name of list.split('|').map((x) => x.trim()).filter(Boolean)) {
      if (table.has(name)) throw new Error(`the operation ${name} has two tools`);
      table.set(name, { op: name, tool, readWith: READ_WITH[name] ?? null });
    }
  }
  return table;
}

/** The operations of wf.mjs that have no row, and the rows that name no operation. Both must be empty. */
export function coverage() {
  const ops = allOps();
  const rows = registry();
  return {
    missing: [...ops.keys()].filter((n) => !rows.has(n) && !NO_TOOL.has(n)),
    unknown: [...rows.keys()].filter((n) => !ops.has(n)),
  };
}

/** The operations of one tool, and the read-only forms of writing operations for a read tool. */
export function opsOfTool(tool) {
  const rows = [...registry().values()];
  const own = rows.filter((r) => r.tool === tool).map((r) => r.op);
  const reads = tool === 'wf_query' ? rows.filter((r) => r.readWith && !READ_TOOLS.has(r.tool)).map((r) => r.op) : [];
  return [...own, ...reads];
}

/**
 * Why `tool` may not run `op` with `fields`, or null. A read tool runs a writing operation only
 * with its read flag (`index` with `check: true`).
 */
export function refusal(tool, op, fields = {}) {
  const row = registry().get(op);
  if (!row) return `${op} is no operation of wf; the operations of ${tool} are: ${opsOfTool(tool).join(', ')}`;
  if (row.tool === tool) return null;
  if (tool === 'wf_query' && row.readWith && fields[row.readWith]) return null;
  if (tool === 'wf_query' && row.readWith) return `${op} writes; ${tool} runs it only with ${row.readWith}: true, else call ${row.tool}`;
  return `${op} belongs to ${row.tool}: call that tool`;
}
