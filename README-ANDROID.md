# ALXmovies — app Android (sem PC, compilando pelo GitHub)

O app é o mesmo projeto React, empacotado com **Capacitor 8**. Quem gera o APK é o GitHub (grátis), você só usa o celular.

## Passo a passo (só com o celular)
1. Crie uma conta em github.com e um repositório novo (pode ser **Private**).
2. No repositório: **Add file → Create new file**. No nome digite exatamente `.github/workflows/android-apk.yml`
   (as barras criam as pastas). Cole o conteúdo do arquivo `android-apk.yml` que está junto com o projeto e toque em **Commit changes**.
3. **Add file → Upload files** e envie o `alxmovies-android.zip` **sem descompactar**. Toque em **Commit changes**.
   O workflow descompacta o zip sozinho (qualquer `.zip` na raiz serve).
4. Abra a aba **Actions**. O "Build Android APK" começa sozinho e leva uns 8–15 min.
   Se aparecer ❌, abra o passo em vermelho e me mande o texto do erro.
5. Quando ficar ✅, vá em **Releases** (coluna da direita da página inicial do repositório), baixe **ALXmovies.apk** e instale
   (o Android pede para permitir "instalar apps desta fonte").

## Atualizar o app
Envie um zip novo para o repositório (Add file → Upload files, mesmo nome substitui). Cada envio gera uma versão nova em Releases.

### Versões e novidades
- A versão tem o formato `MAIOR.MENOR.N` (ex.: `1.1.0`). O arquivo `version.txt` guarda o `MAIOR.MENOR` (ex.: `1.1`); o `N` sobe de 1 em 1 a cada build e **volta a 0 quando você muda o `version.txt`**.
  Para lançar a 1.2.0 basta escrever `1.2` no `version.txt` e enviar o zip. O workflow nunca publica uma versão menor que a última que já está em Releases.
- O arquivo `release-notes.md` vira o texto da Release e é o que a tela de atualização mostra em "O que há de novo". Escreva em três blocos (`## Novo`, `## Melhorado`, `## Corrigido`) com uma linha `- ...` por novidade.
  Quem pulou versões vê as novidades de todas elas, da mais nova para a mais antiga. Troque o conteúdo a cada versão.
A instalação por cima funciona porque o APK é sempre assinado com a mesma chave.

## Atualização automática dentro do app
Ao abrir, o app consulta `https://api.github.com/repos/Alexander20007/alxmovies-tv/releases/latest`, compara a tag (`vMAIOR.MENOR.N`) com a versão instalada e,
se houver uma mais nova, mostra um aviso. Ao tocar em **Atualizar agora** ele baixa o `.apk` ali mesmo (com barra de progresso) e abre o instalador do Android.
- Código: `src/lib/updater.ts`, `src/components/UpdatePrompt.tsx` e o plugin nativo gerado por `scripts/android/patch-android.mjs` (`AppUpdaterPlugin.java`).
- O repositório de Releases precisa ser **público** (a API do GitHub não entrega releases de repositório privado sem login).
- A primeira instalação com este recurso é manual; a partir dela as próximas versões chegam pelo próprio app.
- O Android só atualiza por cima se o APK for assinado com a **mesma chave** — não troque o keystore/secrets entre versões.

## Interface nativa (Material Design 3)
No app, todas as telas usam a linguagem visual do Android moderno (só dentro do app; o site no navegador continua igual):
- **Barra superior** com título da tela, busca, mensagens, avisos e o avatar do perfil. Na Início ela é transparente sobre o destaque e vira sólida ao rolar.
- **Barra de navegação inferior**: Início, Buscar, Canais, Salas e Lista, com a "pílula" no item selecionado. Só aparece nas telas principais.
- **Painéis que sobem de baixo** (bottom sheets) no lugar de janelas no meio da tela: menu do perfil, avisos, mensagens, criar perfil/sala, comentar, convidado, etc.
- **Efeito de toque** (ripple) em botões, cartões e listas; botões em estilo preenchido, tonal, contorno e de perigo; campos de texto com contorno; switches do Material; botão flutuante (FAB) do assistente de IA.
- Cores, formas e sombras no padrão Material 3 (tema escuro com a cor da marca), ícones de linha em vez de emojis nos botões principais, transição suave entre telas e snackbar para avisos.

