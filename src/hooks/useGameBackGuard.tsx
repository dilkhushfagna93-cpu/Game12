import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * Intercepts browser/Android hardware back button and tab close when a player
 * has an active wager or live match in progress, presenting a clean in-app exit modal.
 */
export function useGameBackGuard(active: boolean, exitTarget = '/') {
  const navigate = useNavigate();
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const pushedGuardRef = useRef(false);
  const allowLeavingRef = useRef(false);

  useEffect(() => {
    if (!active) {
      pushedGuardRef.current = false;
      setShowExitConfirm(false);
      return;
    }

    if (!pushedGuardRef.current) {
      try {
        window.history.pushState({ aureliaGameGuard: true }, '', window.location.href);
        pushedGuardRef.current = true;
      } catch {
        // ignore history API errors in sandboxed iframes
      }
    }

    const handlePopState = () => {
      if (allowLeavingRef.current) return;
      // Re-push current entry to stay in game until user confirms
      try {
        window.history.pushState({ aureliaGameGuard: true }, '', window.location.href);
      } catch {
        // ignore
      }
      setShowExitConfirm(true);
    };

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (allowLeavingRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [active]);

  const cancelExit = useCallback(() => {
    setShowExitConfirm(false);
  }, []);

  const confirmExit = useCallback(() => {
    allowLeavingRef.current = true;
    setShowExitConfirm(false);
    navigate(exitTarget, { replace: true });
  }, [exitTarget, navigate]);

  const requestExit = useCallback(() => {
    if (active) {
      setShowExitConfirm(true);
    } else {
      navigate(exitTarget);
    }
  }, [active, exitTarget, navigate]);

  return { showExitConfirm, cancelExit, confirmExit, requestExit };
}

export function GameExitModal({
  open,
  title = 'Leave Active Round?',
  description = 'You currently have an active bet or live match in progress. Leaving now may forfeit your active turn or round.',
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title?: string;
  description?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-amber-400/30 bg-[#0b0813] p-5 shadow-2xl space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-400/30 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-300" />
          </div>
          <div>
            <h3 className="font-display text-base font-bold text-white">{title}</h3>
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="gold-button py-2.5 rounded-xl text-xs font-bold"
          >
            Stay in Game
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="py-2.5 rounded-xl text-xs font-semibold bg-rose-500/15 border border-rose-500/35 text-rose-200 hover:bg-rose-500/25"
          >
            Exit to Lobby
          </button>
        </div>
      </div>
    </div>
  );
}
