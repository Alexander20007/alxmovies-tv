import { createContext, useCallback, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { useProfile } from "./ProfileContext";
import { supabase } from "@/lib/supabase";
import { getSocialSettings, SocialError, type SocialSettings } from "@/services/friends";

export type SocialEvent = "message" | "message-update" | "notification" | "friendship";

interface SocialValue {
  /** conta real (não convidado) com perfil escolhido */
  available: boolean;
  /** amizades ligadas para o perfil ativo */
  enabled: boolean;
  settings: SocialSettings | undefined;
  loading: boolean;
  error: SocialError | null;
  on: (type: SocialEvent, cb: (detail: any) => void) => () => void;
}

const SocialContext = createContext<SocialValue | null>(null);

export function SocialProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { activeProfile } = useProfile();
  const qc = useQueryClient();
  const pid = activeProfile?.id;
  const available = !!user && !user.is_anonymous && !!pid;

  const settings = useQuery({
    queryKey: ["socialSettings", pid],
    queryFn: () => getSocialSettings(pid!),
    enabled: available,
    retry: false,
    staleTime: 60_000,
  });
  const enabled = !!settings.data?.friends_enabled;
  const bus = useRef(new EventTarget());

  useEffect(() => {
    if (!enabled || !pid) return;
    const emit = (type: SocialEvent, detail: unknown) => bus.current.dispatchEvent(new CustomEvent(type, { detail }));
    const refresh = (...keys: string[]) => keys.forEach((k) => void qc.invalidateQueries({ queryKey: [k, pid] }));
    const pg = "postgres_changes" as any;

    const channel = supabase.channel(`social:${pid}`)
      .on(pg, { event: "INSERT", schema: "public", table: "friend_messages" }, (p: any) => { emit("message", p.new); refresh("unread", "friendships"); })
      .on(pg, { event: "UPDATE", schema: "public", table: "friend_messages" }, (p: any) => { emit("message-update", p.new); refresh("unread", "friendships"); })
      .on(pg, { event: "INSERT", schema: "public", table: "social_notifications", filter: `profile_id=eq.${pid}` }, (p: any) => { emit("notification", p.new); refresh("friendNotifs"); })
      .on(pg, { event: "*", schema: "public", table: "friendships" }, (p: any) => { emit("friendship", p.new || p.old); refresh("friendships", "friendNotifs", "unread"); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [enabled, pid, qc]);

  const on = useCallback((type: SocialEvent, cb: (d: any) => void) => {
    const handler = (e: Event) => cb((e as CustomEvent).detail);
    bus.current.addEventListener(type, handler);
    return () => bus.current.removeEventListener(type, handler);
  }, []);

  const value = useMemo<SocialValue>(() => ({
    available, enabled, settings: settings.data, loading: available && settings.isLoading,
    error: (settings.error as SocialError) ?? null, on,
  }), [available, enabled, settings.data, settings.isLoading, settings.error, on]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error("useSocial deve ser usado dentro de <SocialProvider>");
  return ctx;
}
