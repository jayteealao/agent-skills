import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/entrypoint.mjs
import { existsSync } from "node:fs";
import { join } from "node:path";
function resolveEntrypoint(pluginRoot, name) {
  const dist = join(pluginRoot, "dist", `${name}.mjs`);
  return existsSync(dist) ? dist : join(pluginRoot, "scripts", `${name}.mjs`);
}

// lib/pid-file.mjs
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}
async function readPidFile(pidPath) {
  try {
    const text = (await readFile(pidPath, "utf-8")).trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) return { pid: Number(text) };
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (err) {
    if (err?.code === "ENOENT") return null;
    return null;
  }
}
async function writePidFile(pidPath, record) {
  await mkdir(dirname(pidPath), { recursive: true });
  const payload = {
    ...record,
    pid: Number(record.pid),
    writtenAt: record.writtenAt ?? (/* @__PURE__ */ new Date()).toISOString()
  };
  const tmpPath = `${pidPath}.${process.pid}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}
`, "utf-8");
  await rename(tmpPath, pidPath);
  return payload;
}
async function removePidFile(pidPath) {
  await rm(pidPath, { force: true });
}
async function pidFileStatus(pidPath) {
  const record = await readPidFile(pidPath);
  const alive = record?.pid ? isPidAlive(record.pid) : false;
  return { record, alive, stale: Boolean(record && !alive) };
}

export {
  resolveEntrypoint,
  isPidAlive,
  readPidFile,
  writePidFile,
  removePidFile,
  pidFileStatus
};
