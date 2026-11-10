# The foundation (`design/foundation.md`)

Step 3c of the design stage ([stage.md](stage.md)). Load this file only when `<wf> design foundation <root>` exits 1, or when a screen needs a part that the library does not have. The run then has the mode `foundation`. In the commands below, `<wf>` is `node "<skill-dir>/scripts/wf.mjs"` and `<root>` is the project root. [_surface.md](_surface.md) → The foundation holds the rules of a component.

1. **Tokens.** When `<wf> design foundation <root>` prints `no tokens`:
   - When the token scanner of Step 3 found tokens in the code, use their values.
   - Otherwise, make the values from the picked direction and `02b-design.md`.
   - Write the roles into the `### Token roles` tables of `DESIGN.md`, one role name in each Role cell ([setup.md](setup.md) → The DESIGN.md template). Apply [_craft-floor.md](_craft-floor.md) → Record guard. Then run `<wf> design tokens <root>`.
2. **Components.** List each part that the screens need, for example a button, a field, a card, a navigation bar. Run `<wf> design components <root>` to see the library, and `<wf> design components scan <root>` to see the components of the code. For each part that the library does not have:
   - When the code has a component for the part, run `<wf> design component add <root> <key> --title "<title>" --code <file> --name <its name in the code> --workflow <slug>`.
   - When the code has none, run `<wf> design component add <root> <key> --title "<title>" --workflow <slug>`. The component is new, and the build must make it.
3. **Reuse first.** Do not add a component for a part that an existing component covers: add a variant to that component. Do not add two components for one job. `<wf> design component remove <root> <key>` takes back a component that you added by mistake.
4. **Draw each new entry.** Write the style of the component in `.ai/design/components.css`, with tokens only. Write `.ai/design/components/<key>.html` with each variant and state. For a component that the code has, read its source first, and match its look, variants and states.
5. When the product has no reusable parts, for example a terminal surface, run `<wf> design components none <root> --reason "<why>"`.
6. Run `<wf> design foundation <root>`. It must exit 0.
7. Ask no question here. The first decision of the next round ([stage.md](stage.md) Step 4b) is "the tokens and the components": its stop message names each role and each component that this step wrote, and the Tokens and Components lanes of the canvas show them.
