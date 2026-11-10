# The pick: decision closure (ideate)

Load this file only when the pick runs ([../ideate.md](../ideate.md), `# Pick — decision closure`): from the `pick` mode of Step 0 (`/wf intake ideate <slug> <idea-id...> [one-line reason]`), or from `done` in Step 7 with one idea or more at `triage: take`.

The ideas at `take` are the selected ideas. The `later`, `drop`, `brainstorm` and `open` ideas are not picked. The pick writes one list, with one work packet per selected idea, and it closes the workflow. Steps 1, 2, 8 and 9 follow "Closure" of [../_light-index.md](../_light-index.md) with the `ideate` row. Steps 3 to 7 are the pick's own.

1. **Stamp the artifact** (Closure step 1).
2. **Append `## Decision`** (Closure step 2). The culled siblings seed the out-of-scope list of a work packet.
3. **Agree the order.** With two ideas or more, propose an order from the rank, and ask the person to confirm it. For each idea after the first, ask why it comes after the ideas before it. Record the answer in the person's words.
4. **Write up each build work packet.** A build work packet has the form `intake`, `extension`, `fix` or `hotfix`. From the card of the idea, write its goal, its in-scope and out-of-scope lines, its checkable acceptance criteria, its constraints and its risks, per "The write-up of a build work packet" in [../brainstorm/_work.md](../brainstorm/_work.md). Propose its `ux-impact`, its `try-out` and its `estimated-slices`. Detect the stack once: run the probes in `intake/default/_stack-fingerprint.md`.
5. **Confirm the list.** Ask one question per [_gate-question.md](../../_gate-question.md), with the work packets in order, each with its form, its write-up, its `ux-impact` and its `try-out`, and the stack. The person confirms the grouping into work packets, `ux-impact`, `try-out` and the stack. Do not ask about the pick reason again. Two ideas of one family become one work packet when the person says so (the Size rules of [../brainstorm/_work.md](../brainstorm/_work.md)).
6. **Write the input file.** Write `<wf-dir>/.draft/pick.json`. It holds only what the person agreed in steps 3 to 5:

   ```json
   {
     "stack": { "platforms": ["<platform>"], "languages": ["<language>"], "user-confirmed": true },
     "pick": { "reason": "<the person's pick reason, word for word>", "at": "<the chosen-at time>" },
     "packets": [
       { "ideas": ["IDEA-003"], "goal": "<goal>", "in-scope": [], "out-of-scope": [], "acceptance-criteria": ["<criterion>"],
         "constraints": [], "risks": [], "measures": [], "ux-impact": "none", "try-out": "no", "estimated-slices": 8 },
       { "ideas": ["IDEA-001", "IDEA-004"], "why-here": "<the person's words>", "goal": "<goal>", "acceptance-criteria": ["<criterion>"],
         "ux-impact": "visual", "try-out": "yes", "estimated-slices": 10 }
     ]
   }
   ```

   - List the work packets in the order of step 3.
   - Give `why-here` on each work packet after order 1 of the list. On a later pick, every new work packet needs it.
   - Give the write-up of step 4 on each build work packet.
   - Put two ideas in one entry only when the person grouped them in step 5.
   - Give `title`, `slug`, `form` or `target-slug` only when the person changed it, or when the command asks for it.
   - The command takes everything else from the `ideas:` roster: the title, the evidence, the form of the entry, the slug suggestion and the target slug.
7. **Build the board and write the list.** Run `node "<skill-dir>/scripts/ideate-sources.mjs" pick "<projectRoot>" <slug> "<wf-dir>/.draft/pick.json"`. It builds `ideate-work.json` in the board shape of a brainstorm, and it writes the list with `campaign.mjs write`. When `ok` is `false`, the command wrote nothing. Follow the failure rule of [_host-invocation.md](../../_host-invocation.md). Correct an entry of `errors` yourself when the answer is in what the person already agreed in steps 3 to 5. Ask the person only about an entry that needs a new answer. Then run the command again.
8. **Close the workflow** (Closure step 3).
9. **Print the invocations.** Print each entry of `invocations` of step 7, in order. Do not run them.

A later pick on a run that already has a list appends its work packets after the last work packet of the list, and runs steps 1 to 9 for them. A work packet that the walk started keeps its text ([../brainstorm/_work.md](../brainstorm/_work.md), "Reopening a list").

## Regroup (the migration of an old campaign)

The first `/wf campaign <slug>` on an ideate run with an old campaign ledger migrates it (`campaign/_migrate.md`). The walk then runs the section "Regroup" of [../brainstorm/_work.md](../brainstorm/_work.md) on `ideate-work.json`, in its own session, with the person:
- Skip step 1 of that section: it is for a brainstorm board only.
- In its step 2, put every carried item into exactly one work packet.
- Write up each new build work packet and confirm the stack as in steps 4 and 5 above.
- Then write the list with `node "<skill-dir>/scripts/campaign.mjs" write "<wf-dir>/ideate-work.json"`. On an error, repair the board, and run it again.
