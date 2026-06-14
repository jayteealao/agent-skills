import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/entrypoint.mjs
import { existsSync } from "node:fs";
import { join } from "node:path";
function resolveEntrypoint(pluginRoot, name) {
  const dist = join(pluginRoot, "dist", `${name}.mjs`);
  return existsSync(dist) ? dist : join(pluginRoot, "scripts", `${name}.mjs`);
}

// lib/render-queue.mjs
import { randomBytes } from "node:crypto";
import {
  appendFileSync,
  existsSync as existsSync2,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { join as join2 } from "node:path";
var QUEUE_VERSION = 1;
var QUEUE_DIRNAME = ".render-queue";
var PROCESSING = ".processing";
var FAILED = ".failed";
var STATUS_FILE = ".status.json";
var ERROR_LOG = ".render-errors.log";
var RENDER_QUEUE_DEFAULTS = Object.freeze({
  maxPending: 500,
  // hard backstop; coalescing bounds the queue by buckets first
  maxAttempts: 3,
  // give up + move to .failed/ after this many render failures
  orphanTtlMs: 12e4
  // reclaim a .processing/ file abandoned by a dead drain
});
function queueDir(viewDir) {
  return join2(viewDir, QUEUE_DIRNAME);
}
function processingDir(viewDir) {
  return join2(queueDir(viewDir), PROCESSING);
}
function failedDir(viewDir) {
  return join2(queueDir(viewDir), FAILED);
}
function statusPath(viewDir) {
  return join2(queueDir(viewDir), STATUS_FILE);
}
function errorLogPath(viewDir) {
  return join2(viewDir, ERROR_LOG);
}
function writeFileAtomic(path, text) {
  const tmp = `${path}.${process.pid}.${randomBytes(3).toString("hex")}.tmp`;
  writeFileSync(tmp, text, "utf-8");
  try {
    renameSync(tmp, path);
  } catch (err) {
    try {
      rmSync(tmp, { force: true });
    } catch {
    }
    throw err;
  }
}
function listRecordFiles(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names.filter((n) => n.endsWith(".json") && n !== STATUS_FILE);
}
function appendError(viewDir, message) {
  try {
    mkdirSync(viewDir, { recursive: true });
    appendFileSync(errorLogPath(viewDir), `[${(/* @__PURE__ */ new Date()).toISOString()}] render-queue: ${message}
`, "utf-8");
  } catch {
  }
}
function enqueue(viewDir, item = {}, {
  now = () => Date.now(),
  maxPending = RENDER_QUEUE_DEFAULTS.maxPending
} = {}) {
  try {
    if (!viewDir) return { ok: false, reason: "no viewDir" };
    const dir = queueDir(viewDir);
    mkdirSync(dir, { recursive: true });
    const existing = listRecordFiles(dir);
    if (existing.length >= maxPending) {
      const overflow = existing.sort().slice(0, existing.length - maxPending + 1);
      for (const name2 of overflow) {
        try {
          rmSync(join2(dir, name2), { force: true });
        } catch {
        }
      }
      appendError(viewDir, `queue at cap (${existing.length} \u2265 ${maxPending}); evicted ${overflow.length} oldest request(s)`);
    }
    const ts = now();
    const record = {
      v: QUEUE_VERSION,
      repoRoot: item.repoRoot ?? null,
      viewDir,
      kind: item.kind ?? "incremental",
      // incremental | offpipeline | bootstrap
      bucket: item.bucket ?? null,
      // slug | project | docs | off-pipeline bucket | __bootstrap__
      paths: Array.isArray(item.paths) ? item.paths : [],
      attempts: 0,
      enqueuedAt: new Date(ts).toISOString(),
      enqueuedBy: {
        host: item.enqueuedBy?.host ?? "claude",
        pid: item.enqueuedBy?.pid ?? process.pid
      }
    };
    const name = `${String(ts).padStart(15, "0")}-${randomBytes(4).toString("hex")}.json`;
    writeFileAtomic(join2(dir, name), `${JSON.stringify(record, null, 2)}
`);
    return { ok: true, file: name };
  } catch (err) {
    return { ok: false, reason: err?.message ?? String(err) };
  }
}
function readPending(viewDir) {
  const dir = queueDir(viewDir);
  const out = [];
  for (const name of listRecordFiles(dir)) {
    const abs = join2(dir, name);
    try {
      out.push({ name, file: abs, record: JSON.parse(readFileSync(abs, "utf-8")) });
    } catch {
    }
  }
  out.sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  return out;
}
function coalesce(records) {
  if (!records || !records.length) return null;
  if (records.some((r) => r?.kind === "bootstrap")) {
    return { kind: "bootstrap", bucket: "__bootstrap__" };
  }
  const buckets = [...new Set(records.map((r) => r?.bucket).filter(Boolean))];
  if (buckets.length === 1) {
    const r = records.find((rr) => rr?.bucket === buckets[0]);
    return { kind: r?.kind ?? "incremental", bucket: buckets[0] };
  }
  return { kind: "bootstrap", bucket: "__bootstrap__" };
}
function renderArgsForPlan(plan, { viewDir, pluginRoot } = {}) {
  const tail = ["--view", viewDir];
  if (pluginRoot) tail.push("--plugin-root", pluginRoot);
  if (!plan || plan.kind === "bootstrap") return ["--bootstrap", ...tail];
  return ["--only", `${plan.bucket}/**`, ...tail];
}
function claim(viewDir, names) {
  const dir = queueDir(viewDir);
  const proc = processingDir(viewDir);
  try {
    mkdirSync(proc, { recursive: true });
  } catch {
  }
  const claimed = [];
  for (const name of names) {
    const from = join2(dir, name);
    let record = null;
    try {
      record = JSON.parse(readFileSync(from, "utf-8"));
    } catch {
    }
    try {
      renameSync(from, join2(proc, name));
      claimed.push({ name, file: join2(proc, name), record });
    } catch {
    }
  }
  return claimed;
}
function ack(viewDir, claimed) {
  for (const c of claimed ?? []) {
    try {
      rmSync(c.file, { force: true });
    } catch {
    }
  }
}
function unclaim(viewDir, claimed) {
  const dir = queueDir(viewDir);
  for (const c of claimed ?? []) {
    try {
      renameSync(c.file, join2(dir, c.name));
    } catch {
    }
  }
}
function fail(viewDir, claimed, {
  maxAttempts = RENDER_QUEUE_DEFAULTS.maxAttempts,
  now = () => Date.now(),
  error = "render failed"
} = {}) {
  const dir = queueDir(viewDir);
  const failedD = failedDir(viewDir);
  for (const c of claimed ?? []) {
    const attempts = (c.record?.attempts ?? 0) + 1;
    const rec = { ...c.record ?? {}, attempts, lastError: String(error), lastFailedAt: new Date(now()).toISOString() };
    const text = `${JSON.stringify(rec, null, 2)}
`;
    const dest = attempts >= maxAttempts ? failedD : dir;
    if (dest === failedD) {
      try {
        mkdirSync(failedD, { recursive: true });
      } catch {
      }
    }
    try {
      writeFileAtomic(join2(dest, c.name), text);
    } catch {
    }
    try {
      rmSync(c.file, { force: true });
    } catch {
    }
  }
  appendError(viewDir, error);
}
function reclaimOrphans(viewDir, {
  ttlMs = RENDER_QUEUE_DEFAULTS.orphanTtlMs,
  now = () => Date.now()
} = {}) {
  const proc = processingDir(viewDir);
  const dir = queueDir(viewDir);
  let names;
  try {
    names = readdirSync(proc).filter((n) => n.endsWith(".json"));
  } catch {
    return 0;
  }
  let reclaimed = 0;
  for (const name of names) {
    const from = join2(proc, name);
    let mtime;
    try {
      mtime = statSync(from).mtimeMs;
    } catch {
      continue;
    }
    if (now() - mtime < ttlMs) continue;
    try {
      renameSync(from, join2(dir, name));
      reclaimed++;
    } catch {
    }
  }
  return reclaimed;
}
function writeStatus(viewDir, status = {}, { now = () => Date.now() } = {}) {
  try {
    mkdirSync(queueDir(viewDir), { recursive: true });
    writeFileAtomic(statusPath(viewDir), `${JSON.stringify({ ...status, updatedAt: new Date(now()).toISOString() }, null, 2)}
`);
  } catch {
  }
}
function readStatus(viewDir) {
  try {
    return JSON.parse(readFileSync(statusPath(viewDir), "utf-8"));
  } catch {
    return null;
  }
}
function countPending(viewDir) {
  return listRecordFiles(queueDir(viewDir)).length;
}
function listFailed(viewDir) {
  try {
    return readdirSync(failedDir(viewDir)).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
}
function createRenderQueueDrainer({
  submit,
  isBusy,
  pluginRoot,
  log = () => {
  },
  now = () => Date.now(),
  maxAttempts = RENDER_QUEUE_DEFAULTS.maxAttempts,
  orphanTtlMs = RENDER_QUEUE_DEFAULTS.orphanTtlMs
} = {}) {
  function drainEntry(entry) {
    try {
      if (!entry || !entry.id || !entry.viewDir) return { action: "invalid" };
      const { id, viewDir } = entry;
      if (isBusy(id)) return { action: "busy" };
      const pending = readPending(viewDir);
      if (!pending.length) return { action: "empty" };
      const plan = coalesce(pending.map((p) => p.record));
      const claimed = claim(viewDir, pending.map((p) => p.name));
      if (!claimed.length) return { action: "nothing-claimed" };
      const args = renderArgsForPlan(plan, { viewDir, pluginRoot });
      const r = submit(entry, {
        args,
        label: `render-queue: ${id} ${plan.kind} ${plan.bucket} (${claimed.length} req)`,
        onSettled: (code) => {
          try {
            if (code === 0) {
              ack(viewDir, claimed);
              writeStatus(viewDir, { pendingCount: countPending(viewDir), lastError: null }, { now });
            } else {
              fail(viewDir, claimed, { maxAttempts, now, error: `render exited ${code}` });
              writeStatus(viewDir, { pendingCount: countPending(viewDir), lastError: `render exited ${code}` }, { now });
            }
          } catch (err) {
            log(`render-queue: settle error for ${id}: ${err?.message ?? err}`);
          }
        }
      });
      if (r?.action !== "enqueued") {
        unclaim(viewDir, claimed);
        return { action: r?.action ?? "rejected" };
      }
      return { action: "submitted", plan, claimed: claimed.length };
    } catch (err) {
      log(`render-queue: drain error for ${entry?.id ?? "?"}: ${err?.message ?? err}`);
      return { action: "error" };
    }
  }
  function catchUp(entries) {
    for (const e of entries ?? []) {
      try {
        reclaimOrphans(e.viewDir, { ttlMs: orphanTtlMs, now });
      } catch {
      }
    }
    return (entries ?? []).map((e) => drainEntry(e));
  }
  function snapshot(entries) {
    const pending = {};
    const failed = [];
    for (const e of entries ?? []) {
      const n = countPending(e.viewDir);
      if (n > 0) pending[e.id] = n;
      for (const name of listFailed(e.viewDir)) failed.push({ id: e.id, file: name });
    }
    return { pending, failed, lastDrainAt: new Date(now()).toISOString() };
  }
  return { drainEntry, catchUp, snapshot };
}

export {
  resolveEntrypoint,
  queueDir,
  appendError,
  enqueue,
  writeStatus,
  readStatus,
  countPending,
  createRenderQueueDrainer
};