## Upgrade ultra (novidades)
- **Borda a borda de verdade:** a status bar fica transparente e o app desenha por trás dela (`MainActivity` + plugin `EdgeInsets`, gerados por `scripts/android/patch-android.mjs`).
  O JS lê a altura real das barras e publica em `--sat` / `--sab`; até lá, o CSS assume 24 dp para nada ficar embaixo da status bar.
- **Mensagens:** o ícone abre uma tela cheia (`/mensagens`) estilo Instagram — busca, faixa de amigos "ao vivo", lista de conversas com não lidas e a conversa em tela cheia.
- **Notificações:** o sino abre uma tela própria (`/notificacoes`) com **Novas** e **Anteriores** (o histórico fica guardado no aparelho, por perfil). Pedidos de amizade podem ser aceitos/recusados ali.
- **Laura IA:** o assistente agora se chama **Laura IA** e abre em tela cheia (`/laura`). O botão flutuante aparece **só na tela inicial**.
- Visual novo em `src/styles/ultra.css` (barra superior, navegação inferior, início, login, perfis, painéis).

## Comportamento de app
- Carregamento: círculo pequeno girando no topo sempre que uma tela nova carrega dados ou uma ação está sendo enviada;
  botões importantes (entrar, salvar, enviar, criar sala…) mostram o círculo e ficam bloqueados enquanto trabalham.
- Botão **voltar** do Android: fecha modal/painel/menu primeiro, depois volta de tela; na tela inicial pede para tocar de novo para sair.
- Player: gira sozinho para paisagem, esconde as barras do sistema e mantém a tela acesa; ao sair volta para retrato.
- Compartilhar/copiar usam o menu de compartilhamento do Android. Barras do sistema respeitadas (borda a borda); o teclado não cobre campos.
- **Desligados no app:** aviso de cookies, service worker e anúncios (AdSense/pop-up não são permitidos dentro de apps — use AdMob depois).
- **Ainda não tem:** bloqueio por biometria no app (o do site usa WebAuthn, que não funciona no WebView).

## CORS / domínio
`capacitor.config.ts` usa `server.hostname = "alxmovies.netlify.app"` e `androidScheme = "https"`. O app serve os arquivos locais, mas as
requisições saem com `Origin: https://alxmovies.netlify.app`, igual ao site — então o CORS do Supabase e das outras APIs continua valendo.
Não ligue o `CapacitorHttp` (ele removeria o Origin e a função do Gemini, que confere o domínio, recusaria).

