import { registerSW } from 'virtual:pwa-register';

// Register service worker with auto-update
const updateSW = registerSW({
  onNeedRefresh() {
    // Show a prompt to user to refresh the app
    if (confirm('New content available. Reload to update?')) {
      updateSW(true);
    }
  },
  onOfflineReady() {
    console.log('App ready to work offline');
  },
  onRegistered(registration: ServiceWorkerRegistration | undefined) {
    console.log('Service Worker registered:', registration);
  },
  onRegisterError(error: unknown) {
    console.error('Service Worker registration error:', error);
  },
});

export { updateSW };
