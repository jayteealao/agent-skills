// Runs the pure tests of the /wf picker mod (tests/unit/mod/wf-picker.harness.mjs)
// under Node's type stripping, so the `.ts` modules in hooks/mod/ load without
// a build. Node 22.6+ carries `--experimental-strip-types`; on an older Node
// the run is skipped and says so. The hooks module itself is covered by the
// kit tests in hooks/mod/tests/ (`claude plugin test hooks/mod`), which need
// the Claude Code CLI and are not part of `npm test`.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HARNESS = path.join(HERE, 'mod', 'wf-picker.harness.mjs');

// The parent runner marks its children with NODE_TEST_CONTEXT; a grandchild
// that inherits it reports in the runner's wire format instead of TAP.
function childEnv() {
  const env = { ...process.env, NODE_OPTIONS: '' };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

function supportsStripTypes() {
  const [major, minor] = process.versions.node.split('.').map(Number);
  return major > 22 || (major === 22 && minor >= 6);
}

test('the /wf picker mod: pure state machine and workflow readers', { skip: supportsStripTypes() ? false : `Node ${process.versions.node} has no --experimental-strip-types` }, () => {
  const result = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--test', '--test-reporter=tap', HARNESS], {
    encoding: 'utf8',
    env: childEnv(),
  });
  const output = `${result.stdout}\n${result.stderr}`;
  assert.equal(result.status, 0, `harness failed:\n${output}`);
  const pass = /^# pass (\d+)/m.exec(output);
  const fail = /^# fail (\d+)/m.exec(output);
  assert.ok(pass && Number(pass[1]) >= 25, `expected at least 25 passing harness tests:\n${output}`);
  assert.ok(fail && Number(fail[1]) === 0, `harness reported failures:\n${output}`);
});
