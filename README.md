# Agent Skills Marketplace

A plugin marketplace with Claude Code source manifests and generated Codex artifacts for reusable developer workflows.

## Installation

### Claude Code

Add this marketplace to Claude Code:

```bash
/plugin marketplace add YOUR_USERNAME/agent-skills
```

Then install available plugins:

```bash
/plugin install daily-carry
```

### Codex

Codex discovers plugins from the workspace marketplace at [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json). Generated plugin bundles live beside the canonical Claude source in each plugin directory.

To refresh the Codex artifacts for `sdlc-workflow`:

```bash
node scripts/generate-codex-plugin.mjs sdlc-workflow
```

## Available Plugins

| Plugin | Category | Description |
|--------|----------|-------------|
| [daily-carry](./plugins/daily-carry) | deployment | OtterStack deployment orchestration, Portainer management, and Tech Research Enforcer |
| [agent-behavior-patterns](./plugins/agent-behavior-patterns) | workflow | Sound notifications, TUI testing, design documents, and changelog audits |

## Contributing

To add a new plugin:

1. Create a directory under `plugins/your-plugin-name/`
2. Add `.claude-plugin/plugin.json` as the canonical manifest
3. Add skills in `skills/`, commands in `commands/`, etc.
4. Add a small `.codex-plugin.overrides.json` only if Codex-specific interface metadata is needed
5. Update the root `.claude-plugin/marketplace.json` to include your plugin
6. Run `node scripts/generate-codex-plugin.mjs <plugin-name>`
7. Submit a PR

## License

MIT
