# Adapter: `web`

## Detection signals
- `package.json` with a `dev` / `start` / `serve` script
- `vite.config.*`, `next.config.*`, `nuxt.config.*`, `astro.config.*`, `svelte.config.*`, `remix.config.*`
- Static HTML at repo root or under `public/`, `static/`, `dist/`
- `index.html` referencing JavaScript modules

## Bootstrap
1. **Probe for a running dev server** — `curl -sI http://localhost:<port>` against the project's documented port (read from config or `README.md`). If the server already responds, skip to drive.
2. **Start the dev server** — run `npm run dev` / `yarn dev` / `pnpm dev` (or the equivalent from `package.json scripts`) in the background. Wait for the server to bind (poll the port up to 30 seconds).
3. **Resolution attempts before failing:** if the start command exits non-zero, try `npm install` (or yarn/pnpm equivalent) once and retry the start. If that still fails, surface `bootstrap-failure: { step: dev-server-start, ... }`.

## Enumerate
Inventory routes **before** driving (see the enumeration ladder in [_protocols.md](_protocols.md)).
1. **Recipe rung** — read the router manifest: Next.js `app/`/`pages/` tree, React Router route config, Vue/Nuxt routes, Rails `routes.rb`, Django `urls.py`, or a generated `sitemap.xml`.
2. **Static rung** — no central manifest: grep for route-registration calls and collect their path literals.
3. **Traversal rung** — bounded breadth-first crawl from the entry URL, same-origin only, recording distinct rendered routes. The count is a FLOOR.
Record dynamic segments once per template (`/post/:id`), not once per instance.

## Drive — candidate tools

The PO chose a driver during shape (from `02-shape.md` and the `stack:` block); use whatever they picked. The list below is a menu of candidates the shape question draws from, ordered roughly by *already-installed first*. Do not propose installing a *new, unplanned* tool without going back through shape.

**Exception — pre-authorized bootstrap (rung 0).** When the plan's `## Verification Strategy` explicitly named a driver to install for a specific AC (e.g., "install Playwright for the 375px responsive AC"), that install is already PO-approved — execute it per rung 0 of the web ladder rather than skipping the AC. The constraint is on *introducing un-planned tools*, never on installing the one the plan already chose.

**Responsive & media-query ACs — never skip on a pinned viewport.** A host-pinned `innerWidth` in an in-session browser MCP (the window will not resize, so `@media` never fires) is **not** a reason to pass-by-static-reasoning or quietly skip the criterion. Drive a viewport-controllable browser instead: Playwright with explicit `viewport` + `deviceScaleFactor`, or CDP `Emulation.setDeviceMetricsOverride` — rungs 1–2 of the web ladder above. If neither is reachable in this environment, the AC is *deferred with the rungs named*, not passed.

### 1. `dev-browser` (if installed or PO opted in)
Check if installed: `command -v dev-browser`. If not installed AND the PO did not select it during shape, skip this option — do not auto-prompt for installation here.

If available, dev-browser provides Playwright's full Page API in a sandboxed QuickJS runtime with persistent pages across scripts:

```bash
dev-browser --headless <<'SCRIPT'
const page = await browser.getPage("verify");
await page.goto("http://localhost:3000", { waitUntil: "domcontentloaded" });
// interact with the page
await page.click("button#submit");
await page.waitForSelector(".success-message");
// capture screenshot evidence
const buf = await page.screenshot();
await saveScreenshot(buf, "verify-criterion-name.png");
// get AI-friendly DOM snapshot for reasoning
const snapshot = await page.snapshotForAI();
console.log(JSON.stringify(snapshot));
SCRIPT
```

- Use **persistent named pages** (`browser.getPage("verify")`) to maintain state across multiple verification scripts (e.g., login once, then verify multiple pages).
- Use `page.snapshotForAI()` to get LLM-optimized DOM snapshots for reasoning about page structure.
- Screenshots are saved to `~/.dev-browser/tmp/` — copy them to the evidence directory.
- Use `--connect` flag instead of `--headless` if the user has a running Chrome with remote debugging enabled.

### 2. Session-native browser tools (fallback)
If the session exposes browser-control tools (a browser MCP server or a host browser plugin — a host surface, see [_host-invocation.md](../_host-invocation.md)), use them:
- navigate to load pages
- page/DOM and page-text reads to inspect content
- pointer/keyboard interactions (click, type)
- console message reads to check for errors
- network request reads to verify API calls

If no browser tool is available, fall through to Playwright (candidate 3 below).

### 3. Playwright directly
If configured in the project, run existing Playwright test suites or write inline scripts.

