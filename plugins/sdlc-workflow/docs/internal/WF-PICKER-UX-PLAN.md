# /wf Picker UX Plan — one list, no dropdown, paging by wheel, ring wrap, and a filter

Status: **DRAFTED 2026-09-16** against v9.156.1 (`73160ed2`). Nothing built.
Source: the operator's screenshot of the v9.156.1 band and the Claude Code
2.1.271 plugin contract (`.claude/types/claude-code.d.ts`, byte-identical at
anthropics/claude-code@f96c3b4). Every claim below is tagged **contract**
(the declarations say so), **seen** (the operator saw it), or **probe** (a
live session must answer it; §7 lists the probes).

Related: [CHANGELOG.md](../../CHANGELOG.md) 9.155.0 → 9.156.1 (the three
shapes the band has had), `hooks/mod/` (the module), memory note
`sdlc_wf_picker_mod` (the port decisions).

## 1. What the operator saw, and why

The v9.156.1 band draws a `Select` with a column of digit `Button`s beside it.
The terminal `Select` is a dropdown: closed, it draws one row (the selected
option and a `▾`) and opens only under a click. **Seen.** So the band shows
one label beside `1:` and eight bare digits under it. The digits work: a
digit in the empty prompt picks its row. The list does not show until the
dropdown opens, and the dropdown opens only under a click.

Three shapes so far, and what each got wrong:

| Version | Rows | Digits from the prompt | Arrows | Look |
| --- | --- | --- | --- | --- |
| 9.155.0 | `Select` | none | after a click, then the first down only moves the ring onto the Select | a list, but two keystrokes before it moves |
| 9.156.0 | plain `Button` per row | yes | none: the ring does not walk Buttons on the arrows (**seen**) | a list |
| 9.156.1 | `Select` + digit column | yes | inside the open dropdown only | a closed dropdown beside nine digits |

The lesson: the `Select` is not a list. A list of rows the person can read
is a column of plain `Button`s, the shape the engine gives a survey. The
arrows are not the way to move through it. The rest of this plan makes that
column good.

## 2. What the keyboard can and cannot do (contract)

- **From the prompt, only a digit reaches the band**, and only while the
  prompt is empty. Arrows, letters, Enter, and Page keys go to the prompt.
  A `Button` with `action` presses on an engine chord (a modified key or a
  chord), and only when no engine handler of that action is mounted.
- **The band takes the keyboard by a click or `ctrl+x tab`.** Then Tab,
  Shift+Tab, and the arrows are `abovePrompt:next` / `abovePrompt:previous`,
  which move the focus ring; Enter and Space press; Esc returns to the
  prompt. The operator saw that down did not move the ring between plain
  Buttons in 9.156.0; whether Tab does is **probe P1**.
- **`ui.focus` fires before every ring move** the person makes in the band,
  with the element the ring lands on. A hook may keep the ring, or land it
  elsewhere. **Contract.**
- **`ui.scroll` fires for the wheel over the band "at its edges too"**, and
  for the scroll keys while the band holds the keyboard, with `by` signed.
  The wheel needs no focus. **Contract.** An arrow raises `ui.scroll` only
  while the engine has rows to scroll, and our tree never has: a band taller
  than `maxRows` scrolls, and a scrolling band arms no digit.
- **An `Input` is a one-line text field.** While it has focus every
  printable key reaches it alone; a change and Enter raise `ui.input`. It can
  `autoFocus`. **Contract.**
- **A letter hotkey presses while a band Button has focus**; a digit presses
  from the empty prompt and while focused. **Contract.**

So "page left and right from the prompt" is not possible: left and right
move the prompt's cursor. "Scroll past row 9 to the next page" is possible
in two ways that are not native scrolling: the ring wrapping past the last
row (§4), and the wheel over the band (§3).

## 3. W1 — one list, digits inline, paging by wheel and page keys

Build first; every part is contract or already seen to work.

1. Draw the rows as plain `Button`s with the full label, one per row, as
   9.156.0 did: `1: intake  Start, extend, adopt, or maintain workflow scope.`
   Drop the `Select`. The first row carries `autoFocus`, so `ctrl+x tab`
   lands the ring on row 1, not on `close`.
2. Keep `0: more` in the title row. It cycles forward and wraps, so on three
   pages the farthest page is two presses away.
