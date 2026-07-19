// skills/uiproto/scripts/_consent.mjs
//
// Egress consent gate for the uiproto skill. Both engines (Stitch and the REST
// LLM) send the prompt to a third party, so each generator re-checks
// externalDispatch.enabled ITSELF — the script, not just the SKILL.md prose, is
// the consent boundary: a direct `node gen-stitch.mjs …` cannot bypass consent.
// Mirrors consult/dispatch.mjs's dispatchEnabled. EXTERNAL-MODEL-DISPATCH-PLAN D7/§4.1.

import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** Read ~/.sdlc/hub-config.json and return externalDispatch.enabled === true. */
export function dispatchEnabled({ home = homedir() } = {}) {
  try {
    const cfgPath = join(home, '.sdlc', 'hub-config.json');
    if (!existsSync(cfgPath)) return false;
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));
    return cfg?.externalDispatch?.enabled === true;
  } catch {
    return false;
  }
}
