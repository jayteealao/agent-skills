# Platform forms: the terminal (`design/_platforms-terminal.md`)

The rules for a terminal surface: command-line output or a terminal interface. [_platforms.md](_platforms.md) says which file a project reads.

> Load with: `design/_platforms-terminal.md`

## Terminal

A terminal surface has no motion form. The frequency and purpose gates of [animate.md](animate.md), the worst-case content of [_worst-case.md](_worst-case.md) and the native feel of [adapt.md](adapt.md) still apply. Draw and check it with these rules.

1. Draw the screen in a light scheme and in a dark scheme. Use a real, named color scheme for each, and state the scheme on the screen.
2. Check the contrast of ANSI yellow (SGR 33) and bright black (SGR 90) on the ground of each scheme. In Campbell, yellow is about 7.5:1 and bright black about 4.3:1. In Solarized Light, yellow is about 3.0:1 and bright black is above 12:1.
3. Do not set text in a color below 4.5:1 on its ground. Never make yellow or bright black the only signal of a state: the person's own scheme can differ.
4. Draw the screen at 80 columns by 24 rows. It sets the height budget: the result and the next command fit in 24 rows.
5. Print each path in a form that pastes into every target shell: an absolute path, in double quotes when it has a space. Do not print `~`. Not every shell expands it.
6. Print a "done" line only after an end-to-end check of the path it reports.

Capture each terminal screen through the ANSI render, with `campbell` for the dark scheme and `solarized-light` for the light scheme:

```
node "<skill-dir>/scripts/design-boards.mjs" ansi <input.txt> --scheme <campbell|solarized-light> --out <file.html>
```

