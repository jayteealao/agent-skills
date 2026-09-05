# Adapter: `service` (HTTP API / backend service)

## Detection signals
- `Dockerfile` exposing an HTTP port
- Files declaring HTTP server frameworks: Express, Fastify, FastAPI, Flask, Gin, Actix-web, Axum, Spring Boot, Rails, etc.
- `openapi.yaml` / `openapi.json` / `swagger.yaml`
- `docker-compose.yml` with web service definitions

## Bootstrap
1. **Probe for a running service** — `curl -sI http://localhost:<port>/health` (or the project's documented health endpoint). If it responds, skip to drive.
2. **Start the service** — run the project's documented start command (`docker compose up -d`, `npm run start`, `python -m uvicorn`, etc.) in the background.
3. **Wait for readiness** — poll the health endpoint up to 60 seconds.
4. **Resolution attempt before failing:** if start fails, check that required environment variables are set; surface them in the failure hint.

## Enumerate
Inventory routes **before** driving (see the enumeration ladder in [_protocols.md](_protocols.md)).
1. **Recipe rung** — read `openapi.yaml` / `openapi.json` paths, or the framework route table (`app.get(...)`, FastAPI decorators, Spring mappings, Rails routes).
2. **Static rung** — grep for handler registrations and collect method+path literals.
3. **Traversal rung** — a documented discovery endpoint if one exists (`/__routes`, a gateway listing). The count is a FLOOR.
Record method+path pairs, not paths alone — `GET /x` and `DELETE /x` are separate surfaces.

## Drive

**Verify the layer the AC is about (integration-blindspot guard).** When a user-observable AC asserts live integration behavior — a real query, a rules / permission check, an index-backed lookup — a mock-backed unit test is necessary but **not sufficient**, and `convergence: converged` on green mocks is a false pass. Climb to the local emulator suite (Firebase / Firestore emulator) or testcontainers so the **real query path** runs; that is the rung that catches the missing composite index, the swallowed exception, and the rules regression mocks hide. Defer the live path only when it is genuinely creds-gated (prod OAuth, a real third-party session) — and name that residual.

- **HTTP requests** — `curl` or `httpie` (`http POST localhost:<port>/<route>`). For complex flows, write a short script that chains requests.
- **OpenAPI clients** — if a generated client exists, use it for type-safe drives.
- **Existing integration test suites** — prefer running them when they cover the target surface (`pytest tests/integration/`, `npm run test:integration`).

## Observe
- **Response bodies** — capture for each request, validate structure against OpenAPI schema if available.
- **Response status codes** — record per request.
- **Response headers** — capture for security-sensitive criteria (CORS, CSP, cache-control).
- **Service logs** — tail the application log during the drive phase; capture log lines emitted in the relevant time window.

## Perturb
Break exactly one dependency, re-observe, restore (see the perturbation protocol in [_protocols.md](_protocols.md)).
- **One dependency down** — stop a harness-started dependency container (never a process the run did not start); check the blast radius is scoped to routes that need it.
- **One dependency slow** — introduce latency to expose a missing downstream timeout.
- **Malformed input** — a single bad field; check the error names the field without leaking internals.
Watch for `dependency-collapse` (every route 500s) and `branch-gap` (headers only on 200).

## Tear down
- If this run started the service, stop it: `docker compose down`, kill the background process, etc.

## Evidence layout
```
<evidence-dir>/
  <criterion-or-target-slug>.request.txt   # curl command or request descriptor
  <criterion-or-target-slug>.response.json # response body
  <criterion-or-target-slug>.headers.txt   # response headers + status
  <criterion-or-target-slug>.service.log   # captured log lines
```

## Remediation hints
- Service refuses to start → "Check environment variables and database connectivity. Most service bootstrap failures are config, not code."
- Health endpoint never returns ready → "The service is probably stuck on a migration or external dependency; check service logs for the blocking call."
