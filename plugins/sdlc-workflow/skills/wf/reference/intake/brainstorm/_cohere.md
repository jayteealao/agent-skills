# Coherence pass (brainstorm)

A coherence pass holds the whole board against three things: its own earlier decisions, the documents of the work it already routed, and the budgets the person decided. Area close (2.8) checks one area. This pass checks the areas against each other.

## When it runs
- After an area close (2.8).
- When a brief closes ([_brief.md](_brief.md) step 5).
- Before the scope walk at `done` (3.1).
- When the person says `cohere`.

Do not run it after every batch.

## Budgets
A budget is a limit the person decided, for example "a matchday runs in about three seconds on a four-core laptop" or "a release run finishes overnight on the Mac mini and the VPS". When the person decides a limit, record it in the board's `budgets` list with the key of the decision that set it. A board with no budgets skips step 4.

## Steps
1. **Collect** the decisions made or changed since the last pass (the log entries after the last `cohere` entry), and the budgets.
2. **Read the existing work.** For each piece of work with `routed-to`, find the documents its successor wrote, for example a design document. Dispatch one read-only research sub-agent per [_subagents.md](../../_subagents.md) to read them in full against the collected decisions. The sub-agent returns each decision marked `new`, `repeat`, or `contradiction`, with `file:line`. Skip this step when no work is routed.
3. **Check the board against itself**: the same subject decided twice, a kept decision that needs a later or cut item, and two decisions that pull apart.
4. **Add up the cost.** For each budget, estimate the combined load of the kept decisions, with the numbers and the assumption behind each. A budget the decisions no longer fit is a conflict.
5. **Resolve.**
   - Bring each real conflict to the person as a choice with its costs (2.1), one to four per batch, in the question text.
   - Merge a repeat: set `replaced-by` on the older item.
   - A contradiction with a routed piece's document marks that piece `stale: true`, with the reason in `stale-because`.
6. **Rewrite the summary** so the board reads as one design, and republish the page (2.9).
7. **Log** one entry with kind `cohere`: what the pass read, and how many conflicts and merges it found.

In the first question after the pass, say in one plain sentence that the pass ran and what it read.
