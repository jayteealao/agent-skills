---
name: setup-wide-logging
description: Set up wide-event logging with tail sampling to replace scattered logs with canonical log lines. Auto-detects framework (express|koa|fastify|nextjs) and logger (pino|winston|bunyan|console).
---

# External Output Boundary (MANDATORY)
Apply the boundary rule in [_output-boundary.md](../wf/reference/_output-boundary.md) to every external-facing output
this operation produces: translate workflow context to product language and leak-check before publishing.

# Setup Wide-Event Logging

You are an observability architect implementing **wide events / canonical log lines** with **tail sampling** following the philosophy from **loggingsucks.com**.

**Arguments**: `$ARGUMENTS` — optional FRAMEWORK and LOGGER (e.g. `express pino`, `fastify winston`). If not provided, auto-detect from the project.

## Core Philosophy

**Traditional logging is broken:**
1. **Optimized for writing, not querying** - scattered logs create noise, not insight
2. **Missing business context** - logs lack user tier, feature flags, cart value, account age
3. **String search inadequacy** - grep can't correlate events across services
4. **Multi-search debugging nightmare** - requires multiple searches to understand one request

**The Solution**: Emit **ONE comprehensive event per request per service** containing:
- Technical metadata (timestamps, IDs, duration)
- Business context (user subscription, cart value, feature flags)
- Error details when applicable
- Complete request context in a single queryable event

## Step 1: Detect Current Environment

### 1.1 Detect Web Framework

Search project files to identify the web framework:

```bash
# Check package.json for dependencies
cat package.json | grep -E '"(express|koa|fastify|next)"'

# Check for framework imports
grep -r "from 'express'" src/
grep -r "from 'koa'" src/
grep -r "from 'fastify'" src/
grep -r "from 'next'" src/
```

Common patterns:
- **Express**: `import express from 'express'`, `app.get()`, `app.post()`
- **Koa**: `import Koa from 'koa'`, `app.use(async (ctx, next) => {})`
- **Fastify**: `import fastify from 'fastify'`, `fastify.get()`, `fastify.post()`
- **Next.js**: `pages/api/`, `app/api/`, `getServerSideProps`

Set `FRAMEWORK` to detected value.

### 1.2 Detect Logger

Search project files to identify the logger:

```bash
# Check package.json
cat package.json | grep -E '"(pino|winston|bunyan)"'

# Check for logger imports
grep -r "from 'pino'" src/
grep -r "from 'winston'" src/
grep -r "from 'bunyan'" src/
grep -r "console.log" src/
```

Common patterns:
- **Pino**: `import pino from 'pino'`, `logger.info({ ... }, 'message')`
- **Winston**: `import winston from 'winston'`, `logger.info('message', { ... })`
- **Bunyan**: `import bunyan from 'bunyan'`, `logger.info({ ... }, 'message')`
- **Console**: `console.log()`, `console.error()`

Set `LOGGER` to detected value.

### 1.3 Analyze Current Logging Approach

Search for existing log statements:

```bash
# Find all log statements
grep -r "logger\.\(info\|error\|debug\|warn\)" src/
grep -r "console\.\(log\|error\|info\)" src/

# Count log statements per file
grep -r "logger\.info" src/ | cut -d: -f1 | sort | uniq -c | sort -nr

# Look for scattered logging patterns (RED FLAG)
grep -B5 -A5 "logger\.info.*started" src/
grep -B5 -A5 "logger\.info.*completed" src/
```

**Identify anti-patterns:**
- Multiple log statements per request handler (diary logging)
- Log statements at start, middle, end of function
- Missing correlation IDs
- Logging primitive values instead of structured objects
- Secrets or PII in logs

## Step 2: Design Wide Event Schema

Based on the detected framework and application type, design a TypeScript interface for wide events.

### 2.1 Base Wide Event Schema

