# Wide-event observability — React reference adapter

Load this file from `wide-event-observability.md` only when the unit's stack is React (the client tier, opt-in). On any other stack, port the pattern from the language-agnostic core in `wide-event-observability.md`; do not load this file.

## Reference Adapter: React/Frontend (the client tier — opt-in)

The client/edge tier is an **opt-in extension** (Block H of `.ai/observability.md`), not a default. When in scope,
the same core applies — emit fewer, richer events with business context — realized in the browser below.

### Goal on the Client

Use the same philosophy: **emit fewer, better events** with business context.

```typescript
// observability/clientLogger.ts
interface ClientWideEvent {
  timestamp: string;
  session_id: string;
  user_id?: string;
  route: string;
  build_version: string;

  // Correlate with backend
  request_id?: string;

  // Device/Network context
  device: {
    type: 'mobile' | 'tablet' | 'desktop';
    os: string;
    browser: string;
  };

  network: {
    effectiveType: string; // 4g, 3g, etc.
    downlink?: number;
  };

  // Feature flags
  feature_flags?: Record<string, boolean>;

  // Error details
  error?: {
    type: string;
    message: string;
    stack?: string;
    componentStack?: string;
  };

  // Business context
  action?: string; // "checkout_submit", "payment_attempt"
  outcome?: 'success' | 'error';
  duration_ms?: number;
}

class ClientLogger {
  private sessionId: string;

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.setupErrorHandlers();
  }

  private getOrCreateSessionId(): string {
    let sessionId = sessionStorage.getItem('session_id');
    if (!sessionId) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem('session_id', sessionId);
    }
    return sessionId;
  }

  private setupErrorHandlers() {
    // Unhandled errors
    window.addEventListener('error', (event) => {
      this.logError({
        type: 'UnhandledError',
        message: event.message,
        stack: event.error?.stack,
      });
    });

    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.logError({
        type: 'UnhandledRejection',
        message: String(event.reason),
      });
    });
  }

  logEvent(event: Partial<ClientWideEvent>) {
    const fullEvent: ClientWideEvent = {
      timestamp: new Date().toISOString(),
      session_id: this.sessionId,
      user_id: this.getUserId(),
      route: window.location.pathname,
      build_version: process.env.REACT_APP_VERSION || 'unknown',
      device: this.getDeviceContext(),
      network: this.getNetworkContext(),
      feature_flags: this.getFeatureFlags(),
      ...event,
    };

    // Send to backend or observability service
    this.send(fullEvent);
  }

  logError(error: { type: string; message: string; stack?: string }) {
    this.logEvent({
      error,
      outcome: 'error',
    });
  }

  private getUserId(): string | undefined {
    // Get from auth context
    return window.__USER_ID__;
  }

  private getDeviceContext() {
    const ua = navigator.userAgent;
    return {
      type: this.detectDeviceType(ua),
      os: this.detectOS(ua),
      browser: this.detectBrowser(ua),
    };
  }

  private getNetworkContext() {
    const connection = (navigator as any).connection;
    return {
      effectiveType: connection?.effectiveType || 'unknown',
      downlink: connection?.downlink,
    };
  }

  private getFeatureFlags(): Record<string, boolean> {
    return window.__FEATURE_FLAGS__ || {};
  }

  private send(event: ClientWideEvent) {
    // Send to backend or observability service
    if (navigator.sendBeacon) {
      navigator.sendBeacon('/api/events', JSON.stringify(event));
    } else {
      fetch('/api/events', {
        method: 'POST',
        body: JSON.stringify(event),
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => {
        // Ignore errors in logging
      });
    }
  }
}

export const clientLogger = new ClientLogger();
```

### React Error Boundary

```typescript
import React from 'react';
import { clientLogger } from './observability/clientLogger';

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    clientLogger.logError({
      type: 'ReactError',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  render() {
    if (this.state.hasError) {
      return <div>Something went wrong. Please refresh the page.</div>;
    }
    return this.props.children;
  }
}
```

### Log Business Actions

```typescript
function CheckoutButton({ cart }: { cart: Cart }) {
  const handleCheckout = async () => {
    const start = Date.now();

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        body: JSON.stringify(cart),
      });

      const requestId = response.headers.get('x-request-id');

      if (!response.ok) {
        throw new Error('Checkout failed');
      }

      clientLogger.logEvent({
        action: 'checkout_submit',
        outcome: 'success',
        duration_ms: Date.now() - start,
        request_id: requestId,
        cart: {
          total_cents: cart.totalCents,
          item_count: cart.items.length,
        },
      });
    } catch (error: any) {
      clientLogger.logEvent({
        action: 'checkout_submit',
        outcome: 'error',
        duration_ms: Date.now() - start,
        error: {
          type: error.name,
          message: error.message,
        },
      });
    }
  };

  return <button onClick={handleCheckout}>Checkout</button>;
}
```
