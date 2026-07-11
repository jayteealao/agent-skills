# Agent Skills Marketplace

A plugin marketplace with Claude Code plugins, generated Codex adapters, and handwritten Codex-native workflows.

## Installation

### Claude Code

Add this marketplace to Claude Code:

```bash
/plugin marketplace add YOUR_USERNAME/agent-skills
```

Then install available plugins:

```bash
/plugin install sdlc-workflow
```

### Codex

Codex discovers plugins from the workspace marketplace at [`.agents/plugins/marketplace.json`](./.agents/plugins/marketplace.json).

- [`sdlc-workflow`](./plugins/sdlc-workflow) exposes generated Codex adapters beside its canonical Claude source.
- [`sdlc-workflow-codex`](./plugins/sdlc-workflow-codex) is a separate handwritten Codex-native rewrite with no generated adapter layer.

To refresh the Codex artifacts for `sdlc-workflow`:

```bash
node scripts/generate-codex-plugin.mjs sdlc-workflow
```

## Available Plugins

| Plugin | Category | Description |
|--------|----------|-------------|
| [sdlc-workflow](./plugins/sdlc-workflow) | workflow | Canonical SDLC workflow with generated Codex adapters |
| [sdlc-workflow-codex](./plugins/sdlc-workflow-codex) | workflow | Handwritten Codex-native software delivery workflows |

## Contributing

To add a new plugin:

1. Create a directory under `plugins/your-plugin-name/`
2. Add the manifest for the intended host: `.claude-plugin/plugin.json`, `.codex-plugin/plugin.json`, or both
3. Add focused skills and supporting files
4. Update the relevant marketplace manifest
5. Run the host-specific validators and tests
6. For generated Codex adapters only, run `node scripts/generate-codex-plugin.mjs <plugin-name>`
7. Submit a PR

## License

MIT
