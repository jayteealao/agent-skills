// lib/tray-format.mjs
//
// PURE display layer for the system-tray app (TRAY-APP-PLAN.md → "Health
// display"). Zero I/O: `formatHealth` takes the result of a health probe plus a
// `now` and returns everything the menu builder maps onto systray2 items — the
// icon state, tooltip, summary row, detail rows, and (hub only) per-repo rows.
// Keeping it pure makes every state below a unit test over a fixture payload, no
// live server needed.
//
// The health endpoint (scripts/hub-serve.mjs `healthPayload`) returns two shapes,
// discriminated by `Array.isArray(payload.entries)`:
//   • Hub:        { version, pid, uptimeMs, configHash, entries:[…], metrics:{…} }
//   • Per-repo:   { version, pid, configHash, renderedAt }  — no entries/metrics.

/** Humanize a millisecond uptime: `45s`, `14m`, `2h14m`, `3d2h`. */
export function fmtUptime(ms) {
  let n = Number(ms);
  if (!Number.isFinite(n) || n < 0) n = 0;
  const s = Math.floor(n / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24}h`;
}

/** Humanize a byte count: `0 B`, `512 B`, `1.5 KB`, `248 MB`. */
export function fmtBytes(n) {
  let v = Number(n);
  if (!Number.isFinite(v) || v < 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  const str = i === 0 ? String(Math.round(v)) : (v >= 100 ? String(Math.round(v)) : v.toFixed(1));
  return `${str} ${units[i]}`;
}

/** Relative time from an ISO timestamp: `never`, `just now`, `3m ago`, `2h ago`, `5d ago`. */
export function fmtRelTime(iso, now = Date.now()) {
  if (!iso) return 'never';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return 'never';
  const diff = Number(now) - t;
  if (diff < 45_000) return 'just now';
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function shortHash(h) {
  const s = String(h ?? '');
  return s ? s.slice(0, 8) : '—';
}

/**
 * Map a health-probe result to the tray's display model.
 *
 * @param {{ reachable?: boolean, payload?: object|null, pluginVersion?: string }} result
 *   `reachable` — did the HTTP probe succeed with a parseable 200 body.
 *   `payload`   — the parsed health JSON (or null).
 *   `pluginVersion` — the tray's own PLUGIN_VERSION, for stale detection.
 * @param {number} [now] — wall clock in ms, for relative times (injectable for tests).
 * @returns {{
 *   iconState: 'up'|'down'|'stale',
 *   tooltip: string,
 *   summary: string,
 *   detailRows: Array<{label:string,value:string}>,
 *   repoItems: Array<{id:string,branch:string,slugs:number,rendered:string,label:string,href:string}>,
 * }}
 */
export function formatHealth(result = {}, now = Date.now()) {
  const { reachable = false, payload = null, pluginVersion = '' } = result;

  // ── down: probe failed / non-200 / parse error ──
  if (!reachable || !payload || typeof payload !== 'object') {
    return {
      iconState: 'down',
      tooltip: 'SDLC hub — down',
      summary: '● hub down — start it?',
      detailRows: [{ label: 'Status', value: 'not reachable' }],
      repoItems: [],
    };
  }

  const version = typeof payload.version === 'string' ? payload.version : '';
  const isHub = Array.isArray(payload.entries);
  const repoCount = isHub ? payload.entries.length : 0;

  // ── stale: a running server, but a version older/newer than this tray's ──
  // Takes precedence over up: the user should restart to converge on one version.
  const stale = Boolean(pluginVersion) && Boolean(version) && version !== pluginVersion;

  const detailRows = buildDetailRows(payload, { isHub, now });
  const repoItems = isHub ? buildRepoItems(payload.entries, now) : [];

  if (stale) {
    return {
      iconState: 'stale',
      tooltip: `SDLC ${isHub ? 'hub' : 'repo'} stale v${version} → v${pluginVersion}`,
      summary: `● stale v${version} → v${pluginVersion} (restart)`,
      detailRows,
      repoItems,
    };
  }

  // ── up ──
  if (isHub) {
    const upStr = fmtUptime(payload.uptimeMs);
    const reqStr = `${payload.metrics?.requests ?? 0} req`;
    return {
      iconState: 'up',
      tooltip: `SDLC hub v${version} · ${repoCount} repo${repoCount === 1 ? '' : 's'} · up ${upStr} · ${reqStr}`,
      summary: `● healthy — v${version} · ${repoCount} repo${repoCount === 1 ? '' : 's'}`,
      detailRows,
      repoItems,
    };
  }

  // per-repo daemon
  return {
    iconState: 'up',
    tooltip: `SDLC repo v${version} · rendered ${fmtRelTime(payload.renderedAt, now)}`,
    summary: `● serving repo — v${version}`,
    detailRows,
    repoItems,
  };
}

function buildDetailRows(payload, { isHub, now }) {
  const rows = [];
  if (payload.version) rows.push({ label: 'Version', value: `v${payload.version}` });
  if (Number.isInteger(payload.pid)) rows.push({ label: 'PID', value: String(payload.pid) });
  if (isHub) {
    rows.push({ label: 'Uptime', value: fmtUptime(payload.uptimeMs) });
    const m = payload.metrics ?? {};
    rows.push({ label: 'Requests', value: String(m.requests ?? 0) });
    rows.push({ label: 'SSE clients', value: String(m.sseClients ?? 0) });
    if (m.rssBytes != null) rows.push({ label: 'RSS', value: fmtBytes(m.rssBytes) });
  } else {
    rows.push({ label: 'Rendered', value: fmtRelTime(payload.renderedAt, now) });
  }
  rows.push({ label: 'Config', value: shortHash(payload.configHash) });
  return rows;
}

function buildRepoItems(entries, now) {
  return entries.map((e) => {
    const id = String(e.id ?? '?');
    const branch = String(e.branch ?? '?');
    const slugs = Array.isArray(e.slugs) ? e.slugs.length : 0;
    const rendered = fmtRelTime(e.lastRenderedAt, now);
    return {
      id,
      branch,
      slugs,
      rendered,
      label: `↳ ${id} · ${branch} · ${slugs} slug${slugs === 1 ? '' : 's'} · ${rendered}`,
      href: `/r/${id}/`,
    };
  });
}
