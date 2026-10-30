# Long runs — measure, check validity, take the fastest path, run in the background

A **long run** is a command that is expected to take longer than `budget.slice` of the check budget ([_check-budget.md](_check-budget.md)). With no budget, it is a command longer than the time box of the stage. A fit, a proof, a calibration, a coverage pass and a `full` or `heavy` suite are long runs when they take that long. The rules below apply in every stage.

## L1 — Measure first

Before a long run, write one line in chat or in the hand-back: what the run proves, the expected time from a measurement, and the machine.

- A measurement is a run of the same command on the current code. A time from before the last code change that the run reads is not a measurement.
- With no measurement, run a pilot first: one set, one suite, or a small share of the matches. Project the full time from the pilot.

## L2 — Check that the result will still be valid

Before a long run, look for a planned later change that makes the result stale before anything uses it:

- a band-file or threshold edit at the boundary
- a refit after a merge
- engine or model work that the run depends on

When such a change exists, move the run to the point after the change, as a `## Packet Checks` entry or a boundary check. Record the move as a decision with the change that makes the result stale.

## L3 — Take the fastest path that gives a valid answer

Try the paths in this order:

1. Run only the touched part: one crate, one package, one suite or one set.
2. Run a pilot, and stop early when the answer is clear.
3. Sample with paired seeds.
4. Split independent parts across the `budget.machines`.
5. Move the run to the packet end or the boundary.
6. Run it in the background (L4), and continue with work that does not depend on it.

A run that is still over `budget.long` on the fastest valid path is a decision. In stop mode it is a question. In delegate mode it is a delegate decision, and the watching session writes one chat line about it. The question, or the line, gives the time of each path ([_question-craft.md](_question-craft.md) rules 9 and 10).

## L4 — Run in the background

- Start a long run in the background, with its output in a file.
- Record it in the stage record under `long-runs:`, one entry each: `{ command, started-at, expected-end, output, machine }`. A later stage or session reads the result from the output file.
- Continue with work that does not depend on the result.
- Wait on the process with the wait tool of the host. Do not wait in a `sleep` loop.

## L5 — A long run is never a slice step

- A plan puts a long run under `## Packet Checks` or a boundary check, with its pilot measurement. It is never a step of a slice.
- A slice whose whole job is a long run (for example a gate proof) is planned last in the packet, after the last change that would make its result stale.
