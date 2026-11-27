import React from 'react';
import { BookOpen, ShieldCheck, Sparkles, X } from 'lucide-react';
import type { GameId } from '../types';

interface GameRulesModalProps {
  open: boolean;
  game: GameId;
  onClose: () => void;
}

const RULES_CONTENT: Record<
  GameId,
  {
    title: string;
    subtitle: string;
    rules: string[];
    payouts: Array<{ label: string; value: string; note: string }>;
    fairSteps: string[];
  }
> = {
  aviator: {
    title: 'Aviator 3D — How to Play & Payouts',
    subtitle: 'Server-authoritative crash curve with dual bet panels & Auto Cash-Out.',
    rules: [
      'Place 1 or 2 independent bets during the 5-second countdown (or queue your wager for the next takeoff).',
      'As the aircraft climbs from 1.00× upward, your potential payout equals Wager × Live Multiplier.',
      'Tap Cash Out before the aircraft stalls/crashes to lock your winnings directly into your Winning Balance.',
      'Enable Auto Cash-Out (e.g., 2.00×) to let the server settle your payout automatically the instant your target is reached.',
      'If the aircraft crashes before you cash out, the active flight wager is forfeited.',
    ],
    payouts: [
      { label: 'Cash Out @ 1.50×', value: '1.50×', note: 'e.g. 1,000 coins → 1,500 coins' },
      { label: 'Cash Out @ 2.00×', value: '2.00×', note: 'e.g. 1,000 coins → 2,000 coins' },
      { label: 'Cash Out @ 10.00×', value: '10.00×', note: 'e.g. 1,000 coins → 10,000 coins' },
      { label: 'Maximum Crash Curve', value: 'Up to 100×', note: 'Cryptographically generated pre-takeoff' },
    ],
    fairSteps: [
      'Before takeoff, the server generates a random secret Server Seed and locks the crash point, publishing its SHA-256 hash in the bottom-right corner.',
      'The crash point is fixed before any player bets and cannot change mid-flight.',
      'After the round crashes, tap the Fair button in the header to reveal the Server Seed and verify that SHA-256(Server Seed) matches the committed hash.',
    ],
  },
  dragon_tiger: {
    title: 'Dragon Tiger Live — How to Play & Payouts',
    subtitle: 'High-speed casino card showdown dealt from a fair 52-card server deck.',
    rules: [
      'Select a chip denomination (1, 10, 50, 100, 500, or 1K) and tap Dragon, Tie, or Tiger during the 15-second betting window.',
      'When betting closes, one card is dealt face-up to Dragon and one card to Tiger.',
      'Higher card rank wins immediately: Ace (High) > K > Q > J > 10 > 9 … > 2. Suits do not break ties.',
      'Use Undo, Clear, 2× Double, or Rebet controls at any time before betting closes.',
    ],
    payouts: [
      { label: 'Dragon Win', value: '1 : 1 (2×)', note: '100% profit on winning stake' },
      { label: 'Tiger Win', value: '1 : 1 (2×)', note: '100% profit on winning stake' },
      { label: 'Tie Win', value: '8 : 1 (9×)', note: 'Equal card ranks on both sides' },
      { label: 'Dragon / Tiger on Tie', value: '50% Refund', note: 'Half your main side bet returns to Deposit Balance' },
    ],
    fairSteps: [
      'Every round commits a SHA-256 hash of the server seed BEFORE the betting countdown completes.',
      'Both cards are derived deterministically on the server from that committed seed independent of table bets.',
      'Tap the Fair button after any deal to inspect the revealed Server Seed and verify SHA-256 integrity.',
    ],
  },
  ludo: {
    title: 'Ludo 3D — Modes, Rules & Payouts',
    subtitle: 'Quick 1-Token, Classic 1v1 & 4-Player, and Private Friends Rooms.',
    rules: [
      'Quick Mode (1-Token Win): Fast-paced match — the first player to bring 1 token safely into the center home wins immediately!',
      'Classic Mode (1v1 & 4-Player): Traditional Ludo rules — bring all 4 tokens home to claim the crown.',
      'Private Room: Generate a 6-character code and share via 1-click Copy or WhatsApp to play directly with friends.',
      'Roll a 6 to exit your yard. Landing on an opponent on an unprotected square captures them and grants a bonus roll.',
      'Star-marked cells are Safe Zones. Rolling three 6s in a row forfeits the turn; 3 skipped turns (15s clock) auto-forfeit.',
    ],
    payouts: [
      { label: '1v1 (2-Player Match)', value: '2× Entry Pot', note: 'Winner takes the full 2-player entry pot' },
      { label: '3-Player Match', value: '3× Entry Pot', note: 'Winner takes all 3 entry stakes' },
      { label: '4-Player Match', value: '4× Entry Pot', note: 'Winner takes the full 4-player pot' },
      { label: 'Bonus Balance Cap', value: 'Up to 50%', note: 'Use Bonus Balance for half of Ludo entry stakes' },
    ],
    fairSteps: [
      'Every dice roll and timeout auto-move is generated server-side via cryptographic SHA-256 randomness.',
      'Online moves are validated by the server move validator so no player can teleport or spoof dice.',
      'Tap the Fair button in the top bar after any roll to view the exact Server Seed and SHA-256 hash.',
    ],
  },
  teen_patti: {
    title: 'Teen Patti 3D — Hand Rankings & Rules',
    subtitle: 'Authentic 5-seat Indian 3-Card Poker with Blind/Chaal, Side Show & SHA-256 Fair Deck.',
    rules: [
      'Choose a Boot Table (₹1, ₹5, ₹10, ₹50, ₹100, or ₹500) or create a Private Table with a 6-digit code. Everyone posts the Boot into the Pot to begin.',
      'Play BLIND (1× table stake) without looking at your cards, or tap SEE over your cards to reveal them and switch to SEEN (2× Chaal stake). You can raise 2× with the + button.',
      'Hand Rankings (Highest → Lowest): 1) Trail/Trio (A-A-A) · 2) Pure Sequence (A-K-Q > A-2-3 > K-Q-J … > 4-3-2 same suit) · 3) Sequence (straight) · 4) Color (flush) · 5) Pair · 6) High Card.',
      'SIDE SHOW: When you and the previous active player are both Seen (and >2 players remain), request a private comparison. If accepted, the lower hand auto-packs (exact tie favors defender).',
      'SHOW: When 2 active players remain (or when the Pot Limit is reached), all cards flip face-up and the highest hand wins the Pot minus 10% platform rake.',
      'Each turn has a 15-second countdown clock; expiring timers automatically Pack to keep tables fast.',
    ],
    payouts: [
      { label: 'Showdown Winner', value: 'Pot − 10% Rake', note: 'Credited atomically to Winning Balance' },
      { label: 'Chaal Limit', value: '128× Boot', note: 'e.g. ₹10 Boot → ₹1,280 max Chaal' },
      { label: 'Pot Limit (Auto-Show)', value: '1,024× Boot', note: 'e.g. ₹10 Boot → ₹10,240 max Pot' },
      { label: 'Top Hand (Trail)', value: 'A♠ A♥ A♦', note: 'Beats Pure Sequence, Sequence, Color, Pair & High Card' },
    ],
    fairSteps: [
      'Before cards are dealt, the server shuffles the 52-card deck via deterministic Fisher-Yates SHA-256 from a secret Server Seed and publishes its SHA-256 hash.',
      'The Server Seed stays sealed on the server throughout Blind, Chaal, and Side Show actions.',
      'After Showdown, tap the Fair button in the header to reveal the Server Seed and verify the exact SHA-256 commitment and dealt cards in your browser.',
    ],
  },
};

