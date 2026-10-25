// A fake gh for the tests: it logs each call to FAKE_GH_LOG and answers the few commands that
// the scripts run. `stack init|add <b>` create the branch with git, as gh-stack does.
import { appendFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
if (process.env.FAKE_GH_LOG) appendFileSync(process.env.FAKE_GH_LOG, `${JSON.stringify(args)}\n`);
const [a, b, c] = args;
const say = (s) => process.stdout.write(`${s}\n`);

if (a === 'auth' && b === 'status') process.exit(0);
if (a === 'pr' && b === 'list') say('[]');
else if (a === 'pr' && b === 'create') say('https://github.com/o/r/pull/7');
else if (a === 'pr' && b === 'view') say(process.env.FAKE_GH_PR ?? '{"state":"MERGED","headRefName":"feat/x"}');
else if (a === 'issue' && b === 'create') say(process.env.FAKE_GH_ISSUE ?? 'https://github.com/o/records/issues/5');
else if (a === 'repo' && b === 'view') say(process.env.FAKE_GH_REPO ?? '{"nameWithOwner":"o/r","defaultBranchRef":{"name":"main"},"mergeCommitAllowed":true,"squashMergeAllowed":true,"rebaseMergeAllowed":false,"deleteBranchOnMerge":false}');
else if (a === 'api' && /\/rules\/branches\//.test(b)) say(process.env.FAKE_GH_RULES ?? '[]');
else if (a === 'api' && /\/protection$/.test(b)) process.exit(1);
else if (a === 'stack' && (b === 'init' || b === 'add')) execFileSync('git', ['switch', '-q', '-c', c], { stdio: 'ignore' });
else if (a === 'stack') process.exit(0);
process.exit(0);
