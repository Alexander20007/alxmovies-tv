import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/context/ProfileContext";
import { useSocial } from "@/context/SocialContext";
import { getFriendNotifications, getUnreadTotal, listFriendships } from "@/services/friends";

export function useFriendships() {
  const { activeProfile } = useProfile();
  const { enabled } = useSocial();
  const pid = activeProfile?.id;
  return useQuery({
    queryKey: ["friendships", pid],
    queryFn: () => listFriendships(pid!),
    enabled: enabled && !!pid,
    refetchInterval: () => (document.visibilityState === "visible" ? 30_000 : false),
    refetchOnWindowFocus: true,
  });
}

export function useUnreadTotal() {
  const { activeProfile } = useProfile();
  const { enabled } = useSocial();
  const pid = activeProfile?.id;
  return useQuery({ queryKey: ["unread", pid], queryFn: () => getUnreadTotal(pid!), enabled: enabled && !!pid, refetchOnWindowFocus: true });
}

export function useFriendNotifications() {
  const { activeProfile } = useProfile();
  const { enabled } = useSocial();
  const pid = activeProfile?.id;
  return useQuery({ queryKey: ["friendNotifs", pid], queryFn: () => getFriendNotifications(pid!), enabled: enabled && !!pid });
}
