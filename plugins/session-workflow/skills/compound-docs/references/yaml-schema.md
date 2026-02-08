# YAML Frontmatter Schema

**See `schema.yaml` in the compound-docs skill directory for the complete schema specification.**

## Required Fields

- **area** (string): Project area or module (e.g., "API Layer", "Android Client", "Worker Infrastructure")
- **date** (string): ISO 8601 date (YYYY-MM-DD)
- **problem_type** (enum): One of [build_error, test_failure, runtime_error, performance_issue, database_issue, security_issue, ui_bug, integration_issue, logic_error, config_error, developer_experience, workflow_issue, best_practice, documentation_gap]
- **component** (enum): One of [frontend, backend, api, database, mobile, worker, infrastructure, build_system, testing, config, documentation, tooling]
- **symptoms** (array): 1-5 specific observable symptoms
- **root_cause** (enum): One of [missing_dependency, missing_optimization, wrong_api, type_mismatch, race_condition, memory_issue, config_error, logic_error, constraint_violation, missing_validation, missing_permission, platform_issue, version_mismatch, missing_migration, incomplete_setup]
- **resolution_type** (enum): One of [code_fix, migration, config_change, test_fix, dependency_update, environment_setup, workaround, documentation_update, tooling_addition]
- **severity** (enum): One of [critical, high, medium, low]

## Optional Fields

- **framework_version** (string): Framework/runtime version (e.g., "Node 20.11", "Kotlin 1.9")
- **platform** (string): OS/platform details (e.g., "Windows 11 + WSL2")
- **tags** (array): Searchable keywords (lowercase, hyphen-separated)

## Validation Rules

1. All required fields must be present
2. Enum fields must match allowed values exactly (case-sensitive)
3. symptoms must be YAML array with 1-5 items
4. date must match YYYY-MM-DD format
5. tags should be lowercase, hyphen-separated

## Example

```yaml
---
area: Worker Infrastructure
date: 2026-02-08
problem_type: build_error
component: build_system
symptoms:
  - "wrangler: command not found after pnpm install"
  - "Build fails with ENOENT on wrangler.toml"
root_cause: missing_dependency
resolution_type: dependency_update
severity: high
tags: [wrangler, pnpm, cloudflare-workers]
---
```

## Category Mapping

Based on `problem_type`, documentation is filed in:

- **build_error** -> `.claude/solutions/build-errors/`
- **test_failure** -> `.claude/solutions/test-failures/`
- **runtime_error** -> `.claude/solutions/runtime-errors/`
- **performance_issue** -> `.claude/solutions/performance-issues/`
- **database_issue** -> `.claude/solutions/database-issues/`
- **security_issue** -> `.claude/solutions/security-issues/`
- **ui_bug** -> `.claude/solutions/ui-bugs/`
- **integration_issue** -> `.claude/solutions/integration-issues/`
- **logic_error** -> `.claude/solutions/logic-errors/`
- **config_error** -> `.claude/solutions/config-errors/`
- **developer_experience** -> `.claude/solutions/developer-experience/`
- **workflow_issue** -> `.claude/solutions/workflow-issues/`
- **best_practice** -> `.claude/solutions/best-practices/`
- **documentation_gap** -> `.claude/solutions/documentation-gaps/`
