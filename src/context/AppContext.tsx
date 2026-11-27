import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  checkIsAdmin,
  DEFAULT_GAME_CONFIGS,
  DEFAULT_PLATFORM_LIQUIDITY_SETTINGS,
  fetchAllGameConfigs,
  fetchPlatformLiquiditySettings,
  isRootAdminEmail,
  subscribePlatformLiquiditySettings,
  syncAdminRoleToUserDoc,
  syncPlatformLiquidityToServer,
  verifyAdminSessionWithServer,
} from '../services/adminService';
import {
  auth,
  db,
  ensureFirestoreOnline,
  googleProvider,
  handleFirestoreError,
  isFirestoreOfflineError,
  OperationType,
} from '../services/firebase';
import { soundEngine } from '../services/soundEngine';
import {
  applyReferralCode,
  claimDailyLoginReward,
  ensureUserProvisioned,
  extractWalletBuckets,
  placeAtomicBet,
  settleAtomicGameRound,
  updateUserProfileAndSettings,
} from '../services/walletService';
import type {
  ApkConfig,
  GameConfigDoc,
  GameHistoryRecord,
  GameId,
  GraphicsQuality,
  PlatformLiquiditySettings,
  PublicProfile,
  UserPrivate,
} from '../types';

export interface ToastNotice {
  id: string;
  tone: 'gold' | 'emerald' | 'crimson' | 'neutral';
  message: string;
}

export interface SessionAccountData {
  profile: PublicProfile;
  privateUser: UserPrivate;
  mobile: string;
  fullName: string;
}

const PENDING_REF_STORAGE_KEY = 'aurelia_pending_ref_code';

interface AppContextValue {
  firebaseUser: User | null;
  sessionUser: SessionAccountData | null;
  isAuthenticated: boolean;
  authReady: boolean;
  isAdmin: boolean;
  profile: PublicProfile | null;
  privateUser: UserPrivate | null;
  balance: number;
  depositBalance: number;
  winningBalance: number;
  bonusBalance: number;
  isGuestMode: boolean;
  graphicsQuality: GraphicsQuality;
  setGraphicsQuality: (q: GraphicsQuality, silent?: boolean) => void;
  soundEnabled: boolean;
  musicEnabled: boolean;
  volume: number;
  updateAudio: (opts: { soundEnabled?: boolean; musicEnabled?: boolean; volume?: number }) => void;
  gameConfigs: Record<GameConfigDoc['gameId'], GameConfigDoc>;
  platformSettings: PlatformLiquiditySettings;
  apkConfig: ApkConfig;
  refreshConfigs: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (email: string, password: string, username: string, referralCode?: string) => Promise<void>;
  loginWithCredentials: (identifier: string, password: string) => Promise<void>;
  registerWithCredentials: (params: {
    fullName: string;
    contactType: 'mobile' | 'email';
    mobile?: string;
    email?: string;
    password: string;
    referralCode?: string;
  }) => Promise<void>;
  updateAccountProfile: (opts: { username: string; avatarSeed: string }) => Promise<void>;
  claimDailyCheckIn: () => Promise<{ reward: number; streakDays: number; nextBalance: number }>;
  sendResetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  placeBet: (game: GameId, amount: number, roundId: string, description: string) => Promise<number>;
  settleRound: (params: {
    game: GameId;
    betAmount: number;
    payout: number;
    outcome: GameHistoryRecord['outcome'];
    summary: string;
    roundId: string;
    seedHash: string;
  }) => Promise<number>;
  pushToast: (message: string, tone?: ToastNotice['tone']) => void;
  toasts: ToastNotice[];
  dismissToast: (id: string) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

function isValidHttps(url: string): boolean {
  try {
    return new URL(url.trim()).protocol === 'https:';
  } catch {
    return false;
  }
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [firebaseAuthReady, setFirebaseAuthReady] = useState(false);
  const [sessionAuthReady, setSessionAuthReady] = useState(false);
  const [sessionUser, setSessionUser] = useState<SessionAccountData | null>(null);
  const sessionTokenRef = useRef<string | null>(null);

  const [isAdmin, setIsAdmin] = useState(false);
  const [firestoreProfile, setFirestoreProfile] = useState<PublicProfile | null>(null);
  const [firestorePrivateUser, setFirestorePrivateUser] = useState<UserPrivate | null>(null);

  // Graphics quality is permanently locked to 'ultra' across all games
  const graphicsQuality: GraphicsQuality = 'ultra';
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [musicEnabled, setMusicEnabled] = useState(false);
  const [volume, setVolume] = useState(0.65);

  const [gameConfigs, setGameConfigs] =
    useState<Record<GameConfigDoc['gameId'], GameConfigDoc>>(DEFAULT_GAME_CONFIGS);
  const [platformSettings, setPlatformSettings] = useState<PlatformLiquiditySettings>(
    DEFAULT_PLATFORM_LIQUIDITY_SETTINGS,
  );
  const [apkConfig, setApkConfig] = useState<ApkConfig>({
    available: false,
    downloadUrl: '',
    version: '1.1.0',
    size: '48.6 MB',
    updatedAt: '2026-11-26',
    androidCompat: 'Android 9.0 (Pie) or higher · ARM64 / ARMv7',
  });
  const [toasts, setToasts] = useState<ToastNotice[]>([]);

  const pushToast = useCallback((message: string, tone: ToastNotice['tone'] = 'gold') => {
    const id = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { id, tone, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4200);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const authFetch = useCallback(async (url: string, body?: unknown, method = 'POST') => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    };
    if (sessionTokenRef.current) {
      headers.Authorization = `Bearer ${sessionTokenRef.current}`;
    }
    return fetch(url, {
      method,
      credentials: 'include',
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }, []);

  // Capture ?ref=CODE from URL on initial landing
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const ref = params.get('ref');
      if (ref && /^[A-Za-z0-9]{4,24}$/.test(ref.trim())) {
        sessionStorage.setItem(PENDING_REF_STORAGE_KEY, ref.trim().toUpperCase());
      }
    } catch {
      // ignore storage issues
    }
  }, []);

