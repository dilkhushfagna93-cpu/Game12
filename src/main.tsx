import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  if (import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Service worker registration skipped in restricted preview frames
      });
    });
  } else {
    // In dev mode, unregister any previously installed service worker and clear stale caches
    // so Vite ES modules and dynamic imports always fetch fresh from the dev server
    navigator.serviceWorker
      .getRegistrations()
      .then((regs) => Promise.all(regs.map((r) => r.unregister())))
      .catch(() => {});
    if ('caches' in window) {
      caches
        .keys()
        .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
        .catch(() => {});
    }
  }
}

createRoot(document.getElementById('root')!).render(<App />);
