# Agent Skills Marketplace

A plugin marketplace for Claude Code and Codex. One plugin directory serves both hosts: each host reads its own manifest and its own hook wiring from the same tree, and the skill prose is written once, host-neutral.

## Installation

### Claude Code

Add this marketplace to Claude Code:

```bash
/plugin marketplace add jayteealao/agent-skills
```

Then install the plugin:

```bash
/plugin install sdlc-workflow@agent-skills-marketplace
```

### Codex

Codex discovers plugins from the workspace marketplace at [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json), which points at the same plugin directory.

```bash
codex plugin marketplace add jayteealao/agent-skills
codex plugin add sdlc-workflow@agent-skills-marketplace
```

Then open an interactive Codex session and trust the plugin's hooks once with `/hooks`. Untrusted hooks are skipped. The full per-host install and cutover steps are in the plugin's [installation page](./plugins/sdlc-workflow/docs/site/start/installation.html); the host differences are in its [hosts page](./plugins/sdlc-workflow/docs/site/reference/hosts.html).

## Available Plugins

| Plugin | Category | Description |
|--------|----------|-------------|
| [sdlc-workflow](./plugins/sdlc-workflow) | workflow | One-command SDLC lifecycle (`/wf` under Claude Code, `$wf` under Codex) over a shared runtime, hub, and `.ai/` artifacts |

## How one tree serves two hosts

| Host | Manifest | Hook wiring |
|---|---|---|
| Claude Code | `plugins/sdlc-workflow/.claude-plugin/plugin.json` | `plugins/sdlc-workflow/hooks/hooks.json` |
| Codex | `plugins/sdlc-workflow/.codex-plugin/plugin.json` | `plugins/sdlc-workflow/hooks/codex.hooks.json` (declared by the manifest) |

Both hosts run the same bundled hook policy under `dist/`. Everything a host spells differently — invocation sigil, gate questions, sub-agent dispatch, timestamps, script paths, key availability — lives in four contract files under `plugins/sdlc-workflow/skills/wf/reference/`, and `npm run verify:neutrality` fails any skill file that names a host mechanism outside them.

## Contributing

To add a new plugin:

1. Create a directory under `plugins/your-plugin-name/`
2. Add the manifest for each intended host: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, or both. A Codex manifest that declares `hooks` replaces conventional `hooks/hooks.json` discovery, so a plugin that serves both hosts keeps two wiring files.
3. Add focused skills and supporting files. Write skill prose once; keep host mechanics in cited contract files.
4. Update both marketplace catalogs: `.claude-plugin/marketplace.json` (pins the plugin version) and `.agents/plugins/marketplace.json` (name and path).
5. Run the plugin's tests and validators. For `sdlc-workflow`: `npm test`, `npm run verify:versions`, `npm run verify:docs`.
6. Submit a PR

## License

MIT
