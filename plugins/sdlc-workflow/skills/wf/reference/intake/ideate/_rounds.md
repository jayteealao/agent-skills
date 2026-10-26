# Ideate rounds (steer the scan)

A round is one more scan inside the same ideate run. The first scan of `intake/ideate.md` is round 1. Each steer adds one round. The slug, the `01-ideate.md` record, and the roster stay the same. A new slug comes only from a new `/wf intake ideate` without a slug.

The person starts a round from the loop ([_loop.md](_loop.md)) with a steer word, or from the command line after the slug:

```
/wf intake ideate <slug> deeper "retry logic for the Stripe client"
/wf intake ideate <slug> similar 3
/wf intake ideate <slug> lens security
/wf intake ideate <slug> direction payments
/wf intake ideate <slug> surprise me
```

`ideate-sources.mjs args` returns `mode: steer`, with `steer:` the word and `target:` the rest. From the command line, run Step 0 sub-steps 3 to 3c of `intake/ideate.md`, then the round, then go into the loop.

## The kinds of round

| Word | What the round does | Agents |
|---|---|---|
| `deeper <idea>` | Scan the idea's evidence files and the files one import step away from them. Run the lens of the idea's category, plus Lens 6 (architecture) when the category is not architecture. The new ideas get `parent:` set to the idea. | up to 2 lens agents, effort tier low |
| `similar <idea>` | Look for the same pattern in other places of the code. A hit that is the same problem becomes more evidence on the idea. A hit that is a different problem becomes a new idea with `parent:` set to the idea. | 1 agent, effort tier medium |
| `lens <name>` | Run one lens of [_lenses.md](_lenses.md) that this run did not run. When the lens already ran, say so, and offer `deeper` on that lens's best idea. | 1 lens agent, effort tier low |
| `direction <words>` | Point the scan at a new topic. Run the lenses of the run with the new topic, as Step 1 runs them with a topic. | the run's lenses, effort tier low, in waves of at most 6 |
| `surprise me` | Propose three to five angles that the person did not raise: the view of a user, the view of a newcomer, a reversed case, a comparison with another product, "what would you delete". Ask one multi-select question. Each angle that the person picks becomes one `direction` round. | none until the person picks |

The effort tiers follow [_subagents.md](../../_subagents.md). A `similar` round runs at medium because it judges whether two places are one problem.

A source is not a steer word. To add a source, start a new run, or run `refresh` after the source changes.

## Run a round

1. **Announce.** Print one line before the agents start: the kind of round, its target in words, and the number of agents. The person asked for the round, so do not ask again.
2. **Scan.** Run Step 1 of `intake/ideate.md` with the scope of the round. Give every agent the ideas already in the roster, so it reports new ground only.
3. **Generate and filter.** Run Step 2 and Step 3 on the new candidates only. The filter also reads:
   - the memory of earlier runs (Step 3c);
   - this run's `culled:` roster. A candidate that matches an idea that the person dropped is culled with the reason "you dropped this", and is not shown;
   - the ideas already in the roster. Challenge 5 joins a new symptom to an existing root cause: the new evidence goes onto the existing idea.
4. **Record.** Give each new idea the next free `IDEA-NNN` id, `round:` the round number, and `triage: open`. Give each new cull `round:`. Add one entry to `rounds:`:

   ```yaml
   - n: <the next round number>
     kind: <deeper|similar|lens|direction>
     target: IDEA-NNN        # deeper and similar only
     lenses: [<the lenses that ran>]
     topic: "<words>"        # direction only
     raw: <N>
     culled: <N>
     survivors: <N>
     at: "<ISO 8601>"
   ```

   When `rounds:` is empty, add the round-1 entry first, with `kind: initial` and the counts of the first scan.
5. **Rank.** Run Step 4 on the whole roster. A triage state never changes in a re-rank. Show at most **5** new survivors of the round; the person's count argument, when given, replaces 5. The roster keeps every survivor.
6. **Write and return.** Write the records and run the check ([_loop.md](_loop.md), Invariants). Tell the person in two or three plain sentences what the round looked at and what it found, then ask about the new ideas in a triage batch.

A round that finds nothing new says so in one sentence, and returns to the loop.

In the body of `01-ideate.md`, add one line per round to a `## Rounds` section: what the round looked at, and what it found.
