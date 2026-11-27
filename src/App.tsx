import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { AppProvider } from './context/AppContext';
import AviatorPage from './games/aviator/AviatorPage';
import DragonTigerPage from './games/dragon-tiger/DragonTigerPage';
import LudoPage from './games/ludo/LudoPage';
import TeenPattiPage from './games/teen-patti/TeenPattiPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
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

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Aurelia Arena – Ultra-Realistic 3D Teen Patti, Dragon Tiger, Ludo & Aviator',
  '/games': 'All 3D Games – Aurelia Arena',
  '/games/dragon-tiger': 'Dragon Tiger 3D – Aurelia Arena',
  '/games/ludo': 'Ludo 3D – Aurelia Arena',
  '/games/aviator': 'Aviator Ascent 3D – Aurelia Arena',
  '/games/teen-patti': 'Teen Patti 3D – Aurelia Arena',
  '/login': 'Log In – Aurelia Arena',
  '/register': 'Create Account – Aurelia Arena',
  '/profile': 'Player Profile – Aurelia Arena',
  '/wallet': 'Virtual Coin Wallet – Aurelia Arena',
  '/transactions': 'Transaction History – Aurelia Arena',
  '/history': 'Game History – Aurelia Arena',
  '/leaderboard': 'Leaderboard – Aurelia Arena',
  '/rewards': 'Daily Rewards & Missions – Aurelia Arena',
  '/download-apk': 'Download Android APK – Aurelia Arena',
  '/about': 'About Us – Aurelia Arena',
  '/contact': 'Help & Support Tickets – Aurelia Arena',
  '/support': 'Help & Support Tickets – Aurelia Arena',
  '/privacy': 'Privacy Policy – Aurelia Arena',
  '/terms': 'Terms and Conditions – Aurelia Arena',
  '/fair-play': 'Fair Play & RNG Policy – Aurelia Arena',
  '/responsible-gaming': 'Responsible Gaming (18+ Only) – Aurelia Arena',
  '/rules': 'Official Game Rules – Aurelia Arena',
  '/admin': 'Admin Dashboard – Aurelia Arena',
};

function RouteSideEffects() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    document.title = ROUTE_TITLES[pathname] || 'Aurelia Arena – 3D Multi-Game Platform';
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <BrowserRouter>
          <RouteSideEffects />
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/games" element={<GamesPage />} />
              <Route path="/games/dragon-tiger" element={<DragonTigerPage />} />
              <Route path="/games/ludo" element={<LudoPage />} />
              <Route path="/games/aviator" element={<AviatorPage />} />
              <Route path="/games/teen-patti" element={<TeenPattiPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
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
        </BrowserRouter>
      </AppProvider>
    </ErrorBoundary>
  );
}
