# Codex Plugin Migration Plan for `sdlc-workflow`

## Goal

Create a working Codex plugin version of `plugins/sdlc-workflow` without losing the current Claude plugin and without maintaining two independent copies of the same workflow content.

The intended outcome is:

- Claude remains fully supported.
- Codex support is added through generated adapter files and limited compatibility refactors.
- Shared workflow content continues to live in one canonical source tree.

## Non-Goals

- Do not remove or replace the current Claude plugin format.
- Do not fork the plugin into `sdlc-workflow-claude` and `sdlc-workflow-codex`.
- Do not duplicate all commands, skills, references, and hooks into a Codex-only tree.
- Do not expand into Cursor, Windsurf, or other tool formats in this phase unless required by the implementation.

## Current State Summary

The plugin already contains the substantive workflow content:

- commands in `plugins/sdlc-workflow/commands/`
- skills in `plugins/sdlc-workflow/skills/`
- references in `plugins/sdlc-workflow/reference/`
- hooks in `plugins/sdlc-workflow/hooks/`
- Claude metadata in `plugins/sdlc-workflow/.claude-plugin/plugin.json`

The current gaps for Codex are:

1. No `.codex-plugin/plugin.json`.
2. No Codex marketplace file at `.agents/plugins/marketplace.json`.
3. Shared content still contains Claude-specific assumptions such as:
   - `${CLAUDE_PLUGIN_ROOT}`
   - legacy `.claude/<SESSION_SLUG>/...` review paths
   - Claude-only documentation and install guidance
4. Hook and runtime behavior has not been validated against Codex packaging.

## Strategy

Use a source-plus-generator model:

1. Keep Claude metadata as the canonical plugin source.
2. Add a small Codex override/config layer for fields that do not exist in the Claude manifest.
3. Generate Codex-specific packaging artifacts and Codex skill adapters from the canonical source.
4. Refactor shared content only where the existing source is not portable across Claude and Codex.

This avoids duplication while still producing native Codex packaging.

## Deliverables

### 1. Canonical Metadata Inputs

Add or define the canonical inputs for generation:

- `plugins/sdlc-workflow/.claude-plugin/plugin.json`
  - existing primary manifest
- root Claude marketplace metadata
  - likely `.claude-plugin/marketplace.json`
- a new small Codex overrides file
  - proposed location: `plugins/sdlc-workflow/.codex-plugin.overrides.json`

The overrides file should contain only Codex-native fields that cannot be derived cleanly from the Claude manifest, for example:

- `interface.displayName`
- `interface.shortDescription`
- `interface.longDescription`
- `interface.developerName`
- `interface.category`
- `interface.capabilities`
- `interface.websiteURL`
- `interface.privacyPolicyURL`
- `interface.termsOfServiceURL`
- `interface.defaultPrompt`
- optional branding fields if used later

### 2. Generator Script

Add a generator script at a repo-level scripts location, proposed:

- `scripts/generate-codex-plugin.mjs`

The script should:

1. Read the Claude plugin manifest.
2. Read the relevant Claude marketplace entry.
3. Read the Codex overrides file.
4. Generate:
   - `plugins/sdlc-workflow/.codex-plugin/plugin.json`
   - `.agents/plugins/marketplace.json`
   - `plugins/sdlc-workflow/.codex-generated/skills/*/SKILL.md`
5. Support:
   - `generate` mode
   - `--check` mode for CI/staleness detection
   - deterministic JSON formatting
   - clear validation errors when required source fields are missing

### 3. Shared Content Compatibility Cleanup

Refactor the shared plugin body so the generated Codex package is operational.

This work should be limited to the minimum needed to make the same content function for both platforms.

#### 3a. Path and Root Variable Cleanup

Audit and replace `${CLAUDE_PLUGIN_ROOT}` usage in:

- `plugins/sdlc-workflow/hooks/hooks.json`
- `plugins/sdlc-workflow/commands/*.md`
- `plugins/sdlc-workflow/skills/*/SKILL.md`

Preferred outcome:

- use relative plugin-local paths where possible, or
- define one neutral convention used by shared content, then adapt it per runtime only at packaging edges

Avoid introducing a second hardcoded platform-specific root token unless absolutely necessary.

#### 3b. Review Artifact Path Normalization

Normalize review outputs to the workflow artifact model described in the plugin README.

Current issue:

- many review command docs still reference `.claude/<SESSION_SLUG>/reviews/...`
- workflow docs describe `.ai/workflows/<slug>/07-review*.md`

Desired state:

- workflow-driven review artifacts write to `.ai/workflows/<slug>/`
- standalone review commands have an explicitly documented path strategy
- no silent split-brain storage model remains

#### 3c. Documentation Neutralization

Update shared documentation so it no longer implies Claude-only support in places that are meant to be cross-platform.

This includes:

- root marketplace README
- `plugins/sdlc-workflow/README.md`
- any release automation docs that assume only `.claude-plugin`

The content should distinguish:

- canonical source metadata
- generated Codex artifacts
- platform-specific install paths

### 4. Hook Compatibility Review

