# Agent Skills Marketplace

A Claude Code plugin marketplace with curated skills and tools for developers.

## Installation

Add this marketplace to Claude Code:

```bash
/plugin marketplace add YOUR_USERNAME/agent-skills
```

Then install available plugins:

```bash
/plugin install daily-carry
```

## Available Plugins

| Plugin | Category | Description |
|--------|----------|-------------|
| [daily-carry](./plugins/daily-carry) | deployment | OtterStack deployment orchestration, Portainer management, and Tech Research Enforcer |
| [agent-behavior-patterns](./plugins/agent-behavior-patterns) | workflow | Sound notifications, TUI testing, design documents, and changelog audits |

## Contributing

To add a new plugin:

1. Create a directory under `plugins/your-plugin-name/`
2. Add `.claude-plugin/plugin.json` with metadata
3. Add skills in `skills/`, commands in `commands/`, etc.
4. Update the root `.claude-plugin/marketplace.json` to include your plugin
5. Submit a PR

## License

MIT
