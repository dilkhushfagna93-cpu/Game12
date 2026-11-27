import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Award, Check, Copy, Flame, Gift, Lock, MessageCircle, Share2, Sparkles, Users } from 'lucide-react';
import { VipTierCard } from '../components/VipTierCard';
import { useApp } from '../context/AppContext';
import { soundEngine } from '../services/soundEngine';
import {
  applyReferralCode,
  BADGE_CATALOG,
  claimDailySpinReward,
  claimMissionReward,
  claimUnlockedReferralReward,
  DAILY_MISSIONS,
  DAILY_STREAK_REWARDS,
  fetchGameHistory,
  fetchUserReferrals,
  fetchUserUpiRequests,
  generateReferralCodeFromUid,
  getTodayUtcDateKey,
  REFERRAL_REWARD_COINS,
} from '../services/walletService';
import type { DailyMissionDef, ReferralRecord } from '../types';

const WHEEL_SEGMENTS = [
  { label: '5', reward: 5, fill: '#1f1633', text: '#f6dc93' },
  { label: '10', reward: 10, fill: '#2c1e4a', text: '#ffffff' },
  { label: '15', reward: 15, fill: '#191329', text: '#f6dc93' },
  { label: '20', reward: 20, fill: '#37235d', text: '#ffffff' },
  { label: '30', reward: 30, fill: '#1f1633', text: '#f6dc93' },
  { label: '50', reward: 50, fill: '#452b73', text: '#ffffff' },
  { label: '75', reward: 75, fill: '#191329', text: '#f6dc93' },
  { label: '100', reward: 100, fill: '#9f7b1f', text: '#09070d' },
];

