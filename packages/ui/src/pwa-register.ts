import { registerSW } from 'virtual:pwa-register';

const UPDATE_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

/**
 * When the server detects a reverse-proxy prefix (`x-ingress-path`,
 * `x-forwarded-prefix`, etc.) it injects `window.baseUrl` into the HTML.
 * In that scenario the SW causes more harm than good:
 *  - the proxy subpath can change, orphaning old SW registrations
 *  - precache URLs resolve against the wrong scope after a path change
 *  - `confirm()`/`alert()` may be blocked if the proxy serves inside an iframe
 *  - offline caching is pointless (the proxy must be reachable anyway)
 */
function isBehindSubpathProxy(): boolean {
  const base = window.baseUrl;
  return typeof base === 'string' && base !== '/' && base !== './';
}

let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined;

if (isBehindSubpathProxy()) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    for (const r of registrations) {
      r.unregister().then((ok) => {
        if (ok) console.log('Unregistered stale service worker:', r.scope);
      });
    }
    if (registrations.length > 0) {
      window.location.reload();
    }
  });
} else {
  updateSW = registerSW({
    onNeedRefresh() {
      updateSW?.(true);
    },
    onOfflineReady() {
      console.log('App ready to work offline');
    },
    onRegistered(registration: ServiceWorkerRegistration | undefined) {
      console.log('Service Worker registered:', registration);
      if (registration) {
        setInterval(() => registration.update(), UPDATE_INTERVAL_MS);
      }
    },
    onRegisterError(error: unknown) {
      console.error('Service Worker registration error:', error);
    },
  });
}

export { updateSW };
