import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { BrandLogo } from './components/BrandLogo';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { PwaInstallOverlay } from './components/PwaInstallOverlay';
import { AppProvider, useApp } from './context/AppContext';
import { PwaInstallProvider } from './context/PwaInstallContext';
import AviatorPage from './games/aviator/AviatorPage';
import DragonTigerPage from './games/dragon-tiger/DragonTigerPage';
import LudoPage from './games/ludo/LudoPage';
import TeenPattiPage from './games/teen-patti/TeenPattiPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import AuthPage from './pages/AuthPage';
import DownloadApkPage from './pages/DownloadApkPage';
import GamesPage from './pages/GamesPage';
import HomePage from './pages/HomePage';
import {
  AboutPage,
  ContactPage,
  FairPlayPolicyPage,
  PrivacyPage,
  ResponsibleGamingPage,
  RulesPage,
  TermsPage,
} from './pages/InfoPages';
import LeaderboardPage from './pages/LeaderboardPage';
import ProfilePage from './pages/ProfilePage';
import RewardsPage from './pages/RewardsPage';
import { GameHistoryPage, TransactionsPage, WalletPage } from './pages/WalletPages';
import { applyRouteSeo } from './utils/seo';

function RouteSideEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    applyRouteSeo(pathname);
  }, [pathname]);
  return null;
}

function AuthenticatedAppGate() {
  const { authReady, isAuthenticated, balance } = useApp();

  if (!authReady) {
    return (
      <div className="min-h-[100dvh] w-full bg-[#07060b] flex flex-col items-center justify-center gap-4 px-4">
        <BrandLogo />
        <div className="text-xs text-zinc-400 tracking-wide">Loading Aurelia Arena...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/register" element={<AuthPage />} />
        <Route path="*" element={<AuthPage />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/games" element={<GamesPage />} />
        <Route path="/games/dragon-tiger" element={<DragonTigerPage />} />
        <Route path="/games/ludo" element={<LudoPage />} />
        <Route path="/games/aviator" element={<AviatorPage />} />
        <Route path="/games/teen-patti" element={<TeenPattiPage />} />
        <Route
          path="/login"
          element={<Navigate to={balance <= 0 ? '/wallet?tab=deposit' : '/'} replace />}
        />
        <Route path="/register" element={<Navigate to="/wallet?tab=deposit" replace />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/wallet" element={<WalletPage />} />
        <Route path="/transactions" element={<TransactionsPage />} />
        <Route path="/history" element={<GameHistoryPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/rewards" element={<RewardsPage />} />
        <Route path="/download-apk" element={<DownloadApkPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/support" element={<ContactPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/fair-play" element={<FairPlayPolicyPage />} />
        <Route path="/responsible-gaming" element={<ResponsibleGamingPage />} />
        <Route path="/rules" element={<RulesPage />} />
        <Route path="/admin" element={<AdminDashboardPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <PwaInstallProvider>
        <AppProvider>
          <BrowserRouter>
            <RouteSideEffects />
            <PwaInstallOverlay />
            <AuthenticatedAppGate />
          </BrowserRouter>
        </AppProvider>
      </PwaInstallProvider>
    </ErrorBoundary>
  );
}
