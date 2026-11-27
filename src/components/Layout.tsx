import React, { useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import {
  Coins,
  Gamepad2,
  Gift,
  Headphones,
  Home,
  Menu,
  Send,
  Shield,
  Trophy,
  User,
  Wallet,
  X,
} from 'lucide-react';
import { VIRTUAL_COIN_DISCLAIMER } from '../config/assets';
import { useApp } from '../context/AppContext';
import { resolveActiveTelegramUrl } from '../services/adminService';
import { soundEngine } from '../services/soundEngine';
import { BrandLogo } from './BrandLogo';
import { OfflineIndicator, PWAInstallButton } from './PWAInstallButton';

const PRIMARY_NAV = [
  { to: '/', label: 'Home' },
  { to: '/games', label: 'Games' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/rewards', label: 'Rewards' },
  { to: '/profile', label: 'Profile' },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { firebaseUser, profile, balance, isAdmin, gameConfigs, toasts, dismissToast } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const telegramUrl = resolveActiveTelegramUrl(gameConfigs.platform.telegramSupportUrl);

  const isGameRoute =
    location.pathname.startsWith('/games/dragon-tiger') ||
    location.pathname.startsWith('/games/ludo') ||
    location.pathname.startsWith('/games/aviator') ||
    location.pathname.startsWith('/games/teen-patti');

  return (
    <div className="min-h-[100dvh] flex flex-col bg-[#07060b] text-[#f4f1ea] max-w-full overflow-x-clip">
      {/* Offline Banner */}
      <OfflineIndicator />

      {/* Desktop & Mobile Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-[#d4af37]/15 bg-[#07060b]/95 shrink-0">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-12 sm:h-14 lg:h-16 flex items-center justify-between gap-2 sm:gap-6">
          {/* Zone 1: Brand Wordmark */}
          <Link
            to="/"
            onClick={() => soundEngine.playClick()}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] rounded-lg min-w-0"
          >
            <BrandLogo />
          </Link>

          {/* Zone 2: Clean Single-Line Nav Links */}
          <nav
            aria-label="Primary"
            className="hidden lg:flex items-center gap-7 text-sm font-medium text-zinc-400"
          >
            {PRIMARY_NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                onClick={() => soundEngine.playClick()}
                className={({ isActive }) =>
                  `py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
                    isActive
                      ? 'text-[#f6dc93] border-[#d4af37]'
                      : 'border-transparent hover:text-zinc-100'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          {/* Zone 3: Wallet, Support Shortcut & Account Action */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            <div className="hidden sm:block">
              <PWAInstallButton compact />
            </div>

            <Link
              to="/wallet"
              onClick={() => soundEngine.playClick()}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full border border-[#d4af37]/40 bg-gradient-to-r from-[#171128] to-[#1e1633] hover:border-[#f6dc93]/70 transition-colors whitespace-nowrap shrink-0 shadow-[0_0_12px_rgba(212,175,55,0.14)]"
              title="Wallet & Instant UPI"
            >
              <Coins className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#f6dc93] shrink-0" aria-hidden="true" />
              <span className="font-mono-num text-xs sm:text-sm font-bold text-[#fff1c2]">
                ₹{balance.toLocaleString()}
              </span>
              <span
                aria-hidden="true"
                className="w-4 h-4 rounded-full bg-gradient-to-b from-[#f6dc93] to-[#b58822] text-[#140d02] text-[11px] font-black leading-none inline-flex items-center justify-center shrink-0"
              >
                +
              </span>
            </Link>

            <Link
              to="/support"
              onClick={() => soundEngine.playClick()}
              aria-label="Help & Support"
              title="24/7 Support & Notifications"
              className="inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-white/12 bg-white/5 hover:bg-white/12 hover:border-[#d4af37]/40 text-zinc-200 hover:text-[#f6dc93] transition-colors shrink-0"
            >
              <Headphones className="w-4 h-4" aria-hidden="true" />
            </Link>

            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => soundEngine.playClick()}
                title="Open Admin Control Center"
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1 sm:py-1.5 rounded-lg border border-[#f6dc93]/65 bg-gradient-to-r from-[#d4af37]/30 via-[#f6dc93]/20 to-[#b58822]/25 hover:from-[#d4af37]/45 hover:to-[#f6dc93]/30 text-[#fff3c9] text-[11px] sm:text-xs font-bold whitespace-nowrap shrink-0 shadow-[0_0_14px_rgba(212,175,55,0.24)] transition-all"
              >
                <Shield className="w-3.5 h-3.5 text-[#f6dc93] shrink-0" aria-hidden="true" />
                <span className="sm:hidden">Admin</span>
                <span className="hidden sm:inline">Admin Panel</span>
              </Link>
            )}

            {firebaseUser ? (
              <Link
                to="/profile"
                onClick={() => soundEngine.playClick()}
                className="hidden md:inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-100 transition-colors whitespace-nowrap shrink-0 max-w-[150px]"
              >
                <User className="w-3.5 h-3.5 text-[#d4af37] shrink-0" aria-hidden="true" />
                <span className="truncate">{profile?.username || firebaseUser.displayName || 'Account'}</span>
              </Link>
            ) : (
              <div className="hidden md:flex items-center gap-2 shrink-0">
                <Link
                  to="/login"
                  onClick={() => soundEngine.playClick()}
                  className="px-3.5 py-2 rounded-lg text-xs font-medium text-zinc-300 hover:text-white transition-colors whitespace-nowrap shrink-0"
                >
                  Log In
                </Link>
                <Link
                  to="/register"
                  onClick={() => soundEngine.playClick()}
                  className="gold-button px-4 py-2 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0"
                >
                  Register
                </Link>
              </div>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-label="Toggle navigation menu"
              className="lg:hidden inline-flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg border border-white/12 bg-white/5 text-zinc-300 hover:text-white shrink-0"
            >
              {mobileMenuOpen ? <X className="w-4 h-4 sm:w-5 sm:h-5" /> : <Menu className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Drawer */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-white/10 bg-[#0b0814] px-4 py-4 space-y-3">
            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => {
                  soundEngine.playClick();
                  setMobileMenuOpen(false);
                }}
                className="gold-button w-full py-2.5 px-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-[0_0_18px_rgba(212,175,55,0.28)]"
              >
                <Shield className="w-4 h-4" aria-hidden="true" />
                <span>Admin Panel</span>
              </Link>
            )}
            <div className="grid grid-cols-2 gap-2">
              {[
                { to: '/', label: 'Home' },
                { to: '/games', label: 'All Games' },
                { to: '/games/teen-patti', label: 'Teen Patti 3D' },
                { to: '/games/dragon-tiger', label: 'Dragon Tiger 3D' },
                { to: '/games/ludo', label: 'Ludo 3D' },
                { to: '/games/aviator', label: 'Aviator 3D' },
                { to: '/leaderboard', label: 'Leaderboard' },
                { to: '/rewards', label: 'Daily Rewards' },
                { to: '/wallet', label: 'Wallet' },
                { to: '/transactions', label: 'Transactions' },
                { to: '/history', label: 'Game History' },
                { to: '/support', label: 'Help & Support' },
                { to: '/download-apk', label: 'Download APK' },
                { to: '/rules', label: 'Game Rules' },
                { to: '/fair-play', label: 'Fair Play / RNG' },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => {
                    soundEngine.playClick();
                    setMobileMenuOpen(false);
                  }}
                  className="px-3 py-2.5 rounded-lg bg-white/5 text-sm text-zinc-200 hover:bg-white/10"
                >
                  {link.label}
                </Link>
              ))}
              <a
                href={telegramUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => {
                  soundEngine.playClick();
                  setMobileMenuOpen(false);
                }}
                className="col-span-2 px-3 py-2.5 rounded-lg bg-sky-600/20 border border-sky-500/35 text-sm font-medium text-sky-200 hover:bg-sky-600/30 inline-flex items-center justify-center gap-2 transition-colors"
              >
                <Send className="w-4 h-4 text-sky-400" aria-hidden="true" />
                <span>Join Telegram Channel</span>
              </a>
            </div>
            <div className="pt-2 border-t border-white/10 flex items-center gap-2">
              {firebaseUser ? (
                <Link
                  to="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex-1 text-center py-2.5 rounded-lg gold-button text-sm font-semibold"
                >
                  Profile ({profile?.username || 'Player'})
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 text-center py-2.5 rounded-lg border border-white/15 text-sm font-medium text-zinc-200"
                  >
                    Log In
                  </Link>
                  <Link
                    to="/register"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex-1 text-center py-2.5 rounded-lg gold-button text-sm font-semibold"
                  >
                    Register
                  </Link>
                </>
              )}
            </div>
            <div className="pt-1 flex justify-center">
              <PWAInstallButton />
            </div>
          </div>
        )}
      </header>

      {/* Main Content */}
      <main
        className={`flex-1 min-w-0 ${
          isGameRoute ? 'overflow-hidden' : 'pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] lg:pb-0'
        }`}
      >
        {children}
      </main>

      {/* Footer (hidden on active full-viewport 3D game stages to maximize canvas area) */}
      {!isGameRoute && (
        <footer className="border-t border-[#d4af37]/15 bg-[#06050a] mt-16">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-10">
              <div className="space-y-4">
                <BrandLogo />
                <p className="text-sm text-zinc-400 leading-relaxed">
                  Physically rendered 3D browser gaming built with WebGL, fair server-side randomness, and real-time multiplayer architecture.
                </p>
                <p className="text-xs text-[#d4af37]/85 leading-relaxed">
                  {VIRTUAL_COIN_DISCLAIMER}
                </p>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-100 mb-3">3D Games</h3>
                <ul className="space-y-2 text-sm text-zinc-400">
                  <li><Link to="/games/teen-patti" className="hover:text-[#f6dc93] transition-colors">Teen Patti 3D</Link></li>
                  <li><Link to="/games/dragon-tiger" className="hover:text-[#f6dc93] transition-colors">Dragon Tiger 3D</Link></li>
                  <li><Link to="/games/ludo" className="hover:text-[#f6dc93] transition-colors">Ludo 3D</Link></li>
                  <li><Link to="/games/aviator" className="hover:text-[#f6dc93] transition-colors">Aviator Ascent 3D</Link></li>
                  <li><Link to="/games" className="hover:text-[#f6dc93] transition-colors">All Games</Link></li>
                  <li><Link to="/rules" className="hover:text-[#f6dc93] transition-colors">Official Game Rules</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-100 mb-3">Player Hub</h3>
                <ul className="space-y-2 text-sm text-zinc-400">
                  <li><Link to="/leaderboard" className="hover:text-[#f6dc93] transition-colors">Leaderboard</Link></li>
                  <li><Link to="/rewards" className="hover:text-[#f6dc93] transition-colors">Daily Rewards & Missions</Link></li>
                  <li><Link to="/wallet" className="hover:text-[#f6dc93] transition-colors">Virtual Coin Wallet</Link></li>
                  <li><Link to="/transactions" className="hover:text-[#f6dc93] transition-colors">Transaction History</Link></li>
                  <li><Link to="/history" className="hover:text-[#f6dc93] transition-colors">Game History</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-zinc-100 mb-3">Support &amp; Legal</h3>
                <ul className="space-y-2 text-sm text-zinc-400">
                  <li><Link to="/support" className="hover:text-[#f6dc93] transition-colors">Help &amp; Support Tickets</Link></li>
                  <li>
                    <a
                      href={telegramUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sky-300 hover:text-sky-200 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Telegram Channel</span>
                    </a>
                  </li>
                  <li><Link to="/terms" className="hover:text-[#f6dc93] transition-colors">Terms &amp; Conditions</Link></li>
                  <li><Link to="/privacy" className="hover:text-[#f6dc93] transition-colors">Privacy Policy</Link></li>
                  <li><Link to="/fair-play" className="hover:text-[#f6dc93] transition-colors">Fair Play / RNG Policy</Link></li>
                  <li><Link to="/responsible-gaming" className="hover:text-[#f6dc93] transition-colors">Responsible Gaming (18+ Only)</Link></li>
                  <li><Link to="/download-apk" className="hover:text-[#f6dc93] transition-colors">Download Android APK</Link></li>
                  {isAdmin && (
                    <li>
                      <Link to="/admin" className="text-[#f6dc93] font-semibold hover:text-[#fff1c2] transition-colors">
                        Admin Panel
                      </Link>
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="mt-10 pt-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-zinc-500">
              <span>© {new Date().getFullYear()} Aurelia Arena. All rights reserved.</span>
              <span>18+ Only · Provably Fair SHA-256 RNG · Play Responsibly</span>
            </div>
          </div>
        </footer>
      )}

      {/* Mobile Premium Bottom Navigation Bar (respects safe-area-inset-bottom) */}
      <nav
        aria-label="Mobile Navigation"
        className="lg:hidden fixed bottom-0 inset-x-0 z-40 pb-safe border-t border-[#d4af37]/25 bg-[#08060e]/96 backdrop-blur-md px-1"
      >
        <div className="h-[52px] grid grid-cols-5">
          {[
            { to: '/', label: 'Home', Icon: Home },
            { to: '/games', label: 'Games', Icon: Gamepad2 },
            { to: '/leaderboard', label: 'Ranks', Icon: Trophy },
            { to: '/rewards', label: 'Rewards', Icon: Gift },
            { to: '/wallet', label: 'Wallet', Icon: Wallet },
          ].map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => soundEngine.playClick()}
              className={({ isActive }) =>
                `relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors min-h-[44px] ${
                  isActive ? 'text-[#f6dc93]' : 'text-zinc-400 hover:text-zinc-200'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 inset-x-3 h-[2px] rounded-full bg-gradient-to-r from-transparent via-[#f6dc93] to-transparent"
                    />
                  )}
                  <Icon className="w-[18px] h-[18px]" aria-hidden="true" />
                  <span className="leading-none">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Toast Notification Stack */}
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="fixed top-14 sm:top-16 lg:top-20 right-3 sm:right-4 z-50 flex flex-col gap-2 max-w-sm w-[calc(100vw-1.5rem)] sm:w-[calc(100vw-2rem)] pointer-events-none"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-sm shadow-xl ${
                t.tone === 'emerald'
                  ? 'bg-[#0b1b15]/95 border-emerald-500/40 text-emerald-100'
                  : t.tone === 'crimson'
                    ? 'bg-[#210c12]/95 border-rose-500/40 text-rose-100'
                    : t.tone === 'gold'
                      ? 'bg-[#1a1409]/95 border-[#d4af37]/50 text-[#f8e6b3]'
                      : 'bg-[#120e1e]/95 border-white/15 text-zinc-100'
              }`}
            >
              <span>{t.message}</span>
              <button
                type="button"
                onClick={() => dismissToast(t.id)}
                aria-label="Dismiss notification"
                className="text-zinc-400 hover:text-white shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
