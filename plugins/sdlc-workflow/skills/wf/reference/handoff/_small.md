# Small-path handoff — the body of the `small` mode of handoff

The `small` mode applies when the index of the slug has `workflow-type: small`. This is handoff Step 0, item 3b ([../handoff.md](../handoff.md)).

1. The scope is the one slice `<slug>`. `01-small.md` stands in for its `05-implement` and `06-verify` records.
2. When a commit of its `commit-sha` is on the base branch, the PR needs its own branch. Ask one gate question per [_gate-question.md](../_gate-question.md) first: "Commit `<sha>` is on `<base>`. Move it to a new branch `<name>` for the PR?"
3. On yes, run `git branch <name> <sha>` and `git switch <name>`. Then move the local base back to `origin/<base>` with `git branch -f <base> origin/<base>`, and set `branch=<name> branch-strategy=dedicated` in the index. The commit stays on the new branch, so nothing is lost.
4. On no, STOP: no PR opens from the base branch.
