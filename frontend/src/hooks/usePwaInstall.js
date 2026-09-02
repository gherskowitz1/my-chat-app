import { useCallback, useEffect, useState } from 'react';

// Chrome/Edge fire beforeinstallprompt once the PWA installability criteria
// (manifest + service worker + HTTPS) are met; we capture it instead of
// letting the browser show its own mini-infobar, so we control the button.
// Safari/Firefox never fire this — canInstall just stays false there, and
// users on those browsers fall back to the browser's own "Add to Home
// Screen" menu item, same as any other PWA.
export function usePwaInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onAppInstalled = () => {
      setDeferredPrompt(null);
      setInstalled(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    setDeferredPrompt(null);
  }, [deferredPrompt]);

  return { canInstall: !!deferredPrompt && !installed, promptInstall };
}
