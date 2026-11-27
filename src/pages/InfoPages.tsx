import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  LifeBuoy,
  MessageCircle,
  Send,
  ShieldAlert,
  ShieldCheck,
  Ticket,
} from 'lucide-react';
import { VIRTUAL_COIN_DISCLAIMER } from '../config/assets';
import { useApp } from '../context/AppContext';
import { resolveActiveTelegramUrl, submitUserReport } from '../services/adminService';
import { fetchUserSupportTickets, getTimeMs } from '../services/walletService';
import type { ReportRecord } from '../types';

function isSafeHttpsUrl(raw?: string): boolean {
  if (!raw) return false;
  try {
    const u = new URL(raw);
    return u.protocol === 'https:';
  } catch {
    return false;
  }
}

export function AboutPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div className="space-y-2">
        <h1 className="font-display text-3xl sm:text-4xl font-bold gold-gradient-text">
          About Aurelia Arena
        </h1>
        <p className="text-sm text-zinc-400">
          Crafted for players who expect tactile 3D fidelity, transparent fairness, and instant browser play.
        </p>
      </div>

      <div className="surface-panel rounded-2xl p-7 sm:p-8 space-y-5 text-sm text-zinc-300 leading-relaxed">
        <p>
          Aurelia Arena brings three iconic multiplayer and table genres—Dragon Tiger, Ludo 3D, and Aviator Helicopter 3D—into physically rendered Three.js WebGL environments. Every card table, royal board, pawn, ivory die, and helicopter is rendered in real time with calibrated studio lighting and audio.
        </p>
        <p>
          Fair play is enforced architecturally: card shuffles, dice rolls, and flight crash multipliers are generated cryptographically on the server independent of player wagers, and virtual coin balances are settled securely on our servers.
        </p>
        <p className="text-[#f6dc93] font-medium">{VIRTUAL_COIN_DISCLAIMER}</p>
      </div>
    </div>
  );
}

