const PREFS_KEY = "alxmovies_prefs";
export interface Preferences { autoplay?: boolean; datasaver?: boolean; emails?: boolean }

export function getPreferences(): Preferences {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") || {}; } catch { return {}; }
}
export function savePreferences(p: Preferences) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}
export const isDataSaverEnabled = () => !!getPreferences().datasaver;
/** Pôster menor quando o modo economia de dados está ligado. */
export const rowPosterSize = () => (isDataSaverEnabled() ? "w185" : "w500");