```typescript
// src/observability/wideEvent.ts

/**
 * Wide Event Schema - ONE event per request with full context
 * Philosophy: https://loggingsucks.com/
 */
export interface WideEvent {
  // ===== Correlation & Identity =====
  timestamp: string;              // ISO 8601
  request_id: string;             // Correlation across services
  trace_id?: string;              // Distributed tracing (OpenTelemetry)
  span_id?: string;               // Current span ID
  parent_span_id?: string;        // Parent span ID

  // ===== Service Context =====
  service: string;                // "checkout-api"
  version: string;                // "2.1.0"
  deployment_id: string;          // "deploy_abc123"
  region: string;                 // "us-east-1"
  environment: string;            // "production" | "staging" | "development"
  hostname: string;               // Container/instance ID

  // ===== Request Details =====
  method: string;                 // "POST"
  path: string;                   // "/api/checkout"
  route?: string;                 // "/api/checkout/:id" (route pattern)
  status_code?: number;           // 200
  duration_ms?: number;           // 245
  outcome?: 'success' | 'error';  // High-level outcome

  // ===== User Context (HIGH VALUE) =====
  user?: {
    id: string;
    subscription?: 'free' | 'premium' | 'enterprise';
    account_age_days?: number;
    lifetime_value_cents?: number;
    cohort?: string;              // A/B test cohort
    is_internal?: boolean;        // Internal user/employee
  };

  // ===== Request Context =====
  client?: {
    ip?: string;                  // Client IP (or hash for privacy)
    user_agent?: string;
    country?: string;             // GeoIP
    device_type?: 'mobile' | 'tablet' | 'desktop';
  };

  // ===== Feature Flags (for rollout debugging) =====
  feature_flags?: Record<string, boolean | string>;

  // ===== Performance =====
  performance?: {
    db_query_count?: number;
    db_duration_ms?: number;
    cache_hit?: boolean;
    external_api_calls?: number;
    external_api_duration_ms?: number;
  };

  // ===== Error Details (when applicable) =====
  error?: {
    type: string;                 // "PaymentDeclinedError"
    code: string;                 // "card_declined"
    message: string;
    stack?: string;               // Stack trace (redacted in production)
    retriable: boolean;
    provider_code?: string;       // Third-party error code
  };

  // ===== Domain-Specific Context =====
  // Add fields specific to your domain
  [key: string]: any;
}
```

### 2.2 Domain-Specific Extensions

Add fields based on application type:

**E-commerce:**
```typescript
export interface EcommerceWideEvent extends WideEvent {
  cart?: {
    total_cents: number;
    item_count: number;
    currency: string;
    coupon_applied?: string;
  };

  payment?: {
    provider: 'stripe' | 'paypal' | 'square';
    method: 'card' | 'bank' | 'wallet';
    latency_ms: number;
    attempt: number;
    decline_reason?: string;
  };

  order?: {
    id: string;
    total_cents: number;
    items: number;
    shipping_method?: string;
  };
}
```

**SaaS Application:**
```typescript
export interface SaaSWideEvent extends WideEvent {
  workspace?: {
    id: string;
    plan: 'free' | 'pro' | 'enterprise';
    seat_count: number;
    mrr_cents: number;
  };

  usage?: {
    api_calls_today: number;
    quota_limit: number;
    quota_remaining: number;
  };
}
```

## Step 3: Implement Tail Sampling

```typescript
// src/observability/tailSampling.ts

export function shouldSample(event: WideEvent): boolean {
  // ALWAYS KEEP: Errors
  if (event.status_code && event.status_code >= 500) return true;
  if (event.error) return true;
  if (event.status_code && event.status_code >= 400 && event.status_code < 500) {
    return Math.random() < 0.10;
  }

  // ALWAYS KEEP: Slow requests (tune to your p99)
  if (event.duration_ms && event.duration_ms > 2000) return true;
  if (event.duration_ms && event.duration_ms > 1000) return Math.random() < 0.50;

  // ALWAYS KEEP: VIPs / high-value users
  if (event.user?.subscription === 'enterprise') return true;
  if (event.user?.lifetime_value_cents && event.user.lifetime_value_cents > 10000_00) return true;
  if (event.user?.is_internal) return true;

  // ALWAYS KEEP: Feature-flagged traffic
  if (event.feature_flags && Object.keys(event.feature_flags).length > 0) return true;

  // ALWAYS KEEP: New users (for onboarding debugging)
  if (event.user?.account_age_days !== undefined && event.user.account_age_days < 7) return true;

  // ALWAYS KEEP: Critical paths
  const criticalPaths = ['/api/checkout', '/api/payment', '/api/auth/login', '/api/auth/signup'];
  if (event.path && criticalPaths.some(path => event.path.startsWith(path))) {
    return Math.random() < 0.20;
  }

  // SAMPLE: Everything else (5% base)
  return Math.random() < 0.05;
}
```

## Step 4: Implement Wide Event Middleware (Framework-Specific)

### 4.1 Express Middleware

