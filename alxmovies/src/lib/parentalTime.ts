import { supabase } from "./supabase";
import type { Profile } from "@/types";

let cache: { at: number; date: Date } | null = null;

/** Hora do servidor (não dá pra burlar mudando o relógio do aparelho). */
export async function getTrustedNow(): Promise<Date> {
  const now = Date.now();
  if (cache && now - cache.at < 5000) return new Date(cache.date.getTime() + (now - cache.at));
  try {
    const { data, error } = await supabase.rpc("get_server_time");
    if (error || !data) throw error ?? new Error("sem resposta");
    cache = { at: now, date: new Date(data) };
    return cache.date;
  } catch {
    return new Date();
  }
}

const TZ_KEY = "alx_tz_offset_por_ip";
const TZ_TTL = 24 * 60 * 60 * 1000;

function parseUtcOffset(str?: string) {
  const m = /^([+-])(\d{2})(\d{2})$/.exec((str ?? "").trim());
  return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : null;
}

export async function getTrustedTimezoneOffsetMinutes(): Promise<number> {
  try {
    const c = JSON.parse(localStorage.getItem(TZ_KEY) ?? "null");
    if (c && Date.now() - c.at < TZ_TTL && typeof c.offsetMinutes === "number") return c.offsetMinutes;
  } catch { /* ignore */ }
  try {
    const data = await (await fetch("https://ipapi.co/json/")).json();
    const offsetMinutes = parseUtcOffset(data.utc_offset);
    if (offsetMinutes == null) throw new Error("sem fuso");
    localStorage.setItem(TZ_KEY, JSON.stringify({ offsetMinutes, at: Date.now() }));
    return offsetMinutes;
  } catch {
    return -new Date().getTimezoneOffset();
  }
}

const toMin = (hhmm?: string | null) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function isWithinAllowedTime(profile: Profile | null, nowUtc = new Date(), offsetMinutes = -new Date().getTimezoneOffset()) {
  if (!profile?.time_restriction_enabled) return true;
  const start = toMin(profile.allowed_start_time), end = toMin(profile.allowed_end_time);
  if (start == null || end == null) return true;
  const utc = nowUtc.getUTCHours() * 60 + nowUtc.getUTCMinutes();
  const now = (((utc + offsetMinutes) % 1440) + 1440) % 1440;
  return start <= end ? now >= start && now <= end : now >= start || now <= end;
}

export const formatAllowedWindow = (p: Profile) =>
  p.time_restriction_enabled && p.allowed_start_time && p.allowed_end_time
    ? `${p.allowed_start_time} – ${p.allowed_end_time}` : null;
