You should make **every command session-aware** in two ways:

1. **Each command knows which session it belongs to** (so outputs land in `.claude/<session_slug>/...`)
2. **Each command updates the session README as the “source of truth index”** (so navigation stays trivial)

Below are the concrete changes I’d make to the earlier commands, without turning them into a generic template.

---

## Global conventions to add to all commands

### Add these fields to every command

* `SESSION_SLUG: <kebab-case>` (required)
* `ARTIFACT_PATH: <auto>` (derived from command + session)
* `UPDATE_SESSION_README: <yes|no>` (default: yes)

### Add these output obligations to every command

* Include a **“Save as” line** at the top:

  * `Save as: .claude/<session_slug>/<bucket>/<artifact>.md`
* Include minimal frontmatter:

  * `command`, `session_slug`, `date`, `scope`, `target`, `related`
* Update `.claude/<session_slug>/README.md`:

  * append a bullet under a section matching the bucket (Spec/Plan/Work/Reviews/Risk/Ship/Ops/Incidents/Stewardship)
  * link to the artifact path
  * add a 1-line summary

### Standard artifact mapping (used by all commands)

* **Spec** → `spec/`
* **Plan** → `plan/`
* **Decisions** → `decisions/`
* **Work** → `work/`
* **Reviews** → `reviews/`
* **Risk/Compatibility** → `risk/`
* **Testing strategy** → `testing/`
* **Ship** → `ship/`
* **Runbooks** → `runbooks/`
* **Ops** → `ops/`
* **Incidents** → `incidents/`
* **Stewardship** → `stewardship/`

---

## Specific edits per command group

### 1) `/research-plan` (biggest change)

**Add**

* `SESSION_SLUG`
* `ARTIFACT_NAME: research-plan.md` (fixed)
* `RELATED_SPEC: <path or none>`

**Save to**

* `.claude/<session_slug>/plan/research-plan.md`

**Also update**

* session README:

  * under **Plan**: link + summary
  * under **Next actions**: recommend `/work` invocation with `PLAN_SOURCE` pointing to this artifact

**Output add-ons**

* a “Next command to run (filled)” block at the end, pre-populated with `SESSION_SLUG` and `PLAN_SOURCE`.

---

### 2) `/work`

**Add**

* `SESSION_SLUG`
* `PLAN_SOURCE_PATH: .claude/<session_slug>/plan/research-plan.md` (preferred)
* `CHECKPOINT_ID: <auto increment>` (optional)

**Save to**

* `.claude/<session_slug>/work/work.md` (single rolling log)

**Also update**

* session README:

  * under **Work**: link + current checkpoint status
  * optional: keep a “Current checkpoint” line updated

**Output add-ons**

* each checkpoint includes a **“Commit suggestion”** line (message + scope), even if you don’t actually commit.

---

### 3) `/review-*` commands

**Add**

* `SESSION_SLUG`
* `REVIEW_TARGET: <pr|diff|worktree|file|repo>` (already present but keep)
* `ARTIFACT_NAME: review-<dimension>.md` (fixed)

**Save to**

* `.claude/<session_slug>/reviews/review-<dimension>.md`

**Also update**

* session README:

  * under **Reviews**: link + headline result (APPROVE / REQUEST CHANGES + top issue)

**Output add-ons**

* a “Fix-forward list” section: items to apply in `/work` vs items to defer to `stewardship/debt-register.md`.

---

### 4) Spec/Alignment commands

#### `/spec-crystallize`

Save to:

* `.claude/<session_slug>/spec/spec-crystallize.md`

Update README under **Spec**.

#### `/scope-triage`

Save to:

* `.claude/<session_slug>/plan/scope-triage.md`

Update README under **Plan**.

#### `/decision-record`

Save to:

* `.claude/<session_slug>/decisions/decision-record.md`

Update README under **Decisions**.

---

### 5) Risk & compatibility commands

#### `/risk-assess`

Save to:

* `.claude/<session_slug>/risk/risk-assess.md`

Update README under **Risk**.

#### `/compat-check`

Save to:

* `.claude/<session_slug>/risk/compat-check.md`

Update README under **Risk**.

---

### 6) Testing strategy

#### `/test-matrix`

Save to:

* `.claude/<session_slug>/testing/test-matrix.md`

Update README under **Testing**.

---

### 7) Shipping commands

#### `/ship-plan`

Save to:

* `.claude/<session_slug>/ship/ship-plan.md`

Update README under **Ship**.

#### `/release-notes`

Save to:

* `.claude/<session_slug>/ship/release-notes.md`

Update README under **Ship**.

---

### 8) Ops readiness

#### `/prod-readiness`, `/slo-check`, `/telemetry-audit`, `/handoff`

Save to:

* `.claude/<session_slug>/ops/<name>.md`

Update README under **Ops**.

---

### 9) Data runbooks

#### `/migration-runbook`

Save to:

* `.claude/<session_slug>/runbooks/migration-runbook.md`

Update README under **Runbooks**.

---

### 10) Incident commands

#### `/repro-harness`, `/rca`, `/postmortem-actions`

Save to:

* `.claude/<session_slug>/incidents/<name>.md`

Update README under **Incidents**.

---

### 11) Stewardship

#### `/debt-register`, `/refactor-followups`

Save to:

* `.claude/<session_slug>/stewardship/<name>.md`

Update README under **Stewardship**.

---

## One more important change: every command should refuse to run “unscoped”

To avoid orphan artifacts, make this a hard requirement:

* If `SESSION_SLUG` is missing → command output starts with:

  * “Missing SESSION_SLUG. Run `/start-session` first.”

No further work.

---

## What I would change in the earlier command text (example snippets)

### Example: add to the header of `/review-security`

* Add field: `SESSION_SLUG: <...>`
* Add instruction: `Save as .claude/<session_slug>/reviews/review-security.md`
* Add output section: `## Save Location` and `## Session README Update`

Same for all other commands with their respective bucket.

---

## Net effect

After these changes:

* Every artifact has a **predictable home**
* Session README becomes the **table of contents**
* Global `.claude/README.md` stays the **registry**
* You can hand someone a session slug and they can navigate the whole workstream in <30 seconds

If you want, I can rewrite **one command completely** (e.g., `/research-plan`) into its final session-aware form, and then you can apply the same pattern to the rest.
