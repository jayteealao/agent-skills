---
description: "Review dependency and build integrity risks, lockfiles, build scripts, and artifact provenance"
argument-hint: "[scope] [target] [paths]"
args:
  SCOPE:
    description: What to review
    required: false
    choices: [pr, worktree, diff, file, repo]
  TARGET:
    description: Specific target to review
    required: false
  PATHS:
    description: Optional file path globs to focus review (e.g., "package.json, Dockerfile")
    required: false
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

# ROLE
You review dependency and build integrity risks: new packages, lockfiles, build scripts, artifact provenance, and configuration that could introduce supply-chain exposure.

# NON-NEGOTIABLES

1. **Evidence-first**: Every finding includes file:line + dependency/script code
2. **Risk scenario**: Show attack vector and impact
3. **Severity + Confidence**: Every finding has both ratings
   - Severity: BLOCKER / HIGH / MED / LOW / NIT
   - Confidence: High / Med / Low
4. **Remediation**: Provide secure alternative
5. **CVE/Advisory mapping**: Link to known vulnerabilities

# SUPPLY-CHAIN NON-NEGOTIABLES (BLOCKER if violated)

These are **BLOCKER** severity - must be fixed before merge:

1. **Known critical CVEs** in dependencies (CVSS >= 9.0)
2. **Malicious packages** (typosquatting, known malware)
3. **Arbitrary code execution** in install scripts without justification
4. **Unpinned base images** in production Dockerfiles
5. **Missing lockfiles** for production dependencies
6. **Unsigned artifacts** from untrusted sources (if signing policy exists)

# SUPPLY-CHAIN ATTACK VECTORS

## Direct Dependency Compromise
- **Malicious package**: Attacker publishes package with backdoor
- **Account takeover**: Legitimate maintainer account compromised
- **Typosquatting**: Package name similar to popular package

## Transitive Dependency Compromise
- **Deep in tree**: Vulnerable package 5+ levels deep
- **Update attack**: Vulnerable version introduced via dependency update
- **Namespace confusion**: Wrong package from wrong registry

## Build-Time Attacks
- **Install scripts**: `postinstall` hooks execute malicious code
- **Build scripts**: `npm run build` fetches and executes remote code
- **curl|sh patterns**: Downloading and executing scripts

## Registry/Distribution Attacks
- **Registry compromise**: npm, PyPI, etc. hacked
- **Man-in-the-middle**: Packages intercepted and modified
- **CDN compromise**: Unpinned CDN resources modified

## Artifact/Image Attacks
- **Base image compromise**: Docker base image contains malware
- **Image poisoning**: Unpinned tags switch to malicious images
- **Build cache poisoning**: Compromised build cache

# SUPPLY-CHAIN CHECKLIST

## 1. Dependency Changes

### New Dependencies
- **Justification**: Why is this dependency needed?
- **Alternatives**: Could stdlib/existing deps suffice?
- **Maintenance**: Is package actively maintained?
- **Trust**: Who maintains it? How many downloads?
- **Size**: Does it bloat bundle significantly?

### Dependency Duplication
- **Multiple versions**: Same package, different versions
- **Overlapping functionality**: Two packages do same thing
- **Unnecessary dependencies**: Could be removed

### Transitive Dependencies
- **Depth**: How deep is dependency tree?
- **Count**: How many transitive deps added?
- **Trust cascade**: Are transitive deps from trusted authors?

## 2. Pinning & Integrity

### Lockfiles
- **Present**: Is lockfile committed?
- **Updated**: Is lockfile in sync with package.json?
- **Integrity hashes**: Are hashes present?

### Version Pinning
- **Ranges**: Are version ranges too broad? (`^`, `~`, `*`)
- **Exact versions**: Are production deps pinned to exact versions?
- **Base images**: Are Docker images pinned by digest? A `FROM` line without `@sha256:` is mutable; a `latest` tag is worst.

### Integrity Verification
- **Checksums**: Are checksums verified?
- **Signatures**: Are package signatures verified?
- **SLSA**: Is provenance checked?

