// The outward text that the leak guards read: the message of every publishing command form, and
// nothing from the parts of a command that do not publish; the public-doc paths, read relative to
// the project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { extractOutwardText } from '../../../hooks/leak-guard-bash.mjs';
import { isPublicDocPath } from '../../../hooks/leak-guard-write.mjs';

const LEAK = 'see .ai/workflows/demo/06-verify.md';
const has = (texts) => texts.some((t) => t.includes('.ai/workflows/demo'));

test('every publishing command form gives its message to the scan', () => {
  const forms = [
    `git commit -m "${LEAK}"`,
    `git commit -am "${LEAK}"`,
    `git commit -m"${LEAK}"`,
    `git -C . commit -m "${LEAK}"`,
    `git -c user.name=x commit -m "${LEAK}"`,
    `git --no-pager tag -a v1 -m "${LEAK}"`,
    `git commit -m @'\n${LEAK}\n'@`,
    `git commit -m "$(cat <<'MSG'\nfix: thing\n\n${LEAK}\nMSG\n)"`,
    `git commit -F - <<END\n${LEAK}\nEND`,
    `gh pr create --title t --body "${LEAK}"`,
    `gh pr edit 12 --body "${LEAK}"`,
    `gh pr comment 12 --body "${LEAK}"`,
    `gh issue create --title "${LEAK}"`,
    `gh issue comment 3 -b "${LEAK}"`,
    `gh release edit v1 --notes "${LEAK}"`,
  ];
  for (const f of forms) assert.ok(has(extractOutwardText(f)), f);
});

test('a message file is read and scanned, not its path', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'leak-guard-'));
  try {
    writeFileSync(path.join(dir, 'msg.txt'), LEAK);
    for (const f of ['git commit -F msg.txt', 'gh pr create --title t --body-file msg.txt', 'gh release create v1 --notes-file=msg.txt']) {
      assert.ok(has(extractOutwardText(f, dir)), f);
    }
    assert.deepEqual(extractOutwardText('git commit -F .ai/workflows/demo/missing.txt', dir), []);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('the parts of a command that do not publish are not scanned', () => {
  assert.equal(has(extractOutwardText('grep -n .ai/workflows/demo f && git commit -m ok')), false);
  assert.equal(has(extractOutwardText('cat .ai/workflows/demo/x.md | head -n 5; git tag v1')), false);
  assert.deepEqual(extractOutwardText(`cat .ai/workflows/demo/x.md`), []);
  assert.deepEqual(extractOutwardText('git commit --amend --no-edit'), []);
});

test('a public doc inside a project under an internal-looking folder is still a public doc', () => {
  const roots = ['.ai/', '.claude/'];
  const root = path.resolve('/repo/.claude/worktrees/feat');
  assert.equal(isPublicDocPath(path.join(root, 'README.md'), roots, root), true);
  assert.equal(isPublicDocPath(path.join(root, 'docs', 'guide.md'), roots, root), true);
  assert.equal(isPublicDocPath(path.join(root, '.ai', 'workflows', 'w1', 'README.md'), roots, root), false);
  assert.equal(isPublicDocPath(path.join(root, 'src', 'a.js'), roots, root), false);
  assert.equal(isPublicDocPath('docs/guide.md', roots, root), true);
});
