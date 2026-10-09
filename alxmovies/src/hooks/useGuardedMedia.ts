import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/context/ProfileContext";
import { isAllowedForProfile } from "@/lib/contentFilter";
import { tmdb } from "@/services/tmdb";
import type { MediaType } from "@/types";

/** Detalhes do título + trava de classificação indicativa do perfil ativo. */
export function useGuardedMedia(type: MediaType, id: number) {
  const { activeProfile } = useProfile();
  const q = useQuery({ queryKey: ["details", type, id], queryFn: () => tmdb.details(type, id), enabled: !!id });
  return {
    media: q.data,
    loading: q.isLoading,
    error: q.isError,
    blocked: !!q.data && !isAllowedForProfile(q.data, activeProfile),
    profile: activeProfile,
  };
}
