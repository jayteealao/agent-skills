import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  configHash,
  deepMerge
} from "./chunk-H5U2H73C.mjs";
import {
  spawnDetachedNode
} from "./chunk-HQR34SES.mjs";
import {
  hubPidPath,
  sdlcHomeDir
} from "./chunk-VAB2CNQR.mjs";
import {
  CODE_BROWSER_DEFAULTS,
  STALE_RENDER_DEFAULTS,
  isPidAlive,
  pidFileStatus,
  removePidFile,
  writePidFile
} from "./chunk-RY6BGTTK.mjs";
import {
  resolveEntrypoint
} from "./chunk-KRRL2TSM.mjs";

// lib/hub-lifecycle.mjs
import { randomBytes } from "node:crypto";
import { readFileSync as readFileSync2 } from "node:fs";
import { request } from "node:http";

// lib/hub-config.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
var HUB_CONFIG_VERSION = 1;
var HUB_CONFIG_DEFAULTS = Object.freeze({
  version: HUB_CONFIG_VERSION,
  host: "127.0.0.1",
  // The canonical SDLC URL in both single-repo and hub modes (Q4 resolved). The
  // per-repo daemon falls back to 4174 only when forced alongside a live hub.
  port: 4173,
  // Machine-wide authority over per-repo daemons. When false, ensureServeLifecycle
  // reaps any running per-repo daemon and never spawns one — overriding even a
  // repo's force `view.serve.enabled:true`. The hub serves every repo at /r/<id>/,
  // so a per-repo daemon is pure redundancy whenever the hub runs, and the only
  // thing that can squat the hub's port (a pre-hub daemon on 4173 = the inbox
  // disappears behind one repo's dashboard). Default true preserves prior
  // behaviour; set false to make the hub the sole server on this machine.
  perRepoServe: true,
  // Live-reload for the standalone per-repo fallback daemon (the hub always
  // live-reloads). Machine-wide because serve settings are not per-repo.
  liveReload: true,
  maxSseClients: 200,
  // aggregate across repos; client-side filtering scopes per-repo
  maxWatchedRepos: 50,
  // beyond this, poll instead of fs.watch
  tailscale: {
    enabled: false,
    mode: "serve",
    path: "/",
    https: true,
    // Security-decisive: a public binding exposes EVERY registered repo at once,
    // so this acknowledgement is a one-time, per-machine gate — never a
    // committable per-repo flag (§6.1).
    acknowledgedPublic: false
  },
  // The in-browser source browser (CODEBASE-BROWSER-PLAN §5). Machine-wide
  // like every other serve setting; reaches both daemons via env at spawn.
  // ⚠ codeBrowser.serveSecrets:true drops the secret denylist (.env/keys
  // become servable) — keep false whenever host ≠ 127.0.0.1.
  codeBrowser: { ...CODE_BROWSER_DEFAULTS },
  // Stale-render healing (STALE-RENDER-HEAL-PLAN, "Option B"). When a served
  // view's rendered version drifts from the running plugin (the upgrade-left-
  // content-behind split-brain), the serving daemon spawns a background clean
  // re-render OFF the request path; live-reload then refreshes open tabs. heal
  // defaults ON — it fires only on genuine drift (≈once per repo per upgrade)
  // and is bounded by maxConcurrent + per-repo cooldownMs + maxAttempts. Set
  // heal:false to detect-and-flag only (the hub still surfaces `stale` in health).
  // Reaches both daemons via env at spawn (SDLC_STALE_RENDER), like codeBrowser.
  staleRender: { ...STALE_RENDER_DEFAULTS }
});
function hubConfigPath() {
  return join(sdlcHomeDir(), "hub-config.json");
}
function migrate(raw) {
  const merged = deepMerge(HUB_CONFIG_DEFAULTS, raw && typeof raw === "object" ? raw : {});
  merged.version = HUB_CONFIG_VERSION;
  return merged;
}
function writeAtomic(path, obj) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}
`, "utf-8");
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
function readHubConfig({ create = true } = {}) {
  const path = hubConfigPath();
  if (!existsSync(path)) {
    if (create) {
      try {
        writeAtomic(path, HUB_CONFIG_DEFAULTS);
      } catch {
      }
    }
    return structuredClone(HUB_CONFIG_DEFAULTS);
  }
  try {
    return migrate(JSON.parse(readFileSync(path, "utf-8")));
  } catch {
    return structuredClone(HUB_CONFIG_DEFAULTS);
  }
}
function writeHubConfig(cfg) {
  const next = { ...cfg && typeof cfg === "object" ? cfg : {}, version: HUB_CONFIG_VERSION };
  writeAtomic(hubConfigPath(), next);
  return next;
}
function hubConfigHash(cfg) {
  return configHash(cfg);
}

// lib/tailscale.mjs
import { spawnSync } from "node:child_process";
function maybeConfigureTailscale({ tailscale = {}, port, log = () => {
} } = {}) {
  if (tailscale.enabled !== true) return;
  const target = `http://127.0.0.1:${port}`;
  const mode = tailscale.mode === "funnel" ? "funnel" : "serve";
  if (mode === "funnel" && tailscale.acknowledgedPublic !== true) {
    log("[tailscale] refused funnel without acknowledgedPublic:true");
    return;
  }
  const args = [mode, "--bg"];
  if (mode === "serve") {
    if (tailscale.https === false) args.push("--http=80");
    const path = tailscale.path || "/";
    if (path !== "/") args.push(`--set-path=${path}`);
  }
  args.push(target);
  const result = spawnSync("tailscale", args, {
    encoding: "utf-8",
    windowsHide: true,
    timeout: 1e4
  });
  if (result.error) {
    log(`[tailscale] ${mode} unavailable: ${result.error.message}`);
  } else if (result.status !== 0) {
    log(`[tailscale] ${mode} failed: ${(result.stderr || result.stdout || "").trim()}`);
  } else {
    log(`[tailscale] ${mode} configured for ${target}`);
  }
}
function tailscaleDnsName({ log = () => {
} } = {}) {
  try {
    const result = spawnSync("tailscale", ["status", "--json"], {
      encoding: "utf-8",
      windowsHide: true,
      timeout: 1e4
    });
    if (result.status !== 0 || !result.stdout) {
      log(`[tailscale] could not read status for DNS name: ${(result.stderr || "").trim()}`);
      return null;
    }
    const dns = JSON.parse(result.stdout)?.Self?.DNSName;
    if (!dns) return null;
    return String(dns).replace(/\.$/, "").toLowerCase() || null;
  } catch (err) {
    log(`[tailscale] DNS name lookup failed: ${err.message}`);
    return null;
  }
}

