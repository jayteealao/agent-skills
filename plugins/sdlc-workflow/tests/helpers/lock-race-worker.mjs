// tests/helpers/lock-race-worker.mjs
//
// One contender in the cross-host lock race test (the NATIVE-INTEROP Workstream C
// spike exit gate). Spawned as a distinct OS process — this is what makes the
// test a TRUE cross-process proof of the `wx` serializer (the real Claude-vs-Codex
// simultaneous-activation scenario), not just in-process concurrency.
//
// Env contract:
//   LOCK_PATH   — the lock file to contend for
//   RESULTS_DIR — each worker writes <pid>.json = { ok, pid, host } here
//   OWNER       — 'claude' | 'codex' (diagnostic owner host)
//   MODE        — 'try'  → single-shot tryAcquireLock (free-lock exclusion)
//               | 'acquire' → blocking acquireLock w/ takeover (stale-lock exclusion)
//   LIB         — absolute path to lib/cross-host-lock.mjs
//   HOLD_MS     — a winner stays ALIVE this long before exiting. For the takeover
//                 (acquire) race this MUST exceed the losers' acquire timeout, or
//                 the winner's pid would die mid-race, make its own lock look
//                 stale, and let a loser take over → a false second winner.
//
// A winner LEAVES the lock held (never releases). The proof is then
// timing-independent: only one process can ever create + hold the file. The
// parent test cleans the lock up afterward.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { LOCK_PATH, RESULTS_DIR, OWNER, MODE, LIB } = process.env;
const HOLD_MS = Number(process.env.HOLD_MS ?? 0);

const { tryAcquireLock, acquireLock } = await import(LIB);

let result;
try {
  result = MODE === 'acquire'
    ? await acquireLock(LOCK_PATH, { ownerHost: OWNER, ttlMs: 60000, timeoutMs: 2500, retryMs: 50 })
    : await tryAcquireLock(LOCK_PATH, { ownerHost: OWNER, ttlMs: 60000 });
} catch (err) {
  result = { ok: false, error: err?.message ?? String(err) };
}

writeFileSync(join(RESULTS_DIR, `${process.pid}.json`), JSON.stringify({
  ok: Boolean(result.ok),
  pid: process.pid,
  host: OWNER,
}));

// A winner keeps its process alive HOLD_MS (so its live pid keeps the held lock
// from looking stale to still-retrying losers), then exits leaving the lock file
// in place. A loser exits immediately.
if (result.ok && HOLD_MS > 0) {
  await new Promise((r) => setTimeout(r, HOLD_MS));
}
process.exit(0);
