import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken } from "../api/client";
import type { LoginResponse, Me, Permission } from "../api/types";

interface AuthState {
  user: Me | null;
  loading: boolean;
  expired: boolean;
  login: (username: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (perm: Permission) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState<boolean>(!!getToken());
  const [expired, setExpired] = useState(false);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<Me>("/auth/me/"));
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onExpired = () => {
      setUser(null);
      setExpired(true);
    };
    window.addEventListener("qa:session-expired", onExpired);
    return () => window.removeEventListener("qa:session-expired", onExpired);
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await api<LoginResponse>("/auth/login/", { method: "POST", body: { username, password } });
    setToken(res.token);
    setUser(res.user);
    setExpired(false);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout/", { method: "POST" });
    } catch {
      /* token may already be invalid */
    }
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, loading, expired, login, logout, refresh, can: (perm) => !!user?.permissions.includes(perm) }),
    [user, loading, expired, login, logout, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
