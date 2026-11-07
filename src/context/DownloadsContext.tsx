import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Downloads, downloadsAvailable, getOfflinePos, getSpeed, getWifiOnly, setOfflinePos, setSpeedPref, setWifiOnlyPref, type Speed,
  type DlItem, type DlMeta, type DlStorage,
} from "@/lib/downloads";
import { NativePlayer } from "@/lib/nativePlayer";
import { resolveStream } from "@/services/stream";

interface Ctx {
  items: DlItem[];
  storage: DlStorage | null;
  wifiOnly: boolean;
  /** quantos estão baixando ou na fila (para o selo da barra inferior) */
  activeCount: number;
  speed: Speed;
  setSpeed(v: Speed): void;
  setWifiOnly(v: boolean): void;
  refreshStorage(): void;
  pause(id: string): void;
  resume(item: DlItem): Promise<void>;
  pauseAll(): void;
  resumeAll(): void;
  remove(id: string): Promise<void>;
  removeCompleted(): Promise<void>;
  exportFile(id: string): Promise<string>;
  play(item: DlItem): Promise<void>;
}
const C = createContext<Ctx | null>(null);

function upsert(list: DlItem[], it: DlItem): DlItem[] {
  const i = list.findIndex((x) => x.id === it.id);
  if (i < 0) return [it, ...list];
  const copy = list.slice(); copy[i] = it; return copy;
}

export function DownloadsProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<DlItem[]>([]);
  const [storage, setStorage] = useState<DlStorage | null>(null);
  const [wifiOnly, setWifi] = useState(getWifiOnly());
  const [speed, setSpeedState] = useState<Speed>(getSpeed());
  const autoTried = useRef(new Set<string>());
  const storageTimer = useRef<number | undefined>(undefined);

  const refreshStorage = useCallback(() => {
    if (!downloadsAvailable) return;
    void Downloads.storage().then(setStorage).catch(() => {});
  }, []);

  /** Pede um link novo do vídeo (o antigo expira) e manda o baixador continuar de onde parou. */
  const resume = useCallback(async (item: DlItem) => {
    if (item.status === "error" && (item.errorCode === "expired" || item.errorCode === "http")) {
      try {
        const m = JSON.parse(item.meta) as DlMeta;
        const s = await resolveStream({ type: m.type, id: m.id, season: m.season, episode: m.episode });
        await Downloads.updateUrl({ id: item.id, url: s.m3u8 });
      } catch { /* tenta com o link que já tem */ }
    }
    await Downloads.resume({ id: item.id }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!downloadsAvailable) return;
    void Downloads.setOptions({ wifiOnly: getWifiOnly(), maxActive: 2, threads: getSpeed() }).catch(() => {});
    void Downloads.list().then((r) => setItems(r.items)).catch(() => {});
    refreshStorage();

    const subs = [
      Downloads.addListener("changed", ({ item }) => {
        setItems((prev) => upsert(prev, item));
        if (item.status === "done" || item.status === "error") {
          window.clearTimeout(storageTimer.current);
          storageTimer.current = window.setTimeout(refreshStorage, 1500);
        }
        // link expirado: uma tentativa automática com link novo, sem a pessoa precisar fazer nada
        if (item.status === "error" && item.errorCode === "expired" && !autoTried.current.has(item.id)) {
          autoTried.current.add(item.id);
          void resume(item);
        }
        if (item.status === "done") autoTried.current.delete(item.id);
      }),
      Downloads.addListener("removed", ({ id }) => { setItems((prev) => prev.filter((x) => x.id !== id)); refreshStorage(); }),
    ];
    // voltou a internet: retoma o que parou por falha de rede
    const online = () => { void Downloads.kick().catch(() => {}); };
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("online", online);
      subs.forEach((s) => void s.then((h) => h.remove()).catch(() => {}));
    };
  }, [refreshStorage, resume]);

  const value = useMemo<Ctx>(() => ({
    items, storage, wifiOnly, speed,
    setSpeed: (v) => { setSpeedState(v); setSpeedPref(v); void Downloads.setOptions({ wifiOnly, maxActive: 2, threads: v }).catch(() => {}); },
    activeCount: items.filter((i) => i.status === "downloading" || i.status === "queued").length,
    setWifiOnly: (v) => { setWifi(v); setWifiOnlyPref(v); void Downloads.setOptions({ wifiOnly: v, maxActive: 2, threads: speed }).catch(() => {}); },
    refreshStorage,
    pause: (id) => { void Downloads.pause({ id }).catch(() => {}); },
    resume,
    pauseAll: () => { void Downloads.pauseAll().catch(() => {}); },
    resumeAll: () => {
      items.filter((i) => i.status === "paused" || i.status === "error").forEach((i) => void resume(i));
    },
    remove: async (id) => { await Downloads.remove({ id, deleteFiles: true }).catch(() => {}); setOfflinePos(id, 0); },
    removeCompleted: async () => {
      for (const i of items.filter((x) => x.status === "done")) { await Downloads.remove({ id: i.id, deleteFiles: true }).catch(() => {}); setOfflinePos(i.id, 0); }
    },
    exportFile: async (id) => (await Downloads.exportFile({ id })).path,
    play: async (item) => {
      const { url } = await Downloads.playUrl({ id: item.id });
      const res = await NativePlayer.play({
        url, title: item.title, subtitle: item.subtitle || undefined, poster: item.poster || undefined,
        startMs: getOfflinePos(item.id), hasNext: false, server: "Offline", source: "main", fallbackLabel: "", servers: [], rate: 1,
      });
      // guarda onde parou (some se assistiu até o fim)
      const nearEnd = res.durationMs > 0 && res.positionMs > res.durationMs - 30000;
      setOfflinePos(item.id, res.reason === "ended" || nearEnd ? 0 : res.positionMs);
    },
  }), [items, storage, wifiOnly, speed, refreshStorage, resume]);

  return <C.Provider value={value}>{children}</C.Provider>;
}

export function useDownloads(): Ctx {
  const v = useContext(C);
  if (!v) throw new Error("useDownloads fora do DownloadsProvider");
  return v;
}
