import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

export interface BeforeInstallPromptEvent extends Event {
  readonly platforms?: string[];
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
  prompt: () => Promise<void>;
}

declare global {
  interface Window {
    __aureliaDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
    __aureliaAppInstalled?: boolean;
  }
}

const SESSION_DISMISS_KEY = 'aurelia_pwa_launch_banner_dismissed';

function detectStandaloneMode(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.__aureliaAppInstalled === true ||
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isAppleTouchDevice =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return isAppleTouchDevice && !(window as Window & { MSStream?: unknown }).MSStream;
}

function detectAndroid(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /Android/i.test(navigator.userAgent || '');
}

function isBannerDismissedInSession(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.sessionStorage.getItem(SESSION_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export interface PwaInstallContextValue {
  deferredPrompt: BeforeInstallPromptEvent | null;
  canInstall: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  showLaunchBanner: boolean;
  showFallbackModal: boolean;
  dismissLaunchBanner: () => void;
  openFallbackModal: () => void;
  closeFallbackModal: () => void;
  triggerInstall: () => Promise<boolean>;
  promptInstall: () => Promise<boolean>;
}

const PwaInstallContext = createContext<PwaInstallContextValue | null>(null);

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(() =>
    typeof window !== 'undefined' ? window.__aureliaDeferredInstallPrompt ?? null : null,
  );
  const [isInstalled, setIsInstalled] = useState<boolean>(() => detectStandaloneMode());
  const [isIOS] = useState<boolean>(() => detectIOS());
  const [isAndroid] = useState<boolean>(() => detectAndroid());
  const [showLaunchBanner, setShowLaunchBanner] = useState<boolean>(
    () => !detectStandaloneMode() && !isBannerDismissedInSession(),
  );
  const [showFallbackModal, setShowFallbackModal] = useState<boolean>(false);

  const promptRef = useRef<BeforeInstallPromptEvent | null>(deferredPrompt);
  promptRef.current = deferredPrompt;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const syncStandalone = () => {
      const standalone = detectStandaloneMode();
      setIsInstalled(standalone);
      if (standalone) {
        setShowLaunchBanner(false);
        setShowFallbackModal(false);
        setDeferredPrompt(null);
        window.__aureliaDeferredInstallPrompt = null;
      }
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      window.__aureliaDeferredInstallPrompt = promptEvent;
      promptRef.current = promptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handlePromptReadyCustom = () => {
      if (window.__aureliaDeferredInstallPrompt) {
        promptRef.current = window.__aureliaDeferredInstallPrompt;
        setDeferredPrompt(window.__aureliaDeferredInstallPrompt);
      }
    };

    const handleAppInstalled = () => {
      window.__aureliaAppInstalled = true;
      window.__aureliaDeferredInstallPrompt = null;
      promptRef.current = null;
      setDeferredPrompt(null);
      setIsInstalled(true);
      setShowLaunchBanner(false);
      setShowFallbackModal(false);
    };

    syncStandalone();
    handlePromptReadyCustom();

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('aurelia:pwa-prompt-ready', handlePromptReadyCustom);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('aurelia:pwa-installed', handleAppInstalled);

    const standaloneQuery = window.matchMedia('(display-mode: standalone)');
    if (typeof standaloneQuery.addEventListener === 'function') {
      standaloneQuery.addEventListener('change', syncStandalone);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('aurelia:pwa-prompt-ready', handlePromptReadyCustom);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('aurelia:pwa-installed', handleAppInstalled);
      if (typeof standaloneQuery.removeEventListener === 'function') {
        standaloneQuery.removeEventListener('change', syncStandalone);
      }
    };
  }, []);

  const dismissLaunchBanner = useCallback(() => {
    setShowLaunchBanner(false);
    try {
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, '1');
    } catch {
      // Ignore storage failures in private browsing modes
    }
  }, []);

  const openFallbackModal = useCallback(() => {
    setShowFallbackModal(true);
  }, []);

  const closeFallbackModal = useCallback(() => {
    setShowFallbackModal(false);
  }, []);

  const triggerInstall = useCallback(async (): Promise<boolean> => {
    if (detectStandaloneMode()) {
      setIsInstalled(true);
      setShowLaunchBanner(false);
      setShowFallbackModal(false);
      return true;
    }

    const activePrompt =
      promptRef.current ?? (typeof window !== 'undefined' ? window.__aureliaDeferredInstallPrompt ?? null : null);

    if (activePrompt) {
      try {
        await activePrompt.prompt();
        const choice = await activePrompt.userChoice;
        promptRef.current = null;
        setDeferredPrompt(null);
        if (typeof window !== 'undefined') {
          window.__aureliaDeferredInstallPrompt = null;
        }
        if (choice.outcome === 'accepted') {
          setIsInstalled(true);
          setShowLaunchBanner(false);
          setShowFallbackModal(false);
          return true;
        }
        return false;
      } catch {
        // Prompt was already consumed or blocked by browser — show guided fallback steps
      }
    }

    setShowFallbackModal(true);
    return false;
  }, []);

  const value = useMemo<PwaInstallContextValue>(
    () => ({
      deferredPrompt,
      canInstall: Boolean(deferredPrompt),
      isInstalled,
      isStandalone: isInstalled,
      isIOS,
      isAndroid,
      showLaunchBanner,
      showFallbackModal,
      dismissLaunchBanner,
      openFallbackModal,
      closeFallbackModal,
      triggerInstall,
      promptInstall: triggerInstall,
    }),
    [
      deferredPrompt,
      isInstalled,
      isIOS,
      isAndroid,
      showLaunchBanner,
      showFallbackModal,
      dismissLaunchBanner,
      openFallbackModal,
      closeFallbackModal,
      triggerInstall,
    ],
  );

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>;
}

export function usePwaInstall(): PwaInstallContextValue {
  const ctx = useContext(PwaInstallContext);
  if (!ctx) {
    throw new Error('usePwaInstall must be used within a PwaInstallProvider');
  }
  return ctx;
}
