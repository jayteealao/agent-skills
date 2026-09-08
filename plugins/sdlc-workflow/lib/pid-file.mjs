import { readFileSync, rmSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (err) {
    return err?.code === 'EPERM';
  }
}

export async function readPidFile(pidPath) {
  try {
    const text = (await readFile(pidPath, 'utf-8')).trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) return { pid: Number(text) };
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (err) {
    if (err?.code === 'ENOENT') return null;
    return null;
  }
}

export async function writePidFile(pidPath, record) {
  await mkdir(dirname(pidPath), { recursive: true });
  const payload = {
    ...record,
    pid: Number(record.pid),
    writtenAt: record.writtenAt ?? new Date().toISOString(),
  };
  const tmpPath = `${pidPath}.${process.pid}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  await rename(tmpPath, pidPath);
  return payload;
}

export async function removePidFile(pidPath) {
  await rm(pidPath, { force: true });
}

/**
 * Remove the record only when it names `pid` (default: this process) or is
 * absent. A reaped hub's late shutdown must not delete the record the next hub
 * already wrote (review 2026-09-08). Returns true when nothing foreign remains.
 */
export async function removeOwnPidFile(pidPath, pid = process.pid) {
  const record = await readPidFile(pidPath);
  if (record && record.pid !== pid) return false;
  await rm(pidPath, { force: true });
  return true;
}

/** The synchronous twin for an 'exit' handler, where async fs is unsafe. */
export function removeOwnPidFileSync(pidPath, pid = process.pid) {
  let record = null;
  try {
    const text = readFileSync(pidPath, 'utf-8').trim();
    record = /^\d+$/.test(text) ? { pid: Number(text) } : (text ? JSON.parse(text) : null);
  } catch { record = null; }
  if (record && typeof record === 'object' && record.pid !== pid) return false;
  try { rmSync(pidPath, { force: true }); } catch { /* ignore */ }
  return true;
}

export async function pidFileStatus(pidPath) {
  const record = await readPidFile(pidPath);
  const alive = record?.pid ? isPidAlive(record.pid) : false;
  return { record, alive, stale: Boolean(record && !alive) };
}
