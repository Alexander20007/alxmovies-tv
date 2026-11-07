import { CONFIG } from "./config";
import { storage } from "./storage";

export const getGuestMsRemaining = () => {
  const started = storage.getGuestStartedAt();
  return started ? Math.max(0, CONFIG.GUEST_SESSION_MS - (Date.now() - started)) : 0;
};

export const formatHHMM = (ms: number) => {
  const total = Math.floor(ms / 60000);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
