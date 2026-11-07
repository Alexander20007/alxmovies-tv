import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchStaffDirectory } from "@/services/staff";

const EMPTY = new Set<string>();

/** Conjuntos de quem é admin (por conta e por perfil). Carrega uma vez e fica em cache. */
export function useStaffDirectory() {
  const q = useQuery({ queryKey: ["staff-directory"], queryFn: fetchStaffDirectory, staleTime: 5 * 60_000, retry: 0, refetchOnWindowFocus: false });
  return useMemo(() => ({
    users: q.data ? new Set(q.data.users) : EMPTY,
    profiles: q.data ? new Set(q.data.profiles) : EMPTY,
  }), [q.data]);
}
