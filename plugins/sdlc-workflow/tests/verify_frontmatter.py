#!/usr/bin/env python3
"""Verify sdlc-workflow artifact YAML frontmatter against frontmatter.schema.json.

Usage:
  python verify_frontmatter.py                          # scan .ai/workflows/, .ai/simplify/, .ai/profiles/
  python verify_frontmatter.py path/to/file.md ...      # validate listed files
  python verify_frontmatter.py --root <dir>             # custom scan root
  python verify_frontmatter.py --schema <path.json>     # custom schema path
  python verify_frontmatter.py --self-test              # run built-in fixtures

Exit codes:
  0  every file validated
  1  one or more files failed
  2  unrecoverable error (schema missing, etc.)
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable

# ---------------------------------------------------------------------------
# Optional deps: PyYAML for proper YAML parsing, jsonschema for full validation.
# Both are nice-to-have. The script degrades to a minimal hand-rolled check
# if either is missing, so it can run in stripped-down CI containers.
# ---------------------------------------------------------------------------
try:
    import yaml  # type: ignore
    HAVE_YAML = True
except ImportError:
    HAVE_YAML = False

try:
    import jsonschema  # type: ignore
    from jsonschema import Draft202012Validator  # type: ignore
    HAVE_JSONSCHEMA = True
except ImportError:
    HAVE_JSONSCHEMA = False


FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*(?:\n|$)", re.DOTALL)
STAGE_FILENAME_RE = re.compile(r"^(\d{2})([a-z]?)-([a-z0-9-]+)\.md$")

# Maps stage-file basenames (or filename prefixes) to the expected `type:`.
# Used to give precise errors when the frontmatter `type` is missing/wrong.
FILENAME_TO_EXPECTED_TYPE: dict[str, str] = {
    "00-index.md": "index",
    "00-sync.md": "sync-report",
    "01-intake.md": "intake",
    "02-shape.md": "shape",
    "02b-design.md": "design",
    "02c-craft.md": "design-brief",
    "03-slice.md": "slice-index",
    "04-plan.md": "plan-index",
    "04b-instrument.md": "augmentation",   # augmentation-type: instrument
    "04c-experiment.md": "augmentation",   # augmentation-type: experiment
    "05-implement.md": "implement-index",
    "05c-benchmark.md": "augmentation",    # augmentation-type: benchmark
    "06-verify.md": "verify-index",
    "07-design-critique.md": "design-critique",
    "07-design-audit.md": "design-audit",
    "08-handoff.md": "handoff",
    "09-ship.md": "ship",                  # legacy
    "09-ship-runs.md": "ship-runs-index",
    "10-retro.md": "retro",
    "90-resume.md": "resume",
}

PREFIX_TO_EXPECTED_TYPE: list[tuple[str, str]] = [
    ("03-slice-",     "slice"),
    ("04-plan-",      "plan"),
    ("05-implement-", "implement"),
    ("06-verify-",    "verify"),
    ("07-review-",    "review"),       # may also be review-command — looser
    ("09-ship-run-",  "ship-run"),
    ("02-shape-amend-", "shape-amendment"),
    ("skip-",         "skip-record"),
]


@dataclass
class Issue:
    path: Path
    field: str         # JSON-pointer-ish path, e.g. "/refs"
    message: str

    def render(self) -> str:
        loc = self.field if self.field else "(root)"
        return f"  {loc}: {self.message}"


@dataclass
class FileResult:
    path: Path
    issues: list[Issue]
    detected_type: str | None

    @property
    def ok(self) -> bool:
        return not self.issues


# ---------------------------------------------------------------------------
# Frontmatter extraction + parsing
# ---------------------------------------------------------------------------

def extract_frontmatter(text: str) -> str | None:
    """Return the YAML frontmatter body, or None if the file lacks a block."""
    match = FRONTMATTER_RE.match(text)
    if not match:
        return None
    return match.group(1)


def parse_yaml(body: str) -> tuple[Any, str | None]:
    """Parse YAML body. Returns (data, error_message)."""
    if HAVE_YAML:
        try:
            return yaml.safe_load(body), None
        except yaml.YAMLError as exc:
            return None, f"YAML parse error: {exc}"
    # Fallback: very small flat-scalar parser. Adequate to extract
    # schema/type/slug for the minimal-check path; lists/objects become strings.
    data: dict[str, Any] = {}
    for line in body.splitlines():
        if not line or line.startswith("#") or line.startswith(" "):
            continue
        if ":" not in line:
            continue
        key, _, raw = line.partition(":")
        key = key.strip()
        raw = raw.strip()
        if not raw:
            data[key] = ""
            continue
        if raw.startswith(("'", '"')) and raw.endswith(raw[0]) and len(raw) >= 2:
            data[key] = raw[1:-1]
        elif raw == "true":
            data[key] = True
        elif raw == "false":
            data[key] = False
        elif raw == "null" or raw == "~":
            data[key] = None
        else:
            try:
                data[key] = int(raw)
            except ValueError:
                data[key] = raw
    return data, None


# ---------------------------------------------------------------------------
# Expected-type inference from filename
# ---------------------------------------------------------------------------

def expected_type_for(file_path: Path) -> str | None:
    name = file_path.name
    if name in FILENAME_TO_EXPECTED_TYPE:
        return FILENAME_TO_EXPECTED_TYPE[name]
    for prefix, expected in PREFIX_TO_EXPECTED_TYPE:
        if name.startswith(prefix):
            return expected
    # design-augmentation files live under design-notes/
    if "design-notes" in file_path.parts:
        return "design-augmentation"
    # simplify runs
    if "simplify" in file_path.parts:
        return "simplify-run"
    # profiles
    if "profiles" in file_path.parts:
        return "profile"
    return None


# ---------------------------------------------------------------------------
# Schema loading + validation
# ---------------------------------------------------------------------------

def load_schema(schema_path: Path) -> dict[str, Any]:
    with schema_path.open("r", encoding="utf-8") as fh:
        return json.load(fh)


def _branch_for_type(schema: dict[str, Any], type_value: Any) -> dict[str, Any] | None:
    """Find the oneOf branch whose `type` const/enum matches `type_value`.

    Walks `schema.allOf[*].oneOf[*]` (the layout of frontmatter.schema.json),
    resolves each `$ref` against `schema.$defs`, and returns the matching
    sub-schema. Returns None if no branch matches — the caller then falls
    back to the raw oneOf error.
    """
    defs = schema.get("$defs", {})

    def resolve(node: dict[str, Any]) -> dict[str, Any]:
        if "$ref" in node and node["$ref"].startswith("#/$defs/"):
            return defs.get(node["$ref"].split("/")[-1], node)
        return node

    def type_matches(branch: dict[str, Any]) -> bool:
        type_schema = branch.get("properties", {}).get("type", {})
        if "const" in type_schema:
            return type_schema["const"] == type_value
        if "enum" in type_schema:
            return type_value in type_schema["enum"]
        return False

    for chunk in schema.get("allOf", []):
        for branch_ref in chunk.get("oneOf", []):
            branch = resolve(branch_ref)
            if type_matches(branch):
                return branch
    return None


def _minimal_validate(data: Any, file_path: Path) -> list[Issue]:
    """Used when jsonschema isn't available. Checks only the must-have base."""
    issues: list[Issue] = []
    if not isinstance(data, dict):
        return [Issue(file_path, "", "frontmatter is not a YAML mapping")]
    if data.get("schema") != "sdlc/v1":
        issues.append(Issue(file_path, "/schema",
                            f"expected 'sdlc/v1', got {data.get('schema')!r}"))
    if not data.get("type"):
        issues.append(Issue(file_path, "/type", "missing required field 'type'"))
    if not data.get("slug") and expected_type_for(file_path) not in {"profile", "simplify-run"}:
        issues.append(Issue(file_path, "/slug", "missing required field 'slug'"))

    expected = expected_type_for(file_path)
    actual = data.get("type")
    if expected and actual and actual != expected:
        # Accept slice-index/slice, plan-index/plan etc — see schema notes.
        if not (expected == "slice-index" and actual in {"slice", "slice-index"}):
            issues.append(Issue(file_path, "/type",
                                f"expected type {expected!r} for filename, got {actual!r}"))
    return issues


