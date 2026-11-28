import React, { useEffect } from 'react';
import { Download, MoreVertical, PlusSquare, Share, Smartphone, X } from 'lucide-react';
import { usePwaInstall } from '../context/PwaInstallContext';

export function PwaInstallOverlay() {
  const {
    isInstalled,
    isIOS,
    isAndroid,
    showLaunchBanner,
    showFallbackModal,
    dismissLaunchBanner,
    closeFallbackModal,
    triggerInstall,
  } = usePwaInstall();

  useEffect(() => {
    if (!showFallbackModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeFallbackModal();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showFallbackModal, closeFallbackModal]);

  if (isInstalled) return null;

  return (
    <>
      {showLaunchBanner && !showFallbackModal && (
        <div
          role="region"
          aria-label="Install Aurelia Arena App"
          className="fixed left-1/2 -translate-x-1/2 top-[max(0.75rem,env(safe-area-inset-top))] z-[80] w-[calc(100%-1.25rem)] max-w-md pointer-events-auto"
        >
          <div className="relative overflow-hidden rounded-2xl border border-[#d4af37]/50 bg-[#0B0B10]/95 backdrop-blur-xl shadow-[0_18px_48px_rgba(0,0,0,0.82)] px-3.5 py-3">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#f6dc93]/80 to-transparent"
            />
            <div className="flex items-center gap-3">
              <div className="relative shrink-0 w-11 h-11 rounded-xl overflow-hidden border border-[#d4af37]/50 bg-[#141020] shadow-[0_0_18px_rgba(212,175,55,0.25)]">
                <img
                  src="/pwa-192x192.png"
                  alt="Aurelia Arena"
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[13px] sm:text-sm font-bold text-[#f8e7b5] leading-tight truncate">
                  Install Aurelia Arena App
                </p>
                <p className="text-[11px] text-zinc-400 leading-snug mt-0.5 truncate">
                  One-tap full-screen 3D club experience
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => void triggerInstall()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-[#f6dc93] via-[#d4af37] to-[#a9811d] px-3 py-2 text-[11px] sm:text-xs font-extrabold text-[#0B0B10] shadow-[0_4px_16px_rgba(212,175,55,0.4)] hover:brightness-110 active:scale-[0.98] transition-all whitespace-nowrap cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                  <span>Install Now</span>
                </button>
                <button
                  type="button"
                  onClick={dismissLaunchBanner}
                  aria-label="Dismiss install banner"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showFallbackModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="aurelia-pwa-fallback-title"
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
          onClick={closeFallbackModal}
        >
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-[#d4af37]/45 bg-[#0B0B10] shadow-[0_24px_64px_rgba(0,0,0,0.9)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-[1px] bg-gradient-to-r from-transparent via-[#f6dc93]/85 to-transparent"
            />

            <div className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl overflow-hidden border border-[#d4af37]/50 bg-[#141020] shrink-0 shadow-[0_0_18px_rgba(212,175,55,0.22)]">
                    <img
                      src="/pwa-192x192.png"
                      alt="Aurelia Arena"
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <h2
                      id="aurelia-pwa-fallback-title"
                      className="font-display text-base font-bold text-[#f8e7b5] leading-tight"
                    >
                      Install Aurelia Arena App
                    </h2>
                    <p className="text-[11px] text-zinc-400 mt-0.5">
                      Add to your home screen in 2 quick taps
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeFallbackModal}
                  aria-label="Close install instructions"
                  className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5">
                <div
                  className={`rounded-xl border p-3.5 transition-colors ${
                    isAndroid || !isIOS
                      ? 'border-[#d4af37]/45 bg-[#d4af37]/[0.08]'
                      : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-[#f6dc93] mb-1.5">
                    <Smartphone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>Android Chrome</span>
                  </div>
                  <p className="text-xs text-zinc-200 leading-relaxed flex flex-wrap items-center gap-1">
                    <span>1. Tap the</span>
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-semibold">
                      <MoreVertical className="w-3 h-3" aria-hidden="true" />
                      Menu
                    </span>
                    <span>icon, then tap</span>
                    <span className="text-[#f6dc93] font-semibold">Install App</span>
                    <span>(or Add to Home screen).</span>
                  </p>
                </div>

                <div
                  className={`rounded-xl border p-3.5 transition-colors ${
                    isIOS
                      ? 'border-[#d4af37]/45 bg-[#d4af37]/[0.08]'
                      : 'border-white/10 bg-white/[0.03]'
                  }`}
                >
                  <div className="flex items-center gap-2 text-xs font-bold text-[#f6dc93] mb-1.5">
                    <Share className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    <span>iPhone Safari</span>
                  </div>
                  <p className="text-xs text-zinc-200 leading-relaxed flex flex-wrap items-center gap-1">
                    <span>2. Tap</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/10 border border-white/15 text-white font-semibold">
                      <Share className="w-3 h-3" aria-hidden="true" />
                      Share
                    </span>
                    <span>in Safari&apos;s toolbar, then tap</span>
                    <span className="inline-flex items-center gap-1 text-[#f6dc93] font-semibold">
                      <PlusSquare className="w-3 h-3" aria-hidden="true" />
                      Add to Home Screen
                    </span>
                    <span>.</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeFallbackModal}
                className="w-full min-h-[44px] rounded-xl bg-gradient-to-b from-[#f6dc93] via-[#d4af37] to-[#a9811d] py-2.5 px-4 text-xs sm:text-sm font-extrabold text-[#0B0B10] shadow-[0_4px_16px_rgba(212,175,55,0.35)] hover:brightness-110 transition-all cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
