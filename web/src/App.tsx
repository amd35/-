import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from './lib/auth';
import { useI18n } from './lib/i18n';
import { BackgroundLayer } from './lib/backgrounds';
import { Spinner } from './lib/ui';
import { CallOverlay } from './components/CallOverlay';
import { GiftTicker } from './components/GiftTicker';
import { DailyBoxModal } from './components/DailyBoxModal';
import { LoginRewardModal } from './components/LoginRewardModal';
import { LevelUpOverlay } from './components/LevelUpOverlay';
import { BottomNav } from './components/AppShell';
import Welcome from './pages/Welcome';
import { Login, Register, ForgotPassword } from './pages/Auth';
import Home from './pages/Home';
import Chats from './pages/Chats';
import ChatRoom from './pages/ChatRoom';
import Calls from './pages/Calls';
import Wallet from './pages/Wallet';
import Notifications from './pages/Notifications';
import { Profile, UserProfile } from './pages/Profile';
import Settings from './pages/Settings';
import Frames from './pages/Frames';
import Ranks from './pages/Ranks';
import Levels from './pages/Levels';
import Rooms from './pages/Rooms';
import Room from './pages/Room';
import Ads from './pages/Ads';
import AdDetails from './pages/AdDetails';
import Admin from './pages/Admin';
import AgentPanel from './pages/AgentPanel';
import Agents from './pages/Agents';
import Games from './pages/Games';
import Game from './pages/Game';
import GameMatch from './pages/GameMatch';

function Protected({ children }: { children: ReactNode }) {
  const { token, loading, me } = useAuth();
  const { t } = useI18n();
  if (!token) return <Navigate to="/welcome" replace />;
  if (loading && !me) {
    return (
      <div className="app-shell">
        <Spinner label={t('loading')} />
      </div>
    );
  }
  return <>{children}</>;
}

export default function App() {
  const { token } = useAuth();
  const navigate = useNavigate();

  return (
    <>
      <BackgroundLayer />
      <GiftTicker />
      <Routes>
        <Route path="/welcome" element={<Welcome />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route
          path="/"
          element={
            <Protected>
              <Home />
            </Protected>
          }
        />
        <Route
          path="/chats"
          element={
            <Protected>
              <Chats />
            </Protected>
          }
        />
        <Route
          path="/chats/:id"
          element={
            <Protected>
              <ChatRoom />
            </Protected>
          }
        />
        <Route
          path="/calls"
          element={
            <Protected>
              <Calls />
            </Protected>
          }
        />
        <Route
          path="/wallet"
          element={
            <Protected>
              <Wallet />
            </Protected>
          }
        />
        <Route
          path="/notifications"
          element={
            <Protected>
              <Notifications />
            </Protected>
          }
        />
        <Route
          path="/frames"
          element={
            <Protected>
              <Frames />
            </Protected>
          }
        />
        <Route
          path="/ranks"
          element={
            <Protected>
              <Ranks />
            </Protected>
          }
        />
        <Route
          path="/profile"
          element={
            <Protected>
              <Profile />
            </Protected>
          }
        />
        <Route
          path="/u/:id"
          element={
            <Protected>
              <UserProfile />
            </Protected>
          }
        />
        <Route
          path="/settings"
          element={
            <Protected>
              <Settings />
            </Protected>
          }
        />
        <Route
          path="/levels"
          element={
            <Protected>
              <Levels />
            </Protected>
          }
        />
        <Route
          path="/rooms"
          element={
            <Protected>
              <Rooms />
            </Protected>
          }
        />
        <Route
          path="/rooms/:id"
          element={
            <Protected>
              <Room />
            </Protected>
          }
        />
        <Route
          path="/ads"
          element={
            <Protected>
              <Ads />
            </Protected>
          }
        />
        <Route
          path="/ads/:id"
          element={
            <Protected>
              <AdDetails />
            </Protected>
          }
        />
        <Route
          path="/agent"
          element={
            <Protected>
              <AgentPanel />
            </Protected>
          }
        />
        <Route
          path="/agents"
          element={
            <Protected>
              <Agents />
            </Protected>
          }
        />
        <Route
          path="/games"
          element={
            <Protected>
              <Games />
            </Protected>
          }
        />
        <Route
          path="/game"
          element={
            <Protected>
              <Game />
            </Protected>
          }
        />
        <Route
          path="/game/:id"
          element={
            <Protected>
              <GameMatch />
            </Protected>
          }
        />
        <Route path="/admin" element={<Admin />} />
        <Route
          path="*"
          element={
            <div className="app-shell">
              <div className="page">
                <div className="card center">
                  <h2>404</h2>
                  <p className="muted">This page does not exist.</p>
                  <button
                    className="btn btn-primary btn-block"
                    style={{ marginTop: 12 }}
                    onClick={() => navigate(token ? '/' : '/welcome')}
                  >
                    Home
                  </button>
                </div>
                <BottomNav active="home" />
              </div>
            </div>
          }
        />
      </Routes>
      <CallOverlay />
      <DailyBoxModal />
      <LoginRewardModal />
      <LevelUpOverlay />
    </>
  );
}
