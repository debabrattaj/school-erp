import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError, clearSession, getApiBase, setSession, getToken, onUnauthorized } from "../api/client";
import { AuthUser, LoginResponse } from "./types";

const USER_CACHE_KEY = "school_erp_user";

interface LoginArgs {
  accountCode: string;
  email: string;
  password: string;
  mfaCode?: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  /** Set when the backend rejected a stored token, so the login screen can say why. */
  sessionExpired: boolean;
  login: (args: LoginArgs) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * A cached user is only usable if it still looks like one. A partial write or a
 * schema change would otherwise throw inside the bootstrap and leave the app on
 * a blank screen with no way back but reinstalling.
 */
function parseCachedUser(raw: string | null): AuthUser | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.role === "string") return parsed as AuthUser;
  } catch {
    // fall through — a corrupt cache is treated as no cache
  }
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        // Priming the base URL here is what lets `getApiBaseSync()` resolve
        // image and attachment URLs correctly on a restored session: without it
        // the first renders fall back to the default host even when the user
        // has pointed the app at another server.
        const [token, cachedUser] = await Promise.all([
          getToken(),
          AsyncStorage.getItem(USER_CACHE_KEY),
          getApiBase(),
        ]);
        const parsed = parseCachedUser(cachedUser);
        if (token && parsed) {
          setUser(parsed);
        } else if (token || cachedUser) {
          // Half a session is no session — clear it rather than sending
          // requests with a token we have no user for.
          await Promise.all([clearSession(), AsyncStorage.removeItem(USER_CACHE_KEY)]);
        }
      } catch {
        // Storage itself failed. Starting signed-out is recoverable; throwing
        // here would leave the app on its loading spinner with no way forward.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    await AsyncStorage.removeItem(USER_CACHE_KEY);
    setUser(null);
  }, []);

  // A 401 on any request means the token has expired or been revoked. Without
  // this every screen just showed "Not authenticated" forever.
  useEffect(
    () =>
      onUnauthorized(() => {
        setSessionExpired(true);
        void logout();
      }),
    [logout]
  );

  const login = useCallback(async ({ accountCode, email, password, mfaCode }: LoginArgs) => {
    const body: Record<string, string> = {
      account_code: accountCode,
      email,
      password,
    };
    if (mfaCode) body.mfa_code = mfaCode;

    const res = await api.post<LoginResponse>("/auth/login", body, { skipAuth: true });
    await setSession(res.access_token, accountCode);
    await AsyncStorage.setItem(USER_CACHE_KEY, JSON.stringify(res.user));
    setSessionExpired(false);
    setUser(res.user);
  }, []);

  const value = useMemo(
    () => ({ user, loading, sessionExpired, login, logout }),
    [user, loading, sessionExpired, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
