import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase";
import { PLAN_KEY } from "@/hooks/usePlan";

// A ordem tem de ser a mesma do SQL (wheel_spin → seg 0..7). O sorteio é feito no servidor; aqui só se anima.
const SEGMENTS = ["Não foi dessa vez", "+2 downloads", "+5 downloads", "Apoiador 3 dias", "Apoiador 7 dias", "Premium 3 dias", "Premium 7 dias", "Família 7 dias"];
const COLORS = ["#2a2a33", "#7a0710", "#2a2a33", "#a30c17", "#2a2a33", "#c9101c", "#2a2a33", "#e50914"];
const STEP = 360 / SEGMENTS.length;

interface Status { logged: boolean; can_spin?: boolean; last_prize?: string | null }

export function Wheel() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const logged = !!user && !user.is_anonymous;
  const [rot, setRot] = useState(0);
  const [spinning, setSpinning] = useState(false);
  const [canSpin, setCanSpin] = useState<boolean | null>(null);
  const [prize, setPrize] = useState<string | null>(null);
  const [lastPrize, setLastPrize] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const turns = useRef(0);

  useEffect(() => {
    if (!logged) { setCanSpin(null); return; }
    void supabase.rpc("wheel_status").then(({ data }) => {
      const s = data as Status | null;
      setCanSpin(s?.can_spin ?? true);
      setLastPrize(s?.last_prize ?? null);
    });
  }, [logged, user?.id]);

  async function spin() {
    if (spinning || !logged) return;
    setErr(""); setPrize(null); setSpinning(true);
    const { data, error } = await supabase.rpc("wheel_spin");
    const r = data as { ok: boolean; error?: string; segment?: number; prize?: string } | null;
    if (error || !r) { setErr("Não foi possível girar agora. Tente de novo."); setSpinning(false); return; }
    if (!r.ok) {
      const m: Record<string, string> = {
        already: "Você já girou hoje. Volte amanhã!",
        network: "Muitas pessoas giraram por esta rede hoje. Tente em outra rede ou amanhã.",
        guest: "Convidados não podem girar. Entre com uma conta.",
        login: "Entre na sua conta para girar.",
      };
      setErr(m[r.error ?? ""] ?? "Não foi possível girar agora.");
      if (r.error === "already") setCanSpin(false);
      setSpinning(false); return;
    }
    // o ponteiro fica no topo: leva o CENTRO da fatia sorteada até lá
    turns.current += 1;
    setRot(turns.current * 360 * 5 - (r.segment! * STEP + STEP / 2));
    window.setTimeout(() => {
      setPrize(r.prize!); setLastPrize(r.prize!); setCanSpin(false); setSpinning(false);
      void qc.invalidateQueries({ queryKey: PLAN_KEY });
    }, 4600);
  }

  const bg = `conic-gradient(${COLORS.map((c, i) => `${c} ${i * STEP}deg ${(i + 1) * STEP}deg`).join(",")})`;
  const disabled = spinning || !logged || canSpin === false;

  return (
    <div className="wb-wheel">
      <div className="wb-wheel-stage">
        <i className="wb-wheel-pin" aria-hidden />
        <div className="wb-wheel-disc" style={{ background: bg, transform: `rotate(${rot}deg)` }}>
          {SEGMENTS.map((s, i) => (
            <span key={s} style={{ transform: `rotate(${i * STEP + STEP / 2}deg) translateY(-112px)` }}><b>{s}</b></span>
          ))}
        </div>
        <button type="button" className="wb-wheel-btn" onClick={() => void spin()} disabled={disabled} aria-label="Girar a roda">{spinning ? "…" : "GIRAR"}</button>
      </div>

      {!loading && !logged && (
        <div className="wb-wheel-res">
          <b>Entre para girar</b>
          <p>A roda é só para quem tem conta, assim o prêmio fica guardado nela.</p>
          <div className="wb-row center">
            <Link className="wb-btn primary" to="/entrar?next=/roda">Entrar</Link>
            <Link className="wb-btn" to="/entrar?next=/roda&novo=1">Criar conta</Link>
          </div>
        </div>
      )}
      {err && <p className="wb-wheel-err">{err}</p>}
      {prize && !spinning && (
        <div className="wb-wheel-res">
          <small>Seu prêmio</small>
          <b>{prize}</b>
          <p>{prize === SEGMENTS[0] ? "Tente de novo amanhã!" : "Já está na sua conta. No app ele aparece sozinho."}</p>
          <Link className="wb-btn" to="/conta">Ver minha conta</Link>
        </div>
      )}
      {logged && !prize && canSpin === false && !spinning && (
        <p className="wb-wheel-fine">Você já girou hoje{lastPrize ? ` (${lastPrize})` : ""}. Volte amanhã!</p>
      )}
      <p className="wb-wheel-fine">1 giro por dia por conta. Os prêmios são temporários e podem mudar.</p>
    </div>
  );
}
