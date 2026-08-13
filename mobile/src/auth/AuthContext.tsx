import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError, clearSession, setSession, getToken } from "../api/client";
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
  login: (args: LoginArgs) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [token, cachedUser] = await Promise.all([getToken(), AsyncStorage.getItem(USER_CACHE_KEY)]);
      if (token && cachedUser) {
        setUser(JSON.parse(cachedUser));
      }
      setLoading(false);
    })();
  }, []);

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
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    await clearSession();
    await AsyncStorage.removeItem(USER_CACHE_KEY);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, login, logout }), [user, loading, login, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export { ApiError };
