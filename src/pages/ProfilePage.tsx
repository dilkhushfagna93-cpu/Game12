import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, LifeBuoy, LogOut, Save, Shield } from 'lucide-react';
import { AvatarBadge } from '../components/AvatarBadge';
import { GraphicsAudioBar } from '../components/GraphicsAudioBar';
import { VipTierCard } from '../components/VipTierCard';
import { useApp } from '../context/AppContext';
import { BADGE_CATALOG, updateUserProfileAndSettings } from '../services/walletService';

const AVATAR_SEEDS = ['Aurelia', 'Dragon', 'Valkyrie', 'Obsidian', 'Zenith', 'Sovereign'];

export default function ProfilePage() {
  const { firebaseUser, profile, privateUser, isAdmin, isGuestMode, logout, pushToast } = useApp();
  const [username, setUsername] = useState(profile?.username || '');
  const [avatarSeed, setAvatarSeed] = useState(profile?.avatarSeed || 'Aurelia');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setUsername(profile.username);
      setAvatarSeed(profile.avatarSeed);
    }
  }, [profile]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || isGuestMode) return;
    setSaving(true);
    try {
      await updateUserProfileAndSettings(firebaseUser.uid, { username, avatarSeed });
      pushToast('Profile settings saved.', 'emerald');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to save profile', 'crimson');
    } finally {
      setSaving(false);
    }
  };

  if (!firebaseUser || isGuestMode) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 space-y-6">
        <div className="surface-panel rounded-2xl p-8 text-center space-y-5">
          <h1 className="font-display text-3xl font-bold gold-gradient-text">Player Profile</h1>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            Sign in with Google or register an account to customize your avatar, unlock achievement badges, and store your virtual coin balance in Cloud Firestore.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {isAdmin && (
              <Link
                to="/admin"
                className="gold-button inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold shadow-[0_0_18px_rgba(212,175,55,0.28)]"
              >
                <Shield className="w-4 h-4" />
                <span>Admin Panel</span>
              </Link>
            )}
            {!firebaseUser && (
              <>
                <Link to="/login" className="gold-button px-6 py-2.5 rounded-xl text-sm font-bold">
                  Log In
                </Link>
                <Link
                  to="/register"
                  className="px-6 py-2.5 rounded-xl border border-white/15 bg-white/5 text-sm font-medium text-zinc-200"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="surface-panel rounded-2xl p-6 space-y-4">
          <h2 className="font-display text-lg font-bold text-[#faf6ee]">
            Audio &amp; Sound Settings
          </h2>
          <GraphicsAudioBar />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="surface-panel rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <AvatarBadge name={profile?.username || 'Player'} seed={avatarSeed} size="lg" />
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#faf6ee]">
              {profile?.username}
            </h1>
            <div className="text-xs text-zinc-400 mt-0.5">
              {privateUser?.email || firebaseUser.email}
              {isAdmin && (
                <>
                  <span className="mx-1.5">·</span>
                  <span className="text-[#f6dc93] font-semibold">Administrator</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {isAdmin && (
            <Link
              to="/admin"
              className="gold-button inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shadow-[0_0_18px_rgba(212,175,55,0.28)]"
            >
              <Shield className="w-4 h-4" />
              <span>Admin Panel</span>
            </Link>
          )}
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-200"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {/* Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Virtual Balance', val: (profile?.balance ?? 0).toLocaleString(), accent: 'text-[#f6dc93]' },
          { label: 'Games Played', val: (profile?.gamesPlayed ?? 0).toLocaleString(), accent: 'text-zinc-100' },
          { label: 'Total Wins', val: (profile?.wins ?? 0).toLocaleString(), accent: 'text-emerald-300' },
          { label: 'Win Percentage', val: `${(profile?.winRate ?? 0).toFixed(1)}%`, accent: 'text-zinc-100' },
        ].map((s) => (
          <div key={s.label} className="surface-panel rounded-2xl p-5 space-y-1">
            <div className="text-xs text-zinc-400">{s.label}</div>
            <div className={`font-mono-num text-2xl font-bold ${s.accent}`}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* VIP Loyalty Tier & Help Support Quick Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8">
          <VipTierCard profile={profile} compact />
        </div>
        <div className="lg:col-span-4 surface-panel rounded-2xl p-5 flex flex-col justify-between gap-4 border border-[#d4af37]/25">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 text-sm font-display font-bold text-[#faf6ee]">
              <LifeBuoy className="w-4 h-4 text-[#d4af37]" />
              <span>Help &amp; Support Tickets</span>
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Need help with a UPI UTR deposit, withdrawal status, or game round? Submit a support ticket and track live admin replies.
            </p>
          </div>
          <Link
            to="/support"
            className="gold-button w-full py-2.5 rounded-xl text-xs font-bold text-center"
          >
            Open Support Center
          </Link>
        </div>
      </div>

      {/* Account Settings Form & Graphics Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form
          onSubmit={(e) => void handleSave(e)}
          className="lg:col-span-6 surface-panel rounded-2xl p-6 space-y-5"
        >
          <h2 className="font-display text-xl font-bold text-[#faf6ee]">Account Identity</h2>

          <div className="space-y-1.5">
            <label htmlFor="prof-username" className="text-xs text-zinc-400">
              Public Leaderboard Username
            </label>
            <input
              id="prof-username"
              type="text"
              required
              minLength={2}
              maxLength={32}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37]"
            />
          </div>

          <div className="space-y-2">
            <div className="text-xs text-zinc-400">Avatar Emblem Style</div>
            <div className="flex flex-wrap gap-2.5">
              {AVATAR_SEEDS.map((seed) => (
                <button
                  key={seed}
                  type="button"
                  onClick={() => setAvatarSeed(seed)}
                  className={`p-1 rounded-xl border transition-colors ${
                    avatarSeed === seed ? 'border-[#d4af37] bg-[#d4af37]/15' : 'border-white/10'
                  }`}
                >
                  <AvatarBadge name={username || seed} seed={seed} size="sm" />
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="gold-button inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Saving...' : 'Save Identity'}</span>
          </button>
        </form>

        <div className="lg:col-span-6 surface-panel rounded-2xl p-6 space-y-5">
          <h2 className="font-display text-xl font-bold text-[#faf6ee]">
            Sound &amp; Audio Preferences
          </h2>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Control sound effects, ambient music, and master volume across all games. Ultra 3D visual quality is permanently active across every arena.
          </p>
          <GraphicsAudioBar />

          <div className="pt-4 border-t border-white/10 space-y-3">
            <div className="text-xs text-zinc-400">Unlocked Badges ({profile?.badges.length || 0})</div>
            <div className="flex flex-wrap gap-2">
              {(profile?.badges || []).map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1.5 text-xs text-[#f6dc93] bg-black/40 border border-[#d4af37]/25 px-3 py-1.5 rounded-lg"
                >
                  <Award className="w-3.5 h-3.5 text-[#d4af37]" />
                  <span>{BADGE_CATALOG[b]?.label || b}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
