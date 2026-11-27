import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  Coins,
  Copy,
  Download,
  Gift,
  History,
  Lock,
  QrCode,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Tag,
  Trophy,
  XCircle,
} from 'lucide-react';
import QRCode from 'qrcode';
import { VIRTUAL_COIN_DISCLAIMER } from '../config/assets';
import { useApp } from '../context/AppContext';
import { soundEngine } from '../services/soundEngine';
import {
  buildUpiPaymentIntentUrl,
  claimLowBalanceRefill,
  DEFAULT_DEPOSIT_UPI_NAME,
  fetchGameHistory,
  fetchUserTransactions,
  fetchUserUpiRequests,
  getTimeMs,
  getTodayUtcDateKey,
  redeemPromoCode,
  resolveActiveDepositUpi,
  submitUpiDepositRequest,
  submitUpiWithdrawalRequest,
  UPI_DAILY_WITHDRAWAL_LIMIT,
  UPI_WITHDRAWAL_COOLDOWN_MS,
} from '../services/walletService';
import type { GameHistoryRecord, UpiRequestRecord, WalletTransaction } from '../types';

function formatDateTime(ts: unknown): string {
  const ms = getTimeMs(ts);
  if (!ms) return 'Just now';
  return new Date(ms).toLocaleString();
}

function isSafeHttpsUrl(raw?: string): boolean {
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function UpiQrPreview({
  upiId,
  upiIntentUrl,
  qrImageUrl,
}: {
  upiId: string;
  upiIntentUrl: string;
  qrImageUrl?: string;
}) {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (isSafeHttpsUrl(qrImageUrl)) return;
    let active = true;
    void QRCode.toDataURL(upiIntentUrl, {
      width: 240,
      margin: 1,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0b0914',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [qrImageUrl, upiIntentUrl]);

  if (isSafeHttpsUrl(qrImageUrl)) {
    return (
      <img
        src={qrImageUrl}
        alt={`Direct UPI Payment QR for ${upiId}`}
        referrerPolicy="no-referrer"
        className="w-28 h-28 rounded-xl bg-white p-1.5 object-contain border border-[#d4af37]/40 shrink-0"
      />
    );
  }

  return (
    <div
      className="w-28 h-28 rounded-xl bg-white p-1.5 border border-[#d4af37]/50 shadow-inner shrink-0 flex items-center justify-center overflow-hidden"
      aria-label={`Live UPI QR Code for ${upiId}`}
    >
      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt={`Scan to pay ${upiId}`}
          className="w-full h-full object-contain"
        />
      ) : (
        <QrCode className="w-10 h-10 text-zinc-800 animate-pulse" />
      )}
    </div>
  );
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function downloadBrandedUpiQrPng(params: {
  upiId: string;
  merchantName: string;
  amount: string;
  upiIntentUrl: string;
  qrImageUrl?: string;
}): Promise<void> {
  const width = 640;
  const height = 820;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  // Crisp pure white outer padding border for reliable mobile QR scanning
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Subtle gold inner border framing the branded card
  drawRoundedRectPath(ctx, 24, 24, width - 48, height - 48, 28);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#d4af37';
  ctx.stroke();

  // Branded dark-gold header band
  drawRoundedRectPath(ctx, 44, 44, width - 88, 108, 20);
  const headerGrad = ctx.createLinearGradient(44, 44, width - 44, 152);
  headerGrad.addColorStop(0, '#16102b');
  headerGrad.addColorStop(1, '#261847');
  ctx.fillStyle = headerGrad;
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#f6dc93';
  ctx.font = 'bold 34px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(params.merchantName || 'Aurelia Arena', width / 2, 98);

  ctx.fillStyle = '#d4d4d8';
  ctx.font = '600 17px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('DIRECT UPI DEPOSIT QR', width / 2, 130);

  // Render QR onto off-screen canvas (or custom HTTPS QR image with safe fallback)
  const qrSize = 420;
  const qrX = (width - qrSize) / 2;
  const qrY = 178;

  let drewCustomImg = false;
  if (isSafeHttpsUrl(params.qrImageUrl)) {
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.crossOrigin = 'anonymous';
        el.onload = () => resolve(el);
        el.onerror = () => reject(new Error('QR image load failed'));
        el.src = params.qrImageUrl!;
      });
      ctx.drawImage(img, qrX, qrY, qrSize, qrSize);
      drewCustomImg = true;
    } catch {
      drewCustomImg = false;
    }
  }

  if (!drewCustomImg) {
    const qrCanvas = document.createElement('canvas');
    await QRCode.toCanvas(qrCanvas, params.upiIntentUrl, {
      width: qrSize,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: {
        dark: '#0b0914',
        light: '#ffffff',
      },
    });
    ctx.drawImage(qrCanvas, qrX, qrY, qrSize, qrSize);
  }

  // Subtle divider around QR quiet zone
  drawRoundedRectPath(ctx, qrX - 8, qrY - 8, qrSize + 16, qrSize + 16, 18);
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#e4e4e7';
  ctx.stroke();

  // Active UPI ID & Deposit Amount Pill
  ctx.fillStyle = '#18181b';
  ctx.font = 'bold 26px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
  ctx.fillText(params.upiId, width / 2, 650);

  const parsedAmt = Math.round(Number(params.amount));
  const displayAmt =
    Number.isFinite(parsedAmt) && parsedAmt >= 1 ? parsedAmt.toLocaleString('en-IN') : '1,000';

  drawRoundedRectPath(ctx, width / 2 - 140, 672, 280, 52, 14);
  ctx.fillStyle = '#fef3c7';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#d4af37';
  ctx.stroke();

  ctx.fillStyle = '#78350f';
  ctx.font = '800 26px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText(`Amount: ₹${displayAmt}`, width / 2, 707);

  ctx.fillStyle = '#52525b';
  ctx.font = '600 16px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
  ctx.fillText('Scan with PhonePe · Google Pay · Paytm', width / 2, 762);

  // Trigger instant PNG download
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  const downloadLink = document.createElement('a');
  downloadLink.download = 'aurelia-arena-upi-qr.png';
  if (blob) {
    const objectUrl = URL.createObjectURL(blob);
    downloadLink.href = objectUrl;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  } else {
    downloadLink.href = canvas.toDataURL('image/png');
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }
}

