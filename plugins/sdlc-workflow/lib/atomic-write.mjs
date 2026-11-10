// Write a file whole, so a reader sees the old text or the new text and never a part of it.
// The text goes to a temp file beside the target, then a rename puts it in place. Each write
// has its own temp name (`<file>.<pid>.<random>.tmp`), so two processes that write one file at
// the same time never share a temp file. The temp file is removed when the write fails.
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname } from 'node:path';

// On Windows a rename onto a file that another process has open for a moment fails with EPERM,
// EACCES or EBUSY. The rename is tried again for a short time before the write fails.
const RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RETRY_MS = 1_000;
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** The temp name of one write of `file`: unique to this process and this write. */
export const tempNameOf = (file) => `${file}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;

/**
 * Write `data` to `file` through a temp file and a rename. `mkdir` makes the folder first.
 * `options` go to writeFileSync (for example `{ encoding }`). Throws when the write fails, and
 * leaves no temp file behind.
 */
export function writeFileAtomic(file, data, { mkdir = true, ...options } = {}) {
  if (mkdir) mkdirSync(dirname(file), { recursive: true });
  const tmp = tempNameOf(file);
  try {
    writeFileSync(tmp, data, options);
    const until = Date.now() + RETRY_MS;
    for (;;) {
      try { renameSync(tmp, file); return; } catch (e) {
        if (!RETRY_CODES.has(e.code) || Date.now() >= until) throw e;
        pause(20);
      }
    }
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
