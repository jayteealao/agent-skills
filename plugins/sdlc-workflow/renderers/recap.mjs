// renderers/recap.mjs — plain-language recap / explain artifact (90-recap.md).
// The successor to resume.mjs: /wf recap writes a readable catch-up (scope:
// workflow | slice | explain) rather than a token-minimised sub-agent brief.
// Non-regenerable narrative — no automation badge (unlike the legacy resume).
import { renderSimple } from './_simple.mjs';

export function render(artifact, ctx) {
  return renderSimple(artifact, ctx, { title: artifact.frontmatter?.title ?? 'Recap' });
}
