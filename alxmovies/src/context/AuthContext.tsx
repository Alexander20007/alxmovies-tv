import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { storage } from "@/lib/storage";
import { CONFIG } from "@/lib/config";

interface AuthValue {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, metadata?: Record<string, unknown>) => Promise<void>;
  signInAsGuest: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = useCallback(async () => {
    storage.clearProfileId();
    storage.clearGuest();
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  // Convidado: token de 24h vencido → encerra a sessão e avisa na tela de login
  useEffect(() => {
    if (!user?.is_anonymous) return;
    const check = () => {
      const started = storage.getGuestStartedAt();
      if (started && Date.now() - started > CONFIG.GUEST_SESSION_MS) {
        void signOut().finally(() => navigate("/login?expired=guest", { replace: true }));
      }
    };
    check();
    const t = setInterval(check, 60_000);
    return () => clearInterval(t);
  }, [user, signOut, navigate]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => {
        storage.clearGuest();
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUp: async (email, password, metadata = {}) => {
        storage.clearGuest();
        const { error } = await supabase.auth.signUp({ email, password, options: { data: metadata } });
        if (error) throw error;
      },
      signInAsGuest: async () => {
        storage.clearProfileId();
        const { error } = await supabase.auth.signInAnonymously();
        if (error) throw error;
        storage.setGuestStartedAt(Date.now());
      },
      signOut,
    }),
    [user, loading, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth deve ser usado dentro de <AuthProvider>");
  return ctx;
}
