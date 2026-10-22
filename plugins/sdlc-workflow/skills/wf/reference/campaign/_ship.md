# Campaign ship: versions, handoff and ship per wave, hotfix, and the end

This file belongs to [../campaign.md](../campaign.md). `<cmd>` stands for `node "<pluginRoot>/skills/wf/scripts/campaign.mjs"`, followed by the command, `"<projectRoot>"`, and the brainstorm slug. The stacked wave PRs and every `gh stack` command are in [_gh-stack.md](_gh-stack.md).

## Versions and outputs

- **V1.** The target version is the setup answer `target-version`.
- **V2.** A wave gets its version when it is next to ship: `<cmd> version wave` gives the next pre-release of the target after the newest released tag, for example `0.3.0-beta.1`, then `0.3.0-beta.2`.
- **V3.** A hotfix gets `<cmd> version hotfix`. The person confirms the number.
- **V4.** Before a wave ships, its outputs carry a build label, not a version: `<cmd> label <n> [<slug>]` gives `wave-<n>+<sha>` or `wave-<n>.<slug>+<sha>`.
- **V5.** When the wave is next to ship and the person chose "release each wave", run the ship plan's `version-bump-cmd` on the wave branch with the V2 version, commit, and push. CI runs again on that commit.
- **V6.** With `target-version: none`, there is no bump and no tag. The outputs and the try-it notes still exist, with build labels.

WARNING: do not push a wave tag, and do not publish a release, unless the setup answer `release-each-wave` is `true`. A pushed tag is permanent: a fixed release takes a new version, never a re-used one.

## Handoff and ship per wave

Each wave is one PR. Its base is the wave's `base`: the trunk, or the wave branch below when the PRs are stacked.

With local records ([_records.md](_records.md)), handoff and ship run in the wave worktree, because only that checkout has the wave branch. Edit every `00-index.md` in the main checkout. Then, around each `/wf handoff` and each `/wf ship`:

1. Run `<cmd> worktree wave-<n> refresh`. It copies the main edits in.
2. Run the command with the wave worktree as the project root.
3. Run `<cmd> worktree wave-<n> sync`. It copies the handoff and ship records back.

The steps:

1. Run `<cmd> wave <n> set handoff`. In each merged slug's `00-index.md`, set `branch:` to the wave branch and `base-branch:` to the wave's `base` (the trunk, or the wave branch below).
2. Run `/wf handoff <wave branch>`. Batch mode builds the roster of the slugs on that branch and opens one PR with one package. The ship-plan readiness check and the RIM block run as usual. Record the PR with `<cmd> wave <n> set handoff --pr <url>` and `<cmd> journal pr-opened '{"wave":<n>,"pr":"<url>"}'`.
3. With stacked PRs, link the PR into the stack ([_gh-stack.md](_gh-stack.md), "Link").
4. Handoff watches CI to its end state. Record the result with `<cmd> journal ci-result '{"wave":<n>,"result":"<green|red>"}'`.
5. Ship the waves in order: wave n ships only after wave n−1 shipped. Before ship, set `base-branch:` in each merged slug's `00-index.md` to the trunk: GitHub moved the PR onto the trunk when the wave below merged, and ship reads `base-branch` for the tag, the release run, and the push. Run `<cmd> wave <n> set shipping`, then:
   - **Release each wave:** apply V5, then run `/wf ship <wave branch>`. Ship merges the PR, creates the tag, runs the release, and runs the post-publish checks, by the ship plan. Record `<cmd> journal released '{"wave":<n>,"version":"<v>"}'`.
   - **Merge each wave only:** run `/wf ship <wave branch>` for its gates and its merge. At the version step and the tag step, the setup answer is "merge only": bump nothing, tag nothing, publish nothing. When ship has no way to skip one of those steps, ask the person.
6. After the merge, run `<cmd> journal merged '{"wave":<n>}'` and `<cmd> wave <n> set shipped [--version <v>]`. When the wave shipped with a version, build the wave output again from the tagged commit, and put the version in the try-it note. With stacked PRs, sync the stack at the next wave boundary ([_gh-stack.md](_gh-stack.md), "Sync").

**Standing defaults.** With `defaults.ship` `recommended` (`status` gives `defaults`), each ship-family question of handoff and ship takes its recommended option with no question: plan drift, the window, the pre-push check, the merge method, the announcement, and the dry-run. Record each with `<cmd> decided <id> … --why "standing default: ship"`, and list them in the wave digest.

**Ask the person** (record each question with `<cmd> ask <id> --wave <n> <text>`; the watch sends a push notification) when:

- CI is red. Diagnose only, then ask, as handoff does.
- The readiness gate finds drift and `defaults.ship` is `ask`: the person chooses amend or acknowledge.
- The branch needs a human approval. The campaign never approves its own PR.
- The merge command refuses, or a merge queue rejects the wave.
- The version is already released, or does not match.
- A post-publish check fails.
- A recovery step would delete a tag, a release, or a remote branch.
- A conflict needs a resolution that changes behaviour.
- An open RIM or an intent-bearing decision appears.
- Anything the ship plan does not cover, or covers in two ways.

WARNING: do not run a ship-plan recovery step that deletes a tag, a release, or a remote branch without the person's yes. These deletions cannot be undone.

CAUTION: do not turn on auto-merge for a wave PR. An auto-merged PR breaks the wave order.

## Hotfix

A packet with `form: hotfix` and `urgency: urgent` runs before the next planned wave. Prepare it with the person (hotfix intake). Its branch starts from the newest released tag on the trunk, and its PR targets the trunk directly. It ships first, with `<cmd> version hotfix` confirmed by the person. The next wave branches from the trunk after the hotfix merged.

## End

When the last wave shipped (`next.action` is `end`):

1. When the waves merged without tags, or shipped as pre-releases, ask the person whether to release the target version as a final release, by the ship plan's rollout stages. A final release is the person's decision.
2. Write `work/campaign/report.md`:
   - each wave: its slugs, its PR, its version or label, the slugs that moved, its wave review verdict, and its try-it note;
   - every carried decision of the campaign: honoured, narrowed (with the person's answer), dropped (with the ratification), changed at prepare, or not built yet (with its slug);
   - each work revision that the campaign re-planned from, and what it added;
   - the forecast against the real numbers;
   - with local records: the design files that git tracks but that no wave PR carried. Run `git status --porcelain -- .ai/design .ai/workflows` in the main checkout and list each `.ai/design/` file and `design/r<N>/` folder it shows. The person commits them; the campaign does not.
3. Run `<cmd> journal campaign-end`.
4. Route to `/wf retro <slug>` for each slug. The person runs each retro.