// lib/hub-lifecycle.mjs
var PLUGIN_VERSION = (() => {
  try {
    return JSON.parse(readFileSync2(new URL("../package.json", import.meta.url), "utf-8")).version ?? "";
  } catch {
    return "";
  }
})();
async function ensureHubLifecycle({ pluginRoot, log = () => {
} } = {}) {
  const cfg = readHubConfig();
  const host = cfg.host ?? "127.0.0.1";
  const port = Number(cfg.port ?? 4173);
  const pidPath = hubPidPath();
  const status = await pidFileStatus(pidPath);
  if (host === "0.0.0.0" && !(cfg.tailscale?.enabled === true && cfg.tailscale?.acknowledgedPublic === true)) {
    log("[hub] refused host 0.0.0.0 without tailscale.enabled + acknowledgedPublic");
    return { action: "refused-host" };
  }
  const id = await probeHubIdentity({ host, port, timeoutMs: status.alive ? 700 : 350 });
  if (id) {
    const tracked = status.alive && status.record?.pid === id.pid;
    if (id.isHub && id.version === PLUGIN_VERSION && tracked) {
      log(`[hub] already running at http://${displayHost(host)}:${port}`);
      maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
      return { action: "already-running", pid: id.pid };
    }
    const why = !id.isHub ? "non-hub process on hub port" : id.version !== PLUGIN_VERSION ? `stale hub v${id.version || "?"} \u2192 v${PLUGIN_VERSION}` : "untracked hub (orphaned pid file)";
    if (id.pid) stopPid(id.pid, log);
    await removePidFile(pidPath);
    await waitForGone({ host, port, timeoutMs: 2e3 });
    log(`[hub] reaped ${why} (pid ${id.pid ?? "?"})`);
  } else if (status.record) {
    await removePidFile(pidPath);
    log(`[hub] removed stale pid file for pid ${status.record?.pid}`);
  }
  const token = randomBytes(24).toString("hex");
  const cfgHash = hubConfigHash(cfg);
  const script = resolveEntrypoint(pluginRoot, "hub-serve");
  const childArgs = [
    "--host",
    host,
    "--port",
    String(port),
    "--pid-file",
    pidPath,
    "--config-hash",
    cfgHash,
    "--max-sse-clients",
    String(cfg.maxSseClients ?? 200),
    "--max-watched-repos",
    String(cfg.maxWatchedRepos ?? 50)
  ];
  if (host === "0.0.0.0" && cfg.tailscale?.enabled === true) childArgs.push("--allow-all-hosts");
  if (host !== "0.0.0.0" && cfg.tailscale?.enabled === true) {
    const dns = tailscaleDnsName({ log });
    if (dns) {
      childArgs.push("--allowed-hosts", dns);
      log(`[hub] allowlisting tailnet host ${dns}`);
    }
  }
  const child = spawnDetachedNode(script, childArgs, {
    cwd: sdlcHomeDir(),
    // Token via env (not argv) so it isn't visible in process listings; the
    // codeBrowser block rides env too because JSON cannot survive the Windows
    // launch-hidden.vbs argv rebuild. configHash covers it, so editing the
    // block in hub-config.json still restarts the hub.
    env: {
      ...process.env,
      SDLC_HUB_TOKEN: token,
      SDLC_CODE_BROWSER: JSON.stringify(cfg.codeBrowser ?? {}),
      // Stale-render heal config (STALE-RENDER-HEAL-PLAN §3). Via env for the
      // same reason as codeBrowser; configHash covers it so editing the block in
      // hub-config.json restarts the hub. heal defaults ON.
      SDLC_STALE_RENDER: JSON.stringify(cfg.staleRender ?? {})
    }
  });
  if (child.pid) {
    await writePidFile(pidPath, { pid: child.pid, host, port, token, configHash: cfgHash });
  }
  const healthy = await waitForHealth({ host, port, timeoutMs: 2500 });
  if (!healthy) {
    log(`[hub] started pid ${child.pid}, health check not ready yet`);
    return { action: "started-unconfirmed", pid: child.pid };
  }
  log(`[hub] started pid ${child.pid} at http://${displayHost(host)}:${port}`);
  maybeConfigureTailscale({ tailscale: cfg.tailscale, port, log });
  return { action: "started", pid: child.pid };
}
async function stopHub({ log = () => {
} } = {}) {
  const pidPath = hubPidPath();
  const status = await pidFileStatus(pidPath);
  if (status.alive) stopPid(status.record.pid, log);
  if (status.record) await removePidFile(pidPath);
  return { stopped: Boolean(status.alive) };
}
function stopPid(pid, log) {
  if (!isPidAlive(pid)) return;
  try {
    process.kill(pid, "SIGTERM");
  } catch (err) {
    log(`[hub] could not stop pid ${pid}: ${err.message}`);
  }
}
function waitForHealth({ host, port, timeoutMs }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      probeHealth({ host, port, timeoutMs: 250 }).then((ok) => {
        if (ok) return resolve(true);
        if (Date.now() - started >= timeoutMs) return resolve(false);
        setTimeout(tick, 120);
      });
    };
    tick();
  });
}
function probeHealth({ host, port, timeoutMs }) {
  const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return new Promise((resolve) => {
    const req = request({
      hostname: probeHost,
      port,
      path: "/__sdlc/health",
      method: "GET",
      timeout: timeoutMs
    }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}
function probeHubIdentity({ host, port, timeoutMs }) {
  const probeHost = host === "0.0.0.0" ? "127.0.0.1" : host;
  return new Promise((resolve) => {
    const req = request({
      hostname: probeHost,
      port,
      path: "/__sdlc/health",
      method: "GET",
      timeout: timeoutMs
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }
      let buf = "";
      res.setEncoding("utf-8");
      res.on("data", (c) => {
        if (buf.length < 65536) buf += c;
      });
      res.on("end", () => {
        try {
          const body = JSON.parse(buf);
          resolve({
            pid: Number.isInteger(body.pid) ? body.pid : null,
            version: typeof body.version === "string" ? body.version : "",
            isHub: Array.isArray(body.entries)
          });
        } catch {
          resolve(null);
        }
      });
    });
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
    req.on("error", () => resolve(null));
    req.end();
  });
}
function waitForGone({ host, port, timeoutMs }) {
  const started = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      probeHealth({ host, port, timeoutMs: 200 }).then((up) => {
        if (!up) return resolve(true);
        if (Date.now() - started >= timeoutMs) return resolve(false);
        setTimeout(tick, 120);
      });
    };
    tick();
  });
}
function displayHost(host) {
  return host === "0.0.0.0" ? "127.0.0.1" : host;
}

export {
  maybeConfigureTailscale,
  tailscaleDnsName,
  hubConfigPath,
  readHubConfig,
  writeHubConfig,
  ensureHubLifecycle,
  stopHub
};
