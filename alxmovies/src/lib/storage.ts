const PROFILE_KEY = "alxmovies_active_profile";
const GUEST_KEY = "alxmovies_guest_started_at";

export const storage = {
  getProfileId: () => localStorage.getItem(PROFILE_KEY),
  setProfileId: (id: string) => localStorage.setItem(PROFILE_KEY, id),
  clearProfileId: () => localStorage.removeItem(PROFILE_KEY),
  getGuestStartedAt: () => {
    const raw = localStorage.getItem(GUEST_KEY);
    return raw ? Number(raw) : null;
  },
  setGuestStartedAt: (t: number) => localStorage.setItem(GUEST_KEY, String(t)),
  clearGuest: () => localStorage.removeItem(GUEST_KEY),
};
