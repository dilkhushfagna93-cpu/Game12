import React, { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Gift, Lock, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { VIRTUAL_COIN_DISCLAIMER } from '../config/assets';
import { useApp } from '../context/AppContext';
import { soundEngine } from '../services/soundEngine';

type AuthTab = 'login' | 'signup';
type SignUpContactType = 'mobile' | 'email';

const AUTH_PARTICLES = [
  { left: '8%', bottom: '12%', size: 4, duration: 9, delay: 0, drift: 18 },
  { left: '16%', bottom: '28%', size: 3, duration: 11, delay: 1.5, drift: -14 },
  { left: '25%', bottom: '8%', size: 5, duration: 8.5, delay: 0.8, drift: 22 },
  { left: '37%', bottom: '18%', size: 3, duration: 10.5, delay: 2.2, drift: -16 },
  { left: '49%', bottom: '6%', size: 4, duration: 9.5, delay: 0.4, drift: 12 },
  { left: '62%', bottom: '20%', size: 3, duration: 12, delay: 1.9, drift: -20 },
  { left: '74%', bottom: '10%', size: 5, duration: 8.8, delay: 1.1, drift: 16 },
  { left: '85%', bottom: '24%', size: 4, duration: 10.2, delay: 2.7, drift: -12 },
  { left: '92%', bottom: '14%', size: 3, duration: 11.4, delay: 0.6, drift: -18 },
];

function normalizeIndianMobile(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  if (cleaned.startsWith('+91')) return cleaned.slice(3);
  if (cleaned.startsWith('91') && cleaned.length === 12) return cleaned.slice(2);
  return cleaned;
}

export default function AuthPage() {
  const { signInWithGoogle, loginWithCredentials, registerWithCredentials } = useApp();
  const location = useLocation();
  const navigate = useNavigate();

  const initialTab: AuthTab = location.pathname === '/register' ? 'signup' : 'login';
  const [activeTab, setActiveTab] = useState<AuthTab>(initialTab);

  // Login State
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Sign Up State
  const [fullName, setFullName] = useState('');
  const [contactType, setContactType] = useState<SignUpContactType>('mobile');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [showSignupPassword, setShowSignupPassword] = useState(false);
  const [referralCode, setReferralCode] = useState(() => {
    try {
      const urlRef = new URLSearchParams(window.location.search)
        .get('ref')
        ?.trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      if (urlRef && urlRef.length >= 4 && urlRef.length <= 24) return urlRef;
      return (sessionStorage.getItem('aurelia_pending_ref_code') || '').trim().toUpperCase();
    } catch {
      return '';
    }
  });

  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const mobileDigitsValid = useMemo(() => /^\d{10}$/.test(mobile), [mobile]);

  const switchTab = (next: AuthTab) => {
    soundEngine.playClick();
    setActiveTab(next);
    setErrorMsg('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const rawId = loginIdentifier.trim();
    if (!rawId) {
      setErrorMsg('Please enter your 10-digit mobile number or email address.');
      return;
    }

    if (rawId.includes('@')) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(rawId.toLowerCase())) {
        setErrorMsg('Please enter a valid email address.');
        return;
      }
    } else {
      const normalized = normalizeIndianMobile(rawId);
      if (!/^\d{10}$/.test(normalized)) {
        setErrorMsg('Please enter a valid 10-digit mobile number (+91) or email address.');
        return;
      }
    }

    if (loginPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setBusy(true);
    try {
      await loginWithCredentials(rawId, loginPassword);
      navigate('/', { replace: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to sign in. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    const cleanName = fullName.trim();
    if (cleanName.length < 2 || cleanName.length > 64) {
      setErrorMsg('Please enter your full name (2–64 characters).');
      return;
    }

    if (contactType === 'mobile') {
      if (!/^\d{10}$/.test(mobile)) {
        setErrorMsg('Strict 10-digit validation: enter a valid 10-digit Indian mobile number (+91).');
        return;
      }
    } else {
      const cleanEmail = email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail)) {
        setErrorMsg('Please enter a valid email address.');
        return;
      }
    }

    if (signupPassword.length < 6 || signupPassword.length > 128) {
      setErrorMsg('Password must be between 6 and 128 characters.');
      return;
    }

    const cleanRef = referralCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanRef.length > 0 && (cleanRef.length < 4 || cleanRef.length > 24)) {
      setErrorMsg('Referral / Invite code must be 4–24 alphanumeric characters.');
      return;
    }

    setBusy(true);
    try {
      await registerWithCredentials({
        fullName: cleanName,
        contactType,
        mobile: contactType === 'mobile' ? mobile : undefined,
        email: contactType === 'email' ? email.trim().toLowerCase() : undefined,
        password: signupPassword,
        referralCode: cleanRef || undefined,
      });
      navigate('/', { replace: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to create account. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setErrorMsg('');
    setBusy(true);
    try {
      if (referralCode.trim().length >= 4) {
        try {
          sessionStorage.setItem(
            'aurelia_pending_ref_code',
            referralCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
          );
        } catch {
          // ignore storage error
        }
      }
      await signInWithGoogle();
      navigate('/', { replace: true });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in could not be completed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative min-h-[100dvh] w-full bg-[#07060b] text-[#f4f1ea] flex flex-col items-center justify-center px-4 py-8 sm:py-12 overflow-hidden">
      <style>{`
        @keyframes authParticleFloat {
          0% {
            transform: translate3d(0, 0, 0) scale(0.75);
            opacity: 0;
          }
          20% {
            opacity: 0.72;
          }
          80% {
            opacity: 0.48;
          }
          100% {
            transform: translate3d(var(--ap-drift, 14px), -220px, 0) scale(1.1);
            opacity: 0;
          }
        }
        .auth-particle {
          animation: authParticleFloat var(--ap-dur, 9s) ease-in-out var(--ap-delay, 0s) infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .auth-particle {
            animation: none !important;
            opacity: 0.25 !important;
          }
        }
      `}</style>

      {/* Luxury Royal Obsidian Backdrop & Warm Gold Radial Glow */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden="true">
        <div
          className="absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 80% 55% at 50% 0%, rgba(124, 58, 237, 0.18) 0%, rgba(16, 12, 28, 0.72) 48%, #07060b 100%)',
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 -top-24 w-[520px] h-[340px] rounded-full blur-3xl opacity-30"
          style={{
            background: 'radial-gradient(circle, rgba(212, 175, 55, 0.55) 0%, transparent 70%)',
          }}
        />
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-0 w-[440px] h-[220px] rounded-full blur-3xl opacity-20"
          style={{
            background: 'radial-gradient(circle, rgba(212, 175, 55, 0.45) 0%, transparent 72%)',
          }}
        />
        {AUTH_PARTICLES.map((p, idx) => (
          <span
            key={idx}
            className="auth-particle absolute rounded-full bg-gradient-to-t from-[#b58822] via-[#f6dc93] to-white shadow-[0_0_8px_rgba(246,220,147,0.85)]"
            style={
              {
                left: p.left,
                bottom: p.bottom,
                width: `${p.size}px`,
                height: `${p.size}px`,
                '--ap-dur': `${p.duration}s`,
                '--ap-delay': `${p.delay}s`,
                '--ap-drift': `${p.drift}px`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      {/* Main Centered Auth Column */}
      <div className="relative z-10 w-full max-w-[440px] space-y-6">
        {/* AURELIA ARENA Royal Crest Header */}
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="relative inline-flex items-center justify-center">
            <div
              aria-hidden="true"
              className="absolute -inset-3 rounded-full blur-xl opacity-55"
              style={{
                background: 'radial-gradient(circle, rgba(212,175,55,0.45) 0%, transparent 70%)',
              }}
            />
            <div className="relative w-16 h-16 rounded-2xl border border-[#f6dc93]/55 bg-gradient-to-b from-[#23173a] via-[#130d21] to-[#09070f] shadow-[0_10px_32px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,243,196,0.35)] flex items-center justify-center">
              <svg width="38" height="38" viewBox="0 0 64 64" fill="none" aria-hidden="true">
                <defs>
                  <linearGradient id="authCrestGold" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#fff3c4" />
                    <stop offset="48%" stopColor="#d4af37" />
                    <stop offset="100%" stopColor="#8d6514" />
                  </linearGradient>
                  <linearGradient id="authCrestCore" x1="16" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#4c1d95" />
                    <stop offset="100%" stopColor="#0f091d" />
                  </linearGradient>
                </defs>
                <path
                  d="M32 4L56 20L47 56H17L8 20L32 4Z"
                  fill="url(#authCrestCore)"
                  stroke="url(#authCrestGold)"
                  strokeWidth="2.75"
                  strokeLinejoin="round"
                />
                <path d="M32 14L44 32L32 49L20 32L32 14Z" fill="url(#authCrestGold)" fillOpacity="0.94" />
                <path d="M32 21L38 32L32 42L26 32L32 21Z" fill="#110a1f" />
              </svg>
            </div>
          </div>

          <div className="space-y-1">
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-[0.16em] gold-gradient-text uppercase">
              Aurelia Arena
            </h1>
            <p className="text-xs sm:text-sm text-zinc-400">
              Royal 3D Gaming Club · Sign in or create an account to enter
            </p>
          </div>
        </div>

        {/* Glassmorphic Gold-Rimmed Auth Card */}
        <div className="rounded-3xl p-[1px] bg-gradient-to-b from-[#f6dc93]/55 via-[#d4af37]/30 to-[#785412]/40 shadow-[0_24px_80px_rgba(0,0,0,0.92),0_0_40px_rgba(212,175,55,0.12)]">
          <div className="rounded-[23px] bg-[#0e0a18]/90 backdrop-blur-xl p-6 sm:p-7 space-y-5">
            {/* Login / Sign Up Segmented Tab Toggles */}
            <div
              role="tablist"
              aria-label="Authentication mode"
              className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-black/55 border border-[#d4af37]/20"
            >
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'login'}
                onClick={() => switchTab('login')}
                className={`min-h-[44px] rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                  activeTab === 'login'
                    ? 'gold-button shadow-md'
                    : 'text-zinc-300 hover:text-white hover:bg-white/5'
                }`}
              >
                Login
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'signup'}
                onClick={() => switchTab('signup')}
                className={`min-h-[44px] rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                  activeTab === 'signup'
                    ? 'gold-button shadow-md'
                    : 'text-zinc-300 hover:text-white hover:bg-white/5'
                }`}
              >
                Sign Up
              </button>
            </div>

            {activeTab === 'login' ? (
              <form onSubmit={(e) => void handleLoginSubmit(e)} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="auth-login-id" className="block text-xs font-medium text-zinc-300">
                    Mobile Number (+91) or Email
                  </label>
                  <div className="relative flex items-center">
                    <Phone className="w-4 h-4 text-[#d4af37]/80 absolute left-3.5 pointer-events-none" aria-hidden="true" />
                    <input
                      id="auth-login-id"
                      type="text"
                      autoComplete="username"
                      value={loginIdentifier}
                      onChange={(e) => {
                        setLoginIdentifier(e.target.value);
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="9876543210 or player@example.com"
                      className="w-full min-h-[46px] bg-black/55 border border-white/15 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="auth-login-pass" className="block text-xs font-medium text-zinc-300">
                    Password
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-[#d4af37]/80 absolute left-3.5 pointer-events-none" aria-hidden="true" />
                    <input
                      id="auth-login-pass"
                      type={showLoginPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={loginPassword}
                      onChange={(e) => {
                        setLoginPassword(e.target.value);
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="Enter your password"
                      className="w-full min-h-[46px] bg-black/55 border border-white/15 rounded-xl pl-10 pr-12 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#d4af37]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#f6dc93]"
                    >
                      {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 leading-relaxed"
                  >
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[48px] gold-button py-3 px-4 rounded-xl text-sm font-bold whitespace-nowrap disabled:opacity-50"
                >
                  {busy ? 'Entering Arena...' : 'Login to Arena'}
                </button>
              </form>
            ) : (
              <form onSubmit={(e) => void handleSignUpSubmit(e)} noValidate className="space-y-4">
                <div className="space-y-1.5">
                  <label htmlFor="auth-signup-name" className="block text-xs font-medium text-zinc-300">
                    Full Name
                  </label>
                  <div className="relative flex items-center">
                    <User className="w-4 h-4 text-[#d4af37]/80 absolute left-3.5 pointer-events-none" aria-hidden="true" />
                    <input
                      id="auth-signup-name"
                      type="text"
                      autoComplete="name"
                      maxLength={64}
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="Aarav Sharma"
                      className="w-full min-h-[46px] bg-black/55 border border-white/15 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#d4af37]"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label
                      htmlFor={contactType === 'mobile' ? 'auth-signup-mobile' : 'auth-signup-email'}
                      className="text-xs font-medium text-zinc-300"
                    >
                      {contactType === 'mobile' ? 'Indian Mobile Number (+91)' : 'Email Address'}
                    </label>
                    <div className="inline-flex items-center rounded-lg bg-black/55 border border-white/10 p-0.5 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setContactType('mobile');
                          setErrorMsg('');
                        }}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                          contactType === 'mobile'
                            ? 'bg-[#d4af37]/25 text-[#f6dc93]'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Mobile
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setContactType('email');
                          setErrorMsg('');
                        }}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-colors ${
                          contactType === 'email'
                            ? 'bg-[#d4af37]/25 text-[#f6dc93]'
                            : 'text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        Email
                      </button>
                    </div>
                  </div>

                  {contactType === 'mobile' ? (
                    <div className="flex items-center gap-2">
                      <div className="min-h-[46px] px-3 rounded-xl bg-black/65 border border-[#d4af37]/35 text-sm font-mono-num font-bold text-[#f6dc93] flex items-center gap-1.5 shrink-0">
                        <Phone className="w-3.5 h-3.5 text-[#d4af37]" aria-hidden="true" />
                        <span>+91</span>
                      </div>
                      <input
                        id="auth-signup-mobile"
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        maxLength={10}
                        value={mobile}
                        onChange={(e) => {
                          const digitsOnly = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setMobile(digitsOnly);
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder="10-digit mobile number"
                        className="w-full min-h-[46px] bg-black/55 border border-white/15 rounded-xl px-3.5 py-2.5 font-mono-num text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#d4af37]"
                      />
                    </div>
                  ) : (
                    <div className="relative flex items-center">
                      <Mail className="w-4 h-4 text-[#d4af37]/80 absolute left-3.5 pointer-events-none" aria-hidden="true" />
                      <input
                        id="auth-signup-email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errorMsg) setErrorMsg('');
                        }}
                        placeholder="player@example.com"
                        className="w-full min-h-[46px] bg-black/55 border border-white/15 rounded-xl pl-10 pr-3.5 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#d4af37]"
                      />
                    </div>
                  )}

                  {contactType === 'mobile' && mobile.length > 0 && !mobileDigitsValid && (
                    <p className="text-[11px] text-amber-300">
                      {10 - mobile.length} more digit{10 - mobile.length === 1 ? '' : 's'} required (strict 10-digit mobile number)
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="auth-signup-pass" className="block text-xs font-medium text-zinc-300">
                    Password (min 6 characters)
                  </label>
                  <div className="relative flex items-center">
                    <Lock className="w-4 h-4 text-[#d4af37]/80 absolute left-3.5 pointer-events-none" aria-hidden="true" />
                    <input
                      id="auth-signup-pass"
                      type={showSignupPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={signupPassword}
                      onChange={(e) => {
                        setSignupPassword(e.target.value);
                        if (errorMsg) setErrorMsg('');
                      }}
                      placeholder="Create a strong password"
                      className="w-full min-h-[46px] bg-black/55 border border-white/15 rounded-xl pl-10 pr-12 py-2.5 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-[#d4af37]"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignupPassword((v) => !v)}
                      aria-label={showSignupPassword ? 'Hide password' : 'Show password'}
                      className="absolute right-1 min-w-[40px] min-h-[40px] flex items-center justify-center rounded-lg text-zinc-400 hover:text-[#f6dc93]"
                    >
                      {showSignupPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="auth-signup-ref" className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <Gift className="w-3.5 h-3.5 text-[#d4af37]" aria-hidden="true" />
                    <span>Referral / Invite Code (Optional)</span>
                  </label>
                  <input
                    id="auth-signup-ref"
                    type="text"
                    maxLength={24}
                    value={referralCode}
                    onChange={(e) =>
                      setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))
                    }
                    placeholder="e.g. AUR7X29K"
                    className="w-full min-h-[44px] bg-black/55 border border-white/15 rounded-xl px-3.5 py-2 font-mono-num uppercase text-sm text-[#f6dc93] placeholder:text-zinc-500 focus:outline-none focus:border-[#d4af37]"
                  />
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-xs text-rose-200 leading-relaxed"
                  >
                    {errorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full min-h-[48px] gold-button py-3 px-4 rounded-xl text-sm font-bold whitespace-nowrap disabled:opacity-50"
                >
                  {busy ? 'Creating Account...' : 'Create Account'}
                </button>

                <p className="text-[11px] text-zinc-400 text-center flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#d4af37] shrink-0" aria-hidden="true" />
                  <span>New accounts start with ₹0 balance · Add funds in Wallet anytime</span>
                </p>
              </form>
            )}

            <div className="relative flex items-center justify-center text-xs text-zinc-500">
              <span className="w-full border-t border-white/10" />
              <span className="px-3 bg-[#0e0a18] whitespace-nowrap">or</span>
              <span className="w-full border-t border-white/10" />
            </div>

            <button
              type="button"
              disabled={busy}
              onClick={() => void handleGoogleSignIn()}
              className="w-full min-h-[44px] py-2.5 px-4 rounded-xl border border-[#d4af37]/35 bg-white/5 hover:bg-white/10 text-xs sm:text-sm font-semibold text-[#f6dc93] transition-colors whitespace-nowrap disabled:opacity-50"
            >
              Continue with Google
            </button>
          </div>
        </div>

        <p className="text-[11px] text-zinc-500 text-center leading-relaxed px-2">
          {VIRTUAL_COIN_DISCLAIMER}
        </p>
      </div>
    </div>
  );
}
