import { useEffect, useState } from "react";
import { getTrustedNow, getTrustedTimezoneOffsetMinutes, isWithinAllowedTime } from "@/lib/parentalTime";
import type { Profile } from "@/types";

/** true quando o horário permitido do perfil acabou (reconfere a cada minuto). */
export function useParentalLock(profile: Profile | null) {
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!profile?.time_restriction_enabled) { setLocked(false); return; }
    let off = false;
    const check = async () => {
      const [now, offset] = await Promise.all([getTrustedNow(), getTrustedTimezoneOffsetMinutes()]);
      if (!off) setLocked(!isWithinAllowedTime(profile, now, offset));
    };
    void check();
    const t = setInterval(check, 60_000);
    return () => { off = true; clearInterval(t); };
  }, [profile]);
  return locked;
}
