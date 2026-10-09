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
A instalação por cima funciona porque o APK é sempre assinado com a mesma chave.

## Interface nativa (Material Design 3)
No app, todas as telas usam a linguagem visual do Android moderno (só dentro do app; o site no navegador continua igual):
- **Barra superior** com título da tela, busca, mensagens, avisos e o avatar do perfil. Na Início ela é transparente sobre o destaque e vira sólida ao rolar.
- **Barra de navegação inferior**: Início, Buscar, Canais, Salas e Lista, com a "pílula" no item selecionado. Só aparece nas telas principais.
- **Painéis que sobem de baixo** (bottom sheets) no lugar de janelas no meio da tela: menu do perfil, avisos, mensagens, criar perfil/sala, comentar, convidado, etc.
- **Efeito de toque** (ripple) em botões, cartões e listas; botões em estilo preenchido, tonal, contorno e de perigo; campos de texto com contorno; switches do Material; botão flutuante (FAB) do assistente de IA.
- Cores, formas e sombras no padrão Material 3 (tema escuro com a cor da marca), ícones de linha em vez de emojis nos botões principais, transição suave entre telas e snackbar para avisos.

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
