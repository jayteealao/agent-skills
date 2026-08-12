# Hermes Tweet

Hermes Tweet is a workflow guide for public X/Twitter research, monitoring,
audits, and approval-gated account actions in Hermes Agent.

## Install

```bash
hermes plugins install Xquik-dev/hermes-tweet --enable
hermes plugins list
```

Set `XQUIK_API_KEY` on the host that runs Hermes tools. Keep
`HERMES_TWEET_ENABLE_ACTIONS=false` for public research. Enable it only after
the user approves a private read, persistent monitor, webhook, extraction,
giveaway draw, media operation, or account action.

## Use

Use the `hermes-tweet` skill when a Claude Code or Codex session needs to route X/Twitter work through Hermes Agent with the native Hermes Tweet plugin.

Xquik is an independent third-party service. Not affiliated with X Corp.
"Twitter" and "X" are trademarks of X Corp.
