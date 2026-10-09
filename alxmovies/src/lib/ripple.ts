// Efeito de toque (ripple) do Material para qualquer elemento clicável, sem mexer no CSS de cada um:
// uma camada fixa, do tamanho do elemento, com o mesmo raio de borda, mostra a onda e some.
const CLICKABLE = [
  "button", "a[href]", "[role=button]", ".media-card", ".sala-card", ".profile-item", ".channel-card", ".channel-group-card",
  ".chat-item", ".soc-row", ".hsp-card", ".header-bell-item", ".mini-profile-row", ".account-card-head", ".account-policy-link",
  ".d2-season-row", ".salas-busca-item", ".soc-pick", ".ex-ep", ".hpm-section a", ".ns-item", ".nnav-item",
].join(",");
const SKIP = "input, select, textarea, label, .no-ripple, .sala-progress, .axp-seek, .axp-vol";

let installed = false;

export function installRipple() {
  if (installed) return;
  installed = true;
  document.addEventListener("pointerdown", (e) => {
    const target = (e.target as Element | null)?.closest?.(CLICKABLE) as HTMLElement | null;
    if (!target || target.closest(SKIP) || (target as HTMLButtonElement).disabled) return;
    const r = target.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.width * r.height > innerWidth * innerHeight * 0.6) return;

    const box = document.createElement("span");
    box.className = "ripple-box";
    Object.assign(box.style, {
      left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`,
      borderRadius: getComputedStyle(target).borderRadius,
    });
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const radius = Math.hypot(Math.max(x, r.width - x), Math.max(y, r.height - y));
    const wave = document.createElement("span");
    wave.className = "ripple-wave";
    Object.assign(wave.style, { left: `${x - radius}px`, top: `${y - radius}px`, width: `${radius * 2}px`, height: `${radius * 2}px` });
    box.appendChild(wave);
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 520);
  }, { passive: true, capture: true });
}