function UpiStatusTimelineCard({ req }: { req: UpiRequestRecord }) {
  const isApproved = req.status === 'approved';
  const isRejected = req.status === 'rejected';
  const isPending = req.status === 'pending';

  const steps = [
    {
      label: 'Submitted',
      done: true,
      active: false,
      failed: false,
    },
    {
      label: 'Under Review',
      done: isApproved || isRejected,
      active: isPending,
      failed: false,
    },
    {
      label: isRejected
        ? 'Rejected'
        : req.type === 'deposit'
          ? 'Approved / Credited'
          : 'Approved / Paid',
      done: isApproved,
      active: false,
      failed: isRejected,
    },
  ];

  return (
    <div className="rounded-xl bg-black/45 border border-white/10 p-4 space-y-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
              req.type === 'deposit'
                ? 'bg-[#d4af37]/15 text-[#f6dc93] border border-[#d4af37]/35'
                : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/35'
            }`}
          >
            {req.type === 'deposit' ? (
              <ArrowDownLeft className="w-4 h-4" />
            ) : (
              <ArrowUpRight className="w-4 h-4" />
            )}
          </span>
          <div>
            <div className="font-semibold text-zinc-100 capitalize">
              {req.type} ·{' '}
              <span className="font-mono-num text-[#f6dc93]">
                {req.amount.toLocaleString()} coins
              </span>
            </div>
            <div className="text-[11px] text-zinc-500">{formatDateTime(req.createdAt)}</div>
          </div>
        </div>

        <span
          className={`px-2.5 py-0.5 rounded-lg capitalize font-semibold border ${
            isApproved
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
              : isRejected
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/35'
                : 'bg-amber-500/15 text-amber-200 border-amber-500/35'
          }`}
        >
          {isPending ? 'Under Review' : isApproved ? 'Approved' : 'Rejected'}
        </span>
      </div>

      {/* Visual 3-Step Status Timeline */}
      <div className="grid grid-cols-3 gap-1.5 pt-1">
        {steps.map((step, i) => (
          <div key={step.label} className="space-y-1">
            <div className="flex items-center gap-1">
              <span
                className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                  step.failed
                    ? 'bg-rose-500/25 text-rose-300 border border-rose-400/50'
                    : step.done
                      ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-400/50'
                      : step.active
                        ? 'bg-amber-500/25 text-amber-200 border border-amber-400/60'
                        : 'bg-white/5 text-zinc-600 border border-white/10'
                }`}
              >
                {step.failed ? (
                  <XCircle className="w-3 h-3" />
                ) : step.done ? (
                  <CheckCircle2 className="w-3 h-3" />
                ) : (
                  <Clock className="w-2.5 h-2.5" />
                )}
              </span>
              {i < steps.length - 1 && (
                <div
                  className={`h-0.5 flex-1 rounded-full ${
                    step.done ? 'bg-emerald-500/55' : 'bg-white/10'
                  }`}
                />
              )}
            </div>
            <div
              className={`text-[10px] leading-tight font-medium ${
                step.failed
                  ? 'text-rose-300'
                  : step.done
                    ? 'text-emerald-200'
                    : step.active
                      ? 'text-amber-200'
                      : 'text-zinc-500'
              }`}
            >
              {step.label}
            </div>
          </div>
        ))}
      </div>

      <div className="text-zinc-400 flex flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-white/8">
        {req.upiId && req.upiId !== 'N/A' && <span>UPI: {req.upiId}</span>}
        {req.utr && <span className="font-mono text-zinc-300">UTR: {req.utr}</span>}
        {req.payoutRef && (
          <span className="font-mono text-emerald-300">Payout Ref: {req.payoutRef}</span>
        )}
      </div>

      {req.adminNote && (
        <div
          className={`rounded-lg px-2.5 py-1.5 text-[11px] border ${
            isRejected
              ? 'bg-rose-950/35 border-rose-500/30 text-rose-200'
              : 'bg-white/5 border-white/10 text-zinc-300'
          }`}
        >
          <span className="font-semibold">Admin Note:</span> {req.adminNote}
        </div>
      )}
    </div>
  );
}

