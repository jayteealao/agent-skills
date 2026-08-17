# Xquik X Data

Claude Code and Codex plugin for planning Xquik REST, remote MCP, SDK,
Twitter advanced search, export, monitoring, and account workflows from public
source truth.

## Source Truth

- Docs: https://docs.xquik.com
- OpenAPI: https://xquik.com/openapi.json
- MCP manifest: https://xquik.com/.well-known/mcp.json
- MCP endpoint: https://xquik.com/mcp
- Source repo: https://github.com/Xquik-dev/x-twitter-scraper

## Skill

Use `/xquik-x-data:xquik-x-data` in Claude Code or `$xquik-x-data` in
Codex. The skill selects the narrowest current REST, MCP, SDK, extraction,
monitoring, or webhook path. It verifies public sources before naming endpoints,
schemas, limits, or response fields.

The workflow is read-first. It requires explicit approval before private reads,
writes, persistent resources, event delivery, or metered bulk jobs.

Xquik is an independent third-party service. Not affiliated with X Corp.
"Twitter" and "X" are trademarks of X Corp.
