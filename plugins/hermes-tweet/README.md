# Hermes Tweet

Hermes Tweet is a Hermes Agent plugin workflow guide for X/Twitter research, monitoring, audits, and explicit approval-gated account actions.

## Install

```bash
hermes plugins install Xquik-dev/hermes-tweet --enable
hermes plugins list
```

Set `XQUIK_API_KEY` on the host that runs Hermes tools. Keep `HERMES_TWEET_ENABLE_ACTIONS=false` unless the user approves a specific account action workflow.

## Use

Use the `hermes-tweet` skill when a Claude Code or Codex session needs to route X/Twitter work through Hermes Agent with the native Hermes Tweet plugin.
