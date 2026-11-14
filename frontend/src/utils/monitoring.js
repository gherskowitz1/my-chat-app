// Error alerts for the app itself (in browsers, the installed phone app,
// and the desktop app, which loads this same site) via Sentry. Optional:
// only active when the frontend is built with VITE_SENTRY_DSN set, and the
// SDK is only downloaded in that case — otherwise this costs nothing.
// The server side is src/utils/monitoring.js.
export function startMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  import('@sentry/browser')
    .then((Sentry) => {
      Sentry.init({
        dsn,
        environment: import.meta.env.VITE_SENTRY_ENVIRONMENT || 'production',
        // Errors only; no session replay or performance tracing.
        tracesSampleRate: 0,
        // No IPs or user details attached.
        sendDefaultPii: false,
        // Ignore noise that isn't the app's fault (browser extensions,
        // aborted network requests, flaky connections).
        ignoreErrors: ['ResizeObserver loop', 'Failed to fetch', 'NetworkError', 'Load failed', 'AbortError'],
        denyUrls: [/^chrome-extension:\/\//, /^moz-extension:\/\//],
      });
    })
    .catch(() => {});
}
