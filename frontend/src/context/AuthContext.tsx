import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { User } from "@/types/api";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (token: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
  const [isLoading, setIsLoading] = useState(true);

  const parseUserFromToken = useCallback((jwt: string): User | null => {
    try {
      const payload = JSON.parse(atob(jwt.split(".")[1] || ""));
      return {
        name: payload.name || payload.username,
        email: payload.email || payload.username,
      };
    } catch {
      return null;
    }
  }, []);

  const login = useCallback((newToken: string) => {
    localStorage.setItem("token", newToken);
    setToken(newToken);
    setUser(parseUserFromToken(newToken));
    setIsLoading(false);
  }, [parseUserFromToken]);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }
    setUser(parseUserFromToken(token));
    setIsLoading(false);
  }, [token, parseUserFromToken]);

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
