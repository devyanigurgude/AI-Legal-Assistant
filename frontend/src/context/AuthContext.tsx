import React, { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { User } from "@/types/api";
import { getMe } from "@/services/apiService";

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
      const displayFromToken: string | undefined =
        payload.name || payload.username || payload.email || payload.preferred_username || payload.sub;

      const rememberedUsername = localStorage.getItem("auth_username") || undefined;

      if (displayFromToken) {
        return {
          name: displayFromToken,
          email: payload.email || payload.username || rememberedUsername || displayFromToken,
        };
      }

      if (rememberedUsername) {
        return { name: rememberedUsername, email: rememberedUsername };
      }

      if (payload.user_id) {
        return { name: `ID: ${payload.user_id}`, email: "" };
      }

      return null;
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

    let cancelled = false;
    setIsLoading(true);

    getMe()
      .then((data: unknown) => {
        if (cancelled) return;
        const record = data && typeof data === "object" ? (data as Record<string, unknown>) : {};
        const username = typeof record.username === "string" ? record.username : "";
        const id = typeof record.id === "string" ? record.id : "";

        if (username) {
          setUser({ name: username, email: username });
          return;
        }

        if (id) {
          setUser({ name: `ID: ${id}`, email: "" });
          return;
        }

        setUser(parseUserFromToken(token));
      })
      .catch(() => {
        if (cancelled) return;
        setUser(parseUserFromToken(token));
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
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