def validate_file(file_path: Path, schema: dict[str, Any]) -> FileResult:
    try:
        text = file_path.read_text(encoding="utf-8")
    except OSError as exc:
        return FileResult(file_path, [Issue(file_path, "", f"read failed: {exc}")], None)

    body = extract_frontmatter(text)
    if body is None:
        return FileResult(file_path,
                          [Issue(file_path, "", "no YAML frontmatter (file must start with `---`)")],
                          None)

    data, err = parse_yaml(body)
    if err:
        return FileResult(file_path, [Issue(file_path, "", err)], None)

    detected = data.get("type") if isinstance(data, dict) else None

    if not HAVE_JSONSCHEMA:
        return FileResult(file_path, _minimal_validate(data, file_path), detected)

    # Strategy: if `type:` matches a known branch, validate against that
    # branch alone — this produces precise errors instead of the noisy
    # "is not valid under any of the given schemas" oneOf cascade.
    branch = _branch_for_type(schema, detected) if isinstance(data, dict) else None

    if branch is not None:
        # Resolve $defs against the original schema so $ref inside the branch works.
        branch_with_defs = dict(branch)
        branch_with_defs["$defs"] = schema.get("$defs", {})
        validator = Draft202012Validator(branch_with_defs)
    else:
        validator = Draft202012Validator(schema)

    raw_errors = sorted(validator.iter_errors(data), key=lambda e: list(e.absolute_path))
    issues: list[Issue] = []
    for err in raw_errors:
        field = "/" + "/".join(str(p) for p in err.absolute_path)
        issues.append(Issue(file_path, field, err.message))
    return FileResult(file_path, issues, detected)