export function WalletPage() {
  const {
    firebaseUser,
    profile,
    privateUser,
    balance,
    depositBalance,
    winningBalance,
    bonusBalance,
    gameConfigs,
    platformSettings,
    isGuestMode,
    pushToast,
  } = useApp();

  const totalDeposited = Math.max(0, Math.round(profile?.totalDeposited || 0));
  const hasCompletedFirstDeposit = totalDeposited >= 100;
  const withdrawalLockedByFirstDeposit =
    platformSettings.requireFirstDepositToWithdraw && !hasCompletedFirstDeposit;

  const [recentTx, setRecentTx] = useState<WalletTransaction[]>([]);
  const [upiRequests, setUpiRequests] = useState<UpiRequestRecord[]>([]);
  const [refilling, setRefilling] = useState(false);

  // Direct UPI Forms
  const [upiTab, setUpiTab] = useState<'deposit' | 'withdraw'>('deposit');
  const [depAmount, setDepAmount] = useState('1000');
  const [depUtr, setDepUtr] = useState('');
  const [wdAmount, setWdAmount] = useState('500');
  const [wdUpiId, setWdUpiId] = useState('');
  const [submittingUpi, setSubmittingUpi] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Promo Code Redemption State
  const [promoCodeInput, setPromoCodeInput] = useState('');
  const [redeemingPromo, setRedeemingPromo] = useState(false);

  // Timeline Tab on Wallet Desk
  const [timelineTab, setTimelineTab] = useState<'deposits' | 'withdrawals' | 'games'>('deposits');
  const [downloadingQr, setDownloadingQr] = useState(false);
  const [qrSaved, setQrSaved] = useState(false);

  const activePlatformUpi = resolveActiveDepositUpi(gameConfigs.platform.depositUpiId);
  const activeMerchantName = gameConfigs.platform.depositUpiName || DEFAULT_DEPOSIT_UPI_NAME;
  const activeQrUrl = gameConfigs.platform.depositQrUrl || '';
  const upiIntentHref = useMemo(
    () => buildUpiPaymentIntentUrl(activePlatformUpi, activeMerchantName, depAmount),
    [activeMerchantName, activePlatformUpi, depAmount],
  );

  const handleDownloadQr = async () => {
    if (downloadingQr) return;
    setDownloadingQr(true);
    try {
      await downloadBrandedUpiQrPng({
        upiId: activePlatformUpi,
        merchantName: activeMerchantName,
        amount: depAmount,
        upiIntentUrl: upiIntentHref,
        qrImageUrl: activeQrUrl,
      });
      soundEngine.playClick();
      setQrSaved(true);
      pushToast('QR Saved! Open PhonePe, GPay, or Paytm to scan from your gallery.', 'emerald');
      window.setTimeout(() => setQrSaved(false), 2600);
    } catch {
      pushToast('Unable to save QR image. Please try again.', 'crimson');
    } finally {
      setDownloadingQr(false);
    }
  };

  const loadWalletFeed = useCallback(async () => {
    if (!firebaseUser || isGuestMode) return;
    const [txs, reqs] = await Promise.all([
      fetchUserTransactions(firebaseUser.uid, 30).catch(() => []),
      fetchUserUpiRequests(firebaseUser.uid).catch(() => []),
    ]);
    setRecentTx(txs);
    setUpiRequests(reqs);
  }, [firebaseUser, isGuestMode]);

  useEffect(() => {
    void loadWalletFeed();
  }, [loadWalletFeed, balance]);

  // Live cooldown ticker for withdrawal protection
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const lastWdAt = privateUser?.lastWithdrawalAtMs || 0;
  const cooldownRemSec =
    lastWdAt > 0 ? Math.max(0, Math.ceil((lastWdAt + UPI_WITHDRAWAL_COOLDOWN_MS - nowMs) / 1000)) : 0;
  const todayKey = getTodayUtcDateKey();
  const dailyUsed =
    privateUser?.dailyWithdrawnDate === todayKey ? privateUser?.dailyWithdrawnTotal || 0 : 0;
  const dailyRemaining = Math.max(0, UPI_DAILY_WITHDRAWAL_LIMIT - dailyUsed);

  const depositRequests = useMemo(
    () => upiRequests.filter((r) => r.type === 'deposit'),
    [upiRequests],
  );
  const withdrawalRequests = useMemo(
    () => upiRequests.filter((r) => r.type === 'withdrawal'),
    [upiRequests],
  );
  const gameLedgerTx = useMemo(
    () => recentTx.filter((t) => ['bet', 'win', 'refund', 'promo_bonus'].includes(t.type)),
    [recentTx],
  );

  const handleRefill = async () => {
    if (!firebaseUser || isGuestMode) return;
    setRefilling(true);
    try {
      await claimLowBalanceRefill(firebaseUser.uid);
      soundEngine.playCoinReward();
      pushToast('Added +2,500 free playable virtual coins!', 'emerald');
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to claim refill', 'gold');
    } finally {
      setRefilling(false);
    }
  };

  const handleRedeemPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || isGuestMode) {
      pushToast('Sign in with Google to redeem promo codes.', 'gold');
      return;
    }
    if (!promoCodeInput.trim()) return;
    setRedeemingPromo(true);
    try {
      const res = await redeemPromoCode({
        uid: firebaseUser.uid,
        code: promoCodeInput,
        depositAmount: Number(depAmount) || 0,
      });
      soundEngine.playWinFanfare();
      pushToast(
        `Promo ${res.code} applied! +${res.bonusAmount.toLocaleString()} credited to Bonus Balance.`,
        'emerald',
      );
      setPromoCodeInput('');
      await loadWalletFeed();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Invalid promo code', 'crimson');
    } finally {
      setRedeemingPromo(false);
    }
  };

  const handleUpiDepositSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || isGuestMode) {
      pushToast('Sign in with Google to submit Direct UPI requests.', 'gold');
      return;
    }
    setSubmittingUpi(true);
    try {
      await submitUpiDepositRequest({
        uid: firebaseUser.uid,
        username: profile.username,
        amount: Number(depAmount),
        utr: depUtr,
      });
      soundEngine.playCoinReward();
      pushToast('UPI Deposit submitted for verification. Unique UTR locked.', 'emerald');
      setDepUtr('');
      setTimelineTab('deposits');
      await loadWalletFeed();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to submit deposit request', 'crimson');
    } finally {
      setSubmittingUpi(false);
    }
  };

  const handleUpiWithdrawSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || !profile || isGuestMode) {
      pushToast('Sign in with Google to request withdrawals.', 'gold');
      return;
    }
    if (withdrawalLockedByFirstDeposit) {
      pushToast('Make a minimum ₹100 first deposit to unlock instant UPI withdrawals', 'gold');
      return;
    }
    setSubmittingUpi(true);
    try {
      await submitUpiWithdrawalRequest({
        uid: firebaseUser.uid,
        username: profile.username,
        amount: Number(wdAmount),
        upiId: wdUpiId,
        totalDeposited,
      });
      soundEngine.playClick();
      pushToast('Withdrawal request queued atomically from Winning Balance.', 'emerald');
      setTimelineTab('withdrawals');
      await loadWalletFeed();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to submit withdrawal request', 'crimson');
    } finally {
      setSubmittingUpi(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold gold-gradient-text">Split-Balance Wallet</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Secure virtual coin wallet with Direct UPI deposits, instant withdrawals, promo codes, and segregated deposit, winning, and bonus balances.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/rewards"
            className="gold-button px-4 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Gift className="w-3.5 h-3.5" />
            <span>VIP & Rewards</span>
          </Link>
          <Link
            to="/transactions"
            className="px-4 py-2 rounded-xl border border-white/15 bg-white/5 text-xs font-medium text-zinc-200 hover:bg-white/10 inline-flex items-center gap-1.5"
          >
            <History className="w-3.5 h-3.5" />
            <span>Full Timeline</span>
          </Link>
        </div>
      </div>

      {/* Mandatory Virtual Coins Disclaimer */}
      <div className="surface-panel rounded-xl px-5 py-3.5 flex items-center gap-3 text-xs sm:text-sm text-[#f6dc93]">
        <ShieldCheck className="w-5 h-5 text-[#d4af37] shrink-0" />
        <span>{VIRTUAL_COIN_DISCLAIMER}</span>
      </div>

      {/* Total Balance Banner + 3 Split Buckets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Bucket 1: Deposit Balance */}
        <div className="surface-panel rounded-2xl p-5 border border-[#d4af37]/25 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-zinc-400">Deposit Balance</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-400/25">
              Playable Only
            </span>
          </div>
          <div className="font-mono-num text-2xl sm:text-3xl font-bold text-[#f6dc93]">
            {depositBalance.toLocaleString()}
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Used first across Dragon Tiger, Aviator, and Ludo tables. Cannot be withdrawn directly.
          </p>
        </div>

        {/* Bucket 2: Winning Balance */}
        <div className="surface-panel rounded-2xl p-5 border border-emerald-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-zinc-400">Winning Balance</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-200 border border-emerald-400/25 inline-flex items-center gap-1">
              <Trophy className="w-2.5 h-2.5" /> Withdrawable
            </span>
          </div>
          <div className="font-mono-num text-2xl sm:text-3xl font-bold text-emerald-300">
            {winningBalance.toLocaleString()}
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Earned strictly from verified game wins and Aviator cash-outs.{' '}
            {!isGuestMode && !hasCompletedFirstDeposit
              ? 'Capped at ₹200 until your first ₹100+ deposit unlocks unlimited withdrawals.'
              : 'Playable & instantly withdrawable via UPI.'}
          </p>
        </div>

        {/* Bucket 3: Bonus Balance */}
        <div className="surface-panel rounded-2xl p-5 border border-purple-500/30 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-zinc-400">Bonus Balance</span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/15 text-purple-200 border border-purple-400/25 inline-flex items-center gap-1">
              <Sparkles className="w-2.5 h-2.5" /> Promo & Rewards
            </span>
          </div>
          <div className="font-mono-num text-2xl sm:text-3xl font-bold text-purple-200">
            {bonusBalance.toLocaleString()}
          </div>
          <p className="text-[11px] text-zinc-400 leading-relaxed">
            Covers up to 20% of every bet across all games (100% on ≤₹10 starter tables when cash balance is ₹0).
          </p>
        </div>
      </div>

      {/* Total Combined & Free Refill Bar */}
      <div className="surface-panel rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Coins className="w-8 h-8 text-[#d4af37] shrink-0" />
          <div>
            <div className="text-xs uppercase tracking-widest text-zinc-400">Total Combined Balance</div>
            <div className="font-mono-num text-3xl font-bold gold-gradient-text">
              {balance.toLocaleString()} <span className="text-sm font-normal text-zinc-400">coins</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isGuestMode ? (
            <Link to="/register" className="gold-button px-5 py-2.5 rounded-xl text-sm font-bold">
              Sign In to Unlock UPI & Cloud Wallet
            </Link>
          ) : (
            <button
              type="button"
              disabled={refilling || balance >= 1000}
              onClick={() => void handleRefill()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#d4af37]/40 bg-[#d4af37]/15 text-[#f6dc93] text-xs sm:text-sm font-semibold disabled:opacity-45 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${refilling ? 'animate-spin' : ''}`} />
              <span>
                {balance < 1000 ? 'Claim Free +2,500 Refill' : 'Free Refill Below 1,000'}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* Direct UPI Deposit & Withdrawal Desk + Visual Status Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 surface-panel rounded-2xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold text-[#faf6ee]">Direct UPI Desk</h2>
            <div className="inline-flex bg-black/60 border border-white/10 rounded-xl p-1 text-xs">
              <button
                type="button"
                onClick={() => setUpiTab('deposit')}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold ${
                  upiTab === 'deposit' ? 'bg-[#d4af37] text-[#09070d]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ArrowDownLeft className="w-3.5 h-3.5" /> Deposit
              </button>
              <button
                type="button"
                onClick={() => setUpiTab('withdraw')}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg font-semibold ${
                  upiTab === 'withdraw' ? 'bg-emerald-400 text-[#05140d]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ArrowUpRight className="w-3.5 h-3.5" /> Withdraw
              </button>
            </div>
          </div>

          {isGuestMode ? (
            <div className="p-5 rounded-xl bg-black/40 border border-white/10 text-sm text-zinc-400 text-center space-y-3">
              <p>Sign in with a verified account to submit Direct UPI Deposit UTRs, redeem Promo Codes, or withdraw Winning Balance.</p>
              <Link to="/login" className="gold-button inline-block px-5 py-2 rounded-xl text-xs font-bold">
                Sign In Now
              </Link>
            </div>
          ) : upiTab === 'deposit' ? (
            <div className="space-y-5">
              {/* UPI QR Code + Direct Pay via UPI App Deep Link */}
              <div className="rounded-2xl bg-black/50 border border-[#d4af37]/30 p-4 flex flex-col sm:flex-row items-center gap-4">
                <UpiQrPreview
                  upiId={activePlatformUpi}
                  upiIntentUrl={upiIntentHref}
                  qrImageUrl={activeQrUrl}
                />
                <div className="w-full flex-1 min-w-0 space-y-2.5 text-center sm:text-left">
                  <div className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-zinc-400">
                    <QrCode className="w-3 h-3 text-[#d4af37]" />
                    <span>Scan QR or Pay Directly via UPI ({activeMerchantName})</span>
                  </div>
                  <div className="font-mono text-sm font-bold text-[#f6dc93] break-all">
                    {activePlatformUpi}
                  </div>
                  <div className="space-y-2 pt-0.5">
                    <a
                      href={upiIntentHref}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#041b11] text-xs font-extrabold shadow-lg transition-colors"
                    >
                      <Smartphone className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        Pay via UPI App (₹{Number(depAmount || 0).toLocaleString()})
                      </span>
                    </a>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          soundEngine.playClick();
                          void navigator.clipboard?.writeText(activePlatformUpi);
                          pushToast(`UPI ID ${activePlatformUpi} copied!`, 'gold');
                        }}
                        className="inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-semibold text-zinc-200 whitespace-nowrap"
                      >
                        <Copy className="w-3.5 h-3.5 shrink-0" />
                        <span>Copy UPI ID</span>
                      </button>
                      <button
                        type="button"
                        disabled={downloadingQr}
                        onClick={() => void handleDownloadQr()}
                        className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-xl border text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-60 ${
                          qrSaved
                            ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                            : 'bg-[#d4af37]/15 hover:bg-[#d4af37]/25 border-[#d4af37]/40 text-[#f6dc93]'
                        }`}
                      >
                        {qrSaved ? (
                          <>
                            <Check className="w-3.5 h-3.5 shrink-0" />
                            <span>QR Saved</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5 shrink-0" />
                            <span>{downloadingQr ? 'Saving...' : 'Download QR'}</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-zinc-500">
                    Open a UPI app directly or download the QR to scan from gallery in PhonePe, Google Pay, or Paytm, then submit your 12-digit UTR below.
                  </p>
                </div>
              </div>

              {/* Deposit UTR Form */}
              <form onSubmit={(e) => void handleUpiDepositSubmit(e)} className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  {[100, 500, 1000, 2500, 5000].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setDepAmount(String(preset))}
                      className={`px-3 py-1 rounded-lg font-mono-num text-xs font-semibold border ${
                        Number(depAmount) === preset
                          ? 'bg-[#d4af37] text-[#09070d] border-[#f6dc93]'
                          : 'bg-black/40 text-zinc-300 border-white/10 hover:border-white/25'
                      }`}
                    >
                      ₹{preset.toLocaleString()}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Amount (100 – 100,000)</label>
                  <input
                    type="number"
                    required
                    min={100}
                    max={100000}
                    value={depAmount}
                    onChange={(e) => setDepAmount(e.target.value)}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 font-mono-num text-sm text-white focus:outline-none focus:border-[#d4af37]"
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1">12-Digit UTR Reference Number</label>
                  <input
                    type="text"
                    required
                    maxLength={12}
                    pattern="[0-9]{12}"
                    value={depUtr}
                    onChange={(e) => setDepUtr(e.target.value.replace(/\D/g, '').slice(0, 12))}
                    placeholder="432198765432"
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 font-mono-num tracking-widest text-sm text-white focus:outline-none focus:border-[#d4af37]"
                  />
                  <p className="text-[11px] text-zinc-500 mt-1 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-[#d4af37]" />
                    Atomic duplicate-UTR protection rejects any previously used UTR instantly.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={submittingUpi}
                  className="w-full gold-button py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
                >
                  {submittingUpi ? 'Verifying UTR...' : 'Submit Deposit for Approval'}
                </button>
              </form>

              {/* Server-Validated Promo Code Box */}
              <form
                onSubmit={(e) => void handleRedeemPromo(e)}
                className="rounded-xl bg-purple-950/25 border border-purple-500/30 p-3.5 space-y-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-purple-200 inline-flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-purple-300" />
                    <span>Have a Promo Code?</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-400">
                    Try: WELCOME500
                  </span>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={promoCodeInput}
                    onChange={(e) =>
                      setPromoCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 24))
                    }
                    placeholder="ENTER PROMO CODE"
                    className="flex-1 bg-black/50 border border-purple-400/25 rounded-xl px-3 py-2 font-mono text-xs uppercase tracking-widest text-white focus:outline-none focus:border-purple-400"
                  />
                  <button
                    type="submit"
                    disabled={redeemingPromo || promoCodeInput.trim().length < 3}
                    className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold disabled:opacity-45 whitespace-nowrap"
                  >
                    {redeemingPromo ? 'Applying...' : 'Apply'}
                  </button>
                </div>
                <p className="text-[10px] text-zinc-400">
                  Validated atomically on server · Credits directly to your Bonus Balance (1 redemption per user).
                </p>
              </form>
            </div>
          ) : (
            <form onSubmit={(e) => void handleUpiWithdrawSubmit(e)} className="space-y-4">
              <div className="grid grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/25 p-3">
                  <div className="text-zinc-400">Withdrawable</div>
                  <div className="font-mono-num text-base font-bold text-emerald-300">
                    {winningBalance.toLocaleString()}
                  </div>
                </div>
                <div className="rounded-xl bg-black/40 border border-white/10 p-3">
                  <div className="text-zinc-400">Daily Limit Left</div>
                  <div className="font-mono-num text-base font-bold text-[#f6dc93]">
                    {dailyRemaining.toLocaleString()} / 50K
                  </div>
                </div>
              </div>

              {withdrawalLockedByFirstDeposit && (
                <div className="rounded-xl bg-amber-500/12 border border-amber-400/35 p-3.5 space-y-2.5 text-xs text-amber-100">
                  <div className="flex items-start gap-2.5">
                    <Lock className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="font-semibold text-[#f6dc93]">
                        Make a minimum ₹100 first deposit to unlock instant UPI withdrawals
                      </div>
                      <div className="text-[11px] text-amber-200/80">
                        Approved deposits so far:{' '}
                        <span className="font-mono-num font-bold text-white">
                          ₹{totalDeposited.toLocaleString()} / ₹100
                        </span>{' '}
                        · Pre-deposit bonus winnings are capped at ₹200.
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      setDepAmount('100');
                      setUpiTab('deposit');
                    }}
                    className="w-full gold-button py-2 rounded-lg text-xs font-bold"
                  >
                    Deposit ₹100+ Now to Unlock Withdrawals
                  </button>
                </div>
              )}

              {cooldownRemSec > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-400/30 text-xs text-amber-200">
                  <Clock className="w-4 h-4 shrink-0" />
                  <span>
                    5-minute withdrawal cooldown active — next request available in{' '}
                    <strong className="font-mono-num">{cooldownRemSec}s</strong>.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Amount (500 – 25,000)</label>
                  <input
                    type="number"
                    required
                    min={500}
                    max={25000}
                    disabled={withdrawalLockedByFirstDeposit}
                    value={wdAmount}
                    onChange={(e) => setWdAmount(e.target.value)}
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 font-mono-num text-sm text-white focus:outline-none focus:border-emerald-400 disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">Destination UPI ID</label>
                  <input
                    type="text"
                    required
                    disabled={withdrawalLockedByFirstDeposit}
                    value={wdUpiId}
                    onChange={(e) => setWdUpiId(e.target.value)}
                    placeholder="player@upi"
                    className="w-full bg-black/50 border border-white/15 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-400 disabled:opacity-50"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  submittingUpi ||
                  cooldownRemSec > 0 ||
                  winningBalance < 500 ||
                  withdrawalLockedByFirstDeposit
                }
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-[#05140d] text-sm font-bold disabled:opacity-45 transition-colors"
              >
                {withdrawalLockedByFirstDeposit
                  ? 'Deposit ₹100+ to Unlock Withdrawals'
                  : submittingUpi
                    ? 'Locking Winning Balance...'
                    : 'Request UPI Payout'}
              </button>
            </form>
          )}
        </div>

        {/* Visual Status Timeline Panel (Deposits / Withdrawals / Game Bets & Wins) */}
        <div className="lg:col-span-6 surface-panel rounded-2xl p-6 space-y-4 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-xl font-bold text-[#faf6ee]">Transaction Timeline</h2>
              <p className="text-[11px] text-zinc-400">
                Track Submitted → Under Review → Approved / Rejected status in real time.
              </p>
            </div>
            <Link to="/support" className="text-[11px] text-[#f6dc93] hover:underline">
              UTR Issue? Support →
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-1 bg-black/55 border border-white/10 rounded-xl p-1 text-xs">
            {(
              [
                { id: 'deposits', label: `Deposits (${depositRequests.length})` },
                { id: 'withdrawals', label: `Withdrawals (${withdrawalRequests.length})` },
                { id: 'games', label: `Game Bets/Wins` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTimelineTab(tab.id)}
                className={`py-1.5 px-2 rounded-lg font-semibold truncate transition-colors ${
                  timelineTab === tab.id
                    ? 'bg-[#d4af37] text-[#09070d]'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {isGuestMode ? (
            <p className="text-sm text-zinc-400 py-10 text-center">
              Sign in to track your Direct UPI deposits, payout references, and live status timeline.
            </p>
          ) : timelineTab === 'deposits' ? (
            depositRequests.length === 0 ? (
              <p className="text-sm text-zinc-400 py-10 text-center">
                No UPI deposit requests submitted yet.
              </p>
            ) : (
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {depositRequests.map((req) => (
                  <UpiStatusTimelineCard key={req.requestId} req={req} />
                ))}
              </div>
            )
          ) : timelineTab === 'withdrawals' ? (
            withdrawalRequests.length === 0 ? (
              <p className="text-sm text-zinc-400 py-10 text-center">
                No UPI withdrawal requests submitted yet.
              </p>
            ) : (
              <div className="space-y-3 max-h-[460px] overflow-y-auto pr-1">
                {withdrawalRequests.map((req) => (
                  <UpiStatusTimelineCard key={req.requestId} req={req} />
                ))}
              </div>
            )
          ) : gameLedgerTx.length === 0 ? (
            <p className="text-sm text-zinc-400 py-10 text-center">
              No game bets, wins, or promo credits recorded yet.
            </p>
          ) : (
            <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
              {gameLedgerTx.map((t) => (
                <div
                  key={t.txId}
                  className="rounded-xl bg-black/40 border border-white/10 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="text-zinc-100 font-medium truncate">{t.description}</div>
                    <div className="text-[11px] text-zinc-500 capitalize">
                      {t.type.replace(/_/g, ' ')} · {t.bucket || 'deposit'} · {formatDateTime(t.createdAt)}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div
                      className={`font-mono-num font-bold ${
                        t.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {t.amount >= 0 ? `+${t.amount.toLocaleString()}` : t.amount.toLocaleString()}
                    </div>
                    <div className="text-[10px] font-mono-num text-zinc-500">
                      Bal {t.balanceAfter.toLocaleString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Transactions Preview */}
      <div className="surface-panel rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold text-[#faf6ee]">Recent Atomic Transactions</h2>
          <Link to="/transactions" className="text-xs text-[#f6dc93] hover:underline">
            View Full Ledger →
          </Link>
        </div>

        {isGuestMode ? (
          <p className="text-sm text-zinc-400 py-6 text-center">
            Sign in with Google to record and audit your virtual coin transactions in Cloud Firestore.
          </p>
        ) : recentTx.length === 0 ? (
          <p className="text-sm text-zinc-400 py-6 text-center">
            No transactions recorded yet. Play a round or spin the daily bonus wheel.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-400 border-b border-white/10">
                <tr>
                  <th className="py-2.5 pr-4">Description</th>
                  <th className="py-2.5 pr-4">Bucket</th>
                  <th className="py-2.5 pr-4 text-right">Amount</th>
                  <th className="py-2.5 text-right">Balance After</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentTx.slice(0, 10).map((t) => (
                  <tr key={t.txId}>
                    <td className="py-3 pr-4">
                      <div className="text-zinc-100">{t.description}</div>
                      <div className="text-[11px] text-zinc-500">{formatDateTime(t.createdAt)}</div>
                    </td>
                    <td className="py-3 pr-4 text-xs capitalize text-zinc-400">
                      {t.bucket || 'deposit'}
                    </td>
                    <td
                      className={`py-3 pr-4 text-right font-mono-num font-semibold ${
                        t.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {t.amount >= 0 ? `+${t.amount.toLocaleString()}` : t.amount.toLocaleString()}
                    </td>
                    <td className="py-3 text-right font-mono-num text-zinc-200">
                      {t.balanceAfter.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export function TransactionsPage() {
  const { firebaseUser, isGuestMode } = useApp();
  const [rows, setRows] = useState<WalletTransaction[]>([]);
  const [upiRequests, setUpiRequests] = useState<UpiRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [section, setSection] = useState<'deposits' | 'withdrawals' | 'games' | 'all'>('deposits');

  useEffect(() => {
    if (!firebaseUser || isGuestMode) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void Promise.all([
      fetchUserTransactions(firebaseUser.uid, 120).catch(() => []),
      fetchUserUpiRequests(firebaseUser.uid).catch(() => []),
    ])
      .then(([txs, reqs]) => {
        setRows(txs);
        setUpiRequests(reqs);
      })
      .finally(() => setLoading(false));
  }, [firebaseUser, isGuestMode]);

  const deposits = useMemo(() => upiRequests.filter((r) => r.type === 'deposit'), [upiRequests]);
  const withdrawals = useMemo(() => upiRequests.filter((r) => r.type === 'withdrawal'), [upiRequests]);
  const gameRows = useMemo(
    () =>
      rows.filter((r) =>
        ['bet', 'win', 'refund', 'promo_bonus', 'daily_reward', 'spin_reward', 'referral_reward', 'mission_reward'].includes(
          r.type,
        ),
      ),
    [rows],
  );

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold gold-gradient-text">
            Transaction Status Timeline
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Visual verification timeline for Deposits & Withdrawals plus your immutable atomic Game Bets & Wins ledger.
          </p>
        </div>

        <div className="inline-flex flex-wrap items-center gap-1 bg-black/50 border border-white/10 rounded-xl p-1 text-xs">
          {(
            [
              { id: 'deposits', label: `Deposits (${deposits.length})` },
              { id: 'withdrawals', label: `Withdrawals (${withdrawals.length})` },
              { id: 'games', label: 'Game Bets / Wins' },
              { id: 'all', label: 'All Ledger' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSection(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap ${
                section === tab.id ? 'bg-[#d4af37] text-[#09070d] font-semibold' : 'text-zinc-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="surface-panel rounded-2xl p-6">
        {isGuestMode ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm text-zinc-400">Sign in to inspect your cloud virtual coin transactions and UPI timeline.</p>
            <Link to="/login" className="gold-button inline-block px-5 py-2.5 rounded-xl text-sm font-bold">
              Log In
            </Link>
          </div>
        ) : loading ? (
          <div className="py-12 text-center text-sm text-zinc-400">Loading timeline & ledger...</div>
        ) : section === 'deposits' ? (
          deposits.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-400">
              No deposit requests yet. Submit a Direct UPI deposit from your Wallet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {deposits.map((req) => (
                <UpiStatusTimelineCard key={req.requestId} req={req} />
              ))}
            </div>
          )
        ) : section === 'withdrawals' ? (
          withdrawals.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-400">
              No withdrawal requests yet. Request a Winning Balance payout from your Wallet.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {withdrawals.map((req) => (
                <UpiStatusTimelineCard key={req.requestId} req={req} />
              ))}
            </div>
          )
        ) : (
          (() => {
            const list = section === 'games' ? gameRows : rows;
            if (list.length === 0) {
              return (
                <div className="py-12 text-center text-sm text-zinc-400">
                  No matching transactions found.
                </div>
              );
            }
            return (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs text-zinc-400 border-b border-white/10">
                    <tr>
                      <th className="py-2.5 pr-4">Date & Time</th>
                      <th className="py-2.5 pr-4">Type / Bucket</th>
                      <th className="py-2.5 pr-4">Description</th>
                      <th className="py-2.5 pr-4 text-right">Delta</th>
                      <th className="py-2.5 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {list.map((t) => (
                      <tr key={t.txId}>
                        <td className="py-3 pr-4 text-xs text-zinc-400 whitespace-nowrap">
                          {formatDateTime(t.createdAt)}
                        </td>
                        <td className="py-3 pr-4 text-xs capitalize text-zinc-300 whitespace-nowrap">
                          {t.type.replace(/_/g, ' ')}
                          {t.bucket && <span className="text-zinc-500"> · {t.bucket}</span>}
                        </td>
                        <td className="py-3 pr-4 text-zinc-200">{t.description}</td>
                        <td
                          className={`py-3 pr-4 text-right font-mono-num font-semibold whitespace-nowrap ${
                            t.amount >= 0 ? 'text-emerald-300' : 'text-rose-300'
                          }`}
                        >
                          {t.amount >= 0 ? `+${t.amount.toLocaleString()}` : t.amount.toLocaleString()}
                        </td>
                        <td className="py-3 text-right font-mono-num text-zinc-100 whitespace-nowrap">
                          {t.balanceAfter.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()
        )}
      </div>
    </div>
  );
}

export function GameHistoryPage() {
  const { firebaseUser, isGuestMode } = useApp();
  const [rows, setRows] = useState<GameHistoryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [gameFilter, setGameFilter] = useState<'all' | 'dragon_tiger' | 'ludo' | 'aviator' | 'teen_patti'>('all');
  const [scope, setScope] = useState<'mine' | 'global'>(firebaseUser ? 'mine' : 'global');

  useEffect(() => {
    setLoading(true);
    const uid = scope === 'mine' && firebaseUser && !isGuestMode ? firebaseUser.uid : undefined;
    void fetchGameHistory(uid, 80)
      .then(setRows)
      .finally(() => setLoading(false));
  }, [firebaseUser, isGuestMode, scope]);

  const filtered =
    gameFilter === 'all' ? rows : rows.filter((r) => r.game === gameFilter);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold gold-gradient-text">Game History</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Verified match results with SHA-256 Provably Fair seed hashes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isGuestMode && (
            <div className="inline-flex bg-black/50 border border-white/10 rounded-xl p-1 text-xs">
              <button
                type="button"
                onClick={() => setScope('mine')}
                className={`px-3 py-1.5 rounded-lg ${
                  scope === 'mine' ? 'bg-purple-800 text-white font-semibold' : 'text-zinc-400'
                }`}
              >
                My Matches
              </button>
              <button
                type="button"
                onClick={() => setScope('global')}
                className={`px-3 py-1.5 rounded-lg ${
                  scope === 'global' ? 'bg-purple-800 text-white font-semibold' : 'text-zinc-400'
                }`}
              >
                Global Feed
              </button>
            </div>
          )}

          <div className="inline-flex bg-black/50 border border-white/10 rounded-xl p-1 text-xs">
            {(
              [
                { id: 'all', label: 'All' },
                { id: 'teen_patti', label: 'Teen Patti' },
                { id: 'dragon_tiger', label: 'Dragon Tiger' },
                { id: 'ludo', label: 'Ludo' },
                { id: 'aviator', label: 'Aviator' },
              ] as const
            ).map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGameFilter(g.id)}
                className={`px-3 py-1.5 rounded-lg whitespace-nowrap ${
                  gameFilter === g.id ? 'bg-[#d4af37] text-[#09070d] font-semibold' : 'text-zinc-400'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="surface-panel rounded-2xl p-6">
        {loading ? (
          <div className="py-12 text-center text-sm text-zinc-400">Loading match history...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-zinc-400">
            No completed matches recorded yet for this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-zinc-400 border-b border-white/10">
                <tr>
                  <th className="py-2.5 pr-4">Player / Time</th>
                  <th className="py-2.5 pr-4">Game</th>
                  <th className="py-2.5 pr-4">Result Summary</th>
                  <th className="py-2.5 pr-4 text-right">Wager</th>
                  <th className="py-2.5 pr-4 text-right">Net Coins</th>
                  <th className="py-2.5 text-right">Seed Hash</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.map((h) => (
                  <tr key={h.historyId}>
                    <td className="py-3 pr-4">
                      <div className="text-zinc-100 font-medium">{h.username}</div>
                      <div className="text-[11px] text-zinc-500">{formatDateTime(h.createdAt)}</div>
                    </td>
                    <td className="py-3 pr-4 text-xs capitalize text-zinc-300 whitespace-nowrap">
                      {h.game.replace('_', ' ')}
                    </td>
                    <td className="py-3 pr-4 text-zinc-200">{h.summary}</td>
                    <td className="py-3 pr-4 text-right font-mono-num text-zinc-400 whitespace-nowrap">
                      {h.betAmount.toLocaleString()}
                    </td>
                    <td
                      className={`py-3 pr-4 text-right font-mono-num font-semibold whitespace-nowrap ${
                        h.netProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                      }`}
                    >
                      {h.netProfit >= 0 ? `+${h.netProfit.toLocaleString()}` : h.netProfit.toLocaleString()}
                    </td>
                    <td className="py-3 text-right font-mono-num text-[11px] text-zinc-500">
                      {h.seedHash ? `${h.seedHash.slice(0, 10)}…` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
