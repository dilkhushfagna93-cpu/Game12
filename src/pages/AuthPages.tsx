import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Gift } from 'lucide-react';
import { BrandLogo } from '../components/BrandLogo';
import { VIRTUAL_COIN_DISCLAIMER } from '../config/assets';
import { useApp } from '../context/AppContext';

export function LoginPage() {
  const { signInWithGoogle, signInWithEmail, sendResetPassword, pushToast } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [resetMode, setResetMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleGoogle = async () => {
    setErrorMsg('');
    setBusy(true);
    try {
      await signInWithGoogle();
      navigate('/profile');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusy(true);
    try {
      if (resetMode) {
        await sendResetPassword(email);
        setResetMode(false);
      } else {
        await signInWithEmail(email, password);
        navigate('/profile');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Authentication error';
      if (msg.includes('operation-not-allowed')) {
        setErrorMsg(
          'Email/Password sign-in is not yet enabled in Firebase Console. Use "Continue with Google" below for instant access.',
        );
      } else {
        setErrorMsg(msg);
      }
      pushToast('Sign-in could not be completed.', 'crimson');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="surface-panel rounded-2xl p-7 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <BrandLogo />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#faf6ee] pt-2">
            {resetMode ? 'Reset Password' : 'Sign In to Aurelia Arena'}
          </h1>
          <p className="text-xs text-zinc-400">
            Sync your virtual coin wallet, leaderboards, and multiplayer Ludo rooms.
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleGoogle()}
          className="w-full gold-button py-3 px-4 rounded-xl text-sm font-bold disabled:opacity-50"
        >
          Continue with Google (Recommended)
        </button>

        <div className="relative flex items-center justify-center text-xs text-zinc-500">
          <span className="w-full border-t border-white/10" />
          <span className="px-3 bg-[#100d19] whitespace-nowrap">or email</span>
          <span className="w-full border-t border-white/10" />
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="login-email" className="text-xs text-zinc-400">
              Email Address
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37]"
              placeholder="player@example.com"
            />
          </div>

          {!resetMode && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="login-password" className="text-zinc-400">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setResetMode(true)}
                  className="text-[#f6dc93] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <input
                id="login-password"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37]"
                placeholder="••••••••"
              />
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/35 text-xs text-rose-200 leading-relaxed">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 px-4 rounded-xl border border-[#d4af37]/35 bg-white/5 hover:bg-white/10 text-sm font-semibold text-zinc-100 disabled:opacity-50"
          >
            {busy ? 'Processing...' : resetMode ? 'Send Password Reset Email' : 'Sign In with Email'}
          </button>

          {resetMode && (
            <button
              type="button"
              onClick={() => setResetMode(false)}
              className="w-full text-xs text-zinc-400 hover:text-zinc-200"
            >
              Back to Sign In
            </button>
          )}
        </form>

        <div className="text-center text-xs text-zinc-400 pt-2 border-t border-white/10">
          New to Aurelia Arena?{' '}
          <Link to="/register" className="text-[#f6dc93] hover:underline font-medium">
            Create an Account
          </Link>
        </div>
      </div>
    </div>
  );
}

export function RegisterPage() {
  const { signInWithGoogle, registerWithEmail } = useApp();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState(() => {
    const fromUrl = (searchParams.get('ref') || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (fromUrl.length >= 4 && fromUrl.length <= 24) return fromUrl;
    try {
      return (sessionStorage.getItem('aurelia_pending_ref_code') || '').trim().toUpperCase();
    } catch {
      return '';
    }
  });
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const persistPendingRef = () => {
    const cleanRef = referralCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (cleanRef.length >= 4 && cleanRef.length <= 24) {
      try {
        sessionStorage.setItem('aurelia_pending_ref_code', cleanRef);
      } catch {
        // ignore storage restrictions
      }
    }
  };

  const handleGoogle = async () => {
    setErrorMsg('');
    setBusy(true);
    try {
      persistPendingRef();
      await signInWithGoogle();
      navigate('/wallet');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Google registration failed');
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setBusy(true);
    try {
      await registerWithEmail(email, password, username, referralCode);
      navigate('/profile');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      if (msg.includes('operation-not-allowed')) {
        setErrorMsg(
          'Email/Password provider is disabled in Firebase Console. Use "Register with Google" above to create your account and receive 10,000 virtual coins instantly.',
        );
      } else {
        setErrorMsg(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-14">
      <div className="surface-panel rounded-2xl p-7 sm:p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="flex justify-center">
            <BrandLogo />
          </div>
          <h1 className="font-display text-2xl font-bold text-[#faf6ee] pt-2">
            Create Your Account
          </h1>
          <p className="text-xs text-[#f6dc93]">
            Includes 10,000 starter virtual coins upon verified sign-in.
          </p>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleGoogle()}
          className="w-full gold-button py-3 px-4 rounded-xl text-sm font-bold disabled:opacity-50"
        >
          Register with Google (Instant 10,000 Coins)
        </button>

        <div className="relative flex items-center justify-center text-xs text-zinc-500">
          <span className="w-full border-t border-white/10" />
          <span className="px-3 bg-[#100d19] whitespace-nowrap">or email</span>
          <span className="w-full border-t border-white/10" />
        </div>

        <form onSubmit={(e) => void handleRegister(e)} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="reg-user" className="text-xs text-zinc-400">
              Username
            </label>
            <input
              id="reg-user"
              type="text"
              required
              minLength={2}
              maxLength={32}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37]"
              placeholder="AureliaAce"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="reg-email" className="text-xs text-zinc-400">
              Email Address
            </label>
            <input
              id="reg-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37]"
              placeholder="player@example.com"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="reg-pass" className="text-xs text-zinc-400">
              Password (min 6 characters)
            </label>
            <input
              id="reg-pass"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37]"
              placeholder="••••••••"
            />
          </div>

          <div className="space-y-1.5">
            <label htmlFor="reg-ref" className="text-xs text-zinc-400 flex items-center gap-1.5">
              <Gift className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>Referral Code (Optional)</span>
            </label>
            <input
              id="reg-ref"
              type="text"
              maxLength={24}
              value={referralCode}
              onChange={(e) => setReferralCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm font-mono-num uppercase text-[#f6dc93] focus:outline-none focus:border-[#d4af37]"
              placeholder="e.g. AUR7X29K"
            />
            <p className="text-[11px] text-zinc-500">
              Applies to Google or Email registration. Unlocks friend bonus after your 1st completed game.
            </p>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-500/35 text-xs text-rose-200 leading-relaxed">
              {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-2.5 px-4 rounded-xl border border-[#d4af37]/35 bg-white/5 hover:bg-white/10 text-sm font-semibold text-zinc-100 disabled:opacity-50"
          >
            {busy ? 'Creating Account...' : 'Create Email Account'}
          </button>
        </form>

        <p className="text-[11px] text-zinc-500 text-center">{VIRTUAL_COIN_DISCLAIMER}</p>

        <div className="text-center text-xs text-zinc-400 pt-2 border-t border-white/10">
          Already registered?{' '}
          <Link to="/login" className="text-[#f6dc93] hover:underline font-medium">
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
