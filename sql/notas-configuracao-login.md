# Configuração necessária no Supabase — novas opções de login

Essas três funcionalidades novas usam recursos nativos do Supabase Auth.
Não exigem nenhuma tabela nova, só ativar/configurar no painel do projeto.

## 1) Login como convidado (token de 24h)
Vá em **Authentication → Sign In / Providers → Anonymous Sign-Ins** e
ative a opção. Sem isso, o botão "Entrar como convidado" retorna erro.

Como funciona no app: ao clicar em "Entrar como convidado", o
ALXmovies cria uma conta anônima do Supabase (`signInAnonymously`) e
guarda a hora de início no navegador. Depois de 24h, `js/guard.js`
detecta a sessão vencida em qualquer página protegida, faz logout
automático e manda a pessoa de volta pro login com aviso pra criar
uma nova sessão. Um banner no topo mostra o tempo restante.

Limitação importante: como é uma conta anônima de verdade no
Supabase, os favoritos/perfis criados durante a sessão de convidado
ficam vinculados a esse usuário anônimo. Se a pessoa clicar em
"Criar conta para salvar de vez" ela sai dessa sessão e cria uma
conta nova do zero — os dados da sessão de convidado não são
migrados automaticamente. Isso é intencional pra manter o escopo
simples, mas dá pra evoluir depois usando
`supabase.auth.updateUser({ email, password })` numa sessão anônima
pra "promovê-la" a conta permanente sem perder os dados.

### Limpeza automática das contas de convidado vencidas
O front-end (js/guard.js) só reconhece as 24h vencidas quando a
própria pessoa reabre uma página do app com aquela sessão — o
Supabase, do lado do servidor, não sabe desse prazo e mantém a
conta anônima válida por muito mais tempo. Pra realmente apagar
essas contas do banco depois de 24h, foi criada uma Edge Function:

`supabase/functions/cleanup-guest-accounts/index.ts`

Passos pra colocar no ar:
1. Faça o deploy da função (via Supabase CLI):
   `supabase functions deploy cleanup-guest-accounts`
2. Em **Edge Functions → cleanup-guest-accounts → Secrets** (ou via
   CLI: `supabase secrets set CRON_CLEANUP_SECRET=algum-valor-aleatorio-grande`),
   defina um valor secreto qualquer, só pra você — é o que impede
   qualquer pessoa de chamar essa função e apagar contas em massa.
3. Rode o script `sql/cleanup-guest-accounts-cron.sql` no SQL
   Editor, substituindo `<SEU-PROJECT-REF>` e `<VALOR-DO-CRON-SECRET>`
   pelos valores reais. Ele agenda a função pra rodar a cada hora
   (via `pg_cron` + `pg_net`) e também garante que apagar a conta do
   convidado apague junto o perfil, favoritos, avaliações e
   histórico dele (em vez de deixar tudo órfão no banco).

Se preferir não usar `pg_cron`, dá pra chamar a mesma função de um
cron externo gratuito (ex: cron-job.org, GitHub Actions agendado)
fazendo um POST pra
`https://<seu-projeto>.supabase.co/functions/v1/cleanup-guest-accounts`
com o header `x-cron-secret: <o mesmo valor do passo 2>`.

### Código de recuperação (voltar pro mesmo convidado depois)
Se a pessoa fechar/limpar o navegador durante a sessão de convidado,
ela normalmente continua logada (o Supabase guarda a sessão salva
localmente) — a não ser que limpe os dados do site, use aba anônima,
ou troque de aparelho. Pra esses casos, existe um código de
recuperação:

- Botão **"🔑 Código de acesso"** no banner de convidado (aparece no
  topo de qualquer página, enquanto logado como convidado) gera um
  código tipo `AB3CD-EF4GH` pra pessoa guardar.
- Na tela de login, o link **"Já tenho um código de convidado"**
  deixa digitar esse código pra voltar pro mesmo perfil (mesmos
  favoritos, histórico etc.) em qualquer navegador/aparelho — desde
  que ainda não tenham se passado as 24h da conta original.
- Cada convidado só tem UM código ativo por vez; gerar de novo troca
  (invalida) o anterior.

Rode `sql/guest-recovery-codes.sql` no SQL Editor pra criar a tabela
que guarda esses códigos (é só uma tabela nova, sem RLS liberada pra
ninguém — só as Edge Functions, com a service role key, acessam).

Depois, faça o deploy das duas novas funções:
```
supabase functions deploy guest-generate-code
supabase functions deploy guest-redeem-code
```
Elas usam as mesmas `SUPABASE_URL`/`SUPABASE_ANON_KEY`/
`SUPABASE_SERVICE_ROLE_KEY` que já vêm prontas no ambiente — não
precisa configurar nenhum secret extra pra essas duas.

Segurança do código: ele funciona como uma senha temporária —
quem tiver o código consegue entrar naquele perfil de convidado.
Isso é aceitável porque é uma conta descartável (sem e-mail real,
sem dados sensíveis de identidade) e o código expira em 24h junto
com a conta, mas vale avisar isso pra quem for usar: tratar o código
como algo pra não compartilhar.

## 2) Login por biometria (Touch ID / Face ID / Windows Hello)
Não precisa configurar nada no Supabase — é 100% local, via WebAuthn
no navegador (`js/biometric.js`).

Importante: como o app não tem um backend próprio pra validar a
assinatura WebAuthn (isso normalmente exige um "relying party"
guardando a chave pública), a biometria funciona como um **cadeado
do app no aparelho**: depois de logar normalmente uma vez (o que
deixa a sessão do Supabase salva no navegador), a pessoa liga a
biometria no Painel da Conta e, a partir daí, o ALXmovies passa a
exigir a digital/rosto pra revelar esse conteúdo já autenticado
sempre que a aba é aberta. Não é uma segunda forma independente de
autenticar contra o servidor — é uma trava a mais no dispositivo.

## 3) Recuperar/trocar senha esquecida
Vá em **Authentication → URL Configuration** e adicione a URL do seu
site publicado (ex: `https://alxmovies.netlify.app/reset-password.html`)
em **Redirect URLs**. Sem isso, o Supabase recusa redirecionar de
volta pro app depois que a pessoa clica no link do e-mail.

Fluxo: login.html → "Esqueceu a senha?" → e-mail →
`resetPasswordForEmail` → a pessoa recebe um link → cai em
`reset-password.html` → define a nova senha → é deslogada da sessão
de recuperação e cai no login normal já com a senha nova.
