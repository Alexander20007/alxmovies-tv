import { useCallback, useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAnnouncements } from "@/services/announcements";

const KEY = "alx.ann.seen";
const listeners = new Set<() => void>();
const getSeen = (): number => { try { return Number(localStorage.getItem(KEY)) || 0; } catch { return 0; } };
function setSeen(id: number) {
  try { if (id > getSeen()) localStorage.setItem(KEY, String(id)); } catch { /* sem armazenamento */ }
  listeners.forEach((f) => f());
}

/** Avisos do admin + quais a pessoa ainda não viu (guardado no aparelho). */
export function useAnnouncements() {
  const q = useQuery({
    queryKey: ["announcements"], queryFn: fetchAnnouncements,
    staleTime: 60_000, refetchOnWindowFocus: true, refetchInterval: 5 * 60_000, retry: 1,
  });
  const [seen, setSeenState] = useState(getSeen());
  useEffect(() => {
    const f = () => setSeenState(getSeen());
    listeners.add(f);
    return () => { listeners.delete(f); };
  }, []);
  const items = q.data ?? [];
  const markAllSeen = useCallback(() => { setSeen(Math.max(0, ...items.map((a) => a.id))); }, [items]);
  return { items, unread: items.filter((a) => a.id > seen), seen, loading: q.isLoading, markAllSeen, refetch: q.refetch };
}
