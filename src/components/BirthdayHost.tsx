import { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useProfile } from "@/context/ProfileContext";
import { buildBirthdayPrompt, DEFAULT_BIRTHDAY_MESSAGE, isBirthdayToday, markBirthdayShown, wasBirthdayShownToday } from "@/lib/birthday";
import { askGemini } from "@/services/gemini";
import { fetchMyList, fetchWatched } from "@/services/library";
import { useBackClose } from "@/hooks/useBackClose";

const COLORS = ["#ff8b8f", "#ffd166", "#9fd6a5", "#8ecae6", "#c77dff"];

function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 70 }, (_, i) => ({
    key: i, left: Math.random() * 100, color: COLORS[Math.floor(Math.random() * COLORS.length)],
    delay: Math.random() * 2, duration: 3 + Math.random() * 2,
  })), []);
  return (
    <div className="birthday-confetti">
      {pieces.map((p) => (
        <span key={p.key} className="confetti-piece" style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.duration}s` }} />
      ))}
    </div>
  );
}

function BirthdayOverlay({ profileId, name, onClose }: { profileId: string; name: string; onClose: () => void }) {
  useBackClose(true, onClose);
  const [message, setMessage] = useState(DEFAULT_BIRTHDAY_MESSAGE);

  // Mensagem personalizada pela IA com base no que o perfil assiste/favoritou (falha em silêncio)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [watched, favs] = await Promise.all([fetchWatched(profileId, 12).catch(() => []), fetchMyList(profileId).catch(() => [])]);
        const seen = new Set<string>();
        const taste: string[] = [];
        [...watched, ...favs].forEach((i) => {
          const k = `${i.media_type}-${i.media_id}`;
          if (seen.has(k) || !i.title) return;
          seen.add(k); taste.push(i.title);
        });
        const text = (await askGemini(buildBirthdayPrompt(name, taste.slice(0, 12)))).trim().replace(/\*\*/g, "");
        if (alive && text) setMessage(text);
      } catch { /* fica a mensagem padrão */ }
    })();
    return () => { alive = false; };
  }, [profileId, name]);

  return (
    <div className="birthday-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <Confetti />
      <div className="birthday-box">
        <button className="guest-code-close" aria-label="Fechar" onClick={onClose}>✕</button>
        <div className="birthday-cake">🎂</div>
        <h1>Feliz Aniversário, {name}! 💛</h1>
        <p className="birthday-message">{message}</p>
        <button className="account-btn" style={{ justifyContent: "center" }} onClick={onClose}>❤️ Obrigado(a)!</button>
      </div>
    </div>
  );
}

/** Abre a surpresa 1x por dia na home e mostra o botão flutuante "Hoje!" no dia do aniversário do perfil. */
export function BirthdayHost() {
  const { activeProfile } = useProfile();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const today = isBirthdayToday(activeProfile);
  const pid = activeProfile?.id;

  useEffect(() => {
    if (today && pid && pathname === "/home" && !wasBirthdayShownToday(pid)) { markBirthdayShown(pid); setOpen(true); }
  }, [today, pid, pathname]);

  if (!activeProfile || !today) return null;
  return (
    <>
      <button type="button" className="birthday-widget birthday-widget-today" aria-label="Feliz aniversário!" onClick={() => setOpen(true)}>
        <span className="birthday-widget-icon">🎉</span><span className="birthday-widget-caption">Hoje!</span>
      </button>
      {open && <BirthdayOverlay profileId={activeProfile.id} name={activeProfile.name} onClose={() => setOpen(false)} />}
    </>
  );
}
