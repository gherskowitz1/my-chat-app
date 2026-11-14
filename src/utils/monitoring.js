// Error alerts via Sentry (https://sentry.io) — optional, like LiveKit and
// push: does nothing at all unless SENTRY_DSN is set on the backend service.
//
// Required first thing in index.js, before Express loads, so Sentry can
// hook into it. Besides crashes and unhandled promise rejections, every
// console.error is forwarded too — most of this codebase's failures are
// caught, logged, and answered with a 500 (or skipped, in background jobs),
// so they'd never reach a crash handler otherwise.
const Sentry = require('@sentry/node');

const enabled = !!process.env.SENTRY_DSN;

if (enabled) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME || 'production',
    release: process.env.RAILWAY_GIT_COMMIT_SHA,
    // Errors only — no performance tracing.
    tracesSampleRate: 0,
    // Don't attach request bodies, cookies, IPs, or user details: request
    // bodies here can be passwords, sign-in codes, or private messages.
    sendDefaultPii: false,
    integrations: [Sentry.captureConsoleIntegration({ levels: ['error'] })],
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) delete event.request.headers.authorization;
      }
      return event;
    },
  });
}

module.exports = {
  enabled,
  // After the routes: reports errors that reach Express's error handling.
  setupExpress(app) {
    if (enabled) Sentry.setupExpressErrorHandler(app);
  },
};