```typescript
// src/observability/middleware/express.ts

import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { WideEvent } from '../wideEvent';
import { shouldSample } from '../tailSampling';

declare global {
  namespace Express {
    interface Request {
      wideEvent: WideEvent;
    }
  }
}

export function wideEventMiddleware(options: {
  logger: { info: (obj: any, msg?: string) => void; error: (obj: any, msg?: string) => void };
  serviceName?: string;
  version?: string;
  deploymentId?: string;
  region?: string;
  environment?: string;
}) {
  const {
    logger,
    serviceName = process.env.SERVICE_NAME || 'unknown',
    version = process.env.SERVICE_VERSION || process.env.npm_package_version || '0.0.0',
    deploymentId = process.env.DEPLOYMENT_ID || 'local',
    region = process.env.AWS_REGION || process.env.REGION || 'local',
    environment = process.env.NODE_ENV || 'development',
  } = options;

  return function (req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const request_id = req.header('x-request-id') ?? crypto.randomUUID();

    const event: WideEvent = {
      timestamp: new Date().toISOString(),
      request_id,
      service: serviceName,
      version,
      deployment_id: deploymentId,
      region,
      environment,
      hostname: process.env.HOSTNAME || require('os').hostname(),
      method: req.method,
      path: req.path,
      client: { ip: req.ip, user_agent: req.header('user-agent') },
    };

    req.wideEvent = event;
    res.setHeader('x-request-id', request_id);

    res.on('finish', () => {
      event.status_code = res.statusCode;
      event.duration_ms = Date.now() - start;
      event.outcome = res.statusCode >= 500 ? 'error' : 'success';
      if (req.route) event.route = req.route.path;

      if (shouldSample(event)) {
        if (event.error || res.statusCode >= 500) {
          logger.error(event, 'request_complete');
        } else {
          logger.info(event, 'request_complete');
        }
      }
    });

    next();
  };
}

export function wideEventErrorHandler(err: any, req: Request, res: Response, next: any) {
  if ((req as any).wideEvent) {
    (req as any).wideEvent.error = {
      type: err.name || 'Error',
      code: err.code || 'unknown',
      message: err.message || String(err),
      stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
      retriable: err.retriable ?? false,
    };
  }
  next(err);
}
```

### 4.2 Fastify Plugin

```typescript
// src/observability/plugins/fastify.ts

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import crypto from 'crypto';
import { WideEvent } from '../wideEvent';
import { shouldSample } from '../tailSampling';

declare module 'fastify' {
  interface FastifyRequest { wideEvent: WideEvent; }
}

async function wideEventPlugin(fastify: FastifyInstance, options: {
  serviceName?: string; version?: string; deploymentId?: string; region?: string; environment?: string;
}) {
  const {
    serviceName = process.env.SERVICE_NAME || 'unknown',
    version = process.env.SERVICE_VERSION || '0.0.0',
    deploymentId = process.env.DEPLOYMENT_ID || 'local',
    region = process.env.AWS_REGION || 'local',
    environment = process.env.NODE_ENV || 'development',
  } = options;

  fastify.addHook('onRequest', async (request, reply) => {
    const request_id = request.headers['x-request-id'] as string || crypto.randomUUID();
    request.wideEvent = {
      timestamp: new Date().toISOString(),
      request_id,
      service: serviceName, version, deployment_id: deploymentId,
      region, environment,
      hostname: process.env.HOSTNAME || require('os').hostname(),
      method: request.method, path: request.url,
      route: request.routerPath,
      client: { ip: request.ip, user_agent: request.headers['user-agent'] },
    };
    reply.header('x-request-id', request_id);
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const event = request.wideEvent;
    if (!event) return;
    event.status_code = reply.statusCode;
    event.duration_ms = reply.getResponseTime();
    event.outcome = reply.statusCode >= 500 ? 'error' : 'success';
    if (shouldSample(event)) {
      if (event.error || reply.statusCode >= 500) fastify.log.error(event, 'request_complete');
      else fastify.log.info(event, 'request_complete');
    }
  });

  fastify.addHook('onError', async (request, reply, error) => {
    if (request.wideEvent) {
      request.wideEvent.error = {
        type: error.name || 'Error',
        code: (error as any).code || 'unknown',
        message: error.message,
        stack: process.env.NODE_ENV === 'production' ? undefined : error.stack,
        retriable: (error as any).retriable ?? false,
      };
    }
  });
}

export default fp(wideEventPlugin, { name: 'wide-event-logging', fastify: '4.x' });
```

### 4.3 Koa Middleware

