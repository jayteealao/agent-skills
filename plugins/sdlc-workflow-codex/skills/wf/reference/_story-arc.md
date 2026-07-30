# Shared story-arc contract (single source)

Structure rules for artifact story sections and chat summaries. This file
defines the arc — what the story section must contain and in what order. It
defines no language rules: all story prose follows the controlled-language
contract in [_ste-procedural.md](_ste-procedural.md), sections 1 and 3.

**Scope.** Every substantive artifact opens with one prose section,
immediately under the frontmatter and before any structured section. The chat
summary each stage returns opens with the same prose, compressed (A6). The
renderer lifts the story section to the top of the rendered page, so the
heading pattern in A1 is load-bearing. The prose reports a trajectory, not a
status: where the work came from, the road it took, and where it goes next.

- **A1 — The heading is `## The <Subcommand>`, title-cased.**

  | Subcommand | Heading | Subcommand | Heading |
  |---|---|---|---|
  | intake | `## The Intake` | ship | `## The Ship` |
  | shape | `## The Shape` | retro | `## The Retro` |
  | slice (master) | `## The Slices` | instrument | `## The Instrumentation` |
  | slice (per-slice) | `## The Slice` | experiment | `## The Experiment` |
  | plan | `## The Plan` | benchmark | `## The Benchmark` |
  | implement | `## The Implementation` | profile | `## The Profile` |
  | verify | `## The Verification` | design | `## The Design` |
  | review | `## The Review` | probe | `## The Probe` |
  | handoff | `## The Handoff` | simplify | `## The Triage` |

  Intake modes inherit the mode noun: `## The Fix`, `## The RCA`,
  `## The Investigation`, `## The Discovery`, `## The Hotfix`,
  `## The Refactor`, `## The Dependency Update`, `## The Ideation`,
  `## The Adoption`. The drivers `auto` and `yolo` write no artifact of their
  own; their final chat summary follows A6.
- **A2 — Three beats, in this order, every time.**
  1. **Origin.** The state this stage inherited: what the previous stage
     handed over, or the problem that started the work.
  2. **Road.** The load-bearing decisions, in the order they were made, each
     with its reason. Include the decisive counts.
  3. **Destination.** What this stage enables next, and the top open risk in
     concrete terms.
- **A3 — One to three short paragraphs.** One paragraph per beat when the
  material warrants it. A small change compresses all three beats into one
  paragraph, in the same order. `_ste-procedural.md` rule S4 governs each
  paragraph; the 25-word descriptive cap (I3) applies.
- **A4 — Self-sufficient.** A reader who reads only this section knows what
  was produced, the load-bearing decisions and counts, and the top risk. The
  structured sections beneath it are drill-down, never a prerequisite.
- **A5 — Never restate the heading.** Do not open with "This <stage>
  implements…" or any sentence that repeats the heading. The origin beat opens
  the section, so the first sentence names the inherited state or the problem.
- **A6 — Chat-summary form.** Two to five sentences, no bullets, no field
  labels, the same three beats in the same order. The receipt fields
  (`Deltas:`, `Artifacts:`, `Next:`) sit beneath it.
