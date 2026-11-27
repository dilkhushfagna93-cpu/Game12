import React from 'react';
import { Crown, Percent, ShieldCheck, Zap } from 'lucide-react';
import { computeVipProgress, VIP_TIERS } from '../services/walletService';
import type { PublicProfile } from '../types';

interface VipTierCardProps {
  profile: PublicProfile | null;
  compact?: boolean;
}

export const VipTierCard: React.FC<VipTierCardProps> = ({ profile, compact = false }) => {
  const { tier, wagered, progressPct, remainingToNext } = computeVipProgress(profile);

  return (
    <section className="surface-panel rounded-2xl p-5 sm:p-6 border border-[#d4af37]/30 space-y-5">
      {/* Header Row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div
            className="w-12 h-12 rounded-2xl border-2 flex items-center justify-center shrink-0 shadow-lg"
            style={{
              borderColor: tier.accentHex,
              background: `radial-gradient(circle at 30% 25%, ${tier.accentHex}38, rgba(10, 7, 20, 0.92))`,
            }}
          >
            <Crown className="w-6 h-6" style={{ color: tier.accentHex }} />
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-widest text-zinc-400">
              VIP Loyalty Tier
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-0.5">
              <h2
                className="font-display text-2xl font-bold leading-none"
                style={{ color: tier.accentHex }}
              >
                {tier.label} VIP
              </h2>
              {tier.priorityWithdraw && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-400/35 text-[10px] font-bold text-emerald-300">
                  <Zap className="w-3 h-3" />
                  <span>{tier.priorityLabel}</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live Cashback & Wagered Readout */}
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-black/45 border border-white/10 px-3.5 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 inline-flex items-center gap-1">
              <Percent className="w-3 h-3 text-[#d4af37]" />
              <span>Daily Cashback</span>
            </div>
            <div className="font-mono-num text-lg font-bold text-[#f6dc93]">
              {tier.cashbackPct}%
            </div>
          </div>
          <div className="rounded-xl bg-black/45 border border-white/10 px-3.5 py-2 text-right">
            <div className="text-[10px] uppercase tracking-wider text-zinc-400">Total Wagered</div>
            <div className="font-mono-num text-lg font-bold text-zinc-100">
              {wagered.toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bar to Next Tier */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="text-zinc-300 font-medium">
            {tier.nextLabel
              ? `${remainingToNext.toLocaleString()} coins to unlock ${tier.nextLabel} VIP`
              : 'Maximum Diamond VIP Tier Unlocked'}
          </span>
          <span className="font-mono-num font-bold text-[#f6dc93]">{progressPct}%</span>
        </div>
        <div className="h-2.5 w-full rounded-full bg-black/60 border border-white/10 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.max(4, progressPct)}%`,
              background: `linear-gradient(90deg, ${tier.accentHex}, #f6dc93)`,
            }}
          />
        </div>
      </div>

      {/* 4-Tier Roadmap */}
      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {VIP_TIERS.map((t) => {
            const reached = wagered >= t.minWagered;
            const isCurrent = t.id === tier.id;
            return (
              <div
                key={t.id}
                className={`rounded-xl p-3 border text-xs space-y-1.5 transition-colors ${
                  isCurrent
                    ? 'bg-[#1a132c] border-[#d4af37]/70 shadow-[0_0_18px_rgba(212,175,55,0.16)]'
                    : reached
                      ? 'bg-emerald-950/20 border-emerald-500/30'
                      : 'bg-black/35 border-white/10 opacity-70'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold" style={{ color: t.accentHex }}>
                    {t.label}
                  </span>
                  <span className="font-mono-num text-[11px] font-bold text-[#f6dc93]">
                    {t.cashbackPct}% CB
                  </span>
                </div>
                <div className="font-mono-num text-[10px] text-zinc-400">
                  {t.minWagered === 0 ? '0+ Wagered' : `${(t.minWagered / 1000).toFixed(0)}K+ Wagered`}
                </div>
                <div className="text-[10px] text-zinc-300 flex items-center gap-1">
                  <ShieldCheck
                    className={`w-3 h-3 shrink-0 ${t.priorityWithdraw ? 'text-emerald-400' : 'text-zinc-500'}`}
                  />
                  <span className="truncate">{t.priorityLabel}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