3. Hook `ui.scroll` with `{ component: 'AbovePrompt' }`. A negative `by`
   turns the page back, a positive `by` turns it forward, then invalidate.
   Return `{}` so the engine moves no window. This gives the wheel over the
   band, and PageUp / PageDown while the band holds the keyboard.
4. Page size stays `min(9, maxRows − 2)`.
5. Hint line: `a digit picks · wheel or 0 turns the page · ctrl+x tab, then
   Tab moves and Enter picks · Esc returns to the prompt`.

Kit tests: the row labels; `$.ui.scroll` is not on the kit engine, so the
scroll hook is covered by a direct hook call in the harness with a fake
event, and by probe P3.

## 4. W2 — ring wrap turns the page

Hook `ui.focus` with `{ component: 'AbovePrompt' }` and remember where the
ring is (`e.element` at every `next(e)`).

- Ring on the last row, and the move lands on the first row (a forward
  wrap): keep the ring (`{}`), turn the page forward, invalidate, then
  `$.ui.focus({ requestId, key: <first row of the new page> })`.
- Ring on the first row, and the move lands on the last row (a backward
  wrap): the mirror, landing on the new page's last row.
- Any other move: `next(e)`.

This makes Tab past row 9, and right or down past row 9 if they move the
ring at all, flow onto the next page. It depends on the wrap order the
engine uses among one plugin's elements (**probe P2**) and on `$.ui.focus`
landing after a redraw (**probe P4**).

## 5. W3 — a filter field, the pi shape

pi's picker narrows the list as you type. The band can do the same with an
`Input` in the title row.

- `Input` with `placeholder="filter"`, `onInput` narrows the rows to those
  whose value or label contains the text, `onSubmit` picks the first row
  left. Invalidate on every change.
- Focus: two options, settled by **probe P5**. (a) The `Input` carries
  `autoFocus`: `ctrl+x tab` lands in the field, letters narrow, digits type
  into the field (the prompt path with digits still works while the band is
  unfocused). (b) Row 1 carries `autoFocus` and the field is one Tab away.
  Option (a) is closer to pi; option (b) keeps digits pressing while focused.
- A narrowed list of nine or fewer rows needs no page: paging disappears in
  the common case.

## 6. W4 — no pages on a tall band

`maxRows` is the terminal's height outside fullscreen and the bottom slot's
remainder in fullscreen. On a band with room for all rows, draw them all:
digits `1`–`9` on the first nine, letters `a`–`m` on the rest (a letter
presses only while the band has focus, so the rows past nine read `a:`,
`b:` and are reachable by the ring or the filter). The key step has 22
rows; on a 40-row terminal it draws whole and `0: more` never appears.

The catalog order already puts the lifecycle path on page 1: intake, shape,
slice, plan, implement, verify, review, handoff, ship. Keep that order.

## 7. Probes (one live session, `claude --debug --plugin-dir`)

| Probe | Question | Feeds |
| --- | --- | --- |
| P1 | With the band focused on a plain Button, do Tab, right, and down move the ring? | W1 hint text, W2 |
| P2 | From the last Button, where does the next move land: the first Button, `close`, or an engine stop? | W2 |
| P3 | Does a wheel tick over a band that fits raise `ui.scroll` with `by` = ±1? Do PageUp / PageDown while focused? | W1 |
| P4 | After `$.ui.invalidate` inside a `ui.focus` hook, does `$.ui.focus` on a key drawn by the new tree land? | W2 |
| P5 | With an `Input` focused, does a digit type or press? Does Esc return to the prompt and leave the text? | W3 |
| P6 | Does a Button with `action: "app:diffFileListDown"` press on `ctrl+down` from the prompt while no diff panel is open? | a previous-page chord from the prompt, if yes |

Each probe is one hook that writes what it saw with `$.ui.log`; the debug
log carries what the engine refused.

## 8. Order and release

1. W1 (one release, patch): the list is right again and the wheel pages.
2. Probes P1–P4 in one sitting; then W2.
3. Probes P5–P6; then W3 and W4 together (one release, minor).

Out of scope, and why: a `Pane` (the operator wants the band); keys from
the prompt beyond digits and engine chords (the contract has no keystroke
hook); a taller-than-`maxRows` tree (it disarms the digits).