Evaluate whether the existing hook implementation is acceptable for Codex as-is.

Current hook implementation details:

- shell scripts in `plugins/sdlc-workflow/hooks/scripts/`
- `hooks/hooks.json` uses Bash commands
- scripts depend on `bash`, `yq`, `jq`, and `git`

Decision required during implementation:

Option A:
- keep Bash-based hooks
- document prerequisites clearly for Codex users

Option B:
- add PowerShell or Node wrappers for Windows portability

The initial implementation may use Option A if that is sufficient to produce a working Codex plugin, but the plan should record the portability tradeoff explicitly.

### 5. Validation and Smoke Tests

Add a repeatable validation flow.

Minimum validation should cover:

1. Generator validation
   - generated files are deterministic
   - `--check` fails when generated files are stale

2. Structural validation
   - `.codex-plugin/plugin.json` matches intended schema shape
   - `.agents/plugins/marketplace.json` contains correct entry and policy fields

3. Runtime smoke test
   - Codex can discover the local marketplace
   - `sdlc-workflow` is visible as an installable plugin
   - install succeeds
   - key commands and skills are discoverable

4. Behavioral smoke test
   - one small sample workflow can execute enough to prove that artifacts land in the expected `.ai/workflows/<slug>/` paths
   - at least one design skill resolves its references successfully
   - at least one hook fires successfully in Codex, if hook support is available in the target surface

### 6. Release and Maintenance Flow

Define the ongoing workflow after implementation:

1. Edit canonical Claude manifest or shared content.
2. Run generator.
3. Commit both source changes and regenerated Codex artifacts.
4. Run `--check` in CI to prevent drift.

This keeps Codex support derived rather than hand-maintained.

## Implementation Phases

### Phase 1: Source and Generator Foundations

- create Codex migration plan file
- add overrides file
- implement `scripts/generate-codex-plugin.mjs`
- generate initial `.codex-plugin/plugin.json`
- generate initial `.agents/plugins/marketplace.json`

Exit criteria:

- generator works from local source files
- generated files are stable and readable

### Phase 2: Shared Content Portability

- remove or neutralize `CLAUDE_PLUGIN_ROOT` assumptions
- normalize review output paths
- update any shared docs that directly conflict with Codex support

Exit criteria:

- shared content no longer encodes Claude-only runtime assumptions in critical paths

### Phase 3: Hook and Runtime Validation

- test hook registration shape
- verify required runtime dependencies
- document any unsupported surfaces or prerequisites

Exit criteria:

- known-supported configuration is documented and reproducible

### Phase 4: CI and Maintenance Guardrails

- add `--check`
- wire generator check into existing validation flow if appropriate
- document maintainer workflow

Exit criteria:

- Codex artifacts cannot silently drift from source

## Design Rules for the Generator

The generator should follow these rules:

1. Claude source stays authoritative unless a field is explicitly marked as Codex-only.
2. Generated files must never become hand-edited sources of truth.
3. Generated output must be deterministic.
4. The generator must fail loudly on incomplete metadata rather than guessing.
5. The generator should not rewrite commands, skills, or references into duplicate Codex copies.
   Generated Codex skill wrappers are the exception when the target surface is skill-based and the wrapper remains derived from the canonical command source.
6. If a shared-content incompatibility is found, fix the shared source instead of patching generated output whenever feasible.

## Risks

### Risk 1: Installable but Not Operational

Generating only manifest files may make the plugin installable without making it actually work.

Mitigation:

- treat shared-content portability as first-class implementation work

### Risk 2: Drift Between Claude and Codex Metadata

If overrides become too large, the Codex package effectively becomes a second plugin.

Mitigation:

- keep overrides intentionally small and limited to truly Codex-specific fields

### Risk 3: Hook Portability on Windows

Bash-based hooks may be awkward in Codex environments on Windows.

Mitigation:

- document prerequisites in initial release
- optionally add wrappers in a follow-up phase if needed

### Risk 4: Review Subsystem Inconsistency

The review commands currently appear to mix old and new artifact models.

Mitigation:

- normalize storage before calling Codex support complete

## Acceptance Criteria

The work is complete when all of the following are true:

1. The Claude plugin still works and remains present.
2. Codex plugin files are generated from canonical source, not maintained separately.
3. `plugins/sdlc-workflow/.codex-plugin/plugin.json` exists and is generated.
4. `.agents/plugins/marketplace.json` exists and is generated.
5. Codex-facing workflow command wrappers exist under `.codex-generated/skills/` and are generated.
6. Shared content no longer relies on Claude-only assumptions in critical execution paths.
7. A documented smoke test proves Codex installability and basic operation.
8. A `--check` mode can detect stale generated files.

## Recommended Branching and Execution Order

1. Create a dedicated feature branch.
2. Add generator inputs and script.
3. Generate Codex artifacts.
4. Refactor shared content for portability.
5. Validate runtime behavior.
6. Add drift checks and documentation.

## Immediate Next Step

Once implementation is authorized, begin with Phase 1:

- add the Codex overrides file
- implement the generator script
- generate the first Codex plugin and marketplace files
