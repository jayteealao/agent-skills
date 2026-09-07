import { createRequire as __sdlcCreateRequire } from 'module';
const require = __sdlcCreateRequire(import.meta.url);
import {
  CODE_BROWSER_DEFAULTS,
  STALE_RENDER_DEFAULTS
} from "./chunk-N7IAPX7N.mjs";
import {
  configHash,
  deepMerge
} from "./chunk-YVM64S7E.mjs";
import {
  sdlcHomeDir
} from "./chunk-4K63PVBZ.mjs";

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
  // Machine-wide authority over per-repo daemons. Per-repo serving is OPT-IN:
  // a daemon runs ONLY when this is explicitly `true`. At any other value
  // (`false`, or absent) ensureServeLifecycle reaps any running per-repo daemon
  // and never spawns one — overriding even a repo's force `view.serve.enabled:true`.
  // The hub serves every repo at /r/<id>/, so a per-repo daemon is pure
  // redundancy whenever the hub runs, and the only thing that can squat the hub's
  // port (a pre-hub daemon on 4173 = the inbox disappears behind one repo's
  // dashboard). Default `false` makes the hub the sole server on this machine;
  // set `true` to allow the standalone per-repo fallback daemon.
  perRepoServe: false,
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
  staleRender: { ...STALE_RENDER_DEFAULTS },
  // External-model dispatch (EXTERNAL-MODEL-DISPATCH-PLAN, D7/§4). The single
  // machine-wide consent gate for the `consult` / `imagery` / `uiproto` skills,
  // which send artifact/repo content to third-party AI models (Codex, Claude,
  // Gemini, OpenAI, the Vercel AI Gateway, Stitch). OFF by default: dispatch is
  // a privacy/egress boundary, so it stays dark until a developer explicitly
  // opts THIS machine in. The skill runners re-check this flag themselves (the
  // script — not just the SKILL.md prose — is the trust boundary), so a direct
  // `node dispatch.mjs …` cannot bypass consent. Egress consent is this one
  // flag (no separate per-run `.ai/` marker); secrets stay in env, never here.
  externalDispatch: { enabled: false }
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

export {
  hubConfigPath,
  readHubConfig,
  writeHubConfig,
  hubConfigHash
};
