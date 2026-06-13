import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/entrypoint.mjs
import { existsSync } from "node:fs";
import { join } from "node:path";
function resolveEntrypoint(pluginRoot, name) {
  const dist = join(pluginRoot, "dist", `${name}.mjs`);
  return existsSync(dist) ? dist : join(pluginRoot, "scripts", `${name}.mjs`);
}

export {
  resolveEntrypoint
};
