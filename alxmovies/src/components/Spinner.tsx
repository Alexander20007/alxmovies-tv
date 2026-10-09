import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";

/** Círculo pequeno girando. */
export function Spinner({ size = 18, label = "Carregando" }: { size?: number; label?: string }) {
  return <span className="spinner" role="status" aria-label={label} style={{ width: size, height: size }} />;
}

/** Tela de carregamento (troca de página / primeiro carregamento). */
export function PageSpinner() {
  return <div className="page-spinner"><Spinner size={34} /></div>;
}

/** Botão que mostra o círculo girando e fica desativado enquanto `loading`. */
export function BusyButton({ loading = false, disabled, children, className = "", ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button {...rest} className={`${className}${loading ? " is-loading" : ""}`} disabled={disabled || loading}>
      {loading && <Spinner size={15} />}
      {children}
    </button>
  );
}

/**
 * Indicador global: um círculo pequeno no topo aparece sempre que algo está carregando pela primeira vez
 * (dados de uma tela nova), uma ação está sendo enviada (curtir, favoritar, comentar…) ou o app acabou de trocar de tela.
 * Só aparece se a espera passar de ~120 ms (evita piscar) e fica no mínimo ~350 ms (evita sumir rápido demais).
 */
export function GlobalBusyIndicator() {
  const { pathname, search } = useLocation();
  const loadingFirst = useIsFetching({ predicate: (q) => q.state.status === "pending" && q.state.fetchStatus === "fetching" });
  const sending = useIsMutating();
  const [justNavigated, setJustNavigated] = useState(false);
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    setJustNavigated(true);
    const t = setTimeout(() => setJustNavigated(false), 450);
    return () => clearTimeout(t);
  }, [pathname, search]);

  const busy = justNavigated || loadingFirst > 0 || sending > 0;

  useEffect(() => {
    if (busy) {
      const t = setTimeout(() => { shownAt.current = Date.now(); setVisible(true); }, 120);
      return () => clearTimeout(t);
    }
    if (!visible) return;
    const left = Math.max(0, 350 - (Date.now() - shownAt.current));
    const t = setTimeout(() => setVisible(false), left);
    return () => clearTimeout(t);
  }, [busy, visible]);

  if (!visible) return null;
  return <div className="global-busy" aria-live="polite"><Spinner size={22} /></div>;
}
