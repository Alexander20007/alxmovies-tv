# ALXmovies — React

Vite + React 18 + TypeScript + React Router + TanStack Query + Supabase (Realtime) + hls.js.

```bash
cp .env.example .env     # opcional: os valores padrão já apontam para o seu Supabase
npm install
npm run dev              # desenvolvimento
npm run typecheck        # só checagem de tipos
npm run build            # build de produção (dist/)
npm run build:strict     # typecheck + build
```

## Rotas
Públicas: `/login`, `/reset-password`, `/privacidade`, `/cookies`, `/seguranca`.
Com login: `/profiles`, `/manage-profiles`.
Com login + perfil: `/home`, `/details`, `/episodes`, `/info`, `/watch`, `/search`, `/mylist`, `/salas`, `/sala`, `/amigos`, `/mensagens`, `/account`.

## Variáveis de ambiente (`.env.example`)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TMDB_FUNCTION_URL`, `VITE_STREAM_BASE_URL` (player), `VITE_EXTRACTOR_BASE_URL` (salas),
`VITE_CHANNELS_API_URL`, `VITE_EPG_API_URL` (canais), `VITE_GEMINI_FUNCTION_URL`, `VITE_GEMINI_MODEL` (assistente de IA).

## Deploy no Netlify
`netlify.toml` já define: build (`npm run build` → `dist`), redirecionamento SPA, cabeçalhos de segurança (CSP) e cache.
1. Cadastre as variáveis `VITE_*` em *Site settings → Environment variables*.
2. Supabase → Authentication → URL Configuration: coloque o domínio do Netlify em *Site URL* e em *Redirect URLs*, incluindo `https://SEU-SITE.netlify.app/reset-password`.
3. Função Edge do Gemini (`smooth-endpoint`): inclua o domínio do Netlify na lista de origens permitidas.
4. Aplique no Supabase os SQL de `sql/` (salas: `watch-rooms*.sql`; amigos: `sql/amigos/parte-1` a `parte-7`).
5. Anúncios (só convidado): troque `data-ad-slot` em `src/components/Ads.tsx` pelo ID real do bloco do AdSense.

## Observações
- O PIN de perfil e a restrição de horário são conferidos no navegador (como no site original): servem para uso familiar, não como segurança forte.
- Preferência "avisos por e-mail" só grava a escolha; o envio de e-mails não existe (igual ao original).
- Service worker (`public/sw.js`): navegações são sempre buscadas na rede para não servir um `index.html` antigo após um deploy.

## App Android (Capacitor)
Veja `README-ANDROID.md`. Mesmo código do site: `lib/native.ts` detecta o app (`isNative`) e liga o que é só do Android.
