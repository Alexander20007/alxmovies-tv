const K_ASK = "alx.player.askServer";
const K_LAST = "alx.player.lastServer";

/** Mostrar a tela "Escolha o servidor" antes de assistir? (padrão: sim) */
export const askServerEnabled = (): boolean => { try { return localStorage.getItem(K_ASK) !== "0"; } catch { return true; } };
export const setAskServer = (v: boolean) => { try { localStorage.setItem(K_ASK, v ? "1" : "0"); } catch { /* sem armazenamento */ } };
export const getLastServer = (): string => { try { return localStorage.getItem(K_LAST) ?? ""; } catch { return ""; } };
export const setLastServer = (s: string) => { try { localStorage.setItem(K_LAST, s); } catch { /* sem armazenamento */ } };
