import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/project-root.mjs
import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
var WALK_CAP = 200;
function gitToplevel(dir) {
  try {
    const out = execFileSync("git", ["-C", dir, "rev-parse", "--show-toplevel"], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 2e3,
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}
function canon(p) {
  try {
    return realpathSync.native(p);
  } catch {
    return resolve(p);
  }
}
function sameDir(a, b) {
  if (process.platform === "win32") return a.toLowerCase() === b.toLowerCase();
  return a === b;
}
function ownsWorkflowStore(dir) {
  return existsSync(join(dir, ".ai", "workflows"));
}
function resolveProjectRoot(startDir = process.cwd()) {
  const start = canon(startDir);
  if (ownsWorkflowStore(start)) return start;
  const top = gitToplevel(start);
  if (!top) return start;
  const topCanon = canon(top);
  let dir = start;
  for (let i = 0; i < WALK_CAP; i++) {
    if (ownsWorkflowStore(dir)) return dir;
    if (sameDir(dir, topCanon)) break;
    const parent = dirname(dir);
    if (sameDir(parent, dir)) break;
    dir = parent;
  }
  return topCanon;
}

export {
  resolveProjectRoot
};
