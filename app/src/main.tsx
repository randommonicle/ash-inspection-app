import React from 'react'
import ReactDOM from 'react-dom/client'
import * as Sentry from '@sentry/react'
import App from './App.tsx'
import './index.css'

// Sentry is initialised before React so it catches errors during startup.
// Add VITE_SENTRY_DSN to app/.env.local (or Railway Variables) to enable.
// Without a DSN it is a no-op — safe to leave unset during development.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn:              import.meta.env.VITE_SENTRY_DSN as string,
    environment:      import.meta.env.MODE,
    tracesSampleRate: 0.2,
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
