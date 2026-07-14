import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  renderSimple
} from "./chunk-E44QQDJ2.mjs";
import {
  escapeHtml
} from "./chunk-4WRIEOIP.mjs";

// renderers/_lane.mjs
function laneRenderer({ title, lede, metricFields = [] } = {}) {
  return function render(artifact, ctx) {
    const fm = artifact.frontmatter ?? {};
    const resolvedTitle = typeof title === "function" ? title(fm, ctx) : fm.title ?? title;
    const rawLede = typeof lede === "function" ? lede(fm, ctx) : lede;
    return renderSimple(artifact, ctx, {
      title: resolvedTitle,
      lede: rawLede ? escapeHtml(String(rawLede)) : "",
      metricFields
    });
  };
}

export {
  laneRenderer
};