export default function RewardsPage() {
  const navigate = useNavigate();
  const { firebaseUser, isAuthenticated, profile, privateUser, isGuestMode, claimDailyCheckIn, pushToast } = useApp();
  const [claimingDaily, setClaimingDaily] = useState(false);
  const [claimingMissionId, setClaimingMissionId] = useState<string | null>(null);
  const [gameCounts, setGameCounts] = useState({ ludo: 0, dt: 0, aviator: 0 });

  // Daily Spin Wheel State
  const [spinning, setSpinning] = useState(false);
  const [wheelRotation, setWheelRotation] = useState(0);
  const [spinPrizeMsg, setSpinPrizeMsg] = useState('');
  const [hasApprovedDepositRecord, setHasApprovedDepositRecord] = useState(false);

  // Referral System State
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [refInput, setRefInput] = useState('');
  const [applyingRef, setApplyingRef] = useState(false);
  const [claimingRefId, setClaimingRefId] = useState<string | null>(null);

  const loadReferrals = useCallback(async () => {
    if (!firebaseUser || isGuestMode) return;
    const list = await fetchUserReferrals(firebaseUser.uid).catch(() => []);
    setReferrals(list);
  }, [firebaseUser, isGuestMode]);

  useEffect(() => {
    if (!firebaseUser || isGuestMode) {
      setHasApprovedDepositRecord(false);
      return;
    }
    void fetchGameHistory(firebaseUser.uid, 50)
      .then((list) => {
        setGameCounts({
          ludo: list.filter((h) => h.game === 'ludo').length,
          dt: list.filter((h) => h.game === 'dragon_tiger').length,
          aviator: list.filter((h) => h.game === 'aviator').length,
        });
      })
      .catch(() => {});
    void fetchUserUpiRequests(firebaseUser.uid)
      .then((reqs) => {
        const hasApproved = reqs.some(
          (r) => r.type === 'deposit' && (r.status === 'approved' || (r.status as string) === 'completed'),
        );
        setHasApprovedDepositRecord(hasApproved);
      })
      .catch(() => {
        setHasApprovedDepositRecord(false);
      });
    void loadReferrals();
  }, [firebaseUser, isGuestMode, loadReferrals, profile?.gamesPlayed, profile?.totalDeposited]);

  const todayKey = getTodayUtcDateKey();
  const claimedToday = privateUser?.lastDailyClaimDate === todayKey;
  const spunToday = privateUser?.lastSpinDate === todayKey;
  const totalDeposited = Math.max(0, Math.round(profile?.totalDeposited || 0));
  const hasDeposited = !isGuestMode && !!firebaseUser && (totalDeposited > 0 || hasApprovedDepositRecord);
  const currentStreak = privateUser?.streakDays || 0;
  const myReferralCode =
    privateUser?.referralCode || (firebaseUser ? generateReferralCodeFromUid(firebaseUser.uid) : '');
  const shareLink =
    typeof window !== 'undefined' && myReferralCode
      ? `${window.location.origin}/register?ref=${myReferralCode}`
      : '';
  const whatsappInviteHref = shareLink
    ? `https://wa.me/?text=${encodeURIComponent(
        `Join me on Aurelia Arena (Ludo 3D, Dragon Tiger & Aviator)! Use my invite code ${myReferralCode} and start playing with 10,000 bonus virtual coins: ${shareLink}`,
      )}`
    : '#';

  const totalInvitedCount = referrals.length;
  const qualifiedCount = referrals.filter((r) => r.status === 'unlocked' || r.status === 'claimed').length;
  const totalReferralEarnings = referrals
    .filter((r) => r.status === 'claimed')
    .reduce((sum, r) => sum + (r.rewardAmount || REFERRAL_REWARD_COINS), 0);

  const handleClaimDaily = async () => {
    if (!isAuthenticated) {
      pushToast('Please log in to claim daily check-in rewards.', 'gold');
      return;
    }
    setClaimingDaily(true);
    try {
      const res = await claimDailyCheckIn();
      soundEngine.playCoinReward();
      pushToast(`Day ${res.streakDays} claimed! +${res.reward.toLocaleString()} Bonus Coins.`, 'emerald');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to claim daily reward', 'crimson');
    } finally {
      setClaimingDaily(false);
    }
  };

  const handleSpinWheel = async () => {
    if (!firebaseUser || isGuestMode) {
      pushToast('Sign in with Google to spin the Daily Bonus Wheel.', 'gold');
      return;
    }
    if (!hasDeposited) {
      pushToast('Deposit Required to Spin. Add funds in your Wallet to unlock.', 'gold');
      return;
    }
    if (spunToday || spinning) return;
    setSpinning(true);
    setSpinPrizeMsg('');
    soundEngine.playDiceRoll();

    try {
      const resp = await fetch('/api/rewards/spin', { method: 'POST' });
      if (!resp.ok) throw new Error('Spin service unavailable');
      const spinData = (await resp.json()) as {
        spinId: string;
        segmentIndex: number;
        reward: number;
        label: string;
      };

      const segAngle = 360 / WHEEL_SEGMENTS.length;
      // Rotate so the chosen segment lands squarely under the top 12-o'clock pointer
      const targetAngle = 360 - (spinData.segmentIndex * segAngle + segAngle / 2);
      const nextRot = wheelRotation + 5 * 360 + ((targetAngle - (wheelRotation % 360) + 360) % 360);
      setWheelRotation(nextRot);

      window.setTimeout(async () => {
        try {
          const res = await claimDailySpinReward(firebaseUser.uid, spinData);
          soundEngine.playWinFanfare();
          setSpinPrizeMsg(`+${res.reward.toLocaleString()} Bonus Coins Won!`);
          pushToast(`Daily Spin won +${res.reward.toLocaleString()} Bonus Coins!`, 'emerald');
        } catch (err) {
          pushToast(err instanceof Error ? err.message : 'Unable to credit spin reward', 'crimson');
        } finally {
          setSpinning(false);
        }
      }, 4200);
    } catch (err) {
      setSpinning(false);
      pushToast(err instanceof Error ? err.message : 'Spin failed', 'crimson');
    }
  };

  const handleApplyReferral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || isGuestMode) return;
    setApplyingRef(true);
    try {
      const res = await applyReferralCode(firebaseUser.uid, profile.username, refInput);
      soundEngine.playCoinReward();
      pushToast(
        `Linked to ${res.referrerUsername} (${res.code})! Complete your 1st game to unlock their bonus.`,
        'emerald',
      );
      setRefInput('');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Could not apply referral code', 'crimson');
    } finally {
      setApplyingRef(false);
    }
  };

  const handleClaimReferral = async (refId: string) => {
    if (!firebaseUser || isGuestMode) return;
    setClaimingRefId(refId);
    try {
      const res = await claimUnlockedReferralReward(firebaseUser.uid, refId);
      soundEngine.playWinFanfare();
      pushToast(`Claimed +${res.reward.toLocaleString()} Bonus Coins from referral!`, 'emerald');
      await loadReferrals();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to claim referral reward', 'crimson');
    } finally {
      setClaimingRefId(null);
    }
  };

  const handleClaimMission = async (mission: DailyMissionDef) => {
    if (!firebaseUser || isGuestMode) return;
    setClaimingMissionId(mission.id);
    try {
      const res = await claimMissionReward(firebaseUser.uid, mission);
      soundEngine.playWinFanfare();
      pushToast(`Mission complete! +${res.reward.toLocaleString()} Bonus Coins.`, 'emerald');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to claim mission', 'crimson');
    } finally {
      setClaimingMissionId(null);
    }
  };

  const evalStats = {
    gamesPlayed: profile?.gamesPlayed || 0,
    wins: profile?.wins || 0,
    streakDays: currentStreak,
    ludoPlayed: gameCounts.ludo,
    dtPlayed: gameCounts.dt,
    aviatorPlayed: gameCounts.aviator,
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-10">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold gold-gradient-text">
            Rewards, Spin Wheel & Referrals
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Claim daily streaks, spin the server-fair bonus wheel, and invite friends to earn Bonus Balance.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm font-mono-num text-[#f6dc93]">
          <Flame className="w-4 h-4 text-amber-400" />
          <span>Active Streak: {currentStreak} Days</span>
        </div>
      </div>

      {isGuestMode && (
        <div className="surface-panel rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-sm text-zinc-300">
            Sign in with Google to track VIP Loyalty Tiers, spin the Daily Bonus Wheel, and earn referral rewards.
          </div>
          <Link to="/login" className="gold-button px-5 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap">
            Sign In to Claim
          </Link>
        </div>
      )}

      {/* VIP Loyalty Tiers Progression Card */}
      <VipTierCard profile={profile} />

      {/* 7-Day Consecutive Login Calendar */}
      <section className="surface-panel rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-[#faf6ee] inline-flex items-center gap-2">
              <Gift className="w-5 h-5 text-[#d4af37]" />
              <span>7-Day Consecutive Check-In</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-1">
              Credits directly to your Bonus Balance. Resets cleanly on UTC midnight.
            </p>
          </div>
          <button
            type="button"
            disabled={!isAuthenticated || claimedToday || claimingDaily}
            onClick={() => void handleClaimDaily()}
            className="gold-button px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-45"
          >
            {claimedToday ? 'Claimed Today' : claimingDaily ? 'Claiming...' : 'Claim Today’s Bonus'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {DAILY_STREAK_REWARDS.map((amount, idx) => {
            const dayNum = idx + 1;
            const completed = currentStreak % 7 >= dayNum || (currentStreak > 0 && currentStreak % 7 === 0);
            const isNext = !claimedToday && (currentStreak % 7) + 1 === dayNum;
            return (
              <div
                key={dayNum}
                className={`rounded-xl p-4 border text-center space-y-2 ${
                  isNext
                    ? 'border-[#d4af37] bg-[#d4af37]/15'
                    : completed
                      ? 'border-emerald-500/35 bg-emerald-950/25'
                      : 'border-white/10 bg-black/35'
                }`}
              >
                <div className="text-xs text-zinc-400">Day {dayNum}</div>
                <div className="font-mono-num text-base font-bold text-[#f6dc93]">
                  +{amount.toLocaleString()}
                </div>
                <div className="text-[11px]">
                  {completed ? (
                    <span className="inline-flex items-center gap-1 text-emerald-300">
                      <Check className="w-3.5 h-3.5" /> Claimed
                    </span>
                  ) : isNext ? (
                    <span className="text-[#f6dc93] font-medium">Available</span>
                  ) : (
                    <span className="text-zinc-500">Locked</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Daily Bonus Spin Wheel & Referral Program Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Daily Spin Wheel */}
        <section className="lg:col-span-6 surface-panel rounded-2xl p-6 sm:p-7 flex flex-col items-center justify-between space-y-5">
          <div className="text-center space-y-1.5">
            <h2 className="font-display text-xl font-bold text-[#faf6ee] inline-flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#d4af37]" />
              <span>Daily Bonus Spin Wheel</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Win up to 100 Bonus Coins! (Deposited Players Only)
            </p>
            {!hasDeposited && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full border border-amber-400/50 bg-amber-500/15 text-amber-200 text-[11px] font-semibold">
                <Lock className="w-3 h-3 text-amber-300" />
                <span>Deposit Required to Spin</span>
              </div>
            )}
          </div>

          <div className="relative w-60 h-60 sm:w-64 sm:h-64 flex items-center justify-center">
            {/* Top Golden Pointer */}
            <div
              className="absolute -top-2.5 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[10px] border-l-transparent border-r-[10px] border-r-transparent border-t-[18px] border-t-[#f6dc93] drop-shadow-[0_0_8px_rgba(212,175,55,0.85)]"
              aria-hidden="true"
            />
            <div
              className={`w-full h-full rounded-full border-4 border-[#d4af37] shadow-[0_0_32px_rgba(212,175,55,0.28)] overflow-hidden transition-opacity ${
                !hasDeposited ? 'opacity-80' : ''
              }`}
              style={{
                transform: `rotate(${wheelRotation}deg)`,
                transition: spinning ? 'transform 4.2s cubic-bezier(0.16, 1, 0.22, 1)' : 'none',
              }}
            >
              <svg viewBox="0 0 200 200" className="w-full h-full">
                {WHEEL_SEGMENTS.map((seg, i) => {
                  const segAngle = 360 / WHEEL_SEGMENTS.length;
                  const startDeg = i * segAngle - 90;
                  const endDeg = startDeg + segAngle;
                  const startRad = (startDeg * Math.PI) / 180;
                  const endRad = (endDeg * Math.PI) / 180;
                  const x1 = 100 + 100 * Math.cos(startRad);
                  const y1 = 100 + 100 * Math.sin(startRad);
                  const x2 = 100 + 100 * Math.cos(endRad);
                  const y2 = 100 + 100 * Math.sin(endRad);
                  const midDeg = startDeg + segAngle / 2;
                  const midRad = (midDeg * Math.PI) / 180;
                  const tx = 100 + 64 * Math.cos(midRad);
                  const ty = 100 + 64 * Math.sin(midRad);

                  return (
                    <g key={seg.label}>
                      <path
                        d={`M100,100 L${x1},${y1} A100,100 0 0,1 ${x2},${y2} Z`}
                        fill={seg.fill}
                        stroke="#d4af37"
                        strokeWidth="1"
                      />
                      <text
                        x={tx}
                        y={ty}
                        fill={seg.text}
                        fontSize="11"
                        fontWeight="bold"
                        textAnchor="middle"
                        dominantBaseline="middle"
                        transform={`rotate(${midDeg + 90}, ${tx}, ${ty})`}
                      >
                        {seg.label}
                      </text>
                    </g>
                  );
                })}
                <circle cx="100" cy="100" r="18" fill="#09070f" stroke="#f6dc93" strokeWidth="3" />
                <circle cx="100" cy="100" r="6" fill="#d4af37" />
              </svg>
            </div>
            {!hasDeposited && (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full bg-black/25 flex items-center justify-center"
              >
                <div className="w-11 h-11 rounded-full bg-[#120d1d]/95 border-2 border-[#d4af37] shadow-[0_0_16px_rgba(0,0,0,0.85)] flex items-center justify-center">
                  <Lock className="w-5 h-5 text-[#f6dc93]" />
                </div>
              </div>
            )}
          </div>

          <div className="w-full text-center space-y-2">
            {spinPrizeMsg && (
              <div className="text-sm font-bold text-emerald-300">{spinPrizeMsg}</div>
            )}
            {!hasDeposited ? (
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  navigate('/wallet');
                }}
                className="w-full max-w-xs inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-[#d4af37]/75 bg-gradient-to-r from-[#2c1d07] via-[#4a310a] to-[#2c1d07] hover:brightness-110 text-[#fde68a] text-sm font-bold shadow-[0_0_20px_rgba(212,175,55,0.2)] transition-all"
              >
                <Lock className="w-4 h-4 text-[#f6dc93]" />
                <span>Deposit to Unlock Spin</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={isGuestMode || spunToday || spinning}
                onClick={() => void handleSpinWheel()}
                className="w-full max-w-xs gold-button py-3 rounded-xl text-sm font-bold disabled:opacity-45"
              >
                {spinning ? 'Spinning...' : spunToday ? 'Come Back Tomorrow' : 'Spin Bonus Wheel'}
              </button>
            )}
          </div>
        </section>

        {/* Referral Program Panel */}
        <section className="lg:col-span-6 surface-panel rounded-2xl p-6 sm:p-7 flex flex-col justify-between space-y-5">
          <div className="space-y-2">
            <h2 className="font-display text-xl font-bold text-[#faf6ee] inline-flex items-center gap-2">
              <Users className="w-5 h-5 text-[#d4af37]" />
              <span>Refer &amp; Earn +{REFERRAL_REWARD_COINS.toLocaleString()} Bonus</span>
            </h2>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Share your personal invite code. Your +{REFERRAL_REWARD_COINS.toLocaleString()} Bonus Coin reward unlocks automatically once your invited friend completes their first real game.
            </p>
          </div>

          {!isGuestMode && myReferralCode && (
            <div className="space-y-3.5">
              {/* Live Referral Dashboard Metrics */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-xl bg-black/45 border border-white/10 p-2.5 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-400">Total Invited</div>
                  <div className="font-mono-num text-lg font-bold text-white mt-0.5">
                    {totalInvitedCount}
                  </div>
                </div>
                <div className="rounded-xl bg-black/45 border border-emerald-500/25 p-2.5 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-400">Qualified</div>
                  <div className="font-mono-num text-lg font-bold text-emerald-300 mt-0.5">
                    {qualifiedCount}
                  </div>
                </div>
                <div className="rounded-xl bg-black/45 border border-[#d4af37]/30 p-2.5 text-center">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-400">Earned</div>
                  <div className="font-mono-num text-lg font-bold text-[#f6dc93] mt-0.5">
                    {totalReferralEarnings.toLocaleString()}
                  </div>
                </div>
              </div>

              <div className="rounded-xl bg-black/50 border border-[#d4af37]/30 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-zinc-400">Your Referral Code</div>
                    <div className="font-mono text-lg font-bold tracking-widest text-[#f6dc93]">
                      {myReferralCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(myReferralCode);
                      pushToast('Referral code copied!', 'gold');
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-zinc-200"
                  >
                    <Copy className="w-3.5 h-3.5" /> Copy Code
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(shareLink);
                      pushToast('Invite link copied!', 'emerald');
                    }}
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-[#d4af37]/20 hover:bg-[#d4af37]/30 border border-[#d4af37]/40 text-xs font-semibold text-[#f6dc93]"
                  >
                    <Share2 className="w-3.5 h-3.5" /> Copy Invite Link
                  </button>
                  <a
                    href={whatsappInviteHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 text-xs font-bold text-white"
                  >
                    <MessageCircle className="w-3.5 h-3.5" /> Share on WhatsApp
                  </a>
                </div>
              </div>

              {/* Apply Friend's Referral Code (if not yet linked) */}
              {!privateUser?.referredBy && (
                <form onSubmit={(e) => void handleApplyReferral(e)} className="flex gap-2">
                  <input
                    type="text"
                    value={refInput}
                    onChange={(e) => setRefInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))}
                    placeholder="Have a friend's code? Enter here"
                    className="flex-1 bg-black/50 border border-white/15 rounded-xl px-3 py-2 font-mono text-xs uppercase tracking-wider text-white focus:outline-none focus:border-[#d4af37]"
                  />
                  <button
                    type="submit"
                    disabled={applyingRef || refInput.length < 4}
                    className="px-4 py-2 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/15 text-[#f6dc93] text-xs font-semibold disabled:opacity-45"
                  >
                    {applyingRef ? '...' : 'Apply'}
                  </button>
                </form>
              )}

              {/* Invited Friends Tracker */}
              <div className="space-y-2 pt-1">
                <div className="text-xs text-zinc-400">Your Invited Friends ({referrals.length})</div>
                {referrals.length === 0 ? (
                  <div className="rounded-xl bg-black/30 border border-white/5 p-4 text-xs text-zinc-500 text-center">
                    No referrals yet. Share your link to start unlocking +2,000 Bonus Coins per player!
                  </div>
                ) : (
                  <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                    {referrals.map((r) => (
                      <div
                        key={r.referralId}
                        className="flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl bg-black/40 border border-white/10 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-zinc-100 truncate">{r.referredUsername}</div>
                          <div className="text-[11px] text-zinc-500">
                            {r.status === 'pending'
                              ? 'Locked until 1st game completed'
                              : r.status === 'unlocked'
                                ? '1st game verified — Ready to claim!'
                                : 'Reward claimed'}
                          </div>
                        </div>
                        {r.status === 'unlocked' ? (
                          <button
                            type="button"
                            disabled={claimingRefId === r.referralId}
                            onClick={() => void handleClaimReferral(r.referralId)}
                            className="gold-button px-3 py-1.5 rounded-lg text-[11px] font-bold shrink-0"
                          >
                            {claimingRefId === r.referralId ? '...' : `+${r.rewardAmount}`}
                          </button>
                        ) : r.status === 'claimed' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-300 font-semibold shrink-0">
                            <Check className="w-3.5 h-3.5" /> Claimed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-zinc-500 shrink-0">
                            <Lock className="w-3 h-3" /> Pending
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {/* Daily & Weekly Missions */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-[#faf6ee]">Active Missions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {DAILY_MISSIONS.map((m) => {
            const alreadyClaimed = privateUser?.claimedMissions.includes(m.id) || false;
            const ready = !alreadyClaimed && m.checkCompleted(evalStats);
            return (
              <div key={m.id} className="surface-panel rounded-2xl p-5 flex items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="text-xs text-zinc-400 capitalize">
                    {m.cadence} Mission ·{' '}
                    <span className="font-mono-num text-[#f6dc93]">+{m.reward.toLocaleString()} Bonus</span>
                  </div>
                  <h3 className="text-base font-semibold text-zinc-100">{m.title}</h3>
                  <p className="text-xs text-zinc-400">{m.description}</p>
                </div>

                <div className="shrink-0">
                  {alreadyClaimed ? (
                    <span className="text-xs font-semibold text-emerald-300 inline-flex items-center gap-1">
                      <Check className="w-4 h-4" /> Claimed
                    </span>
                  ) : ready && !isGuestMode ? (
                    <button
                      type="button"
                      disabled={claimingMissionId === m.id}
                      onClick={() => void handleClaimMission(m)}
                      className="gold-button px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap"
                    >
                      {claimingMissionId === m.id ? '...' : 'Claim'}
                    </button>
                  ) : (
                    <span className="text-xs text-zinc-500 whitespace-nowrap">In Progress</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Achievement Badges */}
      <section className="space-y-4">
        <h2 className="font-display text-2xl font-bold text-[#faf6ee]">Achievement Badges</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(BADGE_CATALOG).map(([id, badge]) => {
            const unlocked = profile?.badges.includes(id) || false;
            return (
              <div
                key={id}
                className={`rounded-2xl p-5 border flex items-start gap-3.5 ${
                  unlocked
                    ? 'surface-panel border-[#d4af37]/40'
                    : 'bg-black/30 border-white/10 opacity-55'
                }`}
              >
                <Award
                  className={`w-6 h-6 shrink-0 mt-0.5 ${unlocked ? 'text-[#d4af37]' : 'text-zinc-600'}`}
                />
                <div>
                  <div className="text-sm font-semibold text-zinc-100">{badge.label}</div>
                  <div className="text-xs text-zinc-400 mt-0.5">{badge.detail}</div>
                  <div className="text-[11px] mt-2 font-medium text-[#f6dc93]">
                    {unlocked ? 'Unlocked' : 'Locked'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
