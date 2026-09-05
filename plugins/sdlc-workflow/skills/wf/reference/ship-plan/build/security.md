# Ship-plan build — security and supply-chain gates (`ship-plan/build.md` Step 13)

Load this file from `build.md` Steps 3–16 when audit P is Missing or Non-compliant (or the user selected it). Step 13.

# Step 13 — Implement: security & supply-chain gates (Audit P)

Skip if no `security` block. For each non-`none` gate (align generated steps to the conventions in `../review/supply-chain.md`):

- **SAST** — `codeql` → create `.github/workflows/codeql.yml` (`on: pull_request` + `schedule`, `github/codeql-action/{init,analyze}@v3`, languages auto-detected from the ecosystem). Other tools → add a CI step running `security.sast.cmd`.
- **Dependency audit** — add a step to the PR workflow running `dependency-audit.cmd` with the `fail-on` threshold (e.g. `npm audit --audit-level=high`, `pip-audit`, `cargo audit`, `osv-scanner -r .`).
- **Secret scanning** — add a CI step (e.g. `gitleaks/gitleaks-action@v2`); when `pre-commit: true`, also wire it into the Block-I hook framework (a `pre-commit` hook entry).
- **SBOM** — add a step to the release workflow generating the SBOM (`anchore/sbom-action` / `cyclonedx-*`), and when `publish-with-release` attach it to the GitHub release.
- **License check** — add a PR step enforcing `allow[]`/`deny[]` (e.g. `license-checker --onlyAllow`, `cargo-deny check licenses`).
- **Scheduled scans** — gates with a `schedule` also get an `on: schedule:` trigger (a `security-scan.yml` workflow) so they run independent of PR traffic.

Enabled PR-time gates that aren't already in `pre-merge-checks[]` are added there too (consistent with Blocks H/C).
