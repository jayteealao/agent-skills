import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);

// lib/port-owner.mjs
import { spawnSync } from "node:child_process";
import { connect } from "node:net";
function parseNetstatListeners(text) {
  const out = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const m = /^\s*(TCP|UDP)\s+(\S+?):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$/.exec(line);
    if (m) out.push({ proto: m[1], local: m[2], port: Number(m[3]), pid: Number(m[4]) });
  }
  return out;
}
function portOwner(port, { platform = process.platform, exec = spawnSync } = {}) {
  try {
    if (platform === "win32") {
      const r2 = exec("netstat", ["-ano", "-p", "TCP"], { encoding: "utf-8", windowsHide: true, timeout: 1e4 });
      const row = parseNetstatListeners(r2.stdout).find((x) => x.port === Number(port));
      return row ? { pid: row.pid, source: "netstat" } : null;
    }
    const r = exec("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf-8", timeout: 1e4 });
    const pid = Number(String(r.stdout ?? "").trim().split(/\s+/)[0]);
    return Number.isInteger(pid) && pid > 0 ? { pid, source: "lsof" } : null;
  } catch {
    return null;
  }
}
function portHeld({ host = "127.0.0.1", port, timeoutMs = 400 } = {}) {
  const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (!done) {
        done = true;
        try {
          sock.destroy();
        } catch {
        }
        resolve(v);
      }
    };
    const sock = connect({ host: probeHost, port: Number(port) });
    sock.setTimeout(timeoutMs);
    sock.once("connect", () => finish(true));
    sock.once("timeout", () => finish(false));
    sock.once("error", () => finish(false));
  });
}

export {
  portOwner,
  portHeld
};
