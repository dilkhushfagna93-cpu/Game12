import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

const STALE_RELOAD_KEY = 'aurelia_stale_module_reloaded_at';

function isStaleModuleError(error: Error | null | undefined): boolean {
  const msg = String(error?.message || '');
  return (
    msg.includes('Failed to fetch dynamically imported module') ||
    msg.includes('Importing a module script failed') ||
    msg.includes('Cannot read properties of null (reading \'useState\')') ||
    msg.includes('Cannot read properties of null (reading \'useContext\')') ||
    msg.includes('Cannot read properties of null (reading \'useEffect\')') ||
    msg.includes('Invalid hook call')
  );
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  public state: State = { hasError: false, message: '' };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error?.message || 'Unexpected rendering error' };
  }

  public componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);

    // Self-heal once if an older open browser tab encounters a stale Vite module/chunk version
    if (typeof window !== 'undefined' && isStaleModuleError(error)) {
      try {
        const lastReload = Number(sessionStorage.getItem(STALE_RELOAD_KEY) || '0');
        if (Date.now() - lastReload > 10000) {
          sessionStorage.setItem(STALE_RELOAD_KEY, String(Date.now()));
          window.location.reload();
        }
      } catch {
        // ignore storage restrictions
      }
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#07060b] text-[#f4f1ea] flex items-center justify-center p-6">
          <div className="max-w-md w-full surface-panel rounded-2xl p-8 text-center space-y-5">
            <h1 className="font-display text-2xl gold-gradient-text">Rendering Interrupted</h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              A component encountered an unexpected issue. Your virtual coin balance and account remain safe.
            </p>
            <div className="text-xs font-mono-num text-zinc-500 bg-black/40 rounded-lg p-3 break-all">
              {this.state.message.slice(0, 220)}
            </div>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.href = '/';
              }}
              className="gold-button px-6 py-2.5 rounded-lg text-sm font-semibold whitespace-nowrap"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
