# Host surfaces that some stages use (host contract, by section)

This file is a host-contract file, like [_host-invocation.md](_host-invocation.md). It maps the host surfaces that only one or two stages use. A stage loads only its own section, through the Sections cell of its Requires row or a named link. Every section is one row of the same table: the concern, then the Claude Code, Codex, and pi columns.

## pi through pi-code

pi has no plugin manifest and no external-command hooks of its own. The `pi-code` extension loads this plugin from the Claude Code plugin cache (`~/.claude/plugins/cache`), runs `hooks/hooks.json` with the Claude Code payload and environment, and presents Claude Code's tool vocabulary to the hooks and to the model. The reference pi setup is the `pi-unified` meta-package: pi-code without its own web and sub-agent extensions, `@tintinweb/pi-subagents` owning the `Agent` tool, and `pi-web-access` owning web search. A pi cell therefore reads "same as Claude Code" unless it says otherwise. Four differences hold: the `PermissionRequest` hook never fires, because pi has no permission layer; the `SubagentStart` and `SubagentStop` hooks never fire, because pi-code bridges them through its own sub-agent extension, which the reference setup excludes, so a child starts with nothing but its prompt; a `PreToolUse` hook that times out fails closed at 60 seconds; and the hub records a pi session's provenance as `claude`, because the host signal is the hooks' own. These rows are verified against pi-code 1.0.64 and pi-subagents 0.19.0 source, not yet against a live pi session.

## Browser and runtime drive

| Concern | Claude Code | Codex | pi |
|---|---|---|---|
| Browser and runtime drive (probe, verify) | The session's browser pane and Chrome connector tools | The Browser or Chrome plugin when installed; otherwise a Playwright script | A Playwright script |

## Session transcripts

| Concern | Claude Code | Codex | pi |
|---|---|---|---|
| Session transcripts (deep retro) | `~/.claude/projects/<repo-path-slug>/*.jsonl` — the repo's absolute path with separators replaced | None. Deep retro falls back to the artifact-only reading | None verified. Deep retro falls back to the artifact-only reading |

## Built-in image generation

| Concern | Claude Code | Codex | pi |
|---|---|---|---|
| Built-in image generation (imagery) | None; use the scripted providers | The built-in `image_gen` tool | None; use the scripted providers |

## Design canvas

| Concern | Claude Code | Codex | pi |
|---|---|---|---|
| Design canvas (design stage) | The canvas is a mirror of the boards, for comments; the board files stay the contract (`design/_boards.md`). When the session lists the Artifact tool: call it with `action: quickstart` and `intent: design`, create the Design artifact from the type it names, follow the type's own instructions, draw one artboard per board, and record the link as `canvas:` in `02c-craft.md`. Otherwise use the Codex column | No canvas. Build HTML boards and render them to PNG with the board tool (`design/_boards.md`). Offer `/uiproto` for an interactive prototype when `externalDispatch.enabled` | Same as Codex |

## Design system sync

| Concern | Claude Code | Codex | pi |
|---|---|---|---|
| Design system sync (`/wf design sync`) | When the session offers the `/design-sync` skill: hand off to it, one component at a time, after the person approves the plan | None; report that no sync surface exists | None; report that no sync surface exists |

## Published page

| Concern | Claude Code | Codex | pi |
|---|---|---|---|
| Published page (prototype) | When the session lists the Artifact tool: load the `artifact-design` skill before the first publish, publish the page file with the Artifact tool and follow the tool's own instructions, and pass the recorded link to update the same page in a later session | None; the person reads the document | None; the person reads the document |

## PR monitor

| Concern | Claude Code | Codex | pi |
|---|---|---|---|
| PR monitor (the PR phase of ship, `handoff/_pr-ci-handoff.md`) | The desktop app has Auto-fix and the `ccd_pr` tools. Its default tells a session to offer Auto-fix after it opens a PR, and not to poll CI. In the PR phase of a ship run: when `get_status` does not report the PR, bind it with `bind_pr`. Do not offer Auto-fix, and do not call `set_monitor`. When `get_status` reports Auto-fix on, leave it on and say so once in the handoff report. The terminal has no PR monitor | None | None |

## Session-start render refresh

| Concern | Claude Code | Codex | pi |
|---|---|---|---|
| Whole-repo render refresh at session start | Queued by the SessionStart hook, except on a compaction | Queued by the SessionStart adapter, except on a compaction | Same as Claude Code |
