# Adapter: `cli`

## Detection signals
- `Cargo.toml` with a `[[bin]]` target or a single binary crate
- `package.json` with a `bin` field
- `go.mod` with a `main.go` or `cmd/<name>/main.go` layout
- `setup.py` / `pyproject.toml` declaring an `entry_points` console script
- `Makefile` or `justfile` with a `run` target

## Bootstrap
1. **Build the binary** — `cargo build`, `go build ./...`, `npm install` (for `bin` field linking), `pip install -e .`, or the project's documented build step.
2. **Locate the executable** — record the path so observe can invoke it directly (`./target/debug/<name>`, `./<name>` after `go build`, `node_modules/.bin/<name>`, etc.).
3. **Resolution attempt before failing:** if the build fails, run `<tool> --version` to confirm the toolchain is installed; surface a clear error if not.

## Enumerate
Inventory the command tree **before** driving (see the enumeration ladder in [_protocols.md](_protocols.md)).
1. **Recipe rung** — read the declared command registry: `package.json` `bin`, a Click/Typer/Cobra/clap command tree, or a generated completion script.
2. **Static rung** — recursive `--help` walk: parse subcommands out of the top-level help, then recurse into each. Bound the depth and record it.
3. **Traversal rung** — same walk when help output is unstructured, recording every subcommand that responds. The count is a FLOOR.
Enumerate **flags per command** as well as commands — `dead-affordance` on a CLI is usually a flag, not a subcommand.

## Drive
- Run the binary with the inputs implied by the criterion or probe target.
- For interactive CLIs, use `expect` or pipe stdin: `echo "<input>" | <binary> <args>`.
- For commands that take files, stage minimal fixtures under `<evidence-dir>/inputs/` and pass them in.

## Observe
- **Stdout + stderr** — capture both separately: `<binary> <args> >stdout.txt 2>stderr.txt`. Record exit code (`echo $?`).
- **Exit code** — non-zero is a strong signal but not the only signal; some CLIs return zero and emit errors on stderr.
- **Output format** — for criteria that declare output structure (e.g., JSON, table format), parse and validate the structure, not just substring presence.
- **Error cases (when probe target asks)** — test wrong arguments, missing files, permission errors. Capture each.

## Perturb
Break exactly one dependency, re-observe, restore (see the perturbation protocol in [_protocols.md](_protocols.md)).
- **Missing optional config** — move a config file aside, run, move it back. An *optional* source that aborts the command is `dependency-collapse`.
- **Unset a required env var** — check the error is a message, not a traceback (`error-surface-leak`).
- **No network** — run with the network dependency unreachable; check for a timeout, not a hang (`terminal-wait`).
- **Non-tty** — pipe stdout to a file; check `--json` and exit codes still hold (`branch-gap`).

## Tear down
- Delete any temporary input fixtures created under `<evidence-dir>/inputs/`.
- Built binaries persist (they're idempotent and re-running probe is faster with them in place).

## Evidence layout
```
<evidence-dir>/
  <criterion-or-target-slug>.stdout.txt
  <criterion-or-target-slug>.stderr.txt
  <criterion-or-target-slug>.exit-code   # single-line file with the integer
  inputs/                                # staged fixtures, if any
```

## Remediation hints
- Build fails → "Run the project's build command manually to surface the underlying compiler/linker error."
- Binary not found after build → "Check the build target's output path; some projects place binaries under non-default locations."
- Permission denied on execution → "Run `chmod +x <binary>` if the build did not mark it executable."
