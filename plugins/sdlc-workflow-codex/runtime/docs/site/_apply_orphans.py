#!/usr/bin/env python3
"""Apply rewritten bodies to orphaned HTML pages (not in _build_pages.py PAGES)."""
import json
import re
import sys
from pathlib import Path

WORKFLOW_OUTPUT = r'C:\Users\jayte\AppData\Local\Temp\claude\C--Users-jayte-Documents-dev-agent-skills\11a0cc3e-3cb9-4d3a-9613-507b175f1c99\tasks\wf4eaegup.output'
SITE_ROOT = Path(__file__).parent

# These pages are NOT in PAGES — they're committed HTML files that need direct edits.
ORPHAN_PATHS = {
    'how-to/start-workflow.html',
    'how-to/navigate-workflows.html',
    'how-to/amend-or-extend.html',
    'how-to/use-augmentations.html',
    'how-to/triage-pr-comments.html',
    'how-to/author-ship-plan.html',
    'how-to/run-a-release.html',
    'how-to/resume-paused-work.html',
    'how-to/close-workflows.html',
    'how-to/use-design.html',
    'reference/pipeline.html',
    'reference/commands.html',
    'reference/skills.html',
    'reference/wf-design.html',
    'reference/wf.html',
    'reference/wf-quick.html',
    'reference/wf-meta.html',
    'reference/wf-docs.html',
    'reference/review.html',
    'reference/artifacts.html',
    'reference/00-index-schema.html',
    'reference/ship-plan-schema.html',
    'reference/08-handoff-schema.html',
    'reference/09-ship-run-schema.html',
    'reference/hooks.html',
}


def apply_to_html(html_path: Path, new_body: str) -> tuple[str, bool]:
    """Replace body content in an orphaned HTML file.

    The HTML structure is:
        <main>
        <div class="breadcrumb">...</div>
        <span class="quadrant ...">...</span>
        <h1>Title</h1>
        [BODY CONTENT HERE]
        <div class="pager">...</div>
        </main>

    We replace everything between </h1>\\n and <div class="pager"> (or </main>).
    """
    html = html_path.read_text(encoding='utf-8')

    # Find the end of <h1>...</h1>
    h1_end = html.find('</h1>')
    if h1_end == -1:
        return html, False
    body_start = h1_end + len('</h1>') + 1  # +1 for the newline after </h1>

    # Find the start of pager (or </main> if no pager)
    pager_match = re.search(r'\n<div class="pager">', html[body_start:])
    if pager_match:
        body_end = body_start + pager_match.start()
    else:
        main_end = html.find('\n</main>', body_start)
        if main_end == -1:
            return html, False
        body_end = main_end

    new_html = html[:body_start] + '\n' + new_body + '\n' + html[body_end:]
    return new_html, True


def main():
    print(f"Loading workflow results from:\n  {WORKFLOW_OUTPUT}")
    with open(WORKFLOW_OUTPUT, encoding='utf-8') as f:
        data = json.load(f)

    results = [r for r in data['result'] if r['path'] in ORPHAN_PATHS]
    print(f"Found {len(results)} orphan page rewrites to apply.")

    applied = 0
    skipped = []
    for r in results:
        path = r['path']
        new_body = r.get('new_body', '').strip()
        if not new_body:
            skipped.append(f"{path}: empty new_body")
            continue

        html_path = SITE_ROOT / path
        if not html_path.exists():
            skipped.append(f"{path}: file not found")
            continue

        new_html, ok = apply_to_html(html_path, new_body)
        if ok:
            html_path.write_text(new_html, encoding='utf-8', newline='\n')
            applied += 1
            print(f"  OK  {path}")
        else:
            skipped.append(f"{path}: could not find body markers in HTML")

    if skipped:
        print(f"\nSKIPPED ({len(skipped)}):")
        for s in skipped:
            print(f"  SKIP  {s}")

    print(f"\nApplied {applied}/{len(results)} orphan rewrites.")


if __name__ == '__main__':
    main()