# ---------------------------------------------------------------------------
# Path discovery
# ---------------------------------------------------------------------------

def discover_artifacts(root: Path) -> list[Path]:
    """Find every .md file under .ai/workflows/, .ai/simplify/, .ai/profiles/
    descending from `root`. We don't validate plain README.md or top-level docs.
    """
    out: list[Path] = []
    for base in ("workflows", "simplify", "profiles"):
        d = root / ".ai" / base
        if d.is_dir():
            out.extend(sorted(d.rglob("*.md")))
    return out


# ---------------------------------------------------------------------------
# Self-test fixtures
# ---------------------------------------------------------------------------

SELF_TEST_FIXTURES: list[tuple[str, str, bool]] = [
    # (name, content, should_pass)
    (
        "valid-intake",
        """---
schema: sdlc/v1
type: intake
slug: demo-slug
status: complete
stage-number: 1
created-at: "2026-05-11T12:00:00Z"
updated-at: "2026-05-11T12:05:00Z"
tags: [demo]
refs:
  index: 00-index.md
  next: 02-shape.md
next-command: /wf shape demo-slug
next-invocation: shape
---
body
""",
        True,
    ),
    (
        "missing-schema",
        """---
type: intake
slug: demo-slug
---
body
""",
        False,
    ),
    (
        "wrong-status-enum",
        """---
schema: sdlc/v1
type: intake
slug: demo-slug
status: bogus-status
stage-number: 1
created-at: "2026-05-11T12:00:00Z"
updated-at: "2026-05-11T12:05:00Z"
tags: []
refs: {}
next-command: ""
next-invocation: ""
---
""",
        False,
    ),
    (
        "valid-shape",
        """---
schema: sdlc/v1
type: shape
slug: demo
status: complete
stage-number: 2
created-at: "2026-05-11T12:00:00Z"
updated-at: "2026-05-11T12:05:00Z"
docs-needed: false
docs-types: []
tags: []
refs: {index: 00-index.md}
next-command: /wf slice demo
next-invocation: slice
---
""",
        True,
    ),
    (
        "valid-ship-run",
        """---
schema: sdlc/v1
type: ship-run
slug: demo
run-id: 20260511T1200Z
status: complete
plan-ref: ../../ship-plan.md
plan-version-at-run: 1
created-at: "2026-05-11T12:00:00Z"
updated-at: "2026-05-11T12:30:00Z"
environment: production
version: 1.2.3
prior-version: 1.2.2
go-nogo: go
merge-strategy: squash
tags: []
refs: {index: 00-index.md}
next-command: ""
next-invocation: ""
---
""",
        True,
    ),
]


