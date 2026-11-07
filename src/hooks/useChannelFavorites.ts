import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProfile } from "@/context/ProfileContext";
import { getFavoriteChannels, toggleChannelFavorite, type Channel } from "@/services/channels";

export function useChannelFavorites() {
  const { activeProfile } = useProfile();
  const qc = useQueryClient();
  const pid = activeProfile!.id;
  const q = useQuery({ queryKey: ["chanFavs", pid], queryFn: () => getFavoriteChannels(pid) });
  const set = new Set((q.data ?? []).map((c) => c.stream));

  const toggle = useMutation({
    mutationFn: (c: Channel) => toggleChannelFavorite(pid, c, set.has(c.stream)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chanFavs", pid] }),
  });
  return { isFavorite: (stream: string) => set.has(stream), toggle: (c: Channel) => toggle.mutate(c), busy: toggle.isPending };
}
