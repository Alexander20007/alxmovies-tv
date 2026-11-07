# Headers de segurança (`_headers`)

A Netlify lê automaticamente um arquivo chamado `_headers` na raiz do
site publicado — não precisa configurar nada no painel, é só ter o
arquivo no deploy. Ele resolve as 5 pendências vermelhas do seu
relatório:

- **X-Frame-Options** — impede que seu site seja carregado dentro de
  um `<iframe>` em outro site (proteção contra clickjacking).
- **X-Content-Type-Options** — impede que o navegador tente
  "adivinhar" o tipo de um arquivo, o que pode ser explorado pra
  rodar script disfarçado de imagem, por exemplo.
- **Referrer-Policy** — controla quanta informação da URL atual vaza
  pro próximo site quando alguém clica num link seu.
- **Permissions-Policy** — desliga de vez recursos do navegador que o
  site não usa (câmera, microfone, geolocalização, USB, pagamento) e
  também bloqueia o rastreamento por "cohort" do Google (FLoC/Topics).
  Deixei liberado só `fullscreen` e `autoplay` pro seu domínio e pro
  `myembed.biz`, porque o player de vídeo precisa disso pra
  funcionar.
- **Content-Security-Policy (CSP)** — a mais importante das 5. Ela
  diz ao navegador de quais domínios o site tem permissão de carregar
  script, imagem, iframe e fazer chamadas de rede. Mapeei exatamente
  os domínios que seu código já usa:
  - `cdn.jsdelivr.net` → biblioteca do Supabase
  - `onqxflwfkexitipylixc.supabase.co` → suas Edge Functions e Auth
  - `image.tmdb.org` → pôsteres e fotos
  - `myembed.biz` → o player de vídeo (iframe)
  - domínios do Google (`googlesyndication.com`, `doubleclick.net`,
    `google.com`, `ep2.adtrafficquality.google`) → AdSense
  - `profitableratecpmnetwork.com` → anúncios da Adsterra (Popunder e
    Social Bar)

Qualquer domínio de fora dessa lista que tentar carregar script,
imagem ou se conectar ao seu site vai ser bloqueado pelo navegador
automaticamente — inclusive se alguém injetar código malicioso via
alguma falha futura, ele não vai conseguir "ligar pra casa" nem
carregar coisa de fora.

## Uma limitação real, sem enrolação

O CSP acima usa `'unsafe-inline'` pra scripts e estilos. Isso existe
porque o projeto usa bastante `<script type="module">...</script>`
inline dentro dos próprios arquivos `.html` (login.html,
account-panel.html etc.) e atributos `style="..."` direto no HTML —
sem isso, o navegador bloquearia esse código e o site quebraria
inteiro.

O jeito "perfeito" de resolver seria mover todo esse JavaScript
inline pra arquivos `.js` externos (ou usar um sistema de nonce/hash
que muda a cada build) — aí sim dava pra tirar o `'unsafe-inline'` e
fechar de vez essa brecha. Isso é uma refatoração grande, então não
fiz agora, mas é a próxima melhoria de segurança que valeria a pena
se você quiser ir além do que o relatório está pedindo. Me avisa se
quiser que eu faça essa migração — é trabalhosa, mas dá pra fazer aos
poucos, arquivo por arquivo.

## Redes de anúncio e CSP: um limite que não dá pra evitar

Diferente do Supabase/TMDB (domínios fixos e previsíveis), redes de
anúncio como a Adsterra costumam usar vários subdomínios e destinos
que mudam com frequência, dependendo do leilão de anúncio em tempo
real. Liberei `*.profitableratecpmnetwork.com` (o domínio que veio no
seu código), mas é possível que, de vez em quando, algum formato de
anúncio específico tente carregar de outro domínio não previsto e
seja bloqueado pelo CSP. Se isso acontecer, o Console do navegador
(F12) mostra exatamente qual domínio foi barrado, e daí é só eu
adicionar na lista.

O anúncio "Popunder" é uma exceção que não sofre com isso: ele abre
uma aba/janela nova via JavaScript, e o que acontece dentro dessa
nova aba não é controlado pelo CSP da página original — só o
carregamento do script inicial (`profitableratecpmnetwork.com`)
precisa estar liberado, o que já está.

## Canais ao vivo: por que o CSP ficou mais aberto em 3 pontos

Isso merece uma explicação direta, porque é diferente de tudo mais
neste arquivo até aqui.

Com AdSense, Adsterra, TMDB e Supabase, eu sempre consegui listar o
domínio exato de cada um no CSP — são serviços fixos, conhecidos.
Canais ao vivo são o oposto: cada canal do catálogo pode estar
hospedado em qualquer servidor, de qualquer dono, e essa lista muda
com o tempo sem eu ter controle sobre isso. Não tem como colocar
"o domínio de cada canal" numa lista fixa — literalmente não dá pra
prever.

Por causa disso, `img-src`, `connect-src` e `frame-src` passaram a
aceitar **qualquer domínio HTTPS** (`https:`), em vez de uma lista
fechada. Isso é necessário pros logos, os testes de "está online" e
o player de canal funcionarem pra qualquer canal do catálogo, não só
pra alguns.

**O que isso significa na prática:** o CSP deixa de conseguir dizer
"só esses domínios específicos podem aparecer aqui" nessas 3 frentes
— mas ele continua bloqueando totalmente `script-src` (script
continua só dos domínios de sempre: Supabase, Google, Adsterra), e
mais importante ainda, o player de canal usa a mesma proteção
`sandbox` (sem `allow-popups`, sem `allow-top-navigation`) que já
protege o player de filmes/séries contra redirecionamento — isso
continua funcionando igual, independente de qual for o domínio do
canal. Ou seja: abrimos o CSP no que é necessário pra funcionalidade
existir, mas mantivemos a defesa mais importante (impedir que o
conteúdo de terceiros sequestre a navegação) intacta.

Se um dia vocês decidirem não usar mais canais de fontes variadas
(por exemplo, hospedar vocês mesmos os streams, com domínio fixo),
esses 3 pontos podem voltar a ser restritos como antes.

## Como conferir se funcionou

Depois de publicar esse deploy, roda o mesmo relatório de novo (ou
https://securityheaders.com) — os 5 itens vermelhos devem virar
verdes. Se algo quebrar (AdSense não carregar, imagem não aparecer),
abra o Console do navegador (F12) — o Chrome mostra exatamente qual
domínio o CSP bloqueou, e daí é só eu adicionar esse domínio na
lista.
