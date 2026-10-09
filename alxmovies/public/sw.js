// ============================================================
// SERVICE WORKER DO ALXMOVIES
// ------------------------------------------------------------
// Objetivo modesto, de propósito: só o mínimo pra o navegador
// considerar o site "instalável" como app (ícone na tela inicial,
// abre em tela cheia) e deixar a navegação um pouco mais rápida em
// visitas repetidas, cacheando os arquivos estáticos do próprio site
// (HTML, CSS, JS, ícones).
//
// NÃO tenta fazer o site funcionar 100% offline (os dados vêm do
// Supabase/TMDB/canais, que precisam de internet de qualquer jeito)
// — só evita rebaixar uma segunda visita à mesma velocidade da
// primeira pros arquivos que não mudam a cada carregamento.
// ============================================================

const CACHE_NAME = "alxmovies-static-v3";

// Só os arquivos do PRÓPRIO site — nunca cacheia chamada de API
// (Supabase, TMDB, canais, IA), que precisam sempre vir da rede.
const STATIC_ASSETS = [
  "/manifest.json",
  "/favicon.ico",
  "/favicon-192.png",
  "/favicon-512.png",
  "/favicon-180.png",
];

// Extensões de código/conteúdo do site que mudam com frequência
// durante o desenvolvimento — pra essas, priorizamos sempre a rede
// (só cai pro cache se estiver sem internet). Ícones e outros
// arquivos realmente estáticos continuam com cache priorizado
// (carregam na hora, atualizam em segundo plano).
const NETWORK_FIRST_EXT = [".html", ".js", ".css", ".json"];

function isNetworkFirst(url) {
  if (url.pathname === "/" || url.pathname.endsWith("/")) return true;
  return NETWORK_FIRST_EXT.some((ext) => url.pathname.endsWith(ext));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .catch(() => {
        // Se algum arquivo falhar (ex: ainda não existe), não trava a
        // instalação do service worker por causa disso.
      })
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Só mexe em requisições GET, do próprio domínio, e nunca em
  // chamadas de API — tudo isso sempre precisa vir direto da rede,
  // nunca do cache (dados de conta, catálogo, canais etc. mudam o
  // tempo todo).
  const isApiCall =
    url.hostname.includes("supabase.co") ||
    url.hostname.includes("themoviedb.org") ||
    url.hostname.includes("alx-player.netlify.app") ||
    url.hostname.includes("googlesyndication.com") ||
    url.hostname.includes("profitableratecpmnetwork.com") ||
    url.hostname.includes("doubleclick.net");

  if (event.request.method !== "GET" || url.origin !== self.location.origin || isApiCall) {
    return;
  }

  // HTML/CSS/JS: rede primeiro — sempre pega a versão mais nova
  // publicada; só usa o cache se a pessoa estiver sem internet.
  // Navegação (rotas do React, ex.: /home) sempre busca o index.html mais novo: servir um
  // index.html velho do cache apontaria para arquivos com hash que já não existem após um deploy.
  if (event.request.mode === "navigate" || isNetworkFirst(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  // Resto (ícones, imagens locais etc.): "stale-while-revalidate" —
  // mostra o que já tem em cache na hora (se tiver), e atualiza o
  // cache em segundo plano pra próxima vez.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => cached); // sem rede: usa o que tiver em cache, se tiver

      return cached || network;
    })
  );
});
