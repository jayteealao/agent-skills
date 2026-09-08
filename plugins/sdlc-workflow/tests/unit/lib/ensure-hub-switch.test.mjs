// Review 2026-09-08 (second pass) — one kill switch, two spellings. The Claude
// side read SDLC_DISABLE_ENSURE_HUB and the Codex adapter read
// SDLC_DISABLE_HUB_ENSURE; a user who set one still got a hub from the other
// host. Both spellings now disable the ensure everywhere.
import { test } from 'node:test';
import { equal } from 'node:assert/strict';

import { ensureHubEnabled } from '../../../lib/ensure-hub.mjs';

test('ensureHubEnabled honours both spellings of the kill switch', () => {
  equal(ensureHubEnabled({}, {}), true);
  equal(ensureHubEnabled({}, { SDLC_DISABLE_ENSURE_HUB: '1' }), false);
  equal(ensureHubEnabled({}, { SDLC_DISABLE_HUB_ENSURE: '1' }), false);
  equal(ensureHubEnabled({ ensureHubOnWrite: false }, {}), false, 'the per-repo config still wins');
  equal(ensureHubEnabled({}, { SDLC_DISABLE_ENSURE_HUB: '0' }), true, 'only "1" disables');
});
