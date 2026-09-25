# Wide-event observability — Express/Node.js reference adapter

Load this file from `wide-event-observability.md` only when the unit's stack is Node/TypeScript on the server. On any other stack, port the pattern from the language-agnostic core in `wide-event-observability.md`; do not load this file.

## Reference Adapter: Express/Node.js (one realization of the core)

This is the **reference adapter** — the fullest worked example. It realizes the language-agnostic core (schema +
tail sampling + request-scoped builder + emit-once hook) in Express + pino. On a Go, Python, JVM, Rust, or .NET
service, port the *pattern*, not the syntax (see the adapter table in `wide-event-observability.md`).

### Step 1: Wide Event Middleware

```typescript
// observability/wideEvent.ts
import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface WideEvent {
  timestamp: string;
  request_id: string;
  trace_id?: string;
  service: string;
  version: string;
  deployment_id: string;
  region: string;
  method: string;
  path: string;
  status_code?: number;
  duration_ms?: number;
  outcome?: 'success' | 'error';
  user?: {
    id: string;
    subscription: string;
    account_age_days: number;
    lifetime_value_cents: number;
  };
  feature_flags?: Record<string, boolean>;
  error?: {
    type: string;
    code: string;
    message: string;
    retriable: boolean;
  };
  [key: string]: any;
}

function getOrCreateRequestId(req: Request): string {
  const existing = req.header('x-request-id');
  return existing ?? crypto.randomUUID();
}

export function wideEventMiddleware(
  logger: { info: (obj: any, msg?: string) => void }
) {
  return function (req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const request_id = getOrCreateRequestId(req);

    // Build initial event
    const event: WideEvent = {
      timestamp: new Date().toISOString(),
      request_id,
      service: process.env.SERVICE_NAME || 'unknown',
      version: process.env.SERVICE_VERSION || '0.0.0',
      deployment_id: process.env.DEPLOYMENT_ID || 'local',
      region: process.env.REGION || 'local',
      method: req.method,
      path: req.path,
    };

    // Attach to request for handlers to enrich
    (req as any).wideEvent = event;

    // Include request id in response headers
    res.setHeader('x-request-id', request_id);

    // Emit event when response finishes
    res.on('finish', () => {
      event.status_code = res.statusCode;
      event.duration_ms = Date.now() - start;
      event.outcome = res.statusCode >= 500 ? 'error' : 'success';

      // Tail sampling decision
      if (shouldSample(event)) {
        logger.info(event, 'request_complete');
      }
    });

    next();
  };
}

function shouldSample(event: WideEvent): boolean {
  // Always keep errors
  if (event.status_code && event.status_code >= 500) return true;
  if (event.error) return true;

  // Always keep slow requests (tune to your p99)
  if (event.duration_ms && event.duration_ms > 2000) return true;

  // Always keep VIPs
  if (event.user?.subscription === 'enterprise') return true;
  if (event.user?.lifetime_value_cents && event.user.lifetime_value_cents > 10000_00) return true;

  // Always keep feature-flagged traffic
  if (event.feature_flags && Object.keys(event.feature_flags).length > 0) return true;

  // Sample the rest (5%)
  return Math.random() < 0.05;
}
```

### Step 2: Enrich in Route Handlers

```typescript
import express from 'express';

const app = express();

app.use(wideEventMiddleware(logger));

app.post('/api/checkout', async (req, res) => {
  const event = (req as any).wideEvent;

  // Add user context
  const user = req.user; // From auth middleware
  event.user = {
    id: user.id,
    subscription: user.subscription,
    account_age_days: daysSince(user.createdAt),
    lifetime_value_cents: user.lifetimeValueCents,
  };

  // Add feature flags
  event.feature_flags = req.featureFlags; // From feature flag middleware

  // Add business context
  const cart = await getCart(user.id);
  event.cart = {
    total_cents: cart.totalCents,
    item_count: cart.items.length,
    currency: cart.currency,
  };

  try {
    const paymentStart = Date.now();
    const payment = await processPayment(cart, user);

    event.payment = {
      provider: payment.provider,
      method: payment.method,
      latency_ms: Date.now() - paymentStart,
      attempt: payment.attempt,
    };

    res.json({ ok: true, orderId: payment.orderId });
  } catch (err: any) {
    event.error = {
      type: err.name,
      code: err.code || 'unknown',
      message: err.message,
      retriable: err.retriable ?? false,
      provider_code: err.providerCode,
    };

    res.status(err.statusCode || 500).json({
      error: err.code,
      message: err.message,
    });
  }
});
```

### Step 3: Logger Configuration

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'password',
      'creditCard',
      'ssn',
      'authToken',
      'apiKey',
      'authorization',
      'cookie',
    ],
    remove: true,
  },
  // Send to stdout for CloudWatch/Datadog ingestion
  transport: process.env.NODE_ENV === 'development'
    ? { target: 'pino-pretty' }
    : undefined,
});

export default logger;
```
