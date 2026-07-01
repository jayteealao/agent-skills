---
name: hermes-tweet
description: Source-aware Hermes Agent X/Twitter workflow guide. Use when a session needs to install or operate the native Hermes Tweet plugin for read-first research, monitoring, support triage, giveaway audits, or explicit approval-gated account actions.
---

# Hermes Tweet

Use this skill when the user wants X/Twitter work to run through Hermes Agent with the native Hermes Tweet plugin from `Xquik-dev/hermes-tweet`.

Do not use this skill for generic social media copywriting, generic X API clients, or non-Hermes publishing tools. It is specifically for source-aware Hermes Agent workflows.

## Activation

Use this skill when the user says or implies:

- "Hermes Tweet"
- "Hermes Agent Twitter"
- "Hermes Agent X"
- "Hermes social listening"
- "use Hermes for X/Twitter"
- "approval-gated X actions in Hermes"

## Setup

Install and enable the source plugin in Hermes Agent:

```bash
hermes plugins install Xquik-dev/hermes-tweet --enable
hermes plugins list
```

For read workflows, configure `XQUIK_API_KEY` on the host that executes Hermes tools:

```bash
export XQUIK_API_KEY="your-xquik-api-key"
export HERMES_TWEET_ENABLE_ACTIONS="false"
```

Keep `HERMES_TWEET_ENABLE_ACTIONS=false` for research, monitoring, audits, support triage, and unattended sessions. Set it to `true` only after the user approves a specific action workflow.

## Operating Pattern

1. Confirm `hermes plugins list` shows `hermes-tweet` as installed and enabled.
2. Start with `tweet_explore` to inspect available workflows without requiring network access.
3. Use read-only `tweet_read` workflows for search, tweet lookup, account context, replies, threads, monitors, or giveaway audits.
4. Before any `tweet_action` workflow, restate the exact action, target account, text or payload, and expected side effect.
5. Require explicit user approval before enabling `HERMES_TWEET_ENABLE_ACTIONS=true`.
6. After the approved action session, set `HERMES_TWEET_ENABLE_ACTIONS=false` again.
7. Never print API keys, private account data, or session material.

## Example Requests

```text
Use Hermes Tweet to research replies to this launch post and summarize support issues.
```

```text
Prepare a read-only Hermes Tweet monitor for mentions of this release keyword.
```

```text
After I approve the final post, use Hermes Tweet through Hermes Agent to publish it.
```

## Troubleshooting

- If only `tweet_explore` appears, set `XQUIK_API_KEY` and restart the Hermes session or gateway.
- If read tools work but action tools are unavailable, confirm `HERMES_TWEET_ENABLE_ACTIONS=true` for the approved session.
- If the plugin is installed but not enabled, run `hermes plugins enable hermes-tweet`.
- If a desktop client connects to a remote gateway, configure environment variables on the gateway host.