  // Hydrate server cookie session on app mount
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/session', {
      method: 'GET',
      credentials: 'include',
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    })
      .then(async (resp) => {
        if (!resp.ok) return null;
        return (await resp.json()) as {
          authenticated?: boolean;
          user?: SessionAccountData | null;
        };
      })
      .then((data) => {
        if (cancelled) return;
        if (data?.authenticated && data.user) {
          setSessionUser(data.user);
          setSoundEnabled(data.user.privateUser.soundEnabled);
          setMusicEnabled(data.user.privateUser.musicEnabled);
          setVolume(data.user.privateUser.volume);
          soundEngine.configure({
            soundEnabled: data.user.privateUser.soundEnabled,
            musicEnabled: data.user.privateUser.musicEnabled,
            volume: data.user.privateUser.volume,
          });
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setSessionAuthReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refreshConfigs = useCallback(async () => {
    const [cfgs, liquidity] = await Promise.all([
      fetchAllGameConfigs(),
      fetchPlatformLiquiditySettings(),
    ]);
    setGameConfigs(cfgs);
    setPlatformSettings(liquidity);

    let envApk: ApkConfig = {
      available: false,
      downloadUrl: '',
      version: cfgs.platform.apkVersion || '1.1.0',
      size: cfgs.platform.apkSize || '48.6 MB',
      updatedAt: cfgs.platform.apkUpdatedAt || '2026-11-26',
      androidCompat: cfgs.platform.apkAndroidCompat || 'Android 9.0+',
    };

    try {
      const resp = await fetch('/api/config/apk');
      if (resp.ok) {
        const data = (await resp.json()) as ApkConfig;
        envApk = data;
      }
    } catch {
      // ignore if offline
    }

    const adminUrl = (cfgs.platform.apkDownloadUrl || '').trim();
    const resolvedUrl = isValidHttps(adminUrl)
      ? adminUrl
      : isValidHttps(envApk.downloadUrl)
        ? envApk.downloadUrl
        : '';

    setApkConfig({
      available: Boolean(resolvedUrl),
      downloadUrl: resolvedUrl,
      version: cfgs.platform.apkVersion || envApk.version,
      size: cfgs.platform.apkSize || envApk.size,
      updatedAt: cfgs.platform.apkUpdatedAt || envApk.updatedAt,
      androidCompat: cfgs.platform.apkAndroidCompat || envApk.androidCompat,
    });
  }, []);

  useEffect(() => {
    void refreshConfigs();
    const unsubLiquidity = subscribePlatformLiquiditySettings((next) => {
      setPlatformSettings(next);
    });
    return () => unsubLiquidity();
  }, [refreshConfigs]);

  useEffect(() => {
    let unsubPub: (() => void) | null = null;
    let unsubPriv: (() => void) | null = null;
    let removeOnlineListener: (() => void) | null = null;
    let activeSession = 0;

    const cleanupSession = () => {
      if (unsubPub) {
        unsubPub();
        unsubPub = null;
      }
      if (unsubPriv) {
        unsubPriv();
        unsubPriv = null;
      }
      if (removeOnlineListener) {
        removeOnlineListener();
        removeOnlineListener = null;
      }
    };

    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      activeSession += 1;
      const sessionToken = activeSession;
      cleanupSession();

      setFirebaseUser(user);

      if (!user) {
        setFirestoreProfile(null);
        setFirestorePrivateUser(null);
        setIsAdmin(false);
        setFirebaseAuthReady(true);
        return;
      }

      const rootAdmin = isRootAdminEmail(user.email);
      if (rootAdmin) {
        setIsAdmin(true);
      }

      let hydratedRole: string | undefined;

      if (user.emailVerified || rootAdmin) {
        const hydrateUser = async (): Promise<boolean> => {
          try {
            const provisioned = await ensureUserProvisioned({
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || '',
              defaultGraphics: 'ultra',
            });
            if (sessionToken !== activeSession) return true;
            hydratedRole = provisioned.privateUser.role;
            setFirestoreProfile(provisioned.profile);
            setFirestorePrivateUser(provisioned.privateUser);
            if (rootAdmin || provisioned.privateUser.role === 'admin') {
              setIsAdmin(true);
            }
            setSoundEnabled(provisioned.privateUser.soundEnabled);
            setMusicEnabled(provisioned.privateUser.musicEnabled);
            setVolume(provisioned.privateUser.volume);
            soundEngine.configure({
              soundEnabled: provisioned.privateUser.soundEnabled,
              musicEnabled: provisioned.privateUser.musicEnabled,
              volume: provisioned.privateUser.volume,
            });

            // Auto-link pending referral code from URL or signup form if account has no referrer yet
            try {
              const pendingRef = sessionStorage.getItem(PENDING_REF_STORAGE_KEY);
              if (pendingRef && !provisioned.privateUser.referredBy) {
                sessionStorage.removeItem(PENDING_REF_STORAGE_KEY);
                void applyReferralCode(user.uid, provisioned.profile.username, pendingRef)
                  .then((res) => {
                    pushToast(
                      `Referral code ${res.code} linked! Finish your 1st game to unlock your friend's bonus.`,
                      'gold',
                    );
                  })
                  .catch(() => {});
              }
            } catch {
              // ignore sessionStorage error
            }
            return true;
          } catch (err) {
            if (isFirestoreOfflineError(err)) {
              pushToast('Connection unstable — will sync your cloud wallet as soon as network returns.', 'gold');
            } else {
              console.error('User provisioning failed:', err);
            }
            return false;
          }
        };

        const hydrated = await hydrateUser();
        if (sessionToken !== activeSession) return;

        if (!hydrated && typeof window !== 'undefined') {
          const onReconnect = () => {
            void ensureFirestoreOnline().then(async () => {
              const ok = await hydrateUser();
              if (ok && removeOnlineListener) {
                removeOnlineListener();
                removeOnlineListener = null;
              }
            });
          };
          window.addEventListener('online', onReconnect);
          removeOnlineListener = () => window.removeEventListener('online', onReconnect);
        }

        unsubPub = onSnapshot(
          doc(db, 'publicProfiles', user.uid),
          (snap) => {
            if (snap.exists()) setFirestoreProfile(snap.data() as PublicProfile);
          },
          (error) => {
            if (!isFirestoreOfflineError(error)) {
              handleFirestoreError(error, OperationType.GET, `publicProfiles/${user.uid}`);
            }
          },
        );

        unsubPriv = onSnapshot(
          doc(db, 'users', user.uid),
          (snap) => {
            if (snap.exists()) {
              const p = snap.data() as UserPrivate;
              setFirestorePrivateUser(p);
              if (p.role === 'admin' || rootAdmin) {
                setIsAdmin(true);
              }
            }
          },
          (error) => {
            if (!isFirestoreOfflineError(error)) {
              handleFirestoreError(error, OperationType.GET, `users/${user.uid}`);
            }
          },
        );
      }

      const adminFlag = await checkIsAdmin(user.uid, user.email, user.emailVerified, hydratedRole);
      if (sessionToken === activeSession) {
        setIsAdmin(adminFlag);
        setFirebaseAuthReady(true);
        if (adminFlag) {
          void syncAdminRoleToUserDoc(user.uid, user.email);
          void verifyAdminSessionWithServer();
          void fetchPlatformLiquiditySettings()
            .then((s) => syncPlatformLiquidityToServer(s))
            .catch(() => {});
        }
      }
    });

    return () => {
      activeSession += 1;
      unsubAuth();
      cleanupSession();
    };
  }, [pushToast]);

  const setGraphicsQuality = useCallback(
    (_q: GraphicsQuality, _silent = true) => {
      // Graphics quality is permanently locked to 'ultra'
    },
    [],
  );

  const updateAudio = useCallback(
    (opts: { soundEnabled?: boolean; musicEnabled?: boolean; volume?: number }) => {
      if (typeof opts.soundEnabled === 'boolean') setSoundEnabled(opts.soundEnabled);
      if (typeof opts.musicEnabled === 'boolean') setMusicEnabled(opts.musicEnabled);
      if (typeof opts.volume === 'number') setVolume(opts.volume);
      soundEngine.configure(opts);
      if (firebaseUser && (firebaseUser.emailVerified || isRootAdminEmail(firebaseUser.email))) {
        void updateUserProfileAndSettings(firebaseUser.uid, opts).catch(() => {});
      } else if (sessionUser) {
        void authFetch('/api/account/profile', opts)
          .then(async (resp) => {
            if (!resp.ok) return;
            const data = (await resp.json()) as { user?: SessionAccountData };
            if (data.user) setSessionUser(data.user);
          })
          .catch(() => {});
      }
    },
    [authFetch, firebaseUser, sessionUser],
  );

  const signInWithGoogle = useCallback(async () => {
    await signInWithPopup(auth, googleProvider);
    soundEngine.playCoinReward();
    pushToast('Signed in with Google. Cloud wallet synced.', 'emerald');
  }, [pushToast]);

  const signInWithEmail = useCallback(
    async (email: string, password: string) => {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      if (!cred.user.emailVerified) {
        pushToast('Please verify your email address to enable cloud wallet saves.', 'gold');
      } else {
        pushToast('Signed in successfully.', 'emerald');
      }
    },
    [pushToast],
  );

  const registerWithEmail = useCallback(
    async (email: string, password: string, username: string, referralCode?: string) => {
      const cleanRef = (referralCode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleanRef.length >= 4 && cleanRef.length <= 24) {
        try {
          sessionStorage.setItem(PENDING_REF_STORAGE_KEY, cleanRef);
        } catch {
          // ignore
        }
      }
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      await updateProfile(cred.user, { displayName: username.trim().slice(0, 32) });
      await sendEmailVerification(cred.user).catch(() => {});
      pushToast('Account created. Check your inbox to verify your email.', 'gold');
    },
    [pushToast],
  );

  const loginWithCredentials = useCallback(
    async (identifier: string, password: string) => {
      const resp = await authFetch('/api/auth/login', { identifier, password });
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sessionToken?: string;
        user?: SessionAccountData;
      };
      if (!resp.ok || !data.ok || !data.user) {
        throw new Error(data.error || 'Invalid mobile number/email or password.');
      }
      sessionTokenRef.current = data.sessionToken || null;
      setSessionUser(data.user);
      soundEngine.playCoinReward();
      pushToast(`Welcome back, ${data.user.profile.username}!`, 'emerald');
    },
    [authFetch, pushToast],
  );

  const registerWithCredentials = useCallback(
    async (params: {
      fullName: string;
      contactType: 'mobile' | 'email';
      mobile?: string;
      email?: string;
      password: string;
      referralCode?: string;
    }) => {
      const resp = await authFetch('/api/auth/register', params);
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        sessionToken?: string;
        user?: SessionAccountData;
      };
      if (!resp.ok || !data.ok || !data.user) {
        throw new Error(data.error || 'Unable to create account.');
      }
      sessionTokenRef.current = data.sessionToken || null;
      setSessionUser(data.user);
      soundEngine.playCoinReward();
      pushToast(`Account created for ${data.user.profile.username}!`, 'emerald');
    },
    [authFetch, pushToast],
  );

  const sendResetPassword = useCallback(
    async (email: string) => {
      await sendPasswordResetEmail(auth, email.trim());
      pushToast('Password reset link sent to your email.', 'emerald');
    },
    [pushToast],
  );

  const logout = useCallback(async () => {
    sessionTokenRef.current = null;
    setSessionUser(null);
    setFirestoreProfile(null);
    setFirestorePrivateUser(null);
    setIsAdmin(false);
    await authFetch('/api/auth/logout', {}).catch(() => {});
    if (auth.currentUser) {
      await signOut(auth).catch(() => {});
    }
    soundEngine.stopEngine();
    pushToast('Signed out of Aurelia Arena.', 'neutral');
  }, [authFetch, pushToast]);

  const hasVerifiedFirebase =
    Boolean(firebaseUser) &&
    (Boolean(firebaseUser?.emailVerified) || isRootAdminEmail(firebaseUser?.email)) &&
    Boolean(firestoreProfile);

  const isAuthenticated = hasVerifiedFirebase || Boolean(sessionUser);
  const authReady = firebaseAuthReady && sessionAuthReady;
  const isGuestMode = !hasVerifiedFirebase;

  const profile = hasVerifiedFirebase ? firestoreProfile : sessionUser?.profile ?? null;
  const privateUser = hasVerifiedFirebase ? firestorePrivateUser : sessionUser?.privateUser ?? null;

  const resolvedBuckets = profile
    ? extractWalletBuckets(profile)
    : {
        depositBalance: 0,
        winningBalance: 0,
        bonusBalance: 0,
        totalBalance: 0,
      };

  const balance = resolvedBuckets.totalBalance;
  const depositBalance = resolvedBuckets.depositBalance;
  const winningBalance = resolvedBuckets.winningBalance;
  const bonusBalance = resolvedBuckets.bonusBalance;

  const updateAccountProfile = useCallback(
    async (opts: { username: string; avatarSeed: string }) => {
      if (hasVerifiedFirebase && firebaseUser) {
        await updateUserProfileAndSettings(firebaseUser.uid, opts);
        return;
      }
      if (sessionUser) {
        const resp = await authFetch('/api/account/profile', opts);
        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          user?: SessionAccountData;
        };
        if (!resp.ok || !data.ok || !data.user) {
          throw new Error(data.error || 'Unable to save profile');
        }
        setSessionUser(data.user);
        return;
      }
      throw new Error('Authentication required');
    },
    [authFetch, firebaseUser, hasVerifiedFirebase, sessionUser],
  );

  const claimDailyCheckIn = useCallback(async () => {
    if (hasVerifiedFirebase && firebaseUser) {
      return claimDailyLoginReward(firebaseUser.uid);
    }
    if (sessionUser) {
      const resp = await authFetch('/api/account/daily-claim', {});
      const data = (await resp.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        reward?: number;
        streakDays?: number;
        nextBalance?: number;
        user?: SessionAccountData;
      };
      if (!resp.ok || !data.ok || !data.user) {
        throw new Error(data.error || 'Unable to claim daily reward');
      }
      setSessionUser(data.user);
      return {
        reward: data.reward || 0,
        streakDays: data.streakDays || 1,
        nextBalance: data.nextBalance || 0,
      };
    }
    throw new Error('Please sign in to claim daily rewards.');
  }, [authFetch, firebaseUser, hasVerifiedFirebase, sessionUser]);

  const placeBet = useCallback(
    async (game: GameId, amount: number, roundId: string, description: string): Promise<number> => {
      const wager = Math.floor(amount);
      if (wager <= 0) throw new Error('Wager must be greater than zero');
      if (hasVerifiedFirebase && firebaseUser) {
        return placeAtomicBet({
          uid: firebaseUser.uid,
          game,
          amount: wager,
          roundId,
          description,
        });
      }
      if (sessionUser) {
        const resp = await authFetch('/api/account/bet', { amount: wager, game, roundId });
        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          nextBalance?: number;
          user?: SessionAccountData;
        };
        if (!resp.ok || !data.ok || !data.user) {
          throw new Error(data.error || 'Insufficient balance. Please deposit coins in Wallet.');
        }
        setSessionUser(data.user);
        return data.nextBalance ?? data.user.profile.balance;
      }
      throw new Error('Please log in to place bets.');
    },
    [authFetch, firebaseUser, hasVerifiedFirebase, sessionUser],
  );

  const settleRound = useCallback(
    async (params: {
      game: GameId;
      betAmount: number;
      payout: number;
      outcome: GameHistoryRecord['outcome'];
      summary: string;
      roundId: string;
      seedHash: string;
    }): Promise<number> => {
      if (hasVerifiedFirebase && firebaseUser && firestoreProfile) {
        return settleAtomicGameRound({
          uid: firebaseUser.uid,
          username: firestoreProfile.username,
          ...params,
        });
      }
      if (sessionUser) {
        const resp = await authFetch('/api/account/settle', {
          betAmount: params.betAmount,
          payout: params.payout,
          outcome: params.outcome,
        });
        const data = (await resp.json().catch(() => ({}))) as {
          ok?: boolean;
          nextBalance?: number;
          user?: SessionAccountData;
        };
        if (resp.ok && data.ok && data.user) {
          setSessionUser(data.user);
          return data.nextBalance ?? data.user.profile.balance;
        }
        return balance;
      }
      return balance;
    },
    [authFetch, balance, firebaseUser, firestoreProfile, hasVerifiedFirebase, sessionUser],
  );

  return (
    <AppContext.Provider
      value={{
        firebaseUser,
        sessionUser,
        isAuthenticated,
        authReady,
        isAdmin,
        profile,
        privateUser,
        balance,
        depositBalance,
        winningBalance,
        bonusBalance,
        isGuestMode,
        graphicsQuality,
        setGraphicsQuality,
        soundEnabled,
        musicEnabled,
        volume,
        updateAudio,
        gameConfigs,
        platformSettings,
        apkConfig,
        refreshConfigs,
        signInWithGoogle,
        signInWithEmail,
        registerWithEmail,
        loginWithCredentials,
        registerWithCredentials,
        updateAccountProfile,
        claimDailyCheckIn,
        sendResetPassword,
        logout,
        placeBet,
        settleRound,
        pushToast,
        toasts,
        dismissToast,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
