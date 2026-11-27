import React, { useEffect, useState } from 'react';
import { CheckCircle2, Copy, Lock, ShieldCheck, X } from 'lucide-react';
import type { ProvablyFairProof } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  proof: ProvablyFairProof | null;
}

interface VerifiedOutcome {
  computedHash: string;
  hashMatches: boolean;
  aviatorCrash?: number;
  dragonCardLabel?: string;
  tigerCardLabel?: string;
  dtWinner?: 'dragon' | 'tiger' | 'tie';
  teenPattiSeat1?: string;
  teenPattiSeat2?: string;
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const SUIT_SYMBOLS: Record<string, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

function buildOrderedDeck() {
  const suits = ['spades', 'hearts', 'diamonds', 'clubs'] as const;
  const labels: Record<number, string> = {
    2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A',
  };
  const deck: Array<{ rank: number; label: string; suit: string }> = [];
  for (const suit of suits) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, label: labels[rank], suit });
    }
  }
  return deck;
}

export function ProvablyFairModal({ open, onClose, proof }: Props) {
  const [seedInput, setSeedInput] = useState('');
  const [hashInput, setHashInput] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState<VerifiedOutcome | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    if (proof) {
      setSeedInput(proof.serverSeed || '');
      setHashInput(proof.serverSeedHash || '');
      setVerified(null);
    }
  }, [proof, open]);

  useEffect(() => {
    if (!open || !proof || !seedInput.trim()) {
      setVerified(null);
      return;
    }

    let cancelled = false;
    setVerifying(true);

    (async () => {
      try {
        const cleanSeed = seedInput.trim();
        const computedHash = await sha256Hex(cleanSeed);
        const hashMatches = hashInput.trim().toLowerCase() === computedHash.toLowerCase();

        if (proof.game === 'aviator') {
          const hex52 = computedHash.slice(0, 13);
          const u = parseInt(hex52, 16) / Math.pow(2, 52);
          const aviatorCrash =
            u < 0.03 ? 1.0 : Math.min(50.0, Math.max(1.02, Math.floor((0.97 / (1 - u)) * 100) / 100));
          if (!cancelled) {
            setVerified({ computedHash, hashMatches, aviatorCrash });
          }
        } else if (proof.game === 'dragon_tiger') {
          const deck = buildOrderedDeck();
          const dHash = await sha256Hex(`${cleanSeed}:dragon`);
          const dIdx = parseInt(dHash.slice(0, 8), 16) % deck.length;
          const dCard = deck.splice(dIdx, 1)[0];

          const tHash = await sha256Hex(`${cleanSeed}:tiger`);
          const tIdx = parseInt(tHash.slice(0, 8), 16) % deck.length;
          const tCard = deck[tIdx];

          let dtWinner: 'dragon' | 'tiger' | 'tie' = 'tie';
          if (dCard.rank > tCard.rank) dtWinner = 'dragon';
          else if (tCard.rank > dCard.rank) dtWinner = 'tiger';

          if (!cancelled) {
            setVerified({
              computedHash,
              hashMatches,
              dragonCardLabel: `${dCard.label}${SUIT_SYMBOLS[dCard.suit]}`,
              tigerCardLabel: `${tCard.label}${SUIT_SYMBOLS[tCard.suit]}`,
              dtWinner,
            });
          }
        } else if (proof.game === 'teen_patti') {
          const deck = buildOrderedDeck();
          for (let i = deck.length - 1; i >= 1; i--) {
            const h = await sha256Hex(`${cleanSeed}:tp:${i}`);
            const j = parseInt(h.slice(0, 8), 16) % (i + 1);
            const tmp = deck[i];
            deck[i] = deck[j];
            deck[j] = tmp;
          }
          const fmt = (cards: Array<{ label: string; suit: string }>) =>
            cards.map((c) => `${c.label}${SUIT_SYMBOLS[c.suit]}`).join(' ');
          if (!cancelled) {
            setVerified({
              computedHash,
              hashMatches,
              teenPattiSeat1: fmt(deck.slice(0, 3)),
              teenPattiSeat2: fmt(deck.slice(3, 6)),
            });
          }
        } else {
          if (!cancelled) {
            setVerified({ computedHash, hashMatches });
          }
        }
      } catch {
        if (!cancelled) setVerified(null);
      } finally {
        if (!cancelled) setVerifying(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, proof, seedInput, hashInput]);

  if (!open || !proof) return null;

  const copyText = (val: string, field: string) => {
    if (!val) return;
    void navigator.clipboard?.writeText(val).catch(() => {});
    setCopiedField(field);
    window.setTimeout(() => setCopiedField(null), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-[#d4af37]/30 bg-[#0b0813] p-5 sm:p-6 shadow-2xl space-y-4 max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-[#d4af37]/15 border border-[#d4af37]/30 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-[#f0d377]" />
            </div>
            <div>
              <h3 className="font-display text-base sm:text-lg font-bold text-white">
                Provably Fair Verification
              </h3>
              <p className="text-[11px] text-zinc-400">
                SHA-256 Commit-Reveal · Round <span className="font-mono text-zinc-300">{proof.roundId}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white"
            aria-label="Close verifier"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3.5 text-xs text-zinc-300 leading-relaxed">
          Before each round starts, the server generates a cryptographic random seed and publishes its{' '}
          <span className="text-[#f0d377] font-semibold">SHA-256 hash</span> below. Because the hash is
          locked before bets close, the outcome cannot be altered mid-round. Once the round ends, the
          raw <span className="text-emerald-300 font-semibold">Server Seed</span> is revealed so your
          browser can independently recompute both the hash and the exact game outcome.
        </div>

        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
              <span className="uppercase tracking-wider">Committed SHA-256 Seed Hash (Pre-Round)</span>
              <button
                type="button"
                onClick={() => copyText(hashInput, 'hash')}
                className="inline-flex items-center gap-1 text-[#f0d377] hover:underline"
              >
                <Copy className="w-3 h-3" /> {copiedField === 'hash' ? 'Copied' : 'Copy'}
              </button>
            </div>
            <input
              type="text"
              value={hashInput}
              onChange={(e) => setHashInput(e.target.value)}
              className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-[11px] font-mono text-zinc-200 focus:outline-none focus:border-[#d4af37]/50"
            />
          </div>

          <div>
            <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
              <span className="uppercase tracking-wider">Revealed Server Seed (Post-Round)</span>
              {seedInput && (
                <button
                  type="button"
                  onClick={() => copyText(seedInput, 'seed')}
                  className="inline-flex items-center gap-1 text-emerald-300 hover:underline"
                >
                  <Copy className="w-3 h-3" /> {copiedField === 'seed' ? 'Copied' : 'Copy'}
                </button>
              )}
            </div>
            {proof.status === 'committed' && !seedInput ? (
              <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-400/25 px-3 py-2.5 text-xs text-amber-200">
                <Lock className="w-4 h-4 shrink-0" />
                <span>Round in progress — Server Seed stays sealed on the server until the round concludes.</span>
              </div>
            ) : (
              <input
                type="text"
                value={seedInput}
                onChange={(e) => setSeedInput(e.target.value)}
                placeholder="Paste any revealed serverSeed to verify locally..."
                className="w-full rounded-xl bg-black/50 border border-white/10 px-3 py-2 text-[11px] font-mono text-emerald-200 focus:outline-none focus:border-emerald-400/50"
              />
            )}
          </div>
        </div>

        {verified && (
          <div
            className={`rounded-xl border p-3.5 space-y-2 ${
              verified.hashMatches
                ? 'bg-emerald-500/10 border-emerald-400/30'
                : 'bg-rose-500/10 border-rose-400/30'
            }`}
          >
            <div className="flex items-center gap-2 text-xs font-semibold">
              <CheckCircle2
                className={`w-4 h-4 ${verified.hashMatches ? 'text-emerald-300' : 'text-rose-300'}`}
              />
              <span className={verified.hashMatches ? 'text-emerald-200' : 'text-rose-200'}>
                {verified.hashMatches
                  ? 'SHA-256 Commitment Verified Locally (100% Match)'
                  : 'Hash Mismatch — Entered seed does not match this hash'}
              </span>
            </div>

            <div className="text-[11px] font-mono text-zinc-400 break-all">
              SHA-256(seed): <span className="text-zinc-200">{verified.computedHash}</span>
            </div>

            {proof.game === 'aviator' && verified.aviatorCrash !== undefined && (
              <div className="pt-1 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-zinc-300">Recomputed Crash Multiplier:</span>
                <span className="font-display font-bold text-[#f0d377] text-sm">
                  {verified.aviatorCrash.toFixed(2)}x
                </span>
              </div>
            )}

            {proof.game === 'dragon_tiger' && verified.dragonCardLabel && verified.tigerCardLabel && (
              <div className="pt-1 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-zinc-300">Recomputed Cards:</span>
                <span className="font-mono font-bold text-white">
                  Dragon {verified.dragonCardLabel} vs Tiger {verified.tigerCardLabel} ·{' '}
                  <span className="text-[#f0d377] uppercase">{verified.dtWinner}</span>
                </span>
              </div>
            )}

            {proof.game === 'teen_patti' && verified.teenPattiSeat1 && verified.teenPattiSeat2 && (
              <div className="pt-1 border-t border-white/10 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Seat 1 Dealt Cards:</span>
                  <span className="font-mono font-bold text-[#f0d377]">{verified.teenPattiSeat1}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-zinc-300">Seat 2 Dealt Cards:</span>
                  <span className="font-mono font-bold text-white">{verified.teenPattiSeat2}</span>
                </div>
              </div>
            )}
          </div>
        )}

        {verifying && <div className="text-xs text-zinc-400">Computing WebCrypto SHA-256 digest...</div>}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="gold-button px-5 py-2 rounded-xl text-xs font-bold"
          >
            Close Verifier
          </button>
        </div>
      </div>
    </div>
  );
}
