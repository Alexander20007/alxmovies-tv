import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "./AuthContext";
import { fetchProfiles } from "@/services/profiles";
import { storage } from "@/lib/storage";
import type { Profile } from "@/types";

interface ProfileValue {
  profiles: Profile[];
  activeProfile: Profile | null;
  loading: boolean;
  selectProfile: (id: string) => void;
  clearProfile: () => void;
}

const ProfileContext = createContext<ProfileValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeId, setActiveId] = useState<string | null>(storage.getProfileId());

  const { data: profiles = [], isLoading } = useQuery({
    queryKey: ["profiles", user?.id],
    queryFn: () => fetchProfiles(user!.id),
    enabled: !!user,
  });

  const selectProfile = useCallback((id: string) => {
    storage.setProfileId(id);
    setActiveId(id);
  }, []);

  const clearProfile = useCallback(() => {
    storage.clearProfileId();
    setActiveId(null);
  }, []);

  const value = useMemo<ProfileValue>(
    () => ({
      profiles,
      activeProfile: profiles.find((p) => p.id === activeId) ?? null,
      loading: isLoading,
      selectProfile,
      clearProfile,
    }),
    [profiles, activeId, isLoading, selectProfile, clearProfile]
  );

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile() {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile deve ser usado dentro de <ProfileProvider>");
  return ctx;
}
