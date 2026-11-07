// O site agora é só informativo: este arquivo existe apenas para REMOVER o service worker antigo
// (e os caches dele) de quem já visitou o site antes. Não faz cache de nada.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    try { for (const k of await caches.keys()) await caches.delete(k); } catch (e) { /* ignora */ }
    try { await self.registration.unregister(); } catch (e) { /* ignora */ }
    const clients = await self.clients.matchAll({ type: "window" });
    clients.forEach((c) => c.navigate(c.url));
  })());
});
