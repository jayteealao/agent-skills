# Changelog

All notable changes to the diataxis plugin will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-03-17

### Added
- Initial release of the Diátaxis documentation skills pack
- **`diataxis:plan`** — classifies a documentation request, proposes a docs map, and returns a prioritised writing plan with recommended skill for each deliverable
- **`diataxis:tutorial`** — writes learning-oriented lessons that guide a beginner through a complete, working experience; strict boundary discipline (no reference dumps, no how-to shortcuts)
- **`diataxis:how-to`** — writes goal-oriented task guides for competent users who know what they want but need the steps; assumes prior knowledge, no hand-holding
- **`diataxis:reference`** — writes neutral, structured, scannable technical reference (API docs, CLI commands, config keys, schema docs, error codes); no opinion, no narrative
- **`diataxis:explanation`** — writes conceptual, understanding-oriented content: design rationale, architecture overviews, trade-off discussions, historical context; the why, not the how
- **`diataxis:readme`** — writes a repository README as a front door that orients readers and routes them to deeper docs; borrows quickstart shape from tutorial but stays compact
- **`diataxis:review`** — reviews one document or a whole docs set against Diátaxis principles; returns type fit, boundary violations, audience fit, structure quality, and prioritised concrete fixes

### Technical Details
- All skills operate in the current execution context (no `context: fork`)
- Skills are user and model invocable
- Skill descriptions are tuned to trigger on natural-language requests ("review my docs", "write a README", "explain how X works", "API reference for Y")
- Boundary violation heuristics built into reviewer: tutorial-with-theory, how-to-that-teaches-basics, reference-with-opinion, explanation-with-steps, README-as-manual
- Severity scale in reviewer: Critical / Major / Minor
