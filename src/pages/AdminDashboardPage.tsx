import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ClipboardList,
  Coins,
  Gamepad2,
  Plus,
  RefreshCw,
  Save,
  Search,
  Shield,
  SlidersHorizontal,
  Tag,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  adminAdjustVirtualBalance,
  adminCreatePromoCode,
  adminDeletePromoCode,
  adminReviewUpiRequest,
  adminSetUserStatus,
  adminTogglePromoCode,
  adminUpdateReport,
  computeEffectiveAviatorCap,
  computeEffectiveDragonTigerCap,
  DEFAULT_PLATFORM_LIQUIDITY_SETTINGS,
  fetchAdminDashboardData,
  LIQUIDITY_PRESET_DETAILS,
  saveGameConfig,
  savePlatformLiquiditySettings,
} from '../services/adminService';
import { computeVipProgress, extractWalletBuckets, getTimeMs } from '../services/walletService';
import type {
  AdminAuditLog,
  GameConfigDoc,
  GameHistoryRecord,
  LiquidityMode,
  PlatformLiquiditySettings,
  PromoCodeDoc,
  PublicProfile,
  ReportRecord,
  UpiRequestRecord,
  WalletTransaction,
} from '../types';

type AdminTab = 'overview' | 'upi' | 'users' | 'games' | 'promos' | 'reports' | 'wallet';

