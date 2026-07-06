// renderers/ship-rollback.mjs — runbook-driven reversal record (09-rollback-<run-id>.md).
// Written by the rollback phase of /wf ship (feedback-loops W4). `run-id` names the
// ship run being REVERSED; the original run gains rolled-back: true + rollback-artifact.
// Rendered as a frontmatter card + a promoted decision/outcome metric row (colored by
// value — the go/no-go gate and the verify result are what the reader scans for first)
// + the markdown runbook narrative.
import { renderSimple } from './_simple.mjs';
import { escapeHtml } from './_validator.mjs';

const STATUS_TONE = { complete: 'ok', failed: 'bad', aborted: 'bad', 'awaiting-input': 'warn' };
const VERIFY_TONE = { pass: 'ok', fail: 'bad', skipped: 'warn' };

export function render(artifact, ctx) {
  const fm = artifact.frontmatter ?? {};
  return renderSimple(artifact, ctx, {
    title: fm.title ?? 'Ship rollback',
    lede: fm.reason ? escapeHtml(String(fm.reason)) : '',
    metricFields: [
      { key: 'run-id', label: 'reverses run', tone: 'info' },
      { key: 'go-nogo', label: 'decision', tone: fm['go-nogo'] === 'no-go' ? 'bad' : 'ok' },
      { key: 'status', label: 'status', tone: STATUS_TONE[fm.status] ?? 'info' },
      { key: 'rollback-verify-result', label: 'verify', tone: VERIFY_TONE[fm['rollback-verify-result']] ?? 'info' },
      { key: 'steps-executed', label: 'steps executed', tone: 'info' },
      { key: 'steps-irreversible', label: 'irreversible', tone: Number(fm['steps-irreversible']) > 0 ? 'warn' : 'ok' },
    ],
  });
}
