import React, { useEffect, useState } from 'react';
import { Download, Smartphone, WifiOff } from 'lucide-react';
import { usePwaInstall } from '../context/PwaInstallContext';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { canInstall, isInstalled, triggerInstall } = usePwaInstall();

  if (isInstalled) return null;

  return (
    <button
      type="button"
      onClick={() => void triggerInstall()}
      className={`inline-flex items-center gap-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/35 text-[#f0d377] hover:bg-[#d4af37]/25 transition-colors font-semibold ${
        compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs'
      }`}
    >
      {canInstall ? <Download className="w-3.5 h-3.5" /> : <Smartphone className="w-3.5 h-3.5" />}
      <span>{compact ? 'Install App' : 'Install Aurelia App'}</span>
    </button>
  );
}

export function OfflineIndicator() {
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);

  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="w-full bg-amber-500/20 border-b border-amber-400/35 px-4 py-2 text-center text-xs text-amber-200 flex items-center justify-center gap-2">
      <WifiOff className="w-3.5 h-3.5 shrink-0" />
      <span>You are offline. Cached pages stay available; reconnect for live server games and wallet sync.</span>
    </div>
  );
}
