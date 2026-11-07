import type { MediaItem, Profile } from "@/types";

export const RATING_OPTIONS = [
  { value: "L", label: "Livre", numeric: 0 },
  { value: "10", label: "10 anos", numeric: 10 },
  { value: "12", label: "12 anos", numeric: 12 },
  { value: "14", label: "14 anos", numeric: 14 },
  { value: "16", label: "16 anos", numeric: 16 },
  { value: "18", label: "18 anos", numeric: 18 },
] as const;

const GENRE_MIN_RATING: Record<number, number> = {
  27: 16, 10752: 16, 10768: 16, 80: 14, 53: 14, 9648: 12,
};
const KIDS_GENRES = new Set([16, 10751, 10762]);

function ratingToNumber(r?: string | null) {
  if (r == null || r === "") return 18;
  if (r === "L") return 0;
  const n = Number(r);
  return Number.isFinite(n) ? n : 18;
}

const genreIdsOf = (i: MediaItem) => i.genre_ids ?? i.genres?.map((g) => g.id) ?? [];

export function isAllowedForProfile(item: MediaItem | null | undefined, profile: Profile | null) {
  if (!item) return false;
  if (!profile) return true;
  const max = ratingToNumber(profile.maturity_rating);
  const genres = genreIdsOf(item);
  if (item.adult && max < 18) return false;
  if (profile.is_kids) return genres.some((g) => KIDS_GENRES.has(g));
  const required = genres.reduce((m, g) => Math.max(m, GENRE_MIN_RATING[g] ?? 0), 0);
  return required <= max;
}

export const filterForProfile = (items: MediaItem[], profile: Profile | null) =>
  items.filter((i) => isAllowedForProfile(i, profile));
