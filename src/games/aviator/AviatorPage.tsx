import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  HelpCircle,
  History,
  Minus,
  Plus,
  Repeat,
  ShieldCheck,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { GameRulesModal } from '../../components/GameRulesModal';
import { GraphicsAudioBar } from '../../components/GraphicsAudioBar';
import { ProvablyFairModal } from '../../components/ProvablyFairModal';
import { VIRTUAL_COIN_DISCLAIMER } from '../../config/assets';
import { useApp } from '../../context/AppContext';
import { GameExitModal, useGameBackGuard } from '../../hooks/useGameBackGuard';
import { computeEffectiveAviatorCap } from '../../services/adminService';
import { soundEngine } from '../../services/soundEngine';
import type { ProvablyFairProof } from '../../types';
import { AviatorCanvas } from './AviatorCanvas';

const QUICK_BETS = [1, 10, 50, 100, 500];
const COUNTDOWN_SECONDS = 5;
const CRASH_PAUSE_MS = 3000;

interface BetSlotState {
  id: 1 | 2;
  mode: 'manual' | 'auto';
  wager: number;
  autoBet: boolean;
  autoCashout: boolean;
  autoCashoutTarget: number;
  queuedBet: number;
  activeBet: number;
  hasCashedOut: boolean;
  cashedOutMult: number | null;
  cashedOutPayout: number;
}

interface FlightHistoryItem {
  id: string;
  slot: 1 | 2;
  wager: number;
  multiplier: number;
  payout: number;
  won: boolean;
  time: string;
}

function createInitialSlot(id: 1 | 2, defaultWager: number): BetSlotState {
  return {
    id,
    mode: 'manual',
    wager: defaultWager,
    autoBet: false,
    autoCashout: id === 1,
    autoCashoutTarget: id === 1 ? 2.0 : 5.0,
    queuedBet: 0,
    activeBet: 0,
    hasCashedOut: false,
    cashedOutMult: null,
    cashedOutPayout: 0,
  };
}

function getCrashBadgeClass(m: number): string {
  if (m >= 10) {
    return 'bg-[#3d260b] border-[#f6dc93]/60 text-[#ffe89e] shadow-[0_0_10px_rgba(246,220,147,0.22)]';
  }
  if (m >= 2) {
    return 'bg-[#251345] border-purple-400/45 text-purple-200';
  }
  return 'bg-[#101c38] border-sky-400/35 text-sky-200';
}