## Importante
- `appId` (`com.alxmovies.app`) identifica o app e **não pode mudar** depois de publicado. Se quiser outro, troque em `capacitor.config.ts` antes do primeiro envio.
- E-mails do Supabase (confirmação/recuperar senha) abrem no **navegador**, na versão web do site no Netlify. Mantenha o site publicado no Netlify.
- A chave de assinatura incluída (`keystore/alxmovies-sideload.p12`) é só para instalar direto no celular. Para publicar na Play Store, crie a sua
  e cadastre os secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS` e `ANDROID_KEYSTORE_PASSWORD` (Settings → Secrets and variables → Actions).
  A Play Store exige AAB; me peça e eu adiciono esse passo no workflow.

## Notificações do aparelho
- Mensagem nova e pedido de amizade aparecem na barra de notificações quando o app está **em segundo plano**. Na notificação dá para
  **Responder** (campo de texto), **Marcar como lida**, **Aceitar** e **Recusar** sem abrir o app. Tocar nela abre a conversa (`/mensagens?chat=…`) ou os avisos.
- Código: `src/components/DeviceNotifications.tsx`, `src/lib/deviceNotify.ts` e o plugin nativo `AlxNotify` (+ `AlxNotifyReceiver`) gerado por `scripts/android/patch-android.mjs`.
- O app guarda o login atual no aparelho (só dentro do app) para os botões da notificação falarem direto com o Supabase. Ao sair da conta isso é apagado.
- **App fechado:** push via Firebase (FCM). É opcional: só liga se o secret `GOOGLE_SERVICES_JSON` existir no GitHub; sem ele o APK compila igual, só que
  as notificações funcionam apenas com o app aberto/em segundo plano. Passo a passo em `sql/notas-push-firebase.md`
  (SQL `sql/push-notifications.sql` + Edge Function `supabase/functions/push-send`).
- Android 13+ pede a permissão de notificações na primeira vez.

## Players de vídeo (API principal + reserva)
- Tela de assistir e salas usam a **mesma API principal** (`VITE_STREAM_BASE_URL`). Se ela estiver offline, não achar o link ou demorar mais de 8 s,
  a API reserva (`VITE_EXTRACTOR_BASE_URL`, a que as salas usavam) carrega em segundo plano e vale o primeiro link que chegar. Código: `resolveStream` em `src/services/stream.ts`.
- Se o vídeo da principal quebrar durante a reprodução, o player troca para a reserva sozinho (a sala retoma do mesmo ponto). No player principal aparece "Reserva" no menu Servidor.
- Os canais ao vivo continuam como estavam.

## Buscar amigos pelo nome e sugestões
- Na tela **Amigos**: campo "Buscar pessoas pelo nome" e a lista "Pessoas que você pode conhecer" (amigos em comum primeiro). Toque em **Adicionar** para enviar o pedido.
- Exige rodar `sql/amigos/parte-8-buscar-e-sugestoes.sql` no Supabase (SQL Editor). Perfis infantis e perfis da própria conta não aparecem.
- Cada perfil pode sair das buscas em Amigos → Privacidade → "Aparecer em buscas e sugestões" (vem ligado por padrão).

## Ícone e tela de abertura
- Ícone: `assets/icon-only.png` (legado) + `assets/icon-foreground.png`/`icon-background.png` (adaptativo). Tela de abertura do Android 12+: `scripts/android/splash-icon.png`
  (o patch coloca em `drawable-nodpi` e aponta o tema para ela, fundo preto).

## Player nativo (Media3/ExoPlayer)
No app Android, "Assistir" abre um player 100% nativo (`AlxPlayerActivity`, gerado pelo patch a partir de `scripts/android/player-activity.java.txt`).
Controles: play/pause, ±10 s (toque duplo nas laterais), brilho/volume por gesto, velocidade, qualidade, legendas, servidores (incl. "Reserva"), próximo episódio e picture-in-picture.
O app prepara o link (API principal + reserva), abre o player e recebe de volta onde parou. Se o player nativo não abrir, o player web antigo é usado automaticamente.

## Download (1DM / ADM)
O botão **Baixar** entrega o link direto à tela "Baixar arquivo" do 1DM (componente `idm.internet.download.manager.Downloader`, integração oficial), com o nome do arquivo já preenchido (`Série - T01E03`). Código: `scripts/android/download-plugin.java.txt`.

## Aviso de versão nova na barra de notificações
Dois caminhos (os dois evitam notificar duas vezes a mesma versão):
1. **Push do Firebase (na hora):** o app se inscreve no tópico `app-updates`. Depois de publicar a Release, o GitHub Actions chama a função `push-send` (`table: "app_update"`) e todos os celulares recebem. Precisa dos secrets do GitHub `PUSH_SEND_URL` (ex.: `https://SEU-PROJETO.supabase.co/functions/v1/push-send`) e `PUSH_SECRET` (a mesma senha do `push-send`), e do redeploy da função `push-send`.
2. **Verificação em segundo plano (garantia):** a cada ~6 h o Android consulta a última Release do GitHub (`AlxUpdateWorker`) e notifica se houver versão mais nova.
Ao tocar na notificação o app abre direto na tela de atualização.

## Proxy (VITE_USE_PROXY)
**Padrão: desligado** (o app fala direto com os serviços). Só a verificação de versão nova usa o proxy (`/release`, público), com o GitHub como reserva.
Com `VITE_USE_PROXY=true` (variável do repositório no GitHub ou `.env`), o app passa a falar só com o Worker `alx-proxy`
(JWT + nonce). `src/lib/proxy.ts` tem o pool de nonces, o `apiFetch` e o `sbFetch` do supabase-js. Ficam **diretos** de propósito:
o tempo real (websocket), o vídeo (m3u8/segmentos), as funções de convidado, o plugin nativo de notificações, os avatares públicos
e a verificação de versão nova (GitHub). Desligado (padrão) tudo funciona como antes.

## Site
O site (navegador) é só informativo e de download do app: `src/web/` (vitrine, página de link compartilhado). Sem login e sem player.
O app (APK) usa `src/appMain.tsx`; a escolha é feita em `src/main.tsx`. A assinatura do app está em `public/.well-known/assetlinks.json` e em `src/web/release.ts`.
