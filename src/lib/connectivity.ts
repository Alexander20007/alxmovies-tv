import { CONFIG } from "./config";

/** Testa se a internet funciona de verdade (Wi-Fi sem internet também conta como offline). Qualquer resposta do servidor vale. */
export async function hasInternet(timeoutMs = 4000): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`${CONFIG.SUPABASE_URL}/auth/v1/health`, { method: "GET", mode: "no-cors", cache: "no-store", signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}
