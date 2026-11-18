// The folder of the wf skill, `<skill-dir>` of every reference, resolved once by code.
//
// Only the session that loaded SKILL.md knows `<skill-dir>` (the host shows the folder of the
// skill). A sub-agent, a driven stage agent, an agent of a run, or a session after a compaction
// reads a reference that says `node "<skill-dir>/scripts/wf.mjs"` and has no folder for it. So
// every prompt that code builds for another agent carries one `skill-dir:` line, and the
// dispatch and the brief print it too. With no such line, `node "$HOME/.sdlc/bin/wf.mjs"
// skill-dir` prints the folder: the session start of every host writes that stable entry point.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const slash = (p) => String(p).replace(/\\/g, '/').replace(/\/+$/, '');

/** The absolute folder of the wf skill of this plugin copy, with forward slashes. */
export const SKILL_DIR = slash(resolve(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'wf'));

/** The skill folder of a reference folder (`<skill-dir>/reference`). */
export const skillDirOf = (referenceRoot) => slash(referenceRoot).replace(/\/reference$/, '');

/** The stable entry point that prints the folder when no prompt names it. */
export const SKILL_DIR_FALLBACK = 'node "$HOME/.sdlc/bin/wf.mjs" skill-dir';

/**
 * The line that binds `<skill-dir>` for an agent that did not load the skill. The workflow
 * scripts (skills/wf/workflows/*.js) cannot import this module: each one builds the same text
 * from its reference folder, and a test holds them to this function.
 */
export function skillDirLine(dir = SKILL_DIR) {
  const d = slash(dir);
  return `skill-dir: ${d}\n` +
    `Each \`<skill-dir>\` in a file you read is this folder, and each \`wf.mjs\` command runs as \`node "${d}/scripts/wf.mjs" …\`. ` +
    'Never search the disk for wf.mjs, a script or the plugin folder.';
}
