// utils/errorLogger.ts

import * as Sentry from '@sentry/node';

// Initialize Sentry
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring.
  // We recommend adjusting this value in production
  tracesSampleRate: 1.0,
});

export const errorLogger = {
  log: (error: Error, context?: Record<string, any>) => {
    console.error('Error:', error);
    if (process.env.NODE_ENV === 'production') {
      Sentry.withScope((scope) => {
        if (context) {
          Object.keys(context).forEach((key) => {
            scope.setExtra(key, context[key]);
          });
        }
        Sentry.captureException(error);
      });
    }
  },
};
