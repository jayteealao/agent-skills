# Requires tables: authoring

This file is for an author of a stage reference. A stage run does not load it. A stage run reads [_requires.md](_requires.md): the table, the modes, and the checklist.

## Where the table goes

1. Give every stage reference that writes a stage artifact one `## Requires` section.
2. Put the section directly after the header detail table.
3. Open the section with this line: "Read every row before you write the stage artifact. [_requires.md](_requires.md) defines the check."
4. Do not restate `_requires.md` in the stage reference. Cite it.
5. Write one `writes` row for each stage artifact that the table is for.
6. Use only the placeholders `<slice>` and `<mode>` in a path. A glob `*` is permitted.
7. Prefer a Sections cell on an `always` row over a new `mode:` row when a stage needs only part of a file.
