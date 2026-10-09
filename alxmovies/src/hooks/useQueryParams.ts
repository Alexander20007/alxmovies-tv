import { useSearchParams } from "react-router-dom";
import type { MediaType } from "@/types";

export function useMediaParams() {
  const [params] = useSearchParams();
  return {
    id: Number(params.get("id")),
    type: (params.get("type") === "tv" ? "tv" : "movie") as MediaType,
  };
}
