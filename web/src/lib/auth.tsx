import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, getToken, setToken } from './api';

export interface SelfUser {
  frame: { id: string; design: string | null; kind: string; imageUrl: string | null; rarity: string } | null;
  id: string;
  email: string | null;
  phone: string | null;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  gender: string | null;
  country: string | null;
  age: number | null;
  isAdmin: boolean;
  security?: {
    strikes: number;
    suspendedUntil: string | null;
    banned?: boolean;
    banReason?: string | null;
  };
  provider: string;
  createdAt: string;
  verified?: boolean;
}

export interface WalletInfo {
  balance: number;
  reserved: number;
  earned: number;
  spent: number;
  /** Second currency, credited by official recharge agents. */
  gold?: number;
  /** Withdrawable profit balance (beans). */
  beans?: number;
}

/** Official recharge agency, present only while the admin keeps it active. */
export interface AgentSelfInfo {
  status: 'active' | 'suspended';
  commissionPercent: number;
  coinsBalance: number;
  goldBalance: number;
  dueCommission: number;
}

export interface FreeCallInfo {
  enabled: boolean;
  perDay: number;
  used: number;
  voiceUsed: number;
  videoUsed: number;
  remaining: number;
  voiceRemaining: number;
  videoRemaining: number;
  shared: boolean;
  exempt: boolean;
  usageDate: string;
  nextResetAt: string;
}

export interface AppConfig {
  appName: string;
  voicePrice: number;
  videoPrice: number;
  freeCallsPerDay: number;
  freeCallsEnabled: boolean;
  paidCallsEnabled: boolean;
  minWithdrawalCoins: number;
  coinToIqdRate: number;
  supportContact: string;
}

export interface Me {
  user: SelfUser;
  /** The official rank the signed-in user currently holds, if any. */
  rank: import('../components/RankBadge').RankInfo | null;
  /** Normal level state (XP), independent of VIP. */
  level: import('../components/ProgressionBadges').LevelState;
  /** Active VIP subscription, or null. */
  vip: import('../components/ProgressionBadges').VipInfo | null;
  /** Equipped non-frame cosmetics, keyed by category (id | namecard | bubble | entry). */
  cosmetics: Record<string, { id: string; design: string | null; kind: string; imageUrl: string | null; rarity: string } | undefined>;
  /** Royal administration identity, or null for a regular user. */
  adminLook: {
    rankKey: string;
    label: string;
    effectsEnabled: boolean;
    frameId: string | null;
    namecardId: string | null;
    bubbleId: string | null;
    entryId: string | null;
  } | null;
  wallet: WalletInfo;
  agent: AgentSelfInfo | null;
  freeCalls: FreeCallInfo;
  unreadNotifications: number;
  friendRequests: number;
  unreadMessages: number;
  config: AppConfig;
}

interface AuthResponse extends Me {
  token: string;
}

interface AuthValue {
  token: string | null;
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  register: (payload: Record<string, unknown>) => Promise<void>;
  applyAuth: (response: AuthResponse) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(Boolean(getToken()));

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      const data = await api<Me>('/auth/me');
      setMe(data);
      setTokenState(getToken());
    } catch (error) {
      const status = (error as { status?: number }).status;
      if (status === 401 || status === 403) {
        setToken(null);
        setTokenState(null);
        setMe(null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const applyAuth = useCallback((response: AuthResponse) => {
    setToken(response.token);
    setTokenState(response.token);
    const { token: _token, ...rest } = response;
    setMe(rest as Me);
    setLoading(false);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const response = await api<AuthResponse>('/auth/login', {
        method: 'POST',
        body: { identifier, password },
      });
      applyAuth(response);
    },
    [applyAuth]
  );

  const register = useCallback(
    async (payload: Record<string, unknown>) => {
      const response = await api<AuthResponse>('/auth/register', { method: 'POST', body: payload });
      applyAuth(response);
    },
    [applyAuth]
  );

  const logout = useCallback(() => {
    setToken(null);
    setTokenState(null);
    setMe(null);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ token, me, loading, refresh, login, register, applyAuth, logout }),
    [token, me, loading, refresh, login, register, applyAuth, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
