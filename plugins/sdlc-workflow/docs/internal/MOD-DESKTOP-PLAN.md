# The Claude Code mod on Desktop, and a probe journal — plan

Status: **DRAFTED 2026-09-22** against v9.160.0 (`50bfe4fa`). Every engine
mechanism below is in the Claude Code 2.1.271 mod contract
(`.claude/types/claude-code.d.ts`) unless a line says **probe**.

Related: [MOD-FEATURES.md](MOD-FEATURES.md) (what the mod does today),
[POST-STAGE-COMPACT-PLAN.md](POST-STAGE-COMPACT-PLAN.md) (the aids this
makes reachable on Desktop), `hooks/mod/` (the module),
[RELEASE-DISCIPLINE.md](RELEASE-DISCIPLINE.md).

## 1. The defect

`hooks/mod/register.ts` binds its host once, at `session.start`, behind
one line:

```ts
if (e.surface !== 'terminal' || !e.isInteractive) return next(e)
```

The contract says `SessionStartInput.surface` is `terminal` under the REPL
and `null` for a `-p` run or the SDK, and `isInteractive` is false for the
SDK. Claude Code Desktop runs the engine through the SDK. So on Desktop
the module loads, `session.start` returns at that line, `host` stays null,
and every later hook returns at its own `if (!engine)` check.

Nothing runs on Desktop: not the picker, and not the parts that never
draw — the stage-landed check, the post-stage compaction, the
compaction keep-sentence, the active-workflow store.

## 2. Goal

Every part of the mod that does not draw runs wherever the module loads.
Every part that draws runs where a surface draws it. A journal on disk
records which parts ran, so one command answers "does it work on this
host" without reading a transcript.

## 3. Decisions

1. **Bind the host on every session.** `session.start` never returns
   early. The surface and the interactivity flag become model state, not
   a gate.
2. **Draws gate per surface, at the draw.** The four `ui.render` hooks
   already test `e.surface === 'terminal'`; they stay. The picker's own
   steps gate on the same test, because a band that never draws must not
   report itself open.
3. **Prompt and notice calls are best effort.** `$.prompt.fill`,
   `$.prompt.suggest`, `$.ui.status`, and `$.ui.toast` are attempted
   wherever the host is bound. Each failure is caught, recorded once per
   kind per session, and changes nothing else. The contract marks none of
   them terminal-only, and only a live run can say.
4. **A surface that attaches later counts.** `session.attach` records the
   new surface and redraws. The Desktop client attaches as
   `surface: 'desktop'`; this is the positive signal that does not depend
   on `isInteractive`.
5. **The journal is on by default.** A diagnostic that needs switching on
   first answers nothing when the question is asked. The switch is
   `probeJournal`, default true.
6. **The journal is bounded and fail-open.** At most 400 rows, one file,
   `$.fs.write` of the whole text; every read and write is caught and
   dropped. A journal failure never changes what the mod does.
7. **The journal holds no prompt text and no file contents.** Rows carry
   the event, the surface, the command key, the slug, and an outcome.
   The `/wf` command key and slug are already artifact names on disk.

## 4. The engine contract the build uses

| Need | Mechanism | Where |
| --- | --- | --- |
| The surface at start | `session.start` `{ surface, isInteractive }` | `SessionStartInput` line 7302 |
| Every surface now | `$.session.surfaces()` | line 2158 |
| A surface joining | `session.attach` `{ surface, clientId }` | `SessionAttachInput` line 6774 |
| The session's name | `$.session.id()` | line 2139 |
| Write the journal | `$.fs.write(path, text)`, whole text, makes directories | line 2442 |
| The host's name | `$.env.get('CLAUDE_CODE_ENTRYPOINT')` | literal name, as the validator requires |

`$.fs` has no append call, so a row is one read, one push, one write.

## 5. The journal

Path: `<home>/.sdlc/mod-probe.jsonl`, one JSON object per line, oldest
first, at most 400 rows. `home` is `USERPROFILE` then `HOME`, as the hub
config read already resolves it.

Every row carries `at` (ISO-8601 UTC), `session` (the first 8 characters
of `$.session.id()`), `host` (the entrypoint), `surface`, `interactive`,
`event`, and `ok`. The events:

| Event | Written when | Detail |
| --- | --- | --- |
| `load` | `session.start`, after the host binds | `surfaces`, `cwd`, `root`, `version` |
| `attach` | `session.attach` | the surface and the client id |
| `commands` | after the command registrations | how many of 24 registered |
| `turn` | `turn.complete` of a `/wf` turn | key, slug, landed, the action taken |
| `compact` | after a post-stage compaction | `done`, `skipped`, or `refused` |
| `call` | the first failure of `status`, `toast`, `suggest`, or `fill` | the message |

## 6. The automatic check

`scripts/mod-probe.mjs` reads the journal and prints one table: each host
and surface seen, when it was last seen, whether the module loaded, and
which capability calls failed there. It exits 0 when every host seen has
a `load` row, and 1 when a host has none or a capability failed on every
attempt. `npm run mod:probe` runs it; `--json` prints the rows;
`--since <n>h` bounds the window; `--clear` truncates the journal.

`npm run doctor` gains one row: the surfaces seen in the last 7 days and
the verdict per surface.

## 7. Waves

- **W1** — `hooks/mod/probe.ts`: the row shape, the cap, the serialized
  writer, the pure `verdictOf(rows)` the script also uses.
- **W2** — `register.ts`: bind always, model carries the surface, the
  `session.attach` hook, the picker's terminal gate, the best-effort
  wrappers, the journal calls.
- **W3** — `scripts/mod-probe.mjs`, `npm run mod:probe`, the doctor row.
- **W4** — kit tests, harness tests, MOD-FEATURES.md, the site's switch
  table, the changelog, one minor release.

## 8. Risks

- **A Desktop session writes a journal row per turn.** The file is capped
  at 400 rows; a row is about 200 bytes, so the file stays under 80 KiB.
- **`$.ui.status` on Desktop may draw nothing and raise nothing.** The
  journal then shows the call as ok while the person sees no line. The
  `attach` row and the render hooks' own rows are the evidence that
  separates "called" from "drawn"; only a live look settles it.
- **A `-p` run now binds the host.** It reads `00-index.md` once and
  writes one `load` row. It draws nothing, because no surface attaches,
  and it compacts nothing, because a `-p` run ends after its turn.
