// renderers/_story.mjs — lift the leading "## The <Stage>" story section out of
// an artifact body so the orchestrator can render it FIRST (above the figure and
// the structured sections), with the rest of the body following in its normal
// place.
//
// Every `/wf` artifact opens with one prose "story" section named after its stage
// (`## The Plan`, `## The Verification`, …) — see skills/wf/reference/_narrative-voice.md.
// In the raw `.md` that section is already first; this helper makes the rendered
// HTML match, without touching any per-type renderer.

const H2 = /^##\s+\S/;                 // any level-2 heading
const STORY_H2 = /^##\s+The\s+.+$/;    // the story heading specifically
const H1_OR_H2 = /^#{1,2}\s+\S/;       // next section boundary (h1 or h2)

/**
 * Split a markdown body into `{ storyMarkdown, bodyRest }`.
 *
 * The story is the artifact's FIRST level-2 section, and only when that heading
 * matches `## The <X>`. Anchoring on "the first H2 must be a story heading"
 * (rather than "the first `## The …` anywhere") is deliberate: it prevents a
 * stray mid-body heading like `## The tradeoffs` from being mistaken for the
 * lead, and it matches the authored convention exactly.
 *
 * When there is no story section, `storyMarkdown` is '' and `bodyRest` is the
 * body unchanged — so any artifact predating the convention renders as before.
 */
export function splitStorySection(body) {
  if (typeof body !== 'string' || body === '') {
    return { storyMarkdown: '', bodyRest: typeof body === 'string' ? body : '' };
  }
  const lines = body.split(/\r?\n/);

  // The first H2 in the body — the only candidate for the lead.
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (H2.test(lines[i])) { start = i; break; }
  }
  if (start === -1 || !STORY_H2.test(lines[start])) {
    return { storyMarkdown: '', bodyRest: body };
  }

  // The story runs until the next section boundary (next h1/h2).
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (H1_OR_H2.test(lines[i])) { end = i; break; }
  }

  const storyMarkdown = lines.slice(start, end).join('\n').trim();
  const bodyRest = [...lines.slice(0, start), ...lines.slice(end)]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')   // close the gap the lifted section left behind
    .trim();

  return { storyMarkdown, bodyRest };
}
