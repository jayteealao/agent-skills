# Working against a brief (brainstorm)

A brief is a document the person brings that says what good looks like for one part of the product. It can be pasted text or a file path. When a reply carries a brief, or asks whether the board has explored a part that such text describes, run these steps before any other batch.

## Steps
1. **Record the brief** in the board's `briefs` list: a key, a plain name, and its source (`pasted` or the file path). Split it into criteria, one per line:
   - each "what good looks like" line (`part: good`);
   - each common failure (`part: failure`);
   - each acceptance check (`part: check`);
   - each other requirement (`part: other`).
2. **Map the coverage.** For each criterion, find the board items that answer it, run a bounded read of what the code does today, and read the documents of existing work. One research sub-agent per [_subagents.md](../../_subagents.md) may do the reads, as in [_cohere.md](_cohere.md) step 2. Give each criterion a status:
   - `covered` — it has a decision, the decision's cost against the budgets, and a way to check it;
   - `partial` — some of the three are missing;
   - `open` — nothing on the board answers it.
3. **Show the map** in the question text, and on the page (2.9): the count per status, and one plain line per partial or open criterion. Ask which gaps to open first, and whether any criterion is out of scope (`out-of-scope`, with the person's reason).
4. **Walk the gaps** in the person's order, with the loop's craft. Give each criterion the same depth: a criterion becomes `covered` only when it has a decision, its cost, and its check. A later criterion gets no less depth than the first one.
5. **Close the brief** at a check-in: the whole map, the gaps still open, and the out-of-scope criteria with their reasons. Then run a coherence pass ([_cohere.md](_cohere.md)).

A failure that the brief names, for example "one attribute dominates all others", becomes a check: a decision about how the test catches it, or a question for the plan.

On a resume, show each open brief's coverage in 2.6. The page shows one coverage table per brief.