export function ContactPage() {
  const { firebaseUser, profile, gameConfigs, isGuestMode, pushToast } = useApp();
  const [category, setCategory] = useState<ReportRecord['category']>('payment');
  const [subject, setSubject] = useState('');
  const [utrRef, setUtrRef] = useState('');
  const [targetUsername, setTargetUsername] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [myTickets, setMyTickets] = useState<ReportRecord[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);

  const loadMyTickets = useCallback(async () => {
    if (!firebaseUser || isGuestMode) return;
    setLoadingTickets(true);
    try {
      const list = await fetchUserSupportTickets(firebaseUser.uid);
      setMyTickets(list);
    } catch {
      // ignore
    } finally {
      setLoadingTickets(false);
    }
  }, [firebaseUser, isGuestMode]);

  useEffect(() => {
    void loadMyTickets();
  }, [loadMyTickets]);

  const whatsappUrl = isSafeHttpsUrl(gameConfigs.platform.whatsappSupportUrl)
    ? gameConfigs.platform.whatsappSupportUrl!
    : 'https://wa.me/?text=Hello%20Aurelia%20Arena%20Support';
  const telegramUrl = resolveActiveTelegramUrl(gameConfigs.platform.telegramSupportUrl);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser || isGuestMode || !profile) {
      pushToast('Please sign in with Google to submit a tracked support ticket.', 'gold');
      return;
    }
    setSubmitting(true);
    try {
      await submitUserReport({
        uid: firebaseUser.uid,
        username: profile.username,
        category,
        subject,
        message,
        targetUsername,
        utrRef,
      });
      setSent(true);
      setSubject('');
      setMessage('');
      setUtrRef('');
      setTargetUsername('');
      pushToast('Support ticket created! Track admin replies below.', 'emerald');
      await loadMyTickets();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : 'Unable to submit ticket', 'crimson');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#f6dc93]">
            <LifeBuoy className="w-4 h-4 text-[#d4af37]" />
            <span>24×7 Player Helpdesk</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl font-bold gold-gradient-text">
            Help &amp; Support Ticket Center
          </h1>
          <p className="text-sm text-zinc-400">
            Submit UPI / UTR deposit questions, withdrawal checks, or game round issues and track live administrator replies.
          </p>
        </div>

        {/* Official Support Channel Quick Links */}
        <div className="flex flex-wrap items-center gap-2.5">
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow transition-colors"
          >
            <MessageCircle className="w-4 h-4" />
            <span>WhatsApp Support</span>
            <ExternalLink className="w-3 h-3 opacity-80" />
          </a>
          <a
            href={telegramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-500 text-white text-xs font-bold shadow transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Telegram Channel</span>
            <ExternalLink className="w-3 h-3 opacity-80" />
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Raise New Ticket Form */}
        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="lg:col-span-6 surface-panel rounded-2xl p-6 space-y-4"
        >
          <h2 className="font-display text-xl font-bold text-[#faf6ee]">Create a Support Ticket</h2>

          {isGuestMode && (
            <div className="p-4 rounded-xl bg-purple-950/35 border border-purple-500/30 text-xs text-purple-100 flex items-center justify-between gap-3">
              <span>Sign in with Google to submit tracked tickets and receive admin replies.</span>
              <Link to="/login" className="text-[#f6dc93] underline shrink-0">
                Sign In
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label htmlFor="rep-cat" className="text-xs text-zinc-400">
                Issue Category
              </label>
              <select
                id="rep-cat"
                value={category}
                onChange={(e) => setCategory(e.target.value as ReportRecord['category'])}
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37]"
              >
                <option value="payment">Payment / UPI / UTR Issue</option>
                <option value="game">Game Round / Payout Issue</option>
                <option value="account">Account &amp; Wallet Question</option>
                <option value="bug">Technical / 3D Graphics Bug</option>
                <option value="cheating">Cheating / Fair-Play Report</option>
                <option value="contact">General Inquiry</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rep-utr" className="text-xs text-zinc-400">
                UTR / Reference ID (Optional)
              </label>
              <input
                id="rep-utr"
                type="text"
                maxLength={32}
                value={utrRef}
                onChange={(e) => setUtrRef(e.target.value.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32))}
                placeholder="e.g. 432198765432"
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 font-mono text-sm text-white focus:outline-none focus:border-[#d4af37]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div className="space-y-1.5">
              <label htmlFor="rep-subject" className="text-xs text-zinc-400">
                Subject
              </label>
              <input
                id="rep-subject"
                type="text"
                required
                minLength={3}
                maxLength={120}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="e.g. Deposit UTR pending check"
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37]"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="rep-target" className="text-xs text-zinc-400">
                Opponent Username (Optional)
              </label>
              <input
                id="rep-target"
                type="text"
                maxLength={32}
                value={targetUsername}
                onChange={(e) => setTargetUsername(e.target.value)}
                placeholder="Leave blank if N/A"
                className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37]"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="rep-msg" className="text-xs text-zinc-400">
              Issue Details
            </label>
            <textarea
              id="rep-msg"
              required
              minLength={5}
              maxLength={1200}
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Include deposit amount, 12-digit UTR, round ID, or room code so our team can resolve it fast."
              className="w-full bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-[#d4af37]"
            />
          </div>

          {sent && (
            <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/35 text-xs text-emerald-200">
              Ticket logged! You can monitor its status and administrator reply on the right.
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || isGuestMode}
            className="w-full gold-button inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold disabled:opacity-45"
          >
            <Send className="w-4 h-4" />
            <span>{submitting ? 'Submitting Ticket...' : 'Submit Support Ticket'}</span>
          </button>
        </form>

        {/* Right: My Support Tickets & Admin Replies */}
        <div className="lg:col-span-6 surface-panel rounded-2xl p-6 space-y-4 flex flex-col">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl font-bold text-[#faf6ee] inline-flex items-center gap-2">
              <Ticket className="w-5 h-5 text-[#d4af37]" />
              <span>My Tickets ({myTickets.length})</span>
            </h2>
            <span className="text-[11px] text-zinc-500">Live Firestore sync</span>
          </div>

          {isGuestMode ? (
            <div className="py-12 text-center text-sm text-zinc-400">
              Sign in to view your submitted support tickets and admin replies.
            </div>
          ) : loadingTickets ? (
            <div className="py-12 text-center text-sm text-zinc-400">Loading your tickets...</div>
          ) : myTickets.length === 0 ? (
            <div className="py-12 text-center text-sm text-zinc-400">
              No support tickets submitted yet. Use the form to contact our support desk.
            </div>
          ) : (
            <div className="space-y-3 max-h-[480px] overflow-y-auto pr-1">
              {myTickets.map((t) => {
                const isResolved = t.status === 'resolved';
                const isInvestigating = t.status === 'investigating';
                return (
                  <div
                    key={t.reportId}
                    className="rounded-xl bg-black/45 border border-white/10 p-4 space-y-2.5 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-zinc-400">
                          {t.category} ·{' '}
                          {getTimeMs(t.createdAt)
                            ? new Date(getTimeMs(t.createdAt)).toLocaleString()
                            : 'Just now'}
                        </div>
                        <div className="text-sm font-semibold text-zinc-100 mt-0.5">{t.subject}</div>
                      </div>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg capitalize font-semibold border shrink-0 ${
                          isResolved
                            ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                            : isInvestigating
                              ? 'bg-amber-500/15 text-amber-200 border-amber-500/35'
                              : 'bg-rose-500/15 text-rose-200 border-rose-500/35'
                        }`}
                      >
                        {isResolved ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        {t.status}
                      </span>
                    </div>

                    {t.utrRef && (
                      <div className="inline-block font-mono text-[11px] px-2 py-0.5 rounded bg-[#d4af37]/15 text-[#f6dc93] border border-[#d4af37]/30">
                        UTR Ref: {t.utrRef}
                      </div>
                    )}

                    <p className="text-zinc-300 leading-relaxed">{t.message}</p>

                    {t.adminNote ? (
                      <div className="rounded-lg bg-emerald-950/35 border border-emerald-500/30 p-3 space-y-1">
                        <div className="text-[10px] uppercase tracking-wider font-bold text-emerald-300">
                          Admin Reply
                        </div>
                        <p className="text-xs text-emerald-100 leading-relaxed">{t.adminNote}</p>
                      </div>
                    ) : (
                      <div className="text-[11px] text-zinc-500 italic">
                        Queued for support team review…
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function PrivacyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
      <h1 className="font-display text-3xl sm:text-4xl font-bold gold-gradient-text">
        Privacy Policy
      </h1>
      <div className="surface-panel rounded-2xl p-7 sm:p-8 space-y-4 text-sm text-zinc-300 leading-relaxed">
        <p>
          Aurelia Arena protects player privacy using strict data isolation. Personally identifiable fields such as your email address and private account preferences are stored exclusively in secure private account records and are never exposed to public leaderboards or other players.
        </p>
        <p>
          Authentication is handled securely. Passwords are never stored on our servers. Public leaderboards display only your chosen username, avatar emblem, win metrics, and virtual coin score.
        </p>
        <p>
          Support ticket details, UTR reference numbers, and transaction history are restricted to the authenticated owner and verified support administrators.
        </p>
      </div>
    </div>
  );
}

export function TermsPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
      <h1 className="font-display text-3xl sm:text-4xl font-bold gold-gradient-text">
        Terms and Conditions
      </h1>
      <div className="surface-panel rounded-2xl p-7 sm:p-8 space-y-4 text-sm text-zinc-300 leading-relaxed">
        <p className="text-[#f6dc93] font-semibold">{VIRTUAL_COIN_DISCLAIMER}</p>
        <p>
          1. Eligibility (18+ Only): You must be at least 18 years of age to register an account and participate in Aurelia Arena games.
        </p>
        <p>
          2. Fair Play &amp; Anti-Tampering: Any attempt to exploit client state, submit duplicate UTR references, manipulate multiplayer room turns, or abuse promo/reward endpoints violates these terms and may result in immediate account suspension by platform administrators.
        </p>
        <p>
          3. Atomic Ledger &amp; Split Balances: Deposit, Winning, and Bonus coin buckets are governed by atomic Cloud Firestore transactions. Bonus coins cannot be withdrawn directly and are intended for in-game entry eligibility.
        </p>
        <p>
          4. Availability &amp; Browser Compatibility: All three 3D games are playable directly in modern WebGL-enabled browsers on desktop and mobile devices. Optional Android APK packages are provided only when signed and published via HTTPS.
        </p>
      </div>
    </div>
  );
}

export function FairPlayPolicyPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-300">
          <ShieldCheck className="w-4 h-4" />
          <span>Cryptographic Integrity</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold gold-gradient-text">
          Fair Play &amp; Provably Fair RNG Policy
        </h1>
      </div>

      <div className="surface-panel rounded-2xl p-7 sm:p-8 space-y-5 text-sm text-zinc-300 leading-relaxed">
        <p>
          Every outcome in <strong>Aviator Helicopter 3D</strong>, <strong>Dragon Tiger Live</strong>, and <strong>Ludo 3D</strong> is generated exclusively on the server using Node.js cryptographic randomness (<code className="font-mono text-[#f6dc93]">crypto.randomBytes</code> / <code className="font-mono text-[#f6dc93]">crypto.randomInt</code>). Outcomes are strictly independent of player wager size, win history, or VIP tier.
        </p>

        <div className="rounded-xl bg-black/45 border border-emerald-500/25 p-5 space-y-2">
          <h2 className="font-display text-base font-bold text-emerald-300">
            How SHA-256 Commit–Reveal Verification Works
          </h2>
          <ol className="list-decimal pl-5 space-y-1.5 text-xs sm:text-sm text-zinc-300">
            <li>Before betting closes (or before a flight takes off), the server generates a secret 256-bit <code className="font-mono text-white">serverSeed</code> and determines the round result.</li>
            <li>The server immediately publishes <code className="font-mono text-emerald-300">SHA-256(serverSeed)</code> to your browser before cards flip or the plane climbs.</li>
            <li>Once the round concludes, the original <code className="font-mono text-white">serverSeed</code> is revealed inside the in-game <strong>Fair</strong> modal.</li>
            <li>You can verify directly in your browser (via Web Crypto SHA-256) that hashing the revealed seed matches the pre-round hash—proving zero post-bet tampering.</li>
          </ol>
        </div>

        <p>
          In multiplayer Ludo rooms, both dice rolls and token move validation run on server endpoints, and idle players are handled deterministically with a 15-second turn clock and 3-skip auto-forfeit rule.
        </p>
      </div>
    </div>
  );
}

export function ResponsibleGamingPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-12 space-y-6">
      <div className="space-y-2">
        <div className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-300">
          <ShieldAlert className="w-4 h-4" />
          <span>18+ Only · Player Protection</span>
        </div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold gold-gradient-text">
          Responsible Gaming (18+ Only)
        </h1>
      </div>

      <div className="surface-panel rounded-2xl p-7 sm:p-8 space-y-5 text-sm text-zinc-300 leading-relaxed">
        <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 p-4 text-amber-100 font-medium">
          Aurelia Arena is strictly for adults aged 18 and above. Play for entertainment only—never treat gaming as a source of income.
        </div>

        <ul className="space-y-2.5 list-disc pl-5">
          <li>
            <strong>Built-in Guardrails:</strong> Per-game min/max wager limits, daily withdrawal caps (50,000/day), and a 5-minute withdrawal cooldown help maintain healthy pacing.
          </li>
          <li>
            <strong>Set Time &amp; Coin Limits:</strong> Decide your session budget before entering a table and take regular breaks between matches.
          </li>
          <li>
            <strong>Self-Exclusion / Account Freeze:</strong> If you ever want a temporary break or voluntary account suspension, raise a ticket via our{' '}
            <Link to="/support" className="text-[#f6dc93] underline">
              Help &amp; Support Center
            </Link>{' '}
            and our administrators will freeze your account immediately.
          </li>
        </ul>

        <p className="text-xs text-zinc-400 pt-2 border-t border-white/10">{VIRTUAL_COIN_DISCLAIMER}</p>
      </div>
    </div>
  );
}

export function RulesPage() {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 space-y-8">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl font-bold gold-gradient-text">
          Official Game Rules
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Complete rules and payout tables for Dragon Tiger Live, Ludo 3D, and Aviator Helicopter 3D.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <section className="surface-panel rounded-2xl p-6 space-y-3">
          <h2 className="font-display text-xl font-bold text-[#f6dc93]">Dragon Tiger Live</h2>
          <ul className="space-y-2 text-sm text-zinc-300 leading-relaxed">
            <li>• Uses a fair server-shuffled standard 52-card deck.</li>
            <li>• One card is dealt to Dragon and one card to Tiger.</li>
            <li>• Ace is the highest rank (A &gt; K &gt; Q &gt; J &gt; 10 … 2). Suits never decide winners.</li>
            <li>• Dragon or Tiger wins pay 1:1 (2× return).</li>
            <li>• Equal ranks produce a Tie paying 8:1 (9× return) on Tie bets and returning 50% of Dragon/Tiger stakes.</li>
          </ul>
          <Link to="/games/dragon-tiger" className="inline-block text-xs text-[#f6dc93] underline pt-2">
            Play Dragon Tiger Live
          </Link>
        </section>

        <section className="surface-panel rounded-2xl p-6 space-y-3">
          <h2 className="font-display text-xl font-bold text-[#f6dc93]">Ludo 3D</h2>
          <ul className="space-y-2 text-sm text-zinc-300 leading-relaxed">
            <li>• Play Quick Mode (first 1 token home wins), Classic Mode (1v1 &amp; 4-Player, 4 tokens), or Private Rooms with a 6-character WhatsApp invite code.</li>
            <li>• Roll a 6 to bring a token out of your corner yard onto the track.</li>
            <li>• Star-marked cells are safe zones where tokens cannot be captured.</li>
            <li>• Capturing an opponent sends their token home and awards a bonus roll.</li>
            <li>• Rolling a 6 or reaching Home awards a bonus turn (three consecutive 6s pass the turn).</li>
          </ul>
          <Link to="/games/ludo" className="inline-block text-xs text-[#f6dc93] underline pt-2">
            Play Ludo 3D
          </Link>
        </section>

        <section className="surface-panel rounded-2xl p-6 space-y-3">
          <h2 className="font-display text-xl font-bold text-[#f6dc93]">Aviator Helicopter 3D</h2>
          <ul className="space-y-2 text-sm text-zinc-300 leading-relaxed">
            <li>• Place up to two simultaneous wagers during the 5-second countdown or queue for the next flight.</li>
            <li>• Before takeoff, the server generates an independent cryptographic crash multiplier and publishes its SHA-256 hash.</li>
            <li>• Cash Out manually (or via Auto Cash-Out) before the helicopter flies away to lock in your multiplier.</li>
            <li>• If the helicopter flies away before you cash out, the round wager is forfeited.</li>
          </ul>
          <Link to="/games/aviator" className="inline-block text-xs text-[#f6dc93] underline pt-2">
            Play Aviator 3D
          </Link>
        </section>
      </div>
    </div>
  );
}