## Observe
- **Multi-point screenshots (MANDATORY — Gap 12 fix):** For each criterion drive, capture evidence at three distinct moments: the initial response immediately after triggering the action, the transition or loading state while the system is processing, and the final settled state after completion. Use whatever screenshot mechanism the chosen driver provides. Report on each frame: was a loading indicator shown? Did transitions complete cleanly? Was there any blank or broken intermediate state?
- **Video recording (MANDATORY for UI criteria — Gap 8 fix):** Record video of each criterion drive using the chosen driver's recording capability. All major web drivers (Playwright, Cypress, WebdriverIO) and dev-browser support screen recording. The video captures intermediate states, animations, and transitions that discrete screenshots miss. Store the recording in the evidence directory and note the path.
- **Web Vitals (MANDATORY — Gap 8 fix):** After driving each criterion, capture Core Web Vitals — Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and Interaction to Next Paint (INP). Use whatever measurement mechanism the driver supports: the browser's Performance API via script evaluation, Lighthouse, Playwright's built-in tracing, or a web-vitals library injected into the page. Record the values as structured data. INP > 200 ms is a HIGH issue; LCP > 2500 ms is WARN; CLS > 0.1 is WARN.
- Browser console messages — check for errors after each interaction.
- Network requests — verify correct requests sent, responses received when the criterion involves API calls.
- DOM snapshots for AI-readable reasoning when supported (`page.snapshotForAI()`).
- Accessibility scan: axe-core via Playwright (`@axe-core/playwright`), eslint-plugin-jsx-a11y, or built-in browser accessibility audit.

## Cross-browser sweep (MANDATORY for web adapter — Gap 7 fix)
After verifying all criteria in the primary browser, re-drive each criterion in at least one additional browser. Playwright supports Chromium, Firefox, and WebKit natively — switch engines via the driver's browser-selection mechanism. If using a different driver (dev-browser, Cypress, WebdriverIO), use its equivalent cross-browser capability. Compare the secondary browser's screenshots against the primary for each criterion. Report any divergence — layout breakage, missing elements, different rendering, different interaction behaviour — under `## Cross-Browser Delta`. Divergences are HIGH issues. If a third browser is available, add a third pass. Record which browsers were used under `adapters-used`.

## Perturb
Break exactly one dependency, re-observe, restore (see the perturbation protocol in [_protocols.md](_protocols.md)).
- **Offline** — CDP `Network.emulateNetworkConditions` offline, or Playwright `context.setOffline(true)`.
- **One route failing** — intercept a single XHR/fetch route and return 500, or an empty body, leaving the rest healthy.
- **Slow dependency** — throttle one request to expose a missing timeout.
Watch for `dependency-collapse` (unrelated surface blanking) and `branch-gap` (a guarantee that only rendered on success).

## Tear down
- If this run started the dev server (i.e., it was not already running at bootstrap), terminate the background process.
- Stop all video recordings before teardown — Playwright finalizes video files on context close (`await context.close()`).
- If `dev-browser --headless` was used, no extra teardown needed — its tmp directory self-prunes.
- Persistent named pages in dev-browser survive across verification scripts within the same run; they are not torn down between criteria.

## Evidence layout
```
<evidence-dir>/
  <criterion-or-target-slug>-t0.png           # screenshot at action trigger (t=0)
  <criterion-or-target-slug>-t250.png         # screenshot at ~250 ms (transition state)
  <criterion-or-target-slug>-final.png        # screenshot after waitForSelector resolves
  <criterion-or-target-slug>-firefox.png      # cross-browser secondary screenshot
  <criterion-or-target-slug>.console.log      # console output
  <criterion-or-target-slug>.network.json     # network captures (if applicable)
  <criterion-or-target-slug>.web-vitals.json  # {lcp, cls, inp} from CDP
  video/
    <criterion-or-target-slug>.webm           # full interaction recording
```

## Remediation hints (surface in bootstrap-failure)
- `dev-server-start` failed → "Run `npm install` and try the dev script manually to see the underlying error."
- Port already in use → "Another process is bound to the dev port; stop it or run probe with the existing server (probe will detect and reuse it)."
- Build error during startup → "Run `npm run build` to surface the build-time error before retrying probe."

## Skill catalog hints

Surface these only if they appear in `stack.available-skills` / `stack.available-mcp` and the task touches the relevant area. None are required.

- **`frontend-design`** — when the work introduces a new UI surface and the PO wants design-quality output rather than a wired-up component.
- **`playground`** — when the deliverable is an interactive single-file explorer rather than a production-wired feature.
- **`claude-api` / `claude-code-guide`** — when the work involves the Anthropic SDK or the host itself; for another provider's SDK, consult that provider's official SDK docs.
- **Session-native browsers** (browser-control MCP servers or host browser/preview plugins) — if available, these are session-native alternatives to dev-browser; surface alongside dev-browser as drive candidates.
