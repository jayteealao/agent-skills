---
name: diataxis:review
description: Use when the user asks to review, audit, improve, classify, or reorganise existing documentation — for a single page or a whole docs set. Evaluates docs against Diátaxis principles: type fit, boundary discipline, user fit, structure, and quality. Returns concrete prioritised fixes and, where needed, recommends splitting overloaded pages. Triggers on phrases like "review my docs", "audit the documentation", "what's wrong with this guide", "improve this README", "tell me what's wrong".
---

# Documentation reviewer

## Purpose

Review one document or a whole docs set using Diátaxis.

The job is not to say whether the writing is "good" in the abstract. The job is to determine whether each page has the right purpose, stays within its boundaries, serves the right user need, and forms part of a usable documentation system.

## When to use

Use this skill when the user asks for:

- review my docs
- improve this README
- audit the documentation
- tell me what is wrong with this guide
- classify and reorganise these docs

## Review dimensions

Assess each page on these axes:

1. **Type fit**
   - tutorial
   - how-to
   - reference
   - explanation
   - landing page / README

2. **Boundary discipline**
   - does it stay in its lane?
   - what is contaminating it?

3. **User fit**
   - who is it for?
   - beginner, competent user, maintainer, evaluator?

4. **Structure**
   - is the page shaped appropriately for its type?
   - are headings and flow doing the right job?

5. **Functional quality**
   - accuracy
   - completeness
   - consistency
   - usefulness
   - precision

6. **Deep quality**
   - flow
   - anticipation of user needs
   - confidence
   - legibility
   - fitness for use

7. **System quality**
   - does the docs set provide a clear start point?
   - are task, lookup, and conceptual routes obvious?
   - are landing pages and groupings manageable?

## Review workflow

1. Determine the current type of each page from what it actually does, not what it is called.
2. State the page's ideal type if different.
3. Identify the main user need served.
4. List boundary violations.
5. Evaluate structure and quality.
6. Recommend concrete fixes in priority order.
7. Where needed, recommend splitting one page into multiple pages.

## Boundary violation heuristics

Flag examples like:

- tutorial with lots of theory
- how-to guide that teaches basics
- reference page with recommendations and opinion
- explanation page with installation steps
- README trying to be a full manual

## Review output format

For each document, return:

- Current type
- Ideal type
- Audience
- What works
- What is wrong
- Boundary violations
- Severity
- Recommended rewrite strategy

For a docs set, also return:

- missing doc types
- duplicates or overlaps
- proposed information architecture
- best next three fixes

## Severity scale

- Critical: prevents the page from serving its purpose
- Major: significantly reduces usefulness
- Minor: polish or local clarity issue

## Rewrite advice style

Be direct and specific.
Prefer:
- split this section into a separate explanation page
- move parameter tables into reference
- shrink the quickstart to one happy path
- add expected output after step 3

Avoid vague advice like:
- improve clarity
- add more detail
- make it nicer

## Final self-check

Before returning, verify:

- you judged the page by purpose, not title
- you identified the right audience
- your fixes are concrete and actionable
- you recommended splitting when one page is overloaded