def run_self_test(schema: dict[str, Any]) -> int:
    """Validate the embedded fixtures. Returns process exit code."""
    failures = 0
    for name, content, should_pass in SELF_TEST_FIXTURES:
        tmp = Path(f"_selftest_{name}.md")
        tmp.write_text(content, encoding="utf-8")
        try:
            result = validate_file(tmp, schema)
            actual_pass = result.ok
            mark = "PASS" if actual_pass == should_pass else "FAIL"
            if actual_pass != should_pass:
                failures += 1
            print(f"  {mark}  {name:<24} expected={'ok' if should_pass else 'errors'} "
                  f"got={'ok' if actual_pass else 'errors'} "
                  f"(detected type={result.detected_type})")
            if mark == "FAIL":
                for issue in result.issues:
                    print(issue.render())
        finally:
            tmp.unlink(missing_ok=True)
    print()
    print(f"self-test: {len(SELF_TEST_FIXTURES) - failures}/{len(SELF_TEST_FIXTURES)} fixtures passed")
    return 0 if failures == 0 else 1


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("paths", nargs="*", help="Files or directories to validate")
    parser.add_argument("--root", type=Path, default=Path.cwd(),
                        help="Repo root for auto-discovery (default: cwd)")
    parser.add_argument("--schema", type=Path,
                        default=Path(__file__).parent / "frontmatter.schema.json",
                        help="Path to JSON Schema (default: ./frontmatter.schema.json)")
    parser.add_argument("--quiet", action="store_true",
                        help="Only print failing files")
    parser.add_argument("--self-test", action="store_true",
                        help="Run built-in fixtures and exit")
    args = parser.parse_args(argv)

    if not args.schema.exists():
        print(f"error: schema not found at {args.schema}", file=sys.stderr)
        return 2

    schema = load_schema(args.schema)

    if not args.quiet:
        print(f"verifier mode: yaml={'on' if HAVE_YAML else 'fallback'}, "
              f"jsonschema={'on' if HAVE_JSONSCHEMA else 'minimal'}")
        if not HAVE_YAML:
            print("  (install PyYAML for accurate YAML parsing — `pip install pyyaml`)")
        if not HAVE_JSONSCHEMA:
            print("  (install jsonschema for full validation — `pip install jsonschema`)")
        print()

    if args.self_test:
        return run_self_test(schema)

    # Collect target files
    targets: list[Path] = []
    if args.paths:
        for raw in args.paths:
            p = Path(raw)
            if p.is_dir():
                targets.extend(sorted(p.rglob("*.md")))
            elif p.exists():
                targets.append(p)
            else:
                print(f"warning: {p} does not exist", file=sys.stderr)
    else:
        targets = discover_artifacts(args.root)

    if not targets:
        if not args.quiet:
            print(f"no workflow artifacts found under {args.root}/.ai/")
        return 0

    failed = 0
    for path in targets:
        result = validate_file(path, schema)
        if result.ok:
            if not args.quiet:
                print(f"OK    {path}  ({result.detected_type})")
        else:
            failed += 1
            print(f"FAIL  {path}  ({result.detected_type or 'unknown type'})")
            for issue in result.issues:
                print(issue.render())

    total = len(targets)
    if not args.quiet:
        print()
        print(f"summary: {total - failed}/{total} files valid"
              + (f", {failed} FAILED" if failed else ""))
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
