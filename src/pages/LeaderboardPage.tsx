import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ShieldCheck, Trophy } from 'lucide-react';
import { AvatarBadge } from '../components/AvatarBadge';
import { useApp } from '../context/AppContext';
import { fetchLeaderboard } from '../services/walletService';
import type { PublicProfile } from '../types';

export default function LeaderboardPage() {
  const { firebaseUser } = useApp();
  const [timeframe, setTimeframe] = useState<'weekly' | 'monthly' | 'allTime'>('allTime');
  const [players, setPlayers] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    void fetchLeaderboard(timeframe, 50)
      .then(setPlayers)
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));
  }, [timeframe]);

  const scoreValue = (p: PublicProfile) =>
    timeframe === 'weekly' ? p.weeklyScore : timeframe === 'monthly' ? p.monthlyScore : p.balance;

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold gold-gradient-text inline-flex items-center gap-3">
            <Trophy className="w-8 h-8 text-[#d4af37]" />
            <span>Global Leaderboard</span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1 flex items-center gap-1.5 flex-wrap">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>
              Live rankings verified from server-settled provably fair games and real Aurelia Arena accounts.
            </span>
          </p>
        </div>

        <div className="inline-flex bg-black/50 border border-white/10 rounded-xl p-1 text-xs">
          {(
            [
              { id: 'weekly', label: 'Weekly' },
              { id: 'monthly', label: 'Monthly' },
              { id: 'allTime', label: 'All-Time' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTimeframe(t.id)}
              className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap ${
                timeframe === t.id ? 'bg-[#d4af37] text-[#09070d] font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-panel rounded-2xl p-6">
        {loading ? (
          <div className="py-14 text-center text-sm text-zinc-400">Loading verified rankings...</div>
        ) : players.length === 0 ? (
          <div className="py-14 text-center space-y-4">
            <p className="text-sm text-zinc-400">
              No registered players have entered the leaderboard yet. Sign in and play to take the #1 seat.
            </p>
            <Link to="/register" className="gold-button inline-block px-6 py-2.5 rounded-xl text-sm font-bold">
              Register & Compete
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-400 border-b border-white/10">
                <tr>
                  <th className="py-3 pr-4">Rank</th>
                  <th className="py-3 pr-4">Player</th>
                  <th className="py-3 pr-4 text-right">Games</th>
                  <th className="py-3 pr-4 text-right">Wins</th>
                  <th className="py-3 pr-4 text-right">Win %</th>
                  <th className="py-3 pr-4 text-right">Total Won</th>
                  <th className="py-3 text-right">Virtual Coin Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {players.map((p, idx) => {
                  const isMe = firebaseUser?.uid === p.uid;
                  return (
                    <tr key={p.uid} className={isMe ? 'bg-[#d4af37]/10' : ''}>
                      <td className="py-3.5 pr-4 font-mono-num font-bold text-[#d4af37]">
                        #{idx + 1}
                      </td>
                      <td className="py-3.5 pr-4">
                        <div className="flex items-center gap-3">
                          <AvatarBadge name={p.username} seed={p.avatarSeed} size="sm" />
                          <div>
                            <div className="font-semibold text-zinc-100">
                              {p.username} {isMe && <span className="text-xs text-[#f6dc93]">(You)</span>}
                            </div>
                            <div className="text-xs text-zinc-500">
                              {p.streakDays}d streak · {p.badges.length} badges
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 pr-4 text-right font-mono-num text-zinc-300">
                        {p.gamesPlayed.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-4 text-right font-mono-num text-emerald-300">
                        {p.wins.toLocaleString()}
                      </td>
                      <td className="py-3.5 pr-4 text-right font-mono-num text-zinc-200">
                        {p.winRate.toFixed(1)}%
                      </td>
                      <td className="py-3.5 pr-4 text-right font-mono-num text-emerald-300">
                        {(p.totalWon ?? 0).toLocaleString()}
                      </td>
                      <td className="py-3.5 text-right font-mono-num font-bold text-[#f6dc93]">
                        {scoreValue(p).toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
