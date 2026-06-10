// lib/host-allowlist.mjs
//
// Host-header allowlist shared by the hub and the per-repo daemon. Extracted
// from scripts/hub-serve.mjs when the code browser gave the per-repo daemon
// its first Host-gated routes (CODEBASE-BROWSER-PLAN §0.2-4) — serving repo
// SOURCE is a larger perimeter than serving the rendered view, so the new
// `__code/*` routes must not ship without the DNS-rebinding defence the hub
// already had.
//
// The attack this defeats: a hostile page resolves `evil.example` to 127.0.0.1
// and fetches `http://evil.example:4173/...` — same socket, attacker-readable
// response. Legitimate local traffic arrives with a localhost Host header, so
// refusing unknown Hosts breaks the attack without affecting normal use.
// `extraHosts` carries targeted additions (e.g. the tailnet MagicDNS name that
// `tailscale serve` proxies in with) so tailnet exposure works without
// surrendering the allowlist for everything.

const ALLOWED_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

export function hostnameOf(hostHeader) {
  const h = String(hostHeader ?? '');
  if (h.startsWith('[')) return h.slice(0, h.indexOf(']') + 1).toLowerCase();   // [::1]:port
  return h.split(':')[0].toLowerCase();
}

/**
 * @param {import('node:http').IncomingMessage} req
 * @param {boolean} allowAllHosts — the explicit public-exposure mode (the user
 *   acknowledged exposure machine-wide; the write token remains the protection).
 * @param {Set<string>|null} [extraHosts] — lowercased extra Host names admitted
 *   ON TOP OF the localhost allowlist (a targeted relaxation, not allow-all).
 */
export function hostAllowed(req, allowAllHosts, extraHosts) {
  if (allowAllHosts) return true;
  const h = hostnameOf(req.headers.host);
  return ALLOWED_HOSTNAMES.has(h) || (extraHosts != null && extraHosts.has(h));
}
