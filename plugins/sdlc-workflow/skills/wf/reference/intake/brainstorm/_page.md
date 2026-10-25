# The brainstorm page (sub-procedure of intake/brainstorm.md)

Each brainstorm has one page for the person: an HTML file that shows the board and every decision, in the workflow's records folder. A sub-agent writes it, so the loop does not wait on it. In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"`.

## When the page is written

Run the page agent at these moments, and at no other:

- after a check-in (2.5);
- at `pause`;
- after the record step of `done` (3.4).

## Run the page agent

1. Run `<wf> page brief "<root>" <slug>`. When it prints `no page needed`, skip the rest: the page shows the newest board.
2. Spawn one sub-agent at the medium tier, per [_subagents.md](../../_subagents.md). On a host that runs a child in the background, do not wait for it; go on with the loop. Give the child the brief of the next section, with the values from step 1.
3. When the child returns, run `<wf> page put "<root>" <slug>`. When it prints problems, give them to the child once, and run step 3 again. When problems stay, tell the person in one line that the page is old, and go on.

## The brief of the page agent

> Write one HTML page for the person who runs the brainstorm `<slug>`. Read the board `<board>`, the decision store `<decisions>`, and the record `01-brainstorm.md` (`<wf> record get "<root>" <slug> 01-brainstorm.md`). Change no file other than the draft.
>
> 1. Write the page to `<draft>`. Hold every style and script inline. Load nothing from the network: no font, no script, no image.
> 2. Put `<meta name="wf:board" content="<version>">` and a viewport meta in the head, and give the page a `<title>` with the topic.
> 3. Show, in this order: the summary; the map of areas, each with its state and brief; each thread with what is known and what is open; every decision, with its scope (keep, later, cut) and its accepted risk; the open questions and tensions; the work packets with their order and goal; and the sketches as links.
> 4. Give the element of each area, thread, decision and work packet a `data-key` attribute with its key. Give the element of each entry of the decision store a `data-key` attribute with its id (`D-001`, ...).
> 5. Use plain words, as `01-brainstorm.md` does. Show no board key as text.
> 6. Make the page look good: a clear type scale, a calm palette, a light and a dark scheme (`prefers-color-scheme: dark`), and a layout that works at 375 px. A replaced decision shows as replaced, not as live.
> 7. Return one line: the path of the draft.

## What the person sees

Tell the person the path of the page once per session, the first time it is written: `<page>`.