```typescript
// src/observability/middleware/koa.ts

import type { Context, Next } from 'koa';
import crypto from 'crypto';
import { WideEvent } from '../wideEvent';
import { shouldSample } from '../tailSampling';

export function wideEventMiddleware(options: {
  logger: { info: (obj: any, msg?: string) => void; error: (obj: any, msg?: string) => void };
  serviceName?: string; version?: string; deploymentId?: string; region?: string; environment?: string;
}) {
  const {
    logger,
    serviceName = process.env.SERVICE_NAME || 'unknown',
    version = process.env.SERVICE_VERSION || '0.0.0',
    deploymentId = process.env.DEPLOYMENT_ID || 'local',
    region = process.env.AWS_REGION || 'local',
    environment = process.env.NODE_ENV || 'development',
  } = options;

  return async function (ctx: Context, next: Next) {
    const start = Date.now();
    const request_id = ctx.request.header['x-request-id'] as string || crypto.randomUUID();

    const event: WideEvent = {
      timestamp: new Date().toISOString(), request_id,
      service: serviceName, version, deployment_id: deploymentId,
      region, environment, hostname: process.env.HOSTNAME || require('os').hostname(),
      method: ctx.method, path: ctx.path,
      route: ctx._matchedRoute,
      client: { ip: ctx.ip, user_agent: ctx.header['user-agent'] },
    };

    ctx.wideEvent = event;
    ctx.set('x-request-id', request_id);

    try {
      await next();
    } catch (err: any) {
      event.error = {
        type: err.name || 'Error', code: err.code || 'unknown',
        message: err.message || String(err),
        stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
        retriable: err.retriable ?? false,
      };
      throw err;
    } finally {
      event.status_code = ctx.status;
      event.duration_ms = Date.now() - start;
      event.outcome = ctx.status >= 500 ? 'error' : 'success';
      if (shouldSample(event)) {
        if (event.error || ctx.status >= 500) logger.error(event, 'request_complete');
        else logger.info(event, 'request_complete');
      }
    }
  };
}
```

## Step 5: Enrich Wide Events in Route Handlers

```typescript
// Example: Express handler with business context (same pattern works for Fastify/Koa)

router.post('/api/checkout', authenticateUser, async (req, res) => {
  const event = req.wideEvent;

  try {
    // 1. Add user context
    const user = req.user;
    event.user = {
      id: user.id, subscription: user.subscription,
      account_age_days: Math.floor((Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)),
      lifetime_value_cents: user.lifetimeValueCents,
      is_internal: user.email.endsWith('@company.com'),
    };

    // 2. Add feature flags
    event.feature_flags = await getFeatureFlags(user.id);

    // 3. Add business context: cart
    const cart = await getCart(user.id);
    event.cart = { total_cents: cart.totalCents, item_count: cart.items.length, currency: cart.currency };

    // 4. Process payment with timing
    const paymentStart = Date.now();
    const payment = await processPayment(cart, user);
    event.payment = { provider: payment.provider, method: payment.method, latency_ms: Date.now() - paymentStart, attempt: payment.attempt || 1 };

    // 5. Add order context
    event.order = { id: payment.orderId, total_cents: payment.amountCents, items: cart.items.length };

    res.json({ success: true, orderId: payment.orderId, requestId: event.request_id });

  } catch (err: any) {
    event.error = {
      type: err.name, code: err.code || 'unknown', message: err.message,
      retriable: err.retriable ?? false, provider_code: err.providerCode,
    };
    res.status(err.statusCode || 500).json({ error: err.code, message: err.userMessage || 'Payment failed', requestId: event.request_id });
  }
  // Event automatically emitted in middleware's res.on('finish')
});
```

## Step 6: Configure Logger with Redaction

### Pino Logger Configuration

```typescript
// src/observability/logger.ts

import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  ...(process.env.NODE_ENV === 'development' && {
    transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname', translateTime: 'SYS:HH:MM:ss' } },
  }),
  formatters: { level: (label) => ({ level: label }) },
  redact: {
    paths: [
      'password', 'passwordHash', 'token', 'accessToken', 'refreshToken',
      'apiKey', 'api_key', 'secret', 'authorization', 'cookie', 'session',
      'creditCard', 'credit_card', 'cardNumber', 'card_number', 'cvv', 'ssn',
      'bankAccount', 'bank_account', 'email', 'phone', 'address', 'ip',
      'req.headers.authorization', 'req.headers.cookie', 'req.body.password', 'error.stack',
    ],
    remove: true,
  },
});

export default logger;
```

### Winston Logger Configuration

```typescript
// src/observability/logger.ts

import winston from 'winston';

const redactFields = ['password', 'token', 'apiKey', 'secret', 'creditCard', 'ssn', 'authorization', 'cookie'];

function redactSensitive(info: any): any {
  const redacted = { ...info };
  function redactObject(obj: any) {
    for (const key in obj) {
      if (redactFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        redactObject(obj[key]);
      }
    }
  }
  redactObject(redacted);
  return redacted;
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format((info) => redactSensitive(info))(),
    winston.format.json()
  ),
  transports: [new winston.transports.Console({
    format: process.env.NODE_ENV === 'development'
      ? winston.format.combine(winston.format.colorize(), winston.format.simple())
      : winston.format.json(),
  })],
});

export default logger;
```

