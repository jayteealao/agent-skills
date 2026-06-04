// scripts/update-snapshots.mjs
//
// Cross-platform golden regeneration. The plan specified
//   "UPDATE_SNAPSHOTS=1 node --test ..."
// but a POSIX env-var prefix is not valid under npm on Windows (cmd.exe). This
// wrapper sets the flag in-process, then loads the snapshot test modules so
// node:test runs them — the harness writes goldens whenever UPDATE_SNAPSHOTS=1.
//
// Always review the resulting golden diff before committing: never regenerate
// from a renderer that still has a subtle bug.

process.env.UPDATE_SNAPSHOTS = '1';

await import('../tests/unit/snapshots/renderers.test.mjs');
