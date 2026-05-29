import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';

export async function pathMtimeMs(path) {
  if (!path || !existsSync(path)) return null;
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return null;
  }
}

export async function latestMtimeMs(paths) {
  let latest = null;
  for (const path of paths) {
    const mtime = await pathMtimeMs(path);
    if (mtime !== null && (latest === null || mtime > latest)) latest = mtime;
  }
  return latest;
}

export async function latestTreeMtimeMs(root, {
  ignore = ['node_modules'],
} = {}) {
  if (!root || !existsSync(root)) return null;
  const files = await walkFiles(root, { ignoreDirs: new Set(ignore.map((item) => item.replace(/\*\*\//g, '').replace(/\/\*\*$/g, ''))) });
  return latestMtimeMs(files);
}

export async function viewMtimeForSlug(viewRoot, slug) {
  return latestTreeMtimeMs(join(viewRoot, slug));
}

export function classifyRenderState({
  latestArtifactMtime,
  viewMtime,
  renderMissing = true,
  renderStale = true,
} = {}) {
  if (viewMtime === null || viewMtime === undefined) {
    return {
      action: renderMissing ? 'render' : 'skip',
      reason: 'missing',
      stale: Boolean(renderMissing),
    };
  }

  if (
    latestArtifactMtime !== null &&
    latestArtifactMtime !== undefined &&
    latestArtifactMtime >= viewMtime
  ) {
    return {
      action: renderStale ? 'render' : 'skip',
      reason: 'stale',
      stale: Boolean(renderStale),
    };
  }

  return {
    action: 'skip',
    reason: 'fresh',
    stale: false,
  };
}

async function walkFiles(root, { ignoreDirs = new Set() } = {}) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (ignoreDirs.has(entry.name)) continue;
        stack.push(abs);
      } else if (entry.isFile()) {
        out.push(abs);
      }
    }
  }
  return out;
}