export default function AviatorPage() {
  const {
    balance,
    graphicsQuality,
    gameConfigs,
    platformSettings,
    placeBet,
    settleRound,
    pushToast,
  } = useApp();
  const cfg = gameConfigs.aviator;
  const [roundPayoutCap, setRoundPayoutCap] = useState<number>(() =>
    computeEffectiveAviatorCap(platformSettings),
  );

  useEffect(() => {
    setRoundPayoutCap(computeEffectiveAviatorCap(platformSettings));
  }, [platformSettings]);

  const [phase, setPhase] = useState<'countdown' | 'flying' | 'crashed'>('countdown');
  const [countdownMs, setCountdownMs] = useState(COUNTDOWN_SECONDS * 1000);
  const [multiplier, setMultiplier] = useState(1.0);
  const [slots, setSlots] = useState<[BetSlotState, BetSlotState]>([
    createInitialSlot(1, 10),
    createInitialSlot(2, 100),
  ]);
  const [recentMultipliers, setRecentMultipliers] = useState<number[]>([
    2.41, 1.38, 12.64, 1.12, 3.25, 1.85, 5.92, 1.44, 2.78, 1.07, 4.15, 2.09,
  ]);
  const [myHistory, setMyHistory] = useState<FlightHistoryItem[]>([]);
  const [roundSeedHash, setRoundSeedHash] = useState('');
  const [revealedServerSeed, setRevealedServerSeed] = useState('');
  const [currentRoundId, setCurrentRoundId] = useState('');
  const [fairProof, setFairProof] = useState<ProvablyFairProof | null>(null);
  const [fairModalOpen, setFairModalOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [mobilePanelMode, setMobilePanelMode] = useState<'1' | '2' | 'both'>('1');
  const [roundStats, setRoundStats] = useState({ flights: 0, bestCashout: 0, totalProfit: 0 });

  // Stable refs for the continuous server-synced flight loop
  const slotsRef = useRef(slots);
  slotsRef.current = slots;

  const balanceRef = useRef(balance);
  balanceRef.current = balance;

  const cfgRef = useRef(cfg);
  cfgRef.current = cfg;

  const placeBetRef = useRef(placeBet);
  placeBetRef.current = placeBet;

  const settleRoundRef = useRef(settleRound);
  settleRoundRef.current = settleRound;

  const pushToastRef = useRef(pushToast);
  pushToastRef.current = pushToast;

  const roundIdRef = useRef<string>('');
  const roundSeedHashRef = useRef<string>('');
  const startTimeRef = useRef<number>(0);
  const serverOffsetRef = useRef<number>(0);
  const sessionBaseRef = useRef<string>(`heli_${Math.random().toString(36).slice(2, 10)}`);
  const cashingOutSlotRef = useRef<[boolean, boolean]>([false, false]);

  const hasAnyCommitment =
    slots[0].activeBet > 0 ||
    slots[0].queuedBet > 0 ||
    slots[1].activeBet > 0 ||
    slots[1].queuedBet > 0;

  const backGuard = useGameBackGuard(hasAnyCommitment);

  const updateSlot = useCallback(
    (slotIdx: 0 | 1, updater: (prev: BetSlotState) => BetSlotState) => {
      setSlots((prev) => {
        const next: [BetSlotState, BetSlotState] = [prev[0], prev[1]];
        next[slotIdx] = updater(prev[slotIdx]);
        slotsRef.current = next;
        return next;
      });
    },
    [],
  );

  const handleQueueWager = useCallback(
    (slotIdx: 0 | 1) => {
      const currentCfg = cfgRef.current;
      if (!currentCfg.enabled) {
        pushToastRef.current('Aviator is temporarily paused by administrator.', 'crimson');
        return;
      }
      const slot = slotsRef.current[slotIdx];
      const amt = Math.floor(slot.wager);
      const minAllowed = Math.max(1, currentCfg.minBet || 1);
      if (amt < minAllowed || amt > currentCfg.maxBet) {
        pushToastRef.current(
          `Bet must be between ₹${minAllowed} and ₹${currentCfg.maxBet.toLocaleString()}.`,
          'gold',
        );
        return;
      }
      const otherQueued = slotsRef.current[slotIdx === 0 ? 1 : 0].queuedBet;
      if (amt + otherQueued > balanceRef.current) {
        pushToastRef.current('Insufficient virtual coin balance.', 'crimson');
        return;
      }
      soundEngine.playChipPlace();
      updateSlot(slotIdx, (s) => ({ ...s, queuedBet: amt }));
    },
    [updateSlot],
  );

  const handleCancelQueue = useCallback(
    (slotIdx: 0 | 1) => {
      soundEngine.playClick();
      updateSlot(slotIdx, (s) => ({ ...s, queuedBet: 0 }));
    },
    [updateSlot],
  );

  const triggerCashout = useCallback(
    async (slotIdx: 0 | 1, isAuto = false) => {
      const slot = slotsRef.current[slotIdx];
      if (
        cashingOutSlotRef.current[slotIdx] ||
        slot.hasCashedOut ||
        slot.activeBet <= 0 ||
        !roundIdRef.current
      ) {
        return;
      }

      cashingOutSlotRef.current[slotIdx] = true;
      const wager = slot.activeBet;
      const roundId = roundIdRef.current;

      try {
        const resp = await fetch('/api/games/aviator/cashout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roundId,
            sessionKey: `${sessionBaseRef.current}_${slot.id}`,
            betAmount: wager,
            autoCashoutAt: isAuto ? slot.autoCashoutTarget : undefined,
          }),
        });
        const data = await resp.json();
        if (data.cashedOut) {
          updateSlot(slotIdx, (s) => ({
            ...s,
            hasCashedOut: true,
            cashedOutMult: data.multiplier,
            cashedOutPayout: data.payout,
          }));
          soundEngine.playWinFanfare();
          pushToastRef.current(
            data.payoutCapped
              ? `Panel ${slot.id} cashed @ ${Number(data.multiplier).toFixed(2)}x · +${Number(data.payout).toLocaleString()} coins (Round cap ₹${Number(data.maxRoundPayoutCap || data.payout).toLocaleString()} applied)`
              : `Panel ${slot.id} cashed @ ${Number(data.multiplier).toFixed(2)}x · +${Number(data.payout).toLocaleString()} coins!`,
            'emerald',
          );
          setRoundStats((st) => ({
            flights: st.flights + 1,
            bestCashout: Math.max(st.bestCashout, data.multiplier),
            totalProfit: st.totalProfit + (data.payout - wager),
          }));
          setMyHistory((prev) =>
            [
              {
                id: `${roundId}_${slot.id}`,
                slot: slot.id,
                wager,
                multiplier: data.multiplier,
                payout: data.payout,
                won: true,
                time: new Date().toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                }),
              },
              ...prev,
            ].slice(0, 20),
          );

          await settleRoundRef.current({
            game: 'aviator',
            betAmount: wager,
            payout: data.payout,
            outcome: 'cashout',
            summary: `Panel ${slot.id} cashed out at ${Number(data.multiplier).toFixed(2)}x`,
            roundId,
            seedHash: data.serverSeedHash || data.seedHash || roundSeedHashRef.current,
          });
        }
      } catch (err) {
        console.error('Cashout error:', err);
      } finally {
        cashingOutSlotRef.current[slotIdx] = false;
      }
    },
    [updateSlot],
  );

  // ===========================================================================
  // Continuous Automatic Crash-Counting State Machine (Mount-Only, Zero Stalls)
  // ===========================================================================
  useEffect(() => {
    let alive = true;
    let rafId = 0;
    let pollTimer = 0;
    let stepTimer = 0;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        stepTimer = window.setTimeout(resolve, ms);
      });

    const runCountdown = async () => {
      setPhase('countdown');
      setMultiplier(1.0);
      const endTime = Date.now() + COUNTDOWN_SECONDS * 1000;
      while (alive) {
        const remaining = Math.max(0, endTime - Date.now());
        setCountdownMs(remaining);
        if (remaining <= 0) break;
        await sleep(50);
      }
    };

    const runSingleFlight = async () => {
      if (!alive) return;

      // 1. Countdown before takeoff
      await runCountdown();
      if (!alive) return;

      setRevealedServerSeed('');
      cashingOutSlotRef.current = [false, false];

      // 2. Request authoritative round start from server
      let startResp: {
        roundId: string;
        serverSeedHash?: string;
        seedHash: string;
        maxRoundPayoutCap?: number;
        startTimeMs: number;
        serverNowMs?: number;
      };
      try {
        const r = await fetch('/api/games/aviator/start', { method: 'POST' });
        if (!r.ok) throw new Error('Start flight failed');
        startResp = await r.json();
      } catch {
        await sleep(1600);
        return;
      }
      if (!alive) return;

      if (typeof startResp.maxRoundPayoutCap === 'number' && startResp.maxRoundPayoutCap >= 100) {
        setRoundPayoutCap(startResp.maxRoundPayoutCap);
      }

      const committedHash = startResp.serverSeedHash || startResp.seedHash;
      roundIdRef.current = startResp.roundId;
      roundSeedHashRef.current = committedHash;
      serverOffsetRef.current = (startResp.serverNowMs || startResp.startTimeMs) - Date.now();
      startTimeRef.current = startResp.startTimeMs;

      setCurrentRoundId(startResp.roundId);
      setRoundSeedHash(committedHash);
      setFairProof({
        game: 'aviator',
        roundId: startResp.roundId,
        serverSeedHash: committedHash,
        status: 'committed',
      });

      // 3. Lock queued OR Auto-Bet wagers for both slots atomically
      const currentCfg = cfgRef.current;
      for (const idx of [0, 1] as const) {
        const slot = slotsRef.current[idx];
        let wagerToPlace = slot.queuedBet;
        if (wagerToPlace <= 0 && slot.autoBet && currentCfg.enabled) {
          const autoAmt = Math.floor(slot.wager);
          const minAllowed = Math.max(1, currentCfg.minBet || 1);
          if (
            autoAmt >= minAllowed &&
            autoAmt <= currentCfg.maxBet &&
            autoAmt <= balanceRef.current
          ) {
            wagerToPlace = autoAmt;
          }
        }

        if (wagerToPlace > 0) {
          try {
            await placeBetRef.current(
              'aviator',
              wagerToPlace,
              startResp.roundId,
              `Aviator Panel ${slot.id} flight wager (${wagerToPlace} coins)`,
            );
            updateSlot(idx, (s) => ({
              ...s,
              queuedBet: 0,
              activeBet: wagerToPlace,
              hasCashedOut: false,
              cashedOutMult: null,
              cashedOutPayout: 0,
            }));
          } catch (err) {
            pushToastRef.current(
              err instanceof Error ? err.message : `Panel ${slot.id} bet could not be placed`,
              'crimson',
            );
            updateSlot(idx, (s) => ({
              ...s,
              queuedBet: 0,
              activeBet: 0,
              hasCashedOut: false,
              cashedOutMult: null,
              cashedOutPayout: 0,
            }));
          }
        } else {
          updateSlot(idx, (s) => ({
            ...s,
            activeBet: 0,
            hasCashedOut: false,
            cashedOutMult: null,
            cashedOutPayout: 0,
          }));
        }
      }

      if (!alive) return;

      // 4. Takeoff! Start smooth 60fps automatic multiplier counting + server polling
      setPhase('flying');
      setMultiplier(1.0);
      soundEngine.startEngine();

      await new Promise<void>((resolveCrash) => {
        let flightEnded = false;

        const smoothLoop = () => {
          if (!alive || flightEnded) return;
          const syncedNow = Date.now() + serverOffsetRef.current;
          const elapsed = Math.max(0, (syncedNow - startTimeRef.current) / 1000);
          const liveM = Math.floor(Math.exp(0.1 * elapsed) * 100) / 100;
          setMultiplier(liveM);
          soundEngine.updateEnginePitch(liveM);

          // Automatic Cash-Out check for both Panel 1 & Panel 2
          for (const idx of [0, 1] as const) {
            const s = slotsRef.current[idx];
            if (
              s.autoCashout &&
              s.activeBet > 0 &&
              !s.hasCashedOut &&
              !cashingOutSlotRef.current[idx] &&
              liveM >= s.autoCashoutTarget
            ) {
              void triggerCashout(idx, true);
            }
          }

          rafId = window.requestAnimationFrame(smoothLoop);
        };
        rafId = window.requestAnimationFrame(smoothLoop);

        const pollStatus = async () => {
          if (!alive || flightEnded || !roundIdRef.current) return;
          try {
            const sr = await fetch(`/api/games/aviator/status/${roundIdRef.current}`);
            if (!sr.ok) return;
            const st = await sr.json();
            if (st.serverNowMs) {
              serverOffsetRef.current = st.serverNowMs - Date.now();
            }
            if (st.status === 'crashed' && !flightEnded) {
              flightEnded = true;
              window.clearInterval(pollTimer);
              window.cancelAnimationFrame(rafId);
              soundEngine.stopEngine();
              soundEngine.playCrashBoom();

              const finalHash = st.serverSeedHash || st.seedHash || committedHash;
              const crashPoint = Number(st.crashPoint);

              setPhase('crashed');
              setMultiplier(crashPoint);
              setRevealedServerSeed(st.serverSeed || '');
              setFairProof({
                game: 'aviator',
                roundId: roundIdRef.current,
                serverSeedHash: finalHash,
                serverSeed: st.serverSeed || '',
                outcomeLabel: `Crashed at ${crashPoint.toFixed(2)}x`,
                status: 'revealed',
              });
              setRecentMultipliers((prev) => [crashPoint, ...prev].slice(0, 24));

              // Settle any un-cashed active bets from both panels
              for (const idx of [0, 1] as const) {
                const s = slotsRef.current[idx];
                if (s.activeBet > 0 && !s.hasCashedOut) {
                  const lostWager = s.activeBet;
                  setRoundStats((rs) => ({
                    ...rs,
                    flights: rs.flights + 1,
                    totalProfit: rs.totalProfit - lostWager,
                  }));
                  setMyHistory((prev) =>
                    [
                      {
                        id: `${roundIdRef.current}_${s.id}_loss`,
                        slot: s.id,
                        wager: lostWager,
                        multiplier: crashPoint,
                        payout: 0,
                        won: false,
                        time: new Date().toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                          second: '2-digit',
                        }),
                      },
                      ...prev,
                    ].slice(0, 20),
                  );
                  void settleRoundRef
                    .current({
                      game: 'aviator',
                      betAmount: lostWager,
                      payout: 0,
                      outcome: 'crashed',
                      summary: `Panel ${s.id} crashed at ${crashPoint.toFixed(2)}x`,
                      roundId: roundIdRef.current,
                      seedHash: finalHash,
                    })
                    .catch(() => {});
                }
                updateSlot(idx, (prev) => ({
                  ...prev,
                  activeBet: 0,
                  hasCashedOut: false,
                  cashedOutMult: null,
                  cashedOutPayout: 0,
                }));
              }

              resolveCrash();
            }
          } catch {
            // Ignore transient poll error and retry next tick
          }
        };

        pollTimer = window.setInterval(() => {
          void pollStatus();
        }, 180);
      });

      // 5. Brief crash display pause before automatically launching next flight countdown
      if (alive) {
        await sleep(CRASH_PAUSE_MS);
      }
    };

    const loop = async () => {
      while (alive) {
        await runSingleFlight();
      }
    };

    void loop();

    return () => {
      alive = false;
      window.cancelAnimationFrame(rafId);
      window.clearInterval(pollTimer);
      window.clearTimeout(stepTimer);
      soundEngine.stopEngine();
    };
  }, [triggerCashout, updateSlot]);

  const countdownSec = (countdownMs / 1000).toFixed(1);
  const countdownPct = Math.min(100, Math.max(0, (countdownMs / (COUNTDOWN_SECONDS * 1000)) * 100));

  const renderBetPanel = (slotIdx: 0 | 1) => {
    const slot = slots[slotIdx];
    const canCashout = phase === 'flying' && slot.activeBet > 0 && !slot.hasCashedOut;
    const isQueued = slot.queuedBet > 0;
    const cashedThisFlight = phase === 'flying' && slot.hasCashedOut && slot.cashedOutMult !== null;

    const minAllowed = Math.max(1, cfg.minBet || 1);

    const adjustWager = (direction: -1 | 1) => {
      soundEngine.playClick();
      updateSlot(slotIdx, (s) => {
        const cur = Math.floor(s.wager);
        const step =
          direction < 0
            ? cur <= 10
              ? 1
              : cur <= 100
                ? 10
                : 50
            : cur < 10
              ? 1
              : cur < 100
                ? 10
                : 50;
        return {
          ...s,
          wager: Math.min(cfg.maxBet, Math.max(minAllowed, cur + direction * step)),
        };
      });
    };

    const multiplyWager = (factor: number) => {
      soundEngine.playClick();
      updateSlot(slotIdx, (s) => ({
        ...s,
        wager: Math.min(
          cfg.maxBet,
          Math.max(minAllowed, Math.round(s.wager * factor)),
        ),
      }));
    };

    return (
      <div
        key={slot.id}
        className={`rounded-xl border px-2.5 py-2 sm:px-3 sm:py-2.5 flex flex-col gap-1.5 transition-colors ${
          canCashout
            ? 'bg-[#091f17] border-emerald-500/55 shadow-[0_0_18px_rgba(16,185,129,0.16)]'
            : isQueued
              ? 'bg-[#1f0c18] border-rose-500/45'
              : 'bg-[#110d1e] border-white/10'
        }`}
      >
        {/* Top Row: Panel label + Manual/Auto toggle + Auto status */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
              Bet {slot.id}
            </span>
            <div className="inline-flex rounded-lg bg-black/55 p-0.5 border border-white/10">
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  updateSlot(slotIdx, (s) => ({ ...s, mode: 'manual' }));
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold transition-colors ${
                  slot.mode === 'manual'
                    ? 'bg-[#d4af37] text-[#090710]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Manual
              </button>
              <button
                type="button"
                onClick={() => {
                  soundEngine.playClick();
                  updateSlot(slotIdx, (s) => ({ ...s, mode: 'auto' }));
                }}
                className={`px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold transition-colors ${
                  slot.mode === 'auto'
                    ? 'bg-[#d4af37] text-[#090710]'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                Auto
              </button>
            </div>
          </div>

          {/* Quick Auto-Cashout indicator even in Manual view */}
          <div className="flex items-center gap-1.5">
            {slot.autoBet && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-400/30 rounded px-1.5 py-0.5">
                <Repeat className="w-2.5 h-2.5" />
                Auto
              </span>
            )}
            <label className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={slot.autoCashout}
                onChange={(e) =>
                  updateSlot(slotIdx, (s) => ({ ...s, autoCashout: e.target.checked }))
                }
                className="accent-emerald-400 w-3 h-3"
              />
              <span className="hidden sm:inline">Cash @</span>
              <input
                type="number"
                min={1.1}
                max={100}
                step={0.1}
                disabled={!slot.autoCashout}
                value={slot.autoCashoutTarget}
                onChange={(e) =>
                  updateSlot(slotIdx, (s) => ({
                    ...s,
                    autoCashoutTarget: Math.max(1.1, Number(e.target.value)),
                  }))
                }
                aria-label={`Panel ${slot.id} auto cashout multiplier`}
                className="w-12 bg-black/60 border border-white/15 rounded px-1 py-0.5 font-mono-num text-[11px] text-[#f6dc93] disabled:opacity-40 focus:outline-none focus:border-emerald-400"
              />
              <span className="font-mono-num text-[10px] text-[#d4af37]">x</span>
            </label>
          </div>
        </div>

        {/* Auto-mode extra bar: Auto Bet toggle + Quick target multipliers */}
        {slot.mode === 'auto' && (
          <div className="flex items-center justify-between gap-2 px-2 py-1 rounded-lg bg-black/40 border border-white/8">
            <label className="inline-flex items-center gap-1.5 text-[11px] text-zinc-200 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={slot.autoBet}
                onChange={(e) => {
                  soundEngine.playClick();
                  updateSlot(slotIdx, (s) => ({ ...s, autoBet: e.target.checked }));
                }}
                className="accent-[#d4af37] w-3.5 h-3.5"
              />
              <span className="font-medium">Auto Bet Every Flight</span>
            </label>
            <div className="flex items-center gap-1">
              {[1.5, 2, 5].map((tMult) => (
                <button
                  key={tMult}
                  type="button"
                  onClick={() => {
                    soundEngine.playClick();
                    updateSlot(slotIdx, (s) => ({
                      ...s,
                      autoCashout: true,
                      autoCashoutTarget: tMult,
                    }));
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono-num border ${
                    slot.autoCashout && slot.autoCashoutTarget === tMult
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                      : 'bg-white/5 border-white/10 text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {tMult}x
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Row: Wager Input + Presets on left, Primary Action CTA on right */}
        <div className="grid grid-cols-12 gap-2 items-stretch">
          <div className="col-span-7 flex flex-col gap-1">
            {/* - [input] + with 1/2 & 2x */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={isQueued || canCashout}
                onClick={() => adjustWager(-1)}
                aria-label={`Decrease bet ${slot.id}`}
                className="w-7 h-7 shrink-0 rounded-lg bg-white/8 hover:bg-white/15 disabled:opacity-40 border border-white/10 flex items-center justify-center text-zinc-200"
              >
                <Minus className="w-3.5 h-3.5" />
              </button>
              <input
                type="number"
                min={minAllowed}
                max={cfg.maxBet}
                step={1}
                disabled={isQueued || canCashout}
                value={slot.wager}
                onChange={(e) =>
                  updateSlot(slotIdx, (s) => ({ ...s, wager: Math.max(0, Number(e.target.value)) }))
                }
                aria-label={`Panel ${slot.id} wager amount`}
                className="w-full min-w-0 h-7 bg-black/60 border border-white/15 rounded-lg px-2 text-center font-mono-num text-xs sm:text-sm font-bold text-white disabled:opacity-50 focus:outline-none focus:border-[#d4af37]"
              />
              <button
                type="button"
                disabled={isQueued || canCashout}
                onClick={() => adjustWager(1)}
                aria-label={`Increase bet ${slot.id}`}
                className="w-7 h-7 shrink-0 rounded-lg bg-white/8 hover:bg-white/15 disabled:opacity-40 border border-white/10 flex items-center justify-center text-zinc-200"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                disabled={isQueued || canCashout}
                onClick={() => multiplyWager(0.5)}
                className="hidden sm:inline-flex items-center justify-center px-1.5 h-7 rounded-lg bg-white/6 hover:bg-white/12 disabled:opacity-40 border border-white/10 text-[10px] font-mono-num text-zinc-300"
              >
                1/2
              </button>
              <button
                type="button"
                disabled={isQueued || canCashout}
                onClick={() => multiplyWager(2)}
                className="hidden sm:inline-flex items-center justify-center px-1.5 h-7 rounded-lg bg-white/6 hover:bg-white/12 disabled:opacity-40 border border-white/10 text-[10px] font-mono-num text-zinc-300"
              >
                2x
              </button>
            </div>

            {/* Quick Bet Presets */}
            <div className="grid grid-cols-5 gap-1">
              {QUICK_BETS.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  disabled={isQueued || canCashout}
                  onClick={() => {
                    soundEngine.playClick();
                    updateSlot(slotIdx, (s) => ({ ...s, wager: amt }));
                  }}
                  className={`py-0.5 rounded-md border font-mono-num text-[10px] sm:text-[11px] transition-colors disabled:opacity-40 ${
                    slot.wager === amt
                      ? 'bg-[#d4af37]/20 border-[#d4af37]/60 text-[#f6dc93] font-semibold'
                      : 'bg-white/5 hover:bg-white/10 border-white/10 text-zinc-300'
                  }`}
                >
                  {amt >= 1000 ? `${amt / 1000}K` : amt}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Bet / Cancel / Cash Out CTA */}
          <div className="col-span-5 flex">
            {canCashout ? (
              <button
                type="button"
                onClick={() => void triggerCashout(slotIdx, false)}
                className="w-full rounded-xl bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-[#04170d] font-extrabold text-xs sm:text-sm px-2 py-1.5 flex flex-col items-center justify-center leading-tight shadow-[0_0_22px_rgba(16,185,129,0.45)] active:scale-[0.98] transition-transform"
              >
                <span className="uppercase tracking-wider text-[10px] opacity-90">Cash Out</span>
                <span className="font-mono-num text-sm sm:text-base">
                  {Math.min(roundPayoutCap, Math.round(slot.activeBet * multiplier)).toLocaleString()}
                </span>
              </button>
            ) : isQueued ? (
              <button
                type="button"
                onClick={() => handleCancelQueue(slotIdx)}
                className="w-full rounded-xl bg-gradient-to-b from-rose-600 to-rose-800 hover:from-rose-500 hover:to-rose-700 border border-rose-400/40 text-white font-bold text-xs sm:text-sm px-2 py-1.5 flex flex-col items-center justify-center leading-tight active:scale-[0.98] transition-transform"
              >
                <span className="uppercase tracking-wider text-[10px] text-rose-100">Cancel</span>
                <span className="font-mono-num text-xs sm:text-sm">
                  {slot.queuedBet.toLocaleString()} · Ready
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleQueueWager(slotIdx)}
                className="w-full rounded-xl gold-button font-extrabold text-xs sm:text-sm px-2 py-1.5 flex flex-col items-center justify-center leading-tight active:scale-[0.98] transition-transform"
              >
                <span className="uppercase tracking-wider text-[10px]">
                  {cashedThisFlight
                    ? 'Won! Bet Next'
                    : phase === 'countdown'
                      ? 'Place Bet'
                      : 'Bet Next'}
                </span>
                <span className="font-mono-num text-sm sm:text-base">
                  {Math.floor(slot.wager).toLocaleString()}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  const multColorClass =
    phase === 'crashed'
      ? 'text-rose-400 drop-shadow-[0_0_28px_rgba(244,63,94,0.65)]'
      : multiplier >= 10
        ? 'text-[#ffe68a] drop-shadow-[0_0_30px_rgba(246,220,147,0.75)]'
        : multiplier >= 2
          ? 'text-purple-200 drop-shadow-[0_0_26px_rgba(192,132,252,0.65)]'
          : 'text-white drop-shadow-[0_0_24px_rgba(255,255,255,0.45)]';

  return (
    <div className="game-shell-height relative w-full bg-[#070512] overflow-hidden flex flex-col">
      {/* 1. Slim Top Header */}
      <div className="relative z-20 shrink-0 px-3 sm:px-5 py-1.5 flex items-center justify-between gap-2 border-b border-[#d4af37]/15 bg-[#0a0717]">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-rose-600/25 border border-rose-500/45 text-rose-300 shrink-0">
            <Zap className="w-3.5 h-3.5" />
          </span>
          <h1 className="font-display text-sm sm:text-base font-bold gold-gradient-text truncate">
            Aviator Helicopter 3D
          </h1>
          <div className="hidden lg:flex items-center gap-2 text-[11px] text-zinc-400 whitespace-nowrap">
            <span>Auto Crash</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono-num text-zinc-300">
              Flights: {roundStats.flights} · Best: {roundStats.bestCashout.toFixed(2)}x
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setHistoryModalOpen(true);
            }}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/12 bg-white/5 hover:bg-white/10 text-[11px] text-zinc-200 whitespace-nowrap"
            title="Crash History & My Flights"
          >
            <History className="w-3.5 h-3.5 text-[#f6dc93]" />
            <span className="hidden sm:inline">History</span>
          </button>

          {fairProof && (
            <button
              type="button"
              onClick={() => {
                soundEngine.playClick();
                setFairModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-emerald-500/35 bg-emerald-950/40 hover:bg-emerald-900/45 text-[11px] text-emerald-200 whitespace-nowrap"
              title="Verify SHA-256 Provably Fair Seed"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">Fair</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              soundEngine.playClick();
              setRulesOpen(true);
            }}
            aria-label="How to Play Aviator"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-[#d4af37]/35 bg-[#d4af37]/10 hover:bg-[#d4af37]/20 text-[11px] font-semibold text-[#f6dc93] whitespace-nowrap"
            title="How to Play & Payouts"
          >
            <HelpCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Rules</span>
          </button>
          <GraphicsAudioBar compact />
        </div>
      </div>

      {!cfg.enabled && (
        <div className="relative z-20 shrink-0 px-3 sm:px-5 py-2 bg-rose-950/85 border-b border-rose-500/40 text-center text-xs text-rose-200 font-medium">
          {cfg.maintenanceMessage || 'Aviator is currently in maintenance mode. Betting is temporarily paused.'}
        </div>
      )}

      {/* 2. Glowing Crash Multiplier History Strip */}
      <div className="relative z-20 shrink-0 px-2.5 sm:px-5 py-1.5 bg-[#0c081a] border-b border-white/8 flex items-center gap-2">
        <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          {recentMultipliers.map((m, idx) => (
            <span
              key={`${m}_${idx}`}
              className={`font-mono-num text-[11px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0 ${getCrashBadgeClass(m)}`}
            >
              {m.toFixed(2)}x
            </span>
          ))}
        </div>
      </div>

      {/* 3. Expansive 3D Helicopter Flight Viewport + Crisp Live Crash Counting HUD */}
      <div className="relative flex-1 min-h-[195px] w-full overflow-hidden bg-[#130b24]">
        <AviatorCanvas graphicsQuality={graphicsQuality} phase={phase} multiplier={multiplier} />

        {/* Upper-Center Live Automatic Crash Counting Overlay (No backdrop-blur over WebGL) */}
        <div className="pointer-events-none absolute inset-x-0 top-3 sm:top-5 z-10 flex flex-col items-center px-4 text-center">
          {phase === 'countdown' ? (
            <div className="webgl-hud-surface rounded-2xl border border-[#d4af37]/30 px-5 py-2.5 sm:px-7 sm:py-3 flex flex-col items-center gap-1.5 min-w-[210px] sm:min-w-[260px]">
              <div className="flex items-center gap-2 text-[10px] sm:text-xs font-bold uppercase tracking-[0.18em] text-[#f6dc93]">
                <Sparkles className="w-3.5 h-3.5 text-rose-400" />
                <span>Next Takeoff In</span>
              </div>
              <div className="font-mono-num text-3xl sm:text-4xl font-extrabold text-white leading-none">
                {countdownSec}s
              </div>
              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden mt-0.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-500 via-[#f6dc93] to-emerald-400 transition-[width] duration-75"
                  style={{ width: `${countdownPct}%` }}
                />
              </div>
              <span className="text-[10px] text-zinc-400">
                Place your bets · Auto crash counting active
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              {phase === 'crashed' && (
                <div className="px-3 py-0.5 rounded-full bg-rose-950/90 border border-rose-500/60 text-rose-200 text-[11px] sm:text-xs font-extrabold uppercase tracking-[0.2em]">
                  Flew Away!
                </div>
              )}
              <div
                className={`font-mono-num text-5xl sm:text-6xl md:text-7xl font-black tracking-tight leading-none ${multColorClass}`}
              >
                {multiplier.toFixed(2)}x
              </div>

              {/* Active Cashed-Out Win Badges */}
              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
                {slots.map((s) =>
                  s.hasCashedOut && s.cashedOutMult ? (
                    <span
                      key={s.id}
                      className="inline-flex items-center gap-1 rounded-full bg-[#062418] border border-emerald-400/60 px-2.5 py-0.5 text-[11px] font-bold text-emerald-200 shadow-lg"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      P{s.id} @ {s.cashedOutMult.toFixed(2)}x · +{s.cashedOutPayout.toLocaleString()}
                    </span>
                  ) : null,
                )}
              </div>
            </div>
          )}
        </div>

        {/* Bottom-Right Compact SHA-256 Provably Fair Proof Button (keeps bottom-left origin dot unobstructed) */}
        {roundSeedHash && (
          <button
            type="button"
            onClick={() => setFairModalOpen(true)}
            className="webgl-hud-surface absolute right-2.5 bottom-2 z-10 inline-flex items-center gap-1 rounded-lg border border-white/12 px-2 py-1 text-[10px] font-mono text-zinc-300 hover:text-[#f6dc93] max-w-[68%]"
          >
            <ShieldCheck className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate">
              {revealedServerSeed
                ? `Verified (${currentRoundId}) — Tap Proof`
                : `SHA-256: ${roundSeedHash.slice(0, 14)}...`}
            </span>
          </button>
        )}
      </div>

      {/* 4. Dual Bet Controls Dock (Bet 1 & Bet 2 — Fits cleanly in 100dvh) */}
      <div className="relative z-20 shrink-0 w-full bg-[#090614] border-t border-[#d4af37]/20 px-2.5 sm:px-4 py-2">
        <div className="w-full max-w-5xl mx-auto space-y-1.5">
          {/* Mobile Panel Switcher (keeps 3D Helicopter huge on small screens while offering 1-tap Dual) */}
          <div className="flex md:hidden items-center justify-between gap-2">
            <div className="inline-flex rounded-lg bg-black/60 p-0.5 border border-white/10">
              {(['1', '2', 'both'] as const).map((tab) => {
                const slotStatus =
                  tab === '1'
                    ? slots[0].activeBet > 0 || slots[0].queuedBet > 0
                    : tab === '2'
                      ? slots[1].activeBet > 0 || slots[1].queuedBet > 0
                      : false;
                return (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => {
                      soundEngine.playClick();
                      setMobilePanelMode(tab);
                    }}
                    className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold inline-flex items-center gap-1 transition-colors ${
                      mobilePanelMode === tab
                        ? 'bg-[#d4af37] text-[#090710]'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <span>{tab === 'both' ? 'Dual (1+2)' : `Bet ${tab}`}</span>
                    {slotStatus && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Instant Cash-Out safety button if hidden mobile panel is flying with an active bet */}
            {mobilePanelMode !== 'both' &&
              (() => {
                const hiddenIdx: 0 | 1 = mobilePanelMode === '1' ? 1 : 0;
                const hiddenSlot = slots[hiddenIdx];
                if (phase === 'flying' && hiddenSlot.activeBet > 0 && !hiddenSlot.hasCashedOut) {
                  return (
                    <button
                      type="button"
                      onClick={() => void triggerCashout(hiddenIdx, false)}
                      className="px-2.5 py-1 rounded-lg bg-emerald-500 text-[#05140d] font-extrabold text-[11px] font-mono-num shadow-[0_0_12px_rgba(16,185,129,0.45)]"
                    >
                      Cash Bet {hiddenSlot.id} ·{' '}
                      {Math.round(hiddenSlot.activeBet * multiplier).toLocaleString()}
                    </button>
                  );
                }
                return (
                  <span className="text-[10px] text-zinc-500 font-mono-num">
                    Bal: {balance.toLocaleString()}
                  </span>
                );
              })()}
          </div>

          {/* Desktop: Always Dual 2-Column Grid | Mobile: Selected Tab or Dual */}
          <div className="hidden md:grid md:grid-cols-2 gap-2.5">
            {renderBetPanel(0)}
            {renderBetPanel(1)}
          </div>

          <div className="grid md:hidden grid-cols-1 gap-1.5">
            {(mobilePanelMode === '1' || mobilePanelMode === 'both') && renderBetPanel(0)}
            {(mobilePanelMode === '2' || mobilePanelMode === 'both') && renderBetPanel(1)}
          </div>

          <div className="hidden sm:flex items-center justify-between text-[10px] text-zinc-500 pt-0.5">
            <span>Server-Authoritative Auto Crash · Dual Independent Cash-Out Panels</span>
            <span>{VIRTUAL_COIN_DISCLAIMER}</span>
          </div>
        </div>
      </div>

      {/* Crash History & Personal Flight Log Modal */}
      {historyModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          onClick={() => setHistoryModalOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-[#110c20] border border-[#d4af37]/30 p-4 space-y-4 max-h-[82dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#f6dc93]" />
                <h2 className="font-display text-base font-bold text-white">
                  Flight Crash History
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setHistoryModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-black/45 border border-white/8 p-2">
                <div className="text-[10px] uppercase text-zinc-400">Flights</div>
                <div className="font-mono-num text-sm font-bold text-white">
                  {roundStats.flights}
                </div>
              </div>
              <div className="rounded-xl bg-black/45 border border-white/8 p-2">
                <div className="text-[10px] uppercase text-zinc-400">Best Mult</div>
                <div className="font-mono-num text-sm font-bold text-[#f6dc93]">
                  {roundStats.bestCashout.toFixed(2)}x
                </div>
              </div>
              <div className="rounded-xl bg-black/45 border border-white/8 p-2">
                <div className="text-[10px] uppercase text-zinc-400">Net Coins</div>
                <div
                  className={`font-mono-num text-sm font-bold ${
                    roundStats.totalProfit >= 0 ? 'text-emerald-300' : 'text-rose-300'
                  }`}
                >
                  {roundStats.totalProfit >= 0 ? '+' : ''}
                  {roundStats.totalProfit.toLocaleString()}
                </div>
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-zinc-300 mb-2">
                Last {recentMultipliers.length} Crash Points
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentMultipliers.map((m, idx) => (
                  <span
                    key={`hist_${m}_${idx}`}
                    className={`font-mono-num text-xs font-bold px-2.5 py-1 rounded-lg border ${getCrashBadgeClass(m)}`}
                  >
                    {m.toFixed(2)}x
                  </span>
                ))}
              </div>
            </div>

            <div>
              <div className="text-xs font-semibold text-zinc-300 mb-2">My Recent Bets</div>
              {myHistory.length === 0 ? (
                <p className="text-xs text-zinc-500">
                  No completed bets yet this session. Place a bet on Panel 1 or Panel 2 to fly!
                </p>
              ) : (
                <div className="space-y-1.5">
                  {myHistory.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-black/40 border border-white/8"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-500 font-mono-num">{item.time}</span>
                        <span className="text-zinc-300">P{item.slot}</span>
                        <span className="font-mono-num text-zinc-200">
                          {item.wager.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 font-mono-num">
                        <span className={item.won ? 'text-emerald-300' : 'text-rose-400'}>
                          {item.multiplier.toFixed(2)}x
                        </span>
                        <span
                          className={`font-bold ${item.won ? 'text-emerald-400' : 'text-zinc-500'}`}
                        >
                          {item.won ? `+${item.payout.toLocaleString()}` : '0'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <GameRulesModal open={rulesOpen} game="aviator" onClose={() => setRulesOpen(false)} />

      <ProvablyFairModal
        open={fairModalOpen}
        onClose={() => setFairModalOpen(false)}
        proof={fairProof}
      />

      <GameExitModal
        open={backGuard.showExitConfirm}
        title="Leave Active Helicopter Flight?"
        description="You have an active or queued Aviator wager. Leaving now will prevent manual cash-out during this flight."
        onCancel={backGuard.cancelExit}
        onConfirm={backGuard.confirmExit}
      />
    </div>
  );
}
