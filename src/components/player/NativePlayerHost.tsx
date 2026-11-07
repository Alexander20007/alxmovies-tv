import { useEffect, useRef, useState } from "react";
import { PlayerLoading } from "./PlayerLoading";
import { FALLBACK_SERVER, resolveStream, type StreamRequest, type StreamResult } from "@/services/stream";
import { ServerPicker } from "./ServerPicker";
import { askServerEnabled, getLastServer, setAskServer, setLastServer } from "@/lib/serverPref";
import { loadPlayerPrefs, savePlayerPrefs, type EpRef } from "@/lib/media";
import { NativePlayer } from "@/lib/nativePlayer";
import type { ProgressInfo } from "./AlxPlayer";
import { AlxPlayer } from "./AlxPlayer";

interface Props {
  title: string;
  subtitle?: string;
  poster?: string;
  request: StreamRequest;
  resumeAt?: number;
  resumePercent?: number;
  getNextEpisode?: (season: number, episode: number) => Promise<EpRef | null>;
  onProgress: (info: ProgressInfo) => void;
  onNext: (next: EpRef) => void;
  onClose: () => void;
  onPlay?: () => void;
}

/**
 * Player 100% nativo (Media3/ExoPlayer). Este componente só prepara o link (API principal + reserva), abre o player nativo
 * e reage ao que a pessoa fez nele: fechou, terminou, foi para o próximo, trocou de servidor ou deu erro.
 * Se o player nativo não estiver disponível, cai no player web de sempre.
 */
export function NativePlayerHost(props: Props) {
  const propsRef = useRef(props);
  propsRef.current = props;
  const [state, setState] = useState<"loading" | "slow" | "error" | "web" | "pick">("loading");
  const [pick, setPick] = useState<StreamResult | null>(null);
  const pickResolve = useRef<((c: { choice: string | null; skip: boolean }) => void) | null>(null);
  const askedRef = useRef(false);   // a tela de servidor aparece só na primeira vez (não a cada episódio seguinte)
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const { request } = props;
  const reqKey = `${request.type}-${request.id}-${request.season ?? 0}-${request.episode ?? 0}`;

  useEffect(() => {
    let cancelled = false;
    let forced: string | undefined;
    let atMs = propsRef.current.resumeAt != null ? propsRef.current.resumeAt * 1000 : 0;
    const pct = propsRef.current.resumePercent ?? -1;
    let usePct = atMs <= 0 && pct > 0;
    const tried = new Set<string>();
    let notified = false;
    setState("loading"); setError("");

    const report = (posMs: number, durMs: number, ended = false, hasNext = false) => {
      if (!durMs) return;
      propsRef.current.onProgress({ time: posMs / 1000, percent: ended ? 100 : (posMs / durMs) * 100, ended, hasNext, request });
    };

    let lastDur = 0, hasNextNow = false;
    const sub = NativePlayer.addListener("progress", (p) => { lastDur = p.durationMs; report(p.positionMs, p.durationMs, false, hasNextNow); });

    (async () => {
      for (let guard = 0; guard < 8 && !cancelled; guard++) {
        let s;
        try {
          s = await resolveStream({
            ...request,
            server: forced === FALLBACK_SERVER ? undefined : forced,
            fallbackOnly: forced === FALLBACK_SERVER,
            onSlow: () => !cancelled && setState((x) => (x === "loading" ? "slow" : x)),
          });
        } catch (e) {
          if (!cancelled) { setError(e instanceof Error ? e.message : "Erro ao carregar o vídeo."); setState("error"); }
          return;
        }
        if (cancelled) return;
        tried.add(s.server);

        // Tela "Escolha o servidor": o link do Automático já está pronto; se a pessoa escolher outro, buscamos o dele.
        if (guard === 0 && !askedRef.current) {
          askedRef.current = true;
          if (askServerEnabled() && s.source === "main" && s.servers.filter((x) => x.ok).length > 1) {
            const picked = await new Promise<{ choice: string | null; skip: boolean }>((resolve) => {
              pickResolve.current = resolve; setPick(s); setState("pick");
            });
            pickResolve.current = null;
            if (cancelled) return;
            setPick(null); setState("loading");
            if (picked.skip) setAskServer(false);
            if (picked.choice === null) { propsRef.current.onClose(); return; }
            if (picked.choice !== "__auto__" && picked.choice !== s.server) {
              setLastServer(picked.choice);
              forced = picked.choice;
              continue;
            }
          }
        }

        let next: EpRef | null = s.nextEpisode;
        if (!next && request.type === "tv" && propsRef.current.getNextEpisode) {
          next = await propsRef.current.getNextEpisode(request.season!, request.episode!).catch(() => null);
        }
        hasNextNow = !!next;
        if (!notified) { notified = true; propsRef.current.onPlay?.(); }

        const prefs = loadPlayerPrefs();
        let res;
        try {
          res = await NativePlayer.play({
            url: s.m3u8, title: propsRef.current.title, subtitle: propsRef.current.subtitle,
            startMs: Math.floor(atMs), startPercent: usePct ? pct : -1,
            poster: propsRef.current.poster,
            hasNext: !!next, server: s.server, source: s.source, fallbackLabel: FALLBACK_SERVER, servers: s.servers, rate: prefs.rate ?? 1,
          });
        } catch {
          if (!cancelled) setState("web"); // player nativo indisponível: usa o player web
          return;
        }
        if (cancelled) return;
        savePlayerPrefs({ ...prefs, rate: res.rate });
        const dur = res.durationMs || lastDur;
        atMs = res.positionMs; usePct = false;

        if (res.reason === "closed") { report(res.positionMs, dur, false, !!next); propsRef.current.onClose(); return; }
        if (res.reason === "ended") {
          report(res.positionMs, dur, true, !!next);
          if (next) propsRef.current.onNext(next); else propsRef.current.onClose();
          return;
        }
        if (res.reason === "next") { report(res.positionMs, dur, false, true); if (next) propsRef.current.onNext(next); else propsRef.current.onClose(); return; }
        if (res.reason === "server") { forced = res.server; continue; }
        // erro de reprodução: tenta outro servidor e, por último, a API reserva
        const other = s.servers.find((x) => x.ok && !tried.has(x.label));
        if (other) forced = other.label;
        else if (s.source === "main" && !tried.has(FALLBACK_SERVER)) forced = FALLBACK_SERVER;
        else { setError("Não foi possível reproduzir este vídeo. Tente outro servidor ou tente novamente."); setState("error"); return; }
      }
    })();

    return () => { cancelled = true; void sub.then((h) => h.remove()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reqKey, attempt]);

  if (state === "web") return <AlxPlayer {...props} />;
  if (state === "pick" && pick) {
    return (
      <ServerPicker
        title={props.title} subtitle={props.subtitle} poster={props.poster}
        servers={pick.servers} autoServer={pick.server} last={getLastServer()}
        onChoose={(choice, skip) => pickResolve.current?.({ choice, skip })}
      />
    );
  }
  if (state === "error") {
    return (
      <div className="watch-msg">
        <h1>Não foi possível reproduzir</h1>
        <p>{error}</p>
        <button type="button" className="soc-btn primary" onClick={() => setAttempt((a) => a + 1)}>Tentar novamente</button>
        <button type="button" className="soc-btn" onClick={props.onClose}>Voltar</button>
      </div>
    );
  }
  return <PlayerLoading title={props.title} subtitle={props.subtitle} poster={props.poster} slow={state === "slow"} />;
}