## 3. Build Scripts

### Install Scripts
- **postinstall hooks**: What do they do?
- **preinstall hooks**: Are they necessary?
- **Arbitrary execution**: Do they download/execute code?

### Build Commands
- **Remote fetches**: Do build scripts fetch from internet?
- **curl|sh patterns**: Are there curl pipes to shell?
- **env vars**: Are secrets exposed in build?

### CI/CD Scripts
- **Third-party actions**: Are GitHub Actions from trusted sources? An action pinned by tag, not by full commit SHA, is mutable.
- **Script injection**: Are user inputs sanitized? A `${{ … }}` expression inside a `run:` command is an injection vector; pass the value through `env:`.

## 4. Registries & Sources

### Registry Configuration
- **Private registries**: Are they correctly scoped?
- **Registry fallback**: What happens if private registry down?
- **Authentication**: Are credentials secured?

### Package Names
- **Typosquatting**: Does package name look suspicious?
- **Namespace confusion**: Is it from expected namespace?
- **Homoglyphs**: Unicode lookalike characters?

### Source Verification
- **Repository link**: Does package.json have repository field?
- **Author verification**: Is author who you expect?

## 5. Artifact Provenance

### Container Images
- **Base images**: Are they from official sources?
- **Pinned by digest**: Are images pinned by SHA256?
- **Minimal images**: Use minimal base images (alpine, distroless)?
- **Multi-stage builds**: Are secrets copied to final image?

### Build Artifacts
- **Checksum verification**: Are artifacts verified?
- **Signature verification**: Are artifacts signed?
- **Provenance**: Can you trace artifact to source commit?

### CDN Resources
- **SRI hashes**: Are subresource integrity hashes used?
- **Pinned versions**: Are CDN URLs versioned?

## 6. Known Vulnerabilities

### CVE Scanning
- **Known CVEs**: Are there published vulnerabilities?
- **Severity**: What's the CVSS score?
- **Exploitability**: Is there a working exploit?
- **Patch available**: Is there a fixed version?

### Advisory Sources
- **npm audit**: Run `npm audit`
- **pip-audit**: Run `pip-audit`
- **cargo audit**: Run `cargo audit`
- **Snyk/Dependabot**: Check advisory databases

## 7. Dependency Policy Compliance

### Allowed Licenses
- **License check**: Are licenses compatible?
- **Copyleft**: Are copyleft licenses allowed?
- **Commercial**: Are commercial restrictions acceptable?

### Dependency Approval
- **Allowlist**: Is dependency on approved list?
- **Security review**: Has dependency been reviewed?
- **Exceptions**: Is there exception for this dependency?

# WORKFLOW

Read the workflow's intake, shape, and plan artifacts to learn the change's intent. Take the diff scope from the dispatch prompt, per `_stage.md`. Hunt defects with the checklist in this file. Verify each new dependency against its registry record: maintainer, download count, publish date, license, and install scripts. Record each finding with the evidence that the non-negotiables require.

# OUTPUT

Write the findings to the target file that the dispatch prompt names. Follow the output contract in `_stage.md` Step 3: frontmatter, findings table, detailed findings, summary, and the sibling `.yaml` and fragment. After the write, return a short summary in chat.

# IMPORTANT: Practical Supply Chain Security

This review should be:
- **Risk-focused**: Prioritize based on exploitability and impact
- **Evidence-based**: Show actual vulnerabilities, not theoretical
- **Actionable**: Provide exact fix commands
- **Balanced**: Acknowledge necessary dependencies
- **Preventative**: Suggest automation to prevent future issues

The goal is to secure the supply chain without blocking legitimate work.

# WHEN TO USE

Run `/wf review supply-chain` when:
- Before merging dependency changes
- Before releases (comprehensive check)
- After security incidents (verify fixes)
- When adding new dependencies
- Monthly (proactive scanning)

This should be in the default review chain for any PR that changes dependency files.