export default function AdminDashboardPage() {
  const { firebaseUser, isAdmin, authReady, refreshConfigs, signInWithGoogle, pushToast } = useApp();
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<PublicProfile[]>([]);
  const [userEmails, setUserEmails] = useState<Record<string, string>>({});
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [history, setHistory] = useState<GameHistoryRecord[]>([]);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [upiRequests, setUpiRequests] = useState<UpiRequestRecord[]>([]);
  const [promoCodes, setPromoCodes] = useState<PromoCodeDoc[]>([]);
  const [auditLogs, setAuditLogs] = useState<AdminAuditLog[]>([]);
  const [configs, setConfigs] = useState<Record<GameConfigDoc['gameId'], GameConfigDoc> | null>(null);
  const [liquidityDraft, setLiquidityDraft] = useState<PlatformLiquiditySettings>(
    DEFAULT_PLATFORM_LIQUIDITY_SETTINGS,
  );

  // Filters & interactive editor states
  const [userSearch, setUserSearch] = useState('');
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [payoutRefs, setPayoutRefs] = useState<Record<string, string>>({});
  const [upiNotes, setUpiNotes] = useState<Record<string, string>>({});
  const [ticketReplies, setTicketReplies] = useState<Record<string, string>>({});

  // Manual Balance Adjustment Drawer per User
  const [adjustingUid, setAdjustingUid] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('1000');
  const [adjustDirection, setAdjustDirection] = useState<'credit' | 'debit'>('credit');
  const [adjustBucket, setAdjustBucket] = useState<'deposit' | 'winning' | 'bonus'>('bonus');
  const [adjustReason, setAdjustReason] = useState('Manual admin balance adjustment');

  // New Promo Code Form State
  const [newPromoCode, setNewPromoCode] = useState('');
  const [newPromoBonus, setNewPromoBonus] = useState('500');
  const [newPromoMinDep, setNewPromoMinDep] = useState('0');
  const [newPromoMaxUses, setNewPromoMaxUses] = useState('250');
  const [newPromoDesc, setNewPromoDesc] = useState('Special Arena Bonus');

  const loadData = useCallback(async () => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchAdminDashboardData();
      setUsers(data.users);
      setUserEmails(data.userEmails);
      setTransactions(data.transactions);
      setHistory(data.history);
      setReports(data.reports);
      setUpiRequests(data.upiRequests);
      setPromoCodes(data.promoCodes);
      setAuditLogs(data.auditLogs);
      setConfigs(data.configs);
      setLiquidityDraft(data.platformSettings);
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to load admin telemetry', 'crimson');
    } finally {
      setLoading(false);
    }
  }, [isAdmin, pushToast]);

  useEffect(() => {
    if (authReady && isAdmin) {
      void loadData();
    } else if (authReady) {
      setLoading(false);
    }
  }, [authReady, isAdmin, loadData]);

  if (!authReady) {
    return (
      <div className="max-w-md mx-auto px-4 py-20">
        <div className="surface-panel rounded-2xl p-8 text-center space-y-4 border border-[#d4af37]/25">
          <div className="w-12 h-12 rounded-2xl bg-[#d4af37]/15 border border-[#d4af37]/40 mx-auto flex items-center justify-center">
            <RefreshCw className="w-6 h-6 text-[#f6dc93] animate-spin" />
          </div>
          <h1 className="font-display text-xl font-bold text-[#faf6ee]">
            Verifying Administrator Access
          </h1>
          <p className="text-xs text-zinc-400">
            Checking your Firebase session and Firestore admin permissions...
          </p>
        </div>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="surface-panel rounded-2xl p-8 text-center space-y-5 border border-[#d4af37]/30">
          <div className="w-12 h-12 rounded-2xl bg-[#d4af37]/15 border border-[#d4af37]/40 mx-auto flex items-center justify-center">
            <Shield className="w-6 h-6 text-[#f6dc93]" />
          </div>
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold gold-gradient-text">
              Admin Sign-In Required
            </h1>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Sign in with your authorized administrator account to open the Aurelia Arena Admin Control Center.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => void signInWithGoogle().catch(() => {})}
              className="gold-button px-5 py-2.5 rounded-xl text-sm font-bold"
            >
              Sign In with Google
            </button>
            <Link
              to="/login"
              className="px-5 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-zinc-200"
            >
              Email Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-4 py-16">
        <div className="surface-panel rounded-2xl p-8 text-center space-y-4">
          <Shield className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="font-display text-2xl font-bold text-[#faf6ee]">Restricted Admin Area</h1>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Currently signed in as{' '}
            <span className="text-zinc-200 font-medium">{firebaseUser.email || firebaseUser.uid}</span>.
            Administrator access is enforced by Firebase Authentication and Firestore RBAC rules.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5 pt-1">
            <Link to="/" className="gold-button inline-block px-6 py-2.5 rounded-xl text-sm font-bold">
              Return Home
            </Link>
            <Link
              to="/profile"
              className="px-5 py-2.5 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-zinc-200"
            >
              Switch Account
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const adminEmail = firebaseUser.email || 'admin';
  const totalGamesPlayed = users.reduce((sum, u) => sum + (u.gamesPlayed || 0), 0);
  const activeUsers = users.filter((u) => u.status === 'active').length;
  const openReports = reports.filter((r) => r.status !== 'resolved').length;
  const pendingUpiCount = upiRequests.filter((r) => r.status === 'pending').length;

  const queryNorm = userSearch.trim().toLowerCase();
  const filteredUsers = users.filter((u) => {
    if (!queryNorm) return true;
    const email = (userEmails[u.uid] || '').toLowerCase();
    return (
      u.username.toLowerCase().includes(queryNorm) ||
      u.uid.toLowerCase().includes(queryNorm) ||
      email.includes(queryNorm)
    );
  });

  const filteredTx = suspiciousOnly
    ? transactions.filter((t) => Math.abs(t.amount) >= 25000 || t.type === 'admin_adjust')
    : transactions;

  const handleToggleUserStatus = async (u: PublicProfile) => {
    const next = u.status === 'active' ? 'suspended' : 'active';
    setSavingId(u.uid);
    try {
      await adminSetUserStatus(u.uid, next, u.username);
      setUsers((prev) => prev.map((x) => (x.uid === u.uid ? { ...x, status: next } : x)));
      pushToast(`User ${u.username} ${next === 'suspended' ? 'frozen' : 'unfrozen'}.`, 'gold');
    } catch {
      pushToast('Failed to update account status.', 'crimson');
    } finally {
      setSavingId(null);
    }
  };

  const handleManualAdjustSubmit = async (u: PublicProfile) => {
    const rawAmt = Math.round(Number(adjustAmount));
    if (!Number.isFinite(rawAmt) || rawAmt <= 0 || rawAmt > 1000000) {
      pushToast('Enter a valid amount between 1 and 1,000,000.', 'crimson');
      return;
    }
    const delta = adjustDirection === 'credit' ? rawAmt : -rawAmt;
    setSavingId(u.uid);
    try {
      const updated = await adminAdjustVirtualBalance(
        u.uid,
        delta,
        adjustReason.trim() || 'Manual admin adjustment',
        adjustBucket,
      );
      setUsers((prev) =>
        prev.map((x) =>
          x.uid === u.uid
            ? {
                ...x,
                balance: updated.totalBalance,
                depositBalance: updated.depositBalance,
                winningBalance: updated.winningBalance,
                bonusBalance: updated.bonusBalance,
              }
            : x,
        ),
      );
      setAdjustingUid(null);
      pushToast(
        `Applied ${delta > 0 ? '+' : ''}${delta.toLocaleString()} (${adjustBucket}) for ${u.username}. Audit logged.`,
        'emerald',
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Failed to adjust balance.', 'crimson');
    } finally {
      setSavingId(null);
    }
  };

  const handleReviewUpi = async (req: UpiRequestRecord, action: 'approved' | 'rejected') => {
    setSavingId(req.requestId);
    const refVal = (payoutRefs[req.requestId] || '').trim();
    const noteVal =
      (upiNotes[req.requestId] || '').trim() ||
      (action === 'approved'
        ? req.type === 'deposit'
          ? 'UTR verified & credited to Deposit Balance.'
          : 'UPI payout dispatched.'
        : req.type === 'withdrawal'
          ? 'Rejected — refunded to Winning Balance.'
          : 'UTR could not be matched.');

    try {
      await adminReviewUpiRequest({
        requestId: req.requestId,
        action,
        payoutRef: refVal,
        adminNote: noteVal,
      });
      setUpiRequests((prev) =>
        prev.map((r) =>
          r.requestId === req.requestId
            ? { ...r, status: action, payoutRef: refVal, adminNote: noteVal }
            : r,
        ),
      );
      pushToast(
        `UPI ${req.type} (${req.amount.toLocaleString()} coins) ${action} for ${req.username}.`,
        action === 'approved' ? 'emerald' : 'gold',
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to review UPI request', 'crimson');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveConfig = async (gameId: GameConfigDoc['gameId']) => {
    if (!configs) return;
    setSavingId(gameId);
    try {
      await saveGameConfig(configs[gameId]);
      await refreshConfigs();
      pushToast(`Saved ${gameId.replace('_', ' ')} configuration.`, 'emerald');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to save config', 'crimson');
    } finally {
      setSavingId(null);
    }
  };

  const handleSaveLiquiditySettings = async () => {
    setSavingId('liquidity_controls');
    try {
      const saved = await savePlatformLiquiditySettings(liquidityDraft);
      setLiquidityDraft(saved);
      await refreshConfigs();
      const label = LIQUIDITY_PRESET_DETAILS[saved.liquidityMode].label;
      pushToast(
        `Saved Platform Controls: ${label} (Cap ₹${saved.maxRoundPayoutCap.toLocaleString()}, Welcome Bonus ₹${saved.welcomeBonusAmount}, First-Deposit Withdraw Lock: ${saved.requireFirstDepositToWithdraw ? 'ON' : 'OFF'}).`,
        'emerald',
      );
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to save liquidity controls', 'crimson');
    } finally {
      setSavingId(null);
    }
  };

  const handleCreatePromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingId('create_promo');
    try {
      const created = await adminCreatePromoCode({
        code: newPromoCode,
        bonusAmount: Number(newPromoBonus),
        minDeposit: Number(newPromoMinDep) || 0,
        maxUses: Number(newPromoMaxUses) || 100,
        description: newPromoDesc,
      });
      setPromoCodes((prev) => [created, ...prev.filter((p) => p.code !== created.code)]);
      setNewPromoCode('');
      pushToast(`Promo code ${created.code} (+${created.bonusAmount} bonus) created!`, 'emerald');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to create promo code', 'crimson');
    } finally {
      setSavingId(null);
    }
  };

  const handleTogglePromo = async (p: PromoCodeDoc) => {
    setSavingId(p.code);
    try {
      await adminTogglePromoCode(p.code, !p.active);
      setPromoCodes((prev) => prev.map((x) => (x.code === p.code ? { ...x, active: !p.active } : x)));
      pushToast(`Promo ${p.code} ${!p.active ? 'activated' : 'paused'}.`, 'gold');
    } catch {
      pushToast('Unable to toggle promo code.', 'crimson');
    } finally {
      setSavingId(null);
    }
  };

  const handleDeletePromo = async (code: string) => {
    setSavingId(code);
    try {
      await adminDeletePromoCode(code);
      setPromoCodes((prev) => prev.filter((x) => x.code !== code));
      pushToast(`Promo ${code} deleted.`, 'gold');
    } catch {
      pushToast('Unable to delete promo code.', 'crimson');
    } finally {
      setSavingId(null);
    }
  };

  const handleUpdateReport = async (rep: ReportRecord, status: ReportRecord['status']) => {
    setSavingId(rep.reportId);
    const reply =
      (ticketReplies[rep.reportId] ?? rep.adminNote ?? '').trim() ||
      (status === 'resolved' ? 'Reviewed and resolved by Aurelia Arena Support.' : '');
    try {
      await adminUpdateReport(rep.reportId, status, reply, rep.userId, rep.username);
      setReports((prev) =>
        prev.map((r) => (r.reportId === rep.reportId ? { ...r, status, adminNote: reply } : r)),
      );
      pushToast(`Ticket ${rep.reportId.slice(0, 10)} updated to ${status}.`, 'emerald');
    } catch {
      pushToast('Failed to update ticket.', 'crimson');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold gold-gradient-text inline-flex items-center gap-3">
            <Shield className="w-7 h-7 text-[#d4af37]" />
            <span>Admin Control Center</span>
          </h1>
          <p className="text-xs text-zinc-400 mt-1">
            Authenticated as {adminEmail} · Firestore RBAC &amp; Audit Logging Enforced
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadData()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-medium text-zinc-200"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-1.5 bg-black/50 border border-white/10 rounded-xl p-1.5 text-xs">
        {(
          [
            { id: 'overview', label: 'Overview', Icon: Shield },
            { id: 'upi', label: `UPI & Payouts (${pendingUpiCount})`, Icon: ArrowLeftRight },
            { id: 'users', label: `Users (${users.length})`, Icon: Users },
            { id: 'games', label: 'Platform & Games', Icon: Gamepad2 },
            { id: 'promos', label: `Promo Codes (${promoCodes.length})`, Icon: Tag },
            { id: 'reports', label: `Support Tickets (${openReports})`, Icon: AlertTriangle },
            { id: 'wallet', label: 'Ledger & Audit', Icon: ClipboardList },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${
              tab === id ? 'bg-[#d4af37] text-[#09070d] font-semibold' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {tab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <div className="surface-panel rounded-2xl p-5 space-y-1">
              <div className="text-xs text-zinc-400">Total Users</div>
              <div className="font-mono-num text-3xl font-bold text-[#f6dc93]">{users.length}</div>
            </div>
            <div className="surface-panel rounded-2xl p-5 space-y-1">
              <div className="text-xs text-zinc-400">Pending UPI</div>
              <div className="font-mono-num text-3xl font-bold text-amber-300">{pendingUpiCount}</div>
            </div>
            <div className="surface-panel rounded-2xl p-5 space-y-1">
              <div className="text-xs text-zinc-400">Open Tickets</div>
              <div className="font-mono-num text-3xl font-bold text-rose-300">{openReports}</div>
            </div>
            <div className="surface-panel rounded-2xl p-5 space-y-1">
              <div className="text-xs text-zinc-400">Active Accounts</div>
              <div className="font-mono-num text-3xl font-bold text-emerald-300">{activeUsers}</div>
            </div>
            <div className="surface-panel rounded-2xl p-5 space-y-1">
              <div className="text-xs text-zinc-400">Games Played</div>
              <div className="font-mono-num text-3xl font-bold text-zinc-100">{totalGamesPlayed}</div>
            </div>
          </div>

          {/* Quick Liquidity & Risk Preset Summary Bar */}
          <div className="surface-panel rounded-2xl p-5 border border-[#d4af37]/25 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Active Liquidity &amp; Risk Preset
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded-md border text-xs font-bold ${
                    LIQUIDITY_PRESET_DETAILS[liquidityDraft.liquidityMode].badgeClass
                  }`}
                >
                  {LIQUIDITY_PRESET_DETAILS[liquidityDraft.liquidityMode].label}
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Max Round Cap:{' '}
                <span className="font-mono-num text-[#f6dc93] font-semibold">
                  ₹{liquidityDraft.maxRoundPayoutCap.toLocaleString()}
                </span>{' '}
                · Smart Matchmaking:{' '}
                <span className="text-zinc-200 font-semibold">
                  {liquidityDraft.smartMatchmakingEnabled
                    ? `Enabled (${liquidityDraft.matchmakingWaitSeconds}s wait)`
                    : 'Paused (Human-Only)'}
                </span>{' '}
                · Welcome Bonus:{' '}
                <span className="font-mono-num text-emerald-300 font-semibold">
                  ₹{liquidityDraft.welcomeBonusAmount}
                </span>{' '}
                · Withdraw Lock:{' '}
                <span className="text-zinc-200 font-semibold">
                  {liquidityDraft.requireFirstDepositToWithdraw ? '₹100+ First Deposit' : 'Disabled'}
                </span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTab('games')}
              className="gold-button inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold"
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Configure 4-Tier Controls</span>
            </button>
          </div>

          <div className="surface-panel rounded-2xl p-6 space-y-3">
            <h2 className="font-display text-lg font-bold text-[#faf6ee]">Latest Completed Matches</h2>
            {history.length === 0 ? (
              <p className="text-sm text-zinc-400">No match logs recorded yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="text-zinc-400 border-b border-white/10">
                    <tr>
                      <th className="py-2 pr-4">Player</th>
                      <th className="py-2 pr-4">Game</th>
                      <th className="py-2 pr-4">Summary</th>
                      <th className="py-2 text-right">Net Coins</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {history.slice(0, 12).map((h) => (
                      <tr key={h.historyId}>
                        <td className="py-2.5 pr-4 text-zinc-100">{h.username}</td>
                        <td className="py-2.5 pr-4 capitalize text-zinc-400">{h.game.replace('_', ' ')}</td>
                        <td className="py-2.5 pr-4 text-zinc-300">{h.summary}</td>
                        <td
                          className={`py-2.5 text-right font-mono-num font-semibold ${
                            h.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {h.netProfit >= 0 ? `+${h.netProfit}` : h.netProfit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: DIRECT UPI DEPOSITS & WITHDRAWAL PAYOUTS */}
      {tab === 'upi' && (
        <div className="space-y-4">
          {upiRequests.length === 0 ? (
            <div className="surface-panel rounded-2xl p-10 text-center text-sm text-zinc-400">
              No Direct UPI deposit or withdrawal requests have been submitted yet.
            </div>
          ) : (
            upiRequests.map((req) => {
              const isPending = req.status === 'pending';
              return (
                <div key={req.requestId} className="surface-panel rounded-2xl p-5 space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={`px-2 py-0.5 rounded font-semibold uppercase ${
                            req.type === 'deposit'
                              ? 'bg-[#d4af37]/15 text-[#f6dc93] border border-[#d4af37]/30'
                              : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          }`}
                        >
                          {req.type}
                        </span>
                        <span className="font-semibold text-zinc-100">{req.username}</span>
                        <span className="text-zinc-500 font-mono text-[11px]">{req.userId.slice(0, 12)}…</span>
                      </div>
                      <div className="font-mono-num text-xl font-bold text-white">
                        {req.amount.toLocaleString()} coins
                        {req.upiId && req.upiId !== 'N/A' && (
                          <span className="text-xs font-normal text-zinc-400"> · UPI: {req.upiId}</span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-400 flex flex-wrap gap-x-4 gap-y-1">
                        {req.utr && <span className="font-mono text-[#f6dc93]">UTR: {req.utr}</span>}
                        {req.payoutRef && (
                          <span className="font-mono text-emerald-300">Payout Ref: {req.payoutRef}</span>
                        )}
                        <span>
                          {getTimeMs(req.createdAt) ? new Date(getTimeMs(req.createdAt)).toLocaleString() : '—'}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize ${
                        req.status === 'approved'
                          ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                          : req.status === 'rejected'
                            ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                            : 'bg-amber-500/15 text-amber-200 border border-amber-500/30'
                      }`}
                    >
                      {req.status}
                    </span>
                  </div>

                  {isPending ? (
                    <div className="pt-3 border-t border-white/10 grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                      <input
                        type="text"
                        value={payoutRefs[req.requestId] || ''}
                        onChange={(e) =>
                          setPayoutRefs((prev) => ({ ...prev, [req.requestId]: e.target.value }))
                        }
                        placeholder="Payout / Bank Reference ID (e.g. IMPS9821...)"
                        className="md:col-span-4 bg-black/50 border border-white/15 rounded-xl px-3 py-2 font-mono text-xs text-white focus:outline-none focus:border-[#d4af37]"
                      />
                      <input
                        type="text"
                        value={upiNotes[req.requestId] || ''}
                        onChange={(e) =>
                          setUpiNotes((prev) => ({ ...prev, [req.requestId]: e.target.value }))
                        }
                        placeholder="Optional admin note..."
                        className="md:col-span-4 bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-[#d4af37]"
                      />
                      <div className="md:col-span-4 flex items-center gap-2">
                        <button
                          type="button"
                          disabled={savingId === req.requestId}
                          onClick={() => void handleReviewUpi(req, 'approved')}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#05140d] text-xs font-bold disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          disabled={savingId === req.requestId}
                          onClick={() => void handleReviewUpi(req, 'rejected')}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-bold disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    req.adminNote && (
                      <div className="text-xs text-zinc-400 border-t border-white/10 pt-2">
                        Admin Note: {req.adminNote}
                      </div>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: USER MANAGEMENT (Search by Email / Username / UID + Split Wallet + Manual Adjust + Freeze) */}
      {tab === 'users' && (
        <div className="surface-panel rounded-2xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px] max-w-md bg-black/50 border border-white/15 rounded-xl px-3.5 py-2">
              <Search className="w-4 h-4 text-zinc-400 shrink-0" />
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by email, username, or UID..."
                className="w-full bg-transparent text-sm text-white focus:outline-none"
              />
            </div>
            <span className="text-xs text-zinc-500">
              Showing {filteredUsers.length} of {users.length} accounts
            </span>
          </div>

          <div className="space-y-3">
            {filteredUsers.map((u) => {
              const b = extractWalletBuckets(u);
              const vip = computeVipProgress(u);
              const email = userEmails[u.uid] || '';
              const isOpenAdjust = adjustingUid === u.uid;

              return (
                <div
                  key={u.uid}
                  className="rounded-xl bg-black/40 border border-white/10 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-zinc-100">{u.username}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#d4af37]/15 text-[#f6dc93] border border-[#d4af37]/30 font-semibold">
                          VIP {vip.tier.label}
                        </span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded capitalize font-semibold ${
                            u.status === 'active'
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-rose-500/20 text-rose-300'
                          }`}
                        >
                          {u.status === 'suspended' ? 'Frozen' : 'Active'}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 flex flex-wrap gap-x-3 gap-y-0.5">
                        {email && <span className="text-zinc-300">{email}</span>}
                        <span className="font-mono text-[11px] text-zinc-500">UID: {u.uid}</span>
                        <span className="font-mono-num text-[11px]">
                          {u.wins}W / {u.gamesPlayed}G ({u.winRate}%) · Wagered {vip.wagered.toLocaleString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="text-right">
                        <div className="font-mono-num text-base font-bold text-[#f6dc93]">
                          {b.totalBalance.toLocaleString()} coins
                        </div>
                        <div className="text-[10px] font-mono-num text-zinc-400">
                          D:{b.depositBalance.toLocaleString()} · W:{b.winningBalance.toLocaleString()} · B:{b.bonusBalance.toLocaleString()}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            setAdjustingUid(isOpenAdjust ? null : u.uid);
                            setAdjustAmount('1000');
                            setAdjustDirection('credit');
                            setAdjustBucket('bonus');
                            setAdjustReason('Manual admin balance adjustment');
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#d4af37]/35 bg-[#d4af37]/12 hover:bg-[#d4af37]/20 text-xs font-semibold text-[#f6dc93]"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" />
                          <span>Adjust Wallet</span>
                        </button>
                        <button
                          type="button"
                          disabled={savingId === u.uid}
                          onClick={() => void handleToggleUserStatus(u)}
                          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold ${
                            u.status === 'active'
                              ? 'border-rose-500/35 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25'
                              : 'border-emerald-500/35 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                          }`}
                        >
                          {u.status === 'active' ? 'Freeze Account' : 'Unfreeze'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Inline Audit-Logged Manual Balance Adjustment Form */}
                  {isOpenAdjust && (
                    <div className="pt-3 border-t border-white/10 grid grid-cols-1 sm:grid-cols-12 gap-2.5 items-end text-xs">
                      <div className="sm:col-span-2">
                        <label className="text-zinc-400 block mb-1">Action</label>
                        <select
                          value={adjustDirection}
                          onChange={(e) => setAdjustDirection(e.target.value as 'credit' | 'debit')}
                          className="w-full bg-black/60 border border-white/15 rounded-lg px-2.5 py-2 text-white"
                        >
                          <option value="credit">+ Credit</option>
                          <option value="debit">- Debit</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-zinc-400 block mb-1">Bucket</label>
                        <select
                          value={adjustBucket}
                          onChange={(e) =>
                            setAdjustBucket(e.target.value as 'deposit' | 'winning' | 'bonus')
                          }
                          className="w-full bg-black/60 border border-white/15 rounded-lg px-2.5 py-2 text-white"
                        >
                          <option value="deposit">Deposit</option>
                          <option value="winning">Winning</option>
                          <option value="bonus">Bonus</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="text-zinc-400 block mb-1">Coins</label>
                        <input
                          type="number"
                          min={1}
                          max={1000000}
                          value={adjustAmount}
                          onChange={(e) => setAdjustAmount(e.target.value)}
                          className="w-full bg-black/60 border border-white/15 rounded-lg px-2.5 py-2 font-mono-num text-white"
                        />
                      </div>
                      <div className="sm:col-span-4">
                        <label className="text-zinc-400 block mb-1">Audit Reason</label>
                        <input
                          type="text"
                          value={adjustReason}
                          onChange={(e) => setAdjustReason(e.target.value)}
                          placeholder="Reason recorded in adminAuditLogs"
                          className="w-full bg-black/60 border border-white/15 rounded-lg px-2.5 py-2 text-white"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <button
                          type="button"
                          disabled={savingId === u.uid}
                          onClick={() => void handleManualAdjustSubmit(u)}
                          className="w-full gold-button py-2 rounded-lg font-bold disabled:opacity-45"
                        >
                          {savingId === u.uid ? '...' : 'Apply'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 4: PLATFORM & GAME CONTROLS (Unified 4-Tier Liquidity & Risk Controls + Maintenance + UPI + Support + APK) */}
      {tab === 'games' && configs && (
        <div className="space-y-6">
          {/* Unified 4-Tier Matchmaking & Liquidity Controls Card */}
          <div className="surface-panel rounded-2xl p-6 space-y-5 border border-[#d4af37]/30">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="font-display text-xl font-bold gold-gradient-text inline-flex items-center gap-2">
                    <SlidersHorizontal className="w-5 h-5 text-[#d4af37]" />
                    <span>Matchmaking &amp; Liquidity Controls</span>
                  </h2>
                  <span
                    className={`px-2.5 py-0.5 rounded-md border text-[11px] font-bold ${
                      LIQUIDITY_PRESET_DETAILS[liquidityDraft.liquidityMode].badgeClass
                    }`}
                  >
                    Active: {LIQUIDITY_PRESET_DETAILS[liquidityDraft.liquidityMode].label}
                  </span>
                </div>
                <p className="text-xs text-zinc-400">
                  Unified 4-tier platform preset stored in Firestore{' '}
                  <span className="font-mono text-zinc-300">settings/platform</span> and synced live across Ludo 3D,
                  Teen Patti 3D, Aviator, and Dragon Tiger.
                </p>
              </div>
              <button
                type="button"
                disabled={savingId === 'liquidity_controls'}
                onClick={() => void handleSaveLiquiditySettings()}
                className="gold-button inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold disabled:opacity-50 shrink-0"
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {savingId === 'liquidity_controls' ? 'Syncing...' : 'Save Liquidity Controls'}
                </span>
              </button>
            </div>

            {/* 4-Tier Preset Selector */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {(['easy', 'balanced', 'pro', 'ultra-pro'] as LiquidityMode[]).map((modeId) => {
                const meta = LIQUIDITY_PRESET_DETAILS[modeId];
                const isSelected = liquidityDraft.liquidityMode === modeId;
                return (
                  <button
                    key={modeId}
                    type="button"
                    onClick={() =>
                      setLiquidityDraft((prev) => ({ ...prev, liquidityMode: modeId }))
                    }
                    className={`text-left p-3.5 rounded-xl border transition-all ${
                      isSelected
                        ? meta.activeClass
                        : 'border-white/12 bg-black/40 text-zinc-300 hover:border-white/25 hover:bg-black/55'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-display text-sm font-bold">{meta.label}</span>
                      {isSelected && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                    </div>
                    <div className="text-[11px] opacity-80 mt-1 leading-snug">{meta.tagline}</div>
                  </button>
                );
              })}
            </div>

            {/* Live Impact Summary Across All 4 Games */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="rounded-xl bg-black/45 border border-white/10 p-3.5 space-y-1.5">
                <div className="font-semibold text-[#f6dc93] flex items-center justify-between">
                  <span>Ludo 3D &amp; Teen Patti 3D</span>
                  <span className="text-[10px] uppercase tracking-wider text-zinc-400">Opponent Skill</span>
                </div>
                <p className="text-zinc-300 leading-relaxed">
                  {LIQUIDITY_PRESET_DETAILS[liquidityDraft.liquidityMode].ludoTeenPatti}
                </p>
              </div>
              <div className="rounded-xl bg-black/45 border border-white/10 p-3.5 space-y-1.5">
                <div className="font-semibold text-[#f6dc93] flex items-center justify-between">
                  <span>Aviator</span>
                  <span className="font-mono-num text-[11px] text-emerald-300">
                    Cap ₹{computeEffectiveAviatorCap(liquidityDraft).toLocaleString()}
                  </span>
                </div>
                <p className="text-zinc-300 leading-relaxed">
                  {LIQUIDITY_PRESET_DETAILS[liquidityDraft.liquidityMode].aviatorCurve}
                </p>
              </div>
              <div className="rounded-xl bg-black/45 border border-white/10 p-3.5 space-y-1.5">
                <div className="font-semibold text-[#f6dc93] flex items-center justify-between">
                  <span>Dragon Tiger</span>
                  <span className="font-mono-num text-[11px] text-emerald-300">
                    Cap ₹{computeEffectiveDragonTigerCap(liquidityDraft).toLocaleString()}
                  </span>
                </div>
                <p className="text-zinc-300 leading-relaxed">
                  {LIQUIDITY_PRESET_DETAILS[liquidityDraft.liquidityMode].dragonTigerCap}
                </p>
              </div>
            </div>

            {/* Max Payout Cap + Smart Matchmaking Auto-Fill Toggle & Wait Timer */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1 border-t border-white/10 text-xs">
              <div className="space-y-1.5">
                <label className="text-zinc-300 font-medium block">
                  Max Single-Round Payout Cap (₹)
                </label>
                <input
                  type="number"
                  min={100}
                  max={5000000}
                  step={500}
                  value={liquidityDraft.maxRoundPayoutCap}
                  onChange={(e) =>
                    setLiquidityDraft((prev) => ({
                      ...prev,
                      maxRoundPayoutCap: Math.max(100, Math.min(5000000, Math.round(Number(e.target.value) || 0))),
                    }))
                  }
                  className="w-full bg-black/55 border border-white/15 rounded-xl px-3 py-2.5 font-mono-num text-sm text-white focus:outline-none focus:border-[#d4af37]"
                />
                <p className="text-[11px] text-zinc-500">
                  Base cap enforced on Aviator cashouts &amp; Dragon Tiger settlements (range ₹100 – ₹50,00,000).
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-zinc-300 font-medium block">
                  Smart Matchmaking Auto-Fill
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-black/55 border border-white/15 px-3.5 py-2.5 cursor-pointer">
                  <span className="text-zinc-200 font-medium">
                    {liquidityDraft.smartMatchmakingEnabled
                      ? 'Auto-Fill Empty Seats Enabled'
                      : 'Paused (Human Players Only)'}
                  </span>
                  <input
                    type="checkbox"
                    checked={liquidityDraft.smartMatchmakingEnabled}
                    onChange={(e) =>
                      setLiquidityDraft((prev) => ({
                        ...prev,
                        smartMatchmakingEnabled: e.target.checked,
                      }))
                    }
                    className="accent-[#d4af37] w-4 h-4 shrink-0"
                  />
                </label>
                <p className="text-[11px] text-zinc-500">
                  Fills waiting public Ludo &amp; Teen Patti tables seamlessly with natural 1.5s–4.5s reaction delays.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-zinc-300 font-medium">Matchmaking Wait Timer</label>
                  <span className="font-mono-num text-sm font-bold text-[#f6dc93]">
                    {liquidityDraft.matchmakingWaitSeconds}s
                  </span>
                </div>
                <div className="rounded-xl bg-black/55 border border-white/15 px-3.5 py-2.5 space-y-1">
                  <input
                    type="range"
                    min={5}
                    max={15}
                    step={1}
                    disabled={!liquidityDraft.smartMatchmakingEnabled}
                    value={liquidityDraft.matchmakingWaitSeconds}
                    onChange={(e) =>
                      setLiquidityDraft((prev) => ({
                        ...prev,
                        matchmakingWaitSeconds: Math.max(5, Math.min(15, Number(e.target.value))),
                      }))
                    }
                    className="w-full accent-[#d4af37] disabled:opacity-40"
                  />
                  <div className="flex justify-between text-[10px] font-mono-num text-zinc-500">
                    <span>5s</span>
                    <span>8s (default)</span>
                    <span>15s</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Welcome Signup Bonus & Anti-Abuse Bonus Protection Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/10 text-xs">
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-zinc-200 font-semibold">
                    First-Time Signup Bonus (₹)
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[0, 51, 100].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() =>
                          setLiquidityDraft((prev) => ({
                            ...prev,
                            welcomeBonusAmount: preset,
                          }))
                        }
                        className={`px-2.5 py-1 rounded-lg font-mono-num text-[11px] font-bold border transition-colors ${
                          liquidityDraft.welcomeBonusAmount === preset
                            ? 'bg-[#d4af37] text-[#09070d] border-[#f6dc93]'
                            : 'bg-black/50 text-zinc-300 border-white/15 hover:border-white/30'
                        }`}
                      >
                        ₹{preset}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  type="number"
                  min={0}
                  max={500}
                  step={1}
                  value={liquidityDraft.welcomeBonusAmount}
                  onChange={(e) =>
                    setLiquidityDraft((prev) => ({
                      ...prev,
                      welcomeBonusAmount: Math.max(0, Math.min(500, Math.round(Number(e.target.value) || 0))),
                    }))
                  }
                  className="w-full bg-black/55 border border-white/15 rounded-xl px-3 py-2.5 font-mono-num text-sm text-white focus:outline-none focus:border-[#d4af37]"
                />
                <p className="text-[11px] text-zinc-500">
                  Credited once strictly to Bonus Wallet on first sign-in (₹0 disables signup bonus; range ₹0 – ₹500).
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-zinc-200 font-semibold block">
                  Anti-Abuse First-Deposit Withdrawal Lock
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl bg-black/55 border border-white/15 px-3.5 py-2.5 cursor-pointer">
                  <span className="text-zinc-200 font-medium">
                    Require First Deposit to Withdraw (₹100+)
                  </span>
                  <input
                    type="checkbox"
                    checked={liquidityDraft.requireFirstDepositToWithdraw}
                    onChange={(e) =>
                      setLiquidityDraft((prev) => ({
                        ...prev,
                        requireFirstDepositToWithdraw: e.target.checked,
                      }))
                    }
                    className="accent-[#d4af37] w-4 h-4 shrink-0"
                  />
                </label>
                <p className="text-[11px] text-zinc-500">
                  Enforces 20% max bonus per bet (≤₹10 starter-table exception), ₹200 pre-deposit win cap, and ₹100+ approved deposit before UPI payouts.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {(['dragon_tiger', 'ludo', 'aviator', 'teen_patti', 'platform'] as const).map((gid) => {
            const c = configs[gid];
            return (
              <div key={gid} className="surface-panel rounded-2xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-lg font-bold text-[#faf6ee] capitalize">
                    {gid === 'platform' ? 'Platform UPI, Support & APK' : gid.replace('_', ' ')}
                  </h2>
                  <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={c.enabled}
                      onChange={(e) =>
                        setConfigs({ ...configs, [gid]: { ...c, enabled: e.target.checked } })
                      }
                      className="accent-[#d4af37] w-4 h-4"
                    />
                    <span className={c.enabled ? 'text-emerald-300 font-semibold' : 'text-rose-300 font-semibold'}>
                      {c.enabled ? 'Live' : 'Maintenance Mode'}
                    </span>
                  </label>
                </div>

                {gid !== 'platform' ? (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="text-zinc-400 block mb-1">Min Bet</label>
                        <input
                          type="number"
                          value={c.minBet}
                          onChange={(e) =>
                            setConfigs({ ...configs, [gid]: { ...c, minBet: Number(e.target.value) } })
                          }
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-2 font-mono-num text-white"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">Max Bet</label>
                        <input
                          type="number"
                          value={c.maxBet}
                          onChange={(e) =>
                            setConfigs({ ...configs, [gid]: { ...c, maxBet: Number(e.target.value) } })
                          }
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-2 font-mono-num text-white"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">Version</label>
                        <input
                          type="text"
                          value={c.version}
                          onChange={(e) =>
                            setConfigs({ ...configs, [gid]: { ...c, version: e.target.value } })
                          }
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-2 font-mono-num text-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-zinc-400 block mb-1">Maintenance Banner Message</label>
                      <input
                        type="text"
                        value={c.maintenanceMessage}
                        onChange={(e) =>
                          setConfigs({
                            ...configs,
                            [gid]: { ...c, maintenanceMessage: e.target.value },
                          })
                        }
                        placeholder="Shown to players when Maintenance Mode is active"
                        className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-white"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 text-xs">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-zinc-400 block mb-1">Active Deposit UPI ID</label>
                        <input
                          type="text"
                          value={c.depositUpiId ?? 'aureliaarena@ibl'}
                          onChange={(e) =>
                            setConfigs({ ...configs, [gid]: { ...c, depositUpiId: e.target.value } })
                          }
                          placeholder="aureliaarena@ibl"
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">UPI Payee Name</label>
                        <input
                          type="text"
                          value={c.depositUpiName ?? 'Aurelia Arena'}
                          onChange={(e) =>
                            setConfigs({ ...configs, [gid]: { ...c, depositUpiName: e.target.value } })
                          }
                          placeholder="Aurelia Arena"
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-zinc-400 block mb-1">
                        Deposit QR Image URL (HTTPS, optional — auto-generates QR if blank)
                      </label>
                      <input
                        type="url"
                        value={c.depositQrUrl || ''}
                        onChange={(e) =>
                          setConfigs({ ...configs, [gid]: { ...c, depositQrUrl: e.target.value } })
                        }
                        placeholder="https://example.com/upi-qr.png"
                        className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 font-mono text-white"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-zinc-400 block mb-1">WhatsApp Support URL (HTTPS)</label>
                        <input
                          type="url"
                          value={c.whatsappSupportUrl || ''}
                          onChange={(e) =>
                            setConfigs({
                              ...configs,
                              [gid]: { ...c, whatsappSupportUrl: e.target.value },
                            })
                          }
                          placeholder="https://wa.me/919999999999"
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 font-mono text-white"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">Telegram Channel URL (HTTPS)</label>
                        <input
                          type="url"
                          value={c.telegramSupportUrl ?? 'https://t.me/aureliaarena93'}
                          onChange={(e) =>
                            setConfigs({
                              ...configs,
                              [gid]: { ...c, telegramSupportUrl: e.target.value },
                            })
                          }
                          placeholder="https://t.me/aureliaarena93"
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 font-mono text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-zinc-400 block mb-1">
                        APK_DOWNLOAD_URL (Verified HTTPS, blank = Coming Soon)
                      </label>
                      <input
                        type="url"
                        value={c.apkDownloadUrl}
                        onChange={(e) =>
                          setConfigs({ ...configs, [gid]: { ...c, apkDownloadUrl: e.target.value } })
                        }
                        placeholder="https://downloads.example.com/aurelia-arena-v1.apk"
                        className="w-full bg-black/50 border border-white/15 rounded-lg px-3 py-2 font-mono text-white"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-zinc-400 block mb-1">APK Version</label>
                        <input
                          type="text"
                          value={c.apkVersion}
                          onChange={(e) =>
                            setConfigs({ ...configs, [gid]: { ...c, apkVersion: e.target.value } })
                          }
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 font-mono-num text-white"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">APK Size</label>
                        <input
                          type="text"
                          value={c.apkSize}
                          onChange={(e) =>
                            setConfigs({ ...configs, [gid]: { ...c, apkSize: e.target.value } })
                          }
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 font-mono-num text-white"
                        />
                      </div>
                      <div>
                        <label className="text-zinc-400 block mb-1">Updated Date</label>
                        <input
                          type="text"
                          value={c.apkUpdatedAt}
                          onChange={(e) =>
                            setConfigs({ ...configs, [gid]: { ...c, apkUpdatedAt: e.target.value } })
                          }
                          className="w-full bg-black/50 border border-white/15 rounded-lg px-2.5 py-1.5 font-mono-num text-white"
                        />
                      </div>
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  disabled={savingId === gid}
                  onClick={() => void handleSaveConfig(gid)}
                  className="gold-button inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingId === gid ? 'Saving...' : 'Save Configuration'}</span>
                </button>
              </div>
            );
          })}
          </div>
        </div>
      )}

      {/* TAB 5: PROMO CODE MANAGER */}
      {tab === 'promos' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <form
            onSubmit={(e) => void handleCreatePromo(e)}
            className="lg:col-span-5 surface-panel rounded-2xl p-6 space-y-4"
          >
            <h2 className="font-display text-xl font-bold text-[#faf6ee] inline-flex items-center gap-2">
              <Plus className="w-5 h-5 text-[#d4af37]" />
              <span>Create Promo Code</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Promo codes are validated atomically on the server and credited directly to player Bonus Balance. Built-in defaults: WELCOME500, AURELIA1000, VIP2500.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-zinc-400 block mb-1">Code (3–24 chars, A–Z / 0–9)</label>
                <input
                  type="text"
                  required
                  value={newPromoCode}
                  onChange={(e) =>
                    setNewPromoCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24))
                  }
                  placeholder="DIWALI1500"
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 font-mono uppercase tracking-widest text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-zinc-400 block mb-1">Bonus Coins</label>
                  <input
                    type="number"
                    required
                    min={50}
                    max={100000}
                    value={newPromoBonus}
                    onChange={(e) => setNewPromoBonus(e.target.value)}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-2.5 py-2 font-mono-num text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Min Deposit</label>
                  <input
                    type="number"
                    min={0}
                    max={100000}
                    value={newPromoMinDep}
                    onChange={(e) => setNewPromoMinDep(e.target.value)}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-2.5 py-2 font-mono-num text-white"
                  />
                </div>
                <div>
                  <label className="text-zinc-400 block mb-1">Max Uses</label>
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={newPromoMaxUses}
                    onChange={(e) => setNewPromoMaxUses(e.target.value)}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-2.5 py-2 font-mono-num text-white"
                  />
                </div>
              </div>

              <div>
                <label className="text-zinc-400 block mb-1">Description</label>
                <input
                  type="text"
                  value={newPromoDesc}
                  onChange={(e) => setNewPromoDesc(e.target.value)}
                  className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-white"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={savingId === 'create_promo' || newPromoCode.length < 3}
              className="w-full gold-button py-2.5 rounded-xl text-xs font-bold disabled:opacity-45"
            >
              {savingId === 'create_promo' ? 'Creating...' : 'Publish Promo Code'}
            </button>
          </form>

          <div className="lg:col-span-7 surface-panel rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-[#faf6ee]">
              Admin Promo Codes ({promoCodes.length})
            </h2>
            {promoCodes.length === 0 ? (
              <p className="text-sm text-zinc-400 py-8 text-center">
                No custom Firestore promo codes created yet. Create one on the left!
              </p>
            ) : (
              <div className="space-y-2.5">
                {promoCodes.map((p) => (
                  <div
                    key={p.code}
                    className="rounded-xl bg-black/40 border border-white/10 p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-[#f6dc93] tracking-wider">
                          {p.code}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            p.active
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-zinc-700/40 text-zinc-400'
                          }`}
                        >
                          {p.active ? 'Active' : 'Paused'}
                        </span>
                      </div>
                      <div className="text-zinc-400">
                        +{p.bonusAmount.toLocaleString()} Bonus · Min Dep ₹{p.minDeposit} · Used{' '}
                        <span className="font-mono-num text-zinc-200">
                          {p.usedCount}/{p.maxUses}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500">{p.description}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={savingId === p.code}
                        onClick={() => void handleTogglePromo(p)}
                        className="px-3 py-1.5 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-zinc-200"
                      >
                        {p.active ? 'Pause' : 'Activate'}
                      </button>
                      <button
                        type="button"
                        disabled={savingId === p.code}
                        onClick={() => void handleDeletePromo(p.code)}
                        aria-label={`Delete ${p.code}`}
                        className="p-1.5 rounded-lg border border-rose-500/35 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 6: SUPPORT TICKETS & REPORTS */}
      {tab === 'reports' && (
        <div className="space-y-4">
          {reports.length === 0 ? (
            <div className="surface-panel rounded-2xl p-10 text-center text-sm text-zinc-400">
              No player support tickets or fair-play reports submitted yet.
            </div>
          ) : (
            reports.map((rep) => (
              <div key={rep.reportId} className="surface-panel rounded-2xl p-6 space-y-3.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="text-xs text-zinc-400 capitalize flex flex-wrap items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-200">
                        {rep.category}
                      </span>
                      <span>
                        By <span className="text-zinc-100 font-semibold">{rep.username}</span>
                      </span>
                      {rep.utrRef && (
                        <span className="font-mono text-[#f6dc93]">UTR: {rep.utrRef}</span>
                      )}
                      {rep.targetUsername && <span>Target: {rep.targetUsername}</span>}
                    </div>
                    <h3 className="text-base font-semibold text-zinc-100 mt-1">{rep.subject}</h3>
                  </div>
                  <span
                    className={`text-xs font-semibold capitalize px-2.5 py-0.5 rounded-lg border ${
                      rep.status === 'resolved'
                        ? 'text-emerald-300 bg-emerald-500/15 border-emerald-500/35'
                        : rep.status === 'investigating'
                          ? 'text-amber-200 bg-amber-500/15 border-amber-500/35'
                          : 'text-rose-200 bg-rose-500/15 border-rose-500/35'
                    }`}
                  >
                    {rep.status}
                  </span>
                </div>

                <p className="text-sm text-zinc-300 leading-relaxed">{rep.message}</p>

                <div className="pt-3 border-t border-white/10 space-y-2.5">
                  <input
                    type="text"
                    value={ticketReplies[rep.reportId] ?? rep.adminNote ?? ''}
                    onChange={(e) =>
                      setTicketReplies((prev) => ({ ...prev, [rep.reportId]: e.target.value }))
                    }
                    placeholder="Type an official admin reply visible to the player..."
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#d4af37]"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    {(['open', 'investigating', 'resolved'] as const).map((st) => (
                      <button
                        key={st}
                        type="button"
                        disabled={savingId === rep.reportId}
                        onClick={() => void handleUpdateReport(rep, st)}
                        className={`px-3.5 py-1.5 rounded-lg text-xs capitalize font-semibold border ${
                          rep.status === st
                            ? 'border-[#d4af37] bg-[#d4af37]/20 text-[#f6dc93]'
                            : 'border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        Save &amp; Mark {st}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* TAB 7: WALLET MONITOR & IMMUTABLE ADMIN AUDIT LOGS */}
      {tab === 'wallet' && (
        <div className="space-y-6">
          {/* Admin Audit Logs */}
          <div className="surface-panel rounded-2xl p-6 space-y-4">
            <h2 className="font-display text-xl font-bold text-[#faf6ee] inline-flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-[#d4af37]" />
              <span>Admin Audit Logs ({auditLogs.length})</span>
            </h2>
            {auditLogs.length === 0 ? (
              <p className="text-sm text-zinc-400">
                No admin audit entries yet. Manual wallet adjustments, account freezes, promo changes, and ticket replies will appear here.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-zinc-400 border-b border-white/10">
                    <tr>
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Admin</th>
                      <th className="py-2 pr-3">Action</th>
                      <th className="py-2 pr-3">Target</th>
                      <th className="py-2 pr-3">Details</th>
                      <th className="py-2 text-right">Delta</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {auditLogs.map((log) => (
                      <tr key={log.logId}>
                        <td className="py-2.5 pr-3 text-zinc-500 whitespace-nowrap">
                          {getTimeMs(log.createdAt)
                            ? new Date(getTimeMs(log.createdAt)).toLocaleString()
                            : '—'}
                        </td>
                        <td className="py-2.5 pr-3 text-zinc-300">{log.adminEmail}</td>
                        <td className="py-2.5 pr-3 capitalize text-[#f6dc93]">
                          {log.action.replace(/_/g, ' ')}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-zinc-400">
                          {log.targetUsername || log.targetUid.slice(0, 14)}
                        </td>
                        <td className="py-2.5 pr-3 text-zinc-200">{log.reason}</td>
                        <td className="py-2.5 text-right font-mono-num">
                          {log.amount !== 0 ? (
                            <span className={log.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                              {log.amount >= 0 ? `+${log.amount.toLocaleString()}` : log.amount.toLocaleString()}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Virtual Coin Transaction Stream */}
          <div className="surface-panel rounded-2xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="font-display text-xl font-bold text-[#faf6ee] inline-flex items-center gap-2">
                <Coins className="w-5 h-5 text-[#d4af37]" />
                <span>Virtual Coin Transaction Stream</span>
              </h2>
              <label className="inline-flex items-center gap-2 text-xs text-zinc-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={suspiciousOnly}
                  onChange={(e) => setSuspiciousOnly(e.target.checked)}
                  className="accent-[#d4af37] w-4 h-4"
                />
                <span>Flag High-Value / Admin Adjustments (&ge; 25,000)</span>
              </label>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead className="text-zinc-400 border-b border-white/10">
                  <tr>
                    <th className="py-2.5 pr-4">Time / UID</th>
                    <th className="py-2.5 pr-4">Type</th>
                    <th className="py-2.5 pr-4">Description</th>
                    <th className="py-2.5 pr-4 text-right">Amount</th>
                    <th className="py-2.5 text-right">After</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredTx.map((t) => (
                    <tr key={t.txId}>
                      <td className="py-2.5 pr-4">
                        <div className="font-mono-num text-[11px] text-zinc-400">
                          {t.userId.slice(0, 14)}…
                        </div>
                        <div className="text-[11px] text-zinc-500">
                          {getTimeMs(t.createdAt)
                            ? new Date(getTimeMs(t.createdAt)).toLocaleString()
                            : '—'}
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 capitalize text-zinc-300">
                        {t.type.replace(/_/g, ' ')}
                      </td>
                      <td className="py-2.5 pr-4 text-zinc-200">{t.description}</td>
                      <td
                        className={`py-2.5 pr-4 text-right font-mono-num font-semibold ${
                          t.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'
                        }`}
                      >
                        {t.amount >= 0 ? `+${t.amount.toLocaleString()}` : t.amount.toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right font-mono-num text-zinc-100">
                        {t.balanceAfter.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
