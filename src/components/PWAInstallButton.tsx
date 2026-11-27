import React, { useEffect, useState } from 'react';
import { Download, Share, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { canInstall, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;
  if (!canInstall && !isIOS) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          if (canInstall) {
            void promptInstall();
          } else if (isIOS) {
            setShowIOSGuide(true);
          }
        }}
        className={`inline-flex items-center gap-1.5 rounded-lg bg-[#d4af37]/15 border border-[#d4af37]/35 text-[#f0d377] hover:bg-[#d4af37]/25 transition-colors font-semibold ${
          compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs'
        }`}
      >
        {canInstall ? <Download className="w-3.5 h-3.5" /> : <Share className="w-3.5 h-3.5" />}
        <span>{compact ? 'Install App' : 'Install Aurelia PWA'}</span>
      </button>

      {showIOSGuide && (
        <div
          className="fixed inset-0 z-[85] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={() => setShowIOSGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[#d4af37]/30 bg-[#0b0813] p-5 shadow-2xl space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold text-white">Install on iOS</h3>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="p-1 text-zinc-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ol className="text-xs text-zinc-300 space-y-2 list-decimal list-inside">
              <li>
                Tap the <span className="text-[#f0d377] font-semibold">Share</span> icon in Safari&apos;s toolbar.
              </li>
              <li>
                Scroll down and select <span className="text-white font-semibold">Add to Home Screen</span>.
              </li>
              <li>
                Tap <span className="text-emerald-300 font-semibold">Add</span> to launch Aurelia Arena fullscreen.
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
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