## Step 7: Migrate Existing Log Statements

**DO NOT** migrate all at once. Follow this phased approach:

**Phase 1: Add middleware (Week 1)**
- Add wide event middleware; dual log (keep existing + new wide events); verify events; test sampling.

**Phase 2: Enrich critical paths (Week 2)**
- Add business context to top 5 endpoints; add user context, feature flags, domain-specific fields.

**Phase 3: Remove scattered logs (Week 3)**
- Remove redundant log statements in migrated endpoints; keep infrastructure logs; update runbooks.

**Phase 4: Tune sampling (Week 4)**
- Monitor sampling rates; adjust thresholds; optimize for cost vs signal.

### Migration Patterns

```typescript
// Pattern 1: "Started"/"Completed" logs → Wide event
// BEFORE
logger.info('Payment processing started', { userId, amount });
const result = await processPayment();
logger.info('Payment processing completed', { userId, duration: Date.now() - start });

// AFTER
event.payment = { provider: 'stripe', amount_cents: amount };
const result = await processPayment();
// Duration automatically tracked by middleware

// Pattern 2: Error logs → event.error
// BEFORE
try { await processPayment(); } catch (err) { logger.error('Payment failed', { error: err.message }); throw err; }

// AFTER
try { await processPayment(); } catch (err: any) {
  event.error = { type: err.name, code: err.code, message: err.message, retriable: err.retriable };
  throw err;
}

// Pattern 3: Multiple context logs → Single enrichment
// BEFORE
logger.info('User info', { userId, subscription });
logger.info('Cart info', { cartTotal, items });

// AFTER
event.user = { id: userId, subscription };
event.cart = { total_cents: cartTotal, item_count: items };
// All logged together in one event
```

## Step 8: Document Query Examples

```sql
-- Example 1: Checkout failures for premium users with feature flag
SELECT error.code, COUNT(*) as failure_count, AVG(duration_ms) as avg_duration_ms
FROM logs
WHERE path = '/api/checkout' AND outcome = 'error'
  AND user.subscription = 'premium' AND feature_flags.new_checkout_flow = true
  AND @timestamp > ago(1h)
GROUP BY error.code ORDER BY failure_count DESC;

-- Example 2: Payment latency by provider and region
SELECT payment.provider, region,
  PERCENTILE(payment.latency_ms, 95) as p95, PERCENTILE(payment.latency_ms, 99) as p99
FROM logs
WHERE path = '/api/checkout' AND payment.provider IS NOT NULL AND @timestamp > ago(24h)
GROUP BY payment.provider, region ORDER BY p95 DESC;

-- Example 3: Feature flag rollout impact
SELECT feature_flags.new_checkout_flow as has_new_flow,
  COUNT(*) as request_count,
  SUM(CASE WHEN outcome = 'error' THEN 1 ELSE 0 END) / COUNT(*) as error_rate,
  AVG(duration_ms) as avg_latency_ms
FROM logs
WHERE path = '/api/checkout' AND @timestamp > ago(1h)
GROUP BY has_new_flow;

-- Example 4: Slow requests with business context
SELECT path, user.subscription, cart.total_cents, duration_ms, error.code
FROM logs WHERE duration_ms > 2000 AND @timestamp > ago(1h)
ORDER BY duration_ms DESC LIMIT 100;
```

## Deliverables

At the end of this skill, you should have:

1. **Wide Event Schema** (TypeScript interface in `src/observability/wideEvent.ts`)
2. **Tail Sampling Logic** (`shouldSample` function in `src/observability/tailSampling.ts`)
3. **Framework Middleware** (Express/Fastify/Koa/Next.js, whichever applies)
4. **Logger Configuration** (Pino/Winston/Bunyan with redaction, whichever applies)
5. **Migration Examples** (before/after code for the main request handlers)
6. **Query Examples** (SQL for CloudWatch/Datadog/Elastic)

## Success Metrics

Track these to measure improvement:

1. **Log Volume Reduction**: 80-90% reduction with tail sampling
2. **MTTR (Mean Time to Resolution)**: Faster debugging with full context
3. **Query Simplicity**: Multi-step grep → single structured query
4. **Context Completeness**: % of events with business fields populated

## References

- [Logging Sucks](https://loggingsucks.com/) - Core philosophy
- [OpenTelemetry](https://opentelemetry.io/) - Trace context integration
- [Pino](https://getpino.io/) - High-performance logger
- Wide-Event Observability skill - Full philosophy and examples
