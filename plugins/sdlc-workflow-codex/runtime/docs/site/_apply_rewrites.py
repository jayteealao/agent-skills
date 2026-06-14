#!/usr/bin/env python3
"""Apply rewritten page bodies from a workflow result file to _build_pages.py."""
import json
import re
import sys
from pathlib import Path

WORKFLOW_OUTPUT = r'C:\Users\jayte\AppData\Local\Temp\claude\C--Users-jayte-Documents-dev-agent-skills\11a0cc3e-3cb9-4d3a-9613-507b175f1c99\tasks\wf4eaegup.output'
BUILD_SCRIPT = Path(__file__).parent / '_build_pages.py'


def replace_body(content: str, page_path: str, new_body: str) -> tuple[str, bool]:
    """Replace the body triple-quoted string for a specific page in _build_pages.py.

    The format in _build_pages.py is:
        PAGES.append((
            "path/to/file.html",
            "Title",
            "quadrant",
            'breadcrumb HTML',
            \"\"\"
        <body content>
        \"\"\",
            None, None,
        ))
    """
    escaped = re.escape(page_path)
    # Pattern:
    #   Group 1: PAGES.append(( ... "path", ... \"\"\"\\n  (everything up to + including opening body delimiter)
    #   Group 2: old body content
    #   Group 3: \\n\"\"\"  (closing triple-quote at column 0 — prev/next vary, this is stable)
    pattern = (
        rf'(PAGES\.append\(\(\s*\n\s+"{escaped}",[\s\S]*?\n    """\n)'
        rf'([\s\S]*?)'
        rf'(\n""")'
    )
    new_content, count = re.subn(pattern, lambda m: m.group(1) + new_body + m.group(3), content, count=1)
    return new_content, count == 1


def main():
    print(f"Loading workflow results from:\n  {WORKFLOW_OUTPUT}")
    with open(WORKFLOW_OUTPUT, encoding='utf-8') as f:
        data = json.load(f)

    results = data['result']
    print(f"Found {len(results)} page rewrites to apply.")

    content = BUILD_SCRIPT.read_text(encoding='utf-8')
    original_len = len(content)

    applied = 0
    skipped = []
    for r in results:
        path = r['path']
        new_body = r['new_body']
        if not new_body or not new_body.strip():
            skipped.append(f"{path}: empty new_body")
            continue
        content, ok = replace_body(content, path, new_body)
        if ok:
            applied += 1
            print(f"  OK  {path}")
        else:
            skipped.append(f"{path}: pattern not matched")

    if skipped:
        print(f"\nSKIPPED ({len(skipped)}):")
        for s in skipped:
            print(f"  SKIP  {s}")

    if applied == 0:
        print("\nNothing matched — no changes written.")
        sys.exit(1)

    BUILD_SCRIPT.write_text(content, encoding='utf-8', newline='\n')
    print(f"\nApplied {applied}/{len(results)} rewrites. File grew/shrank by {len(content) - original_len:+} chars.")
    print("Run: python3 _build_pages.py")


if __name__ == '__main__':
    main()