export const GameRulesModal: React.FC<GameRulesModalProps> = ({ open, game, onClose }) => {
  if (!open) return null;
  const content = RULES_CONTENT[game];

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-3 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={content.title}
    >
      <div
        className="w-full max-w-lg max-h-[88dvh] overflow-y-auto rounded-2xl border border-[#d4af37]/45 bg-[#0d0a1a] p-5 sm:p-6 space-y-5 shadow-[0_24px_60px_rgba(0,0,0,0.85)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#f6dc93]">
              <BookOpen className="w-3.5 h-3.5 text-[#d4af37]" />
              <span>How to Play & Payouts</span>
            </div>
            <h2 className="font-display text-lg sm:text-xl font-bold text-[#faf6ee]">
              {content.title}
            </h2>
            <p className="text-xs text-zinc-400">{content.subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close rules modal"
            className="w-8 h-8 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 flex items-center justify-center text-zinc-300 shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Payout Multipliers Table */}
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[#f6dc93] inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-[#d4af37]" />
            <span>Payout Multipliers</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {content.payouts.map((p) => (
              <div
                key={p.label}
                className="rounded-xl bg-black/45 border border-white/10 px-3.5 py-2.5 flex flex-col justify-between gap-0.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-zinc-200">{p.label}</span>
                  <span className="font-mono-num text-xs font-bold text-emerald-300">{p.value}</span>
                </div>
                <span className="text-[11px] text-zinc-500">{p.note}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Game Rules */}
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-300">
            Official Rules
          </div>
          <ul className="space-y-1.5 text-xs text-zinc-300 leading-relaxed">
            {content.rules.map((rule, idx) => (
              <li key={idx} className="flex items-start gap-2">
                <span className="font-mono-num text-[10px] font-bold text-[#f6dc93] bg-[#d4af37]/15 border border-[#d4af37]/30 rounded w-4 h-4 flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span>{rule}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Provably Fair Verification */}
        <div className="rounded-xl bg-emerald-950/30 border border-emerald-500/30 p-3.5 space-y-2">
          <div className="text-xs font-bold text-emerald-300 inline-flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            <span>Provably Fair SHA-256 Verification</span>
          </div>
          <ul className="space-y-1 text-[11px] text-emerald-100/85 leading-relaxed">
            {content.fairSteps.map((step, idx) => (
              <li key={idx}>• {step}</li>
            ))}
          </ul>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="gold-button px-5 py-2 rounded-xl text-xs font-bold"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};
