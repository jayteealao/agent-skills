# The check budget — one question per repo

The check budget says how long a check may take before an agent moves it or makes it faster. The person chooses it once for the repo. It lives in `testProfile.budget` of `.ai/sdlc-config.json`:

- `slice`: the longest check that a slice stage may run, in seconds. A longer command is a long run ([_long-runs.md](_long-runs.md)).
- `long`: the longest single long run (a fit, a proof, a calibration, a coverage pass) before the agent must offer the faster paths. No value means no limit.
- `machines`: the machines that the person allows for split runs, by name.

`node "<skill-dir>/scripts/wf.mjs" profile budget "<projectRoot>"` shows it. `profile show` and every stage brief also show it.

## When to ask

Ask the budget question when `profile budget` prints `no budget`. The first of these places that runs asks it, and no later place asks it again:

- setup ([setup.md](setup.md) Step 2)
- intake Batch B ([intake/default.md](intake/default.md) Step 0.6)
- shape Round 6 ([shape.md](shape.md) Step 2.3)
- the campaign walk ([campaign.md](campaign.md) step 2)

## The question

Ask one question with the host question tool ([_gate-question.md](_gate-question.md)). The question text has three parts:

1. One sentence on why it matters: "The budget decides whether an agent waits on a check or moves it to a later point."
2. The measured or estimated time of each suite, from `profile show`, and of each known long run of the repo (below).
3. "How long may a check take?"

The options:

- **Fast loop (Recommended).** Slice checks under 2 min. Long runs only at the packet end or the wave boundary, each with a pilot first. Feedback is faster; a fault that only a long run finds shows later.
- **Balanced.** Slice checks under 10 min. One long run may take up to 1 h before the agent offers a faster path.
- **Thorough.** No limit: a run takes as long as its checks take. Feedback is slower; nothing waits for a later point.

Then ask, in the same call when the repo names more than one machine (for example in a run script or a doc), which machines a split run may use.

Record the answer:

```
node "<skill-dir>/scripts/wf.mjs" profile budget "<projectRoot>" --preset <fast-loop|balanced|thorough> [--machines <a,b>]
```

A free-text answer sets the numbers: `--slice <seconds>` and `--long <seconds|none>`.

## The known long runs

List each long command of the repo with an estimate, in the question text:

- each pre-push and pre-commit command (`wf.mjs profile hooks`)
- each command that a doc of the repo calls slow, or gives a time of minutes or hours (for example a fit, a calibration, a proof, a coverage pass)
- each suite whose recorded time is over the time box

A command with no measurement gets "not measured". Do not run a long command to time it.
