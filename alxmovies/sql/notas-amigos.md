# Amigos, mensagens e "assistindo agora"

## Como instalar
1. Supabase → SQL Editor → rode `sql/friends-system.sql` (pode rodar de novo sem problema).
2. Publique os arquivos novos/alterados do site. Sem o SQL, o site continua normal:
   o botão 💬 e os links de Amigos simplesmente não aparecem.

## Como funciona
- Amizade é entre **perfis** (cada perfil tem seus amigos), não entre contas.
- Adicionar: pelo **código de amigo** (ex: A1B2-C3D4) ou link `amigos.html?add=CODIGO`.
  Não existe busca por nome — ninguém consegue listar perfis do site.
- Sino 🔔: pedido de amizade (Aceitar/Recusar ali mesmo) + "aceitou seu pedido" +
  os avisos que já existiam. Botão 💬 ao lado: conversas e total de não lidas.
- Mensagens: texto, indicação de filme/série e convite pra sala sua. Ao vivo (Realtime).
- "Assistindo agora": **desligado por padrão**. Só grava se o perfil ligar, só amigos
  aceitos veem, some ao sair do player, e expira sozinho (150s "ao vivo", 24h no máximo).

## Regras de segurança
- Perfil infantil nasce com amizades DESLIGADAS; só o responsável liga
  (Painel da conta → Amigos e privacidade). Perfil infantil não muda a privacidade sozinho.
- Convidado não usa amizades. Bloquear remove a amizade e impede novo pedido
  (a outra pessoa não é avisada de quem bloqueou).
- Toda escrita passa por funções SECURITY DEFINER que conferem se o perfil é de quem chamou.
  Tabelas `profile_social` e `friend_activity` não são legíveis direto.
- Limite de 30 mensagens/minuto por perfil.

## Arquivos
Novos: `sql/friends-system.sql`, `amigos.html`, `mensagens.html`, `css/social.css`,
`js/friends.js`, `js/social-ui.js`, `js/header-social.js`, `js/amigos.js`, `js/mensagens.js`
Alterados: `js/header.js` (sino saiu daqui), `js/notifications.js`, `js/watch.js`,
`js/account-panel.js`, `account-panel.html`, `css/header.css`

---

# Visual imersivo (detalhes, episódios, informações)

- Essas 3 páginas rodam em **modo imersivo**: sem topo (perfil/busca/mensagens/sino) e sem
  barra de baixo. Só um botão de voltar (esquerda) e um atalho pro início (direita), em vidro.
  Para ligar em outra página: `renderHeader("", { immersive: true, back: "home.html" })`.
- Voltar usa o histórico quando a pessoa veio de outra página do site; se abriu por link
  direto, cai na página de "fallback" (ex: episódios -> detalhes).
- Novo `css/immersive.css` (hero cinematográfico, botões em ícones, lista de episódios com
  miniaturas grandes, skeleton de carregamento). Transição suave entre páginas no `theme.css`
  (`@view-transition`; navegador sem suporte ignora).
- Corrigidos de brinde: nome de quem comenta entrava no HTML sem escape (brecha de XSS) e o
  banner de cookies aparecia sem estilo nas páginas principais.


---

# Se der erro

**"relation public.social_privacy does not exist" ao criar perfil**
Sobra de um trigger antigo no banco (esse nome não existe em nenhum arquivo do site).
Rode `sql/friends-corrigir-social-privacy.sql`. Resultado vazio = limpo.

**"Banco de dados incompleto: Could not find the function ..."**
Rode `sql/friends-system.sql` inteiro de novo (ele agora confere/limpa sobras antigas e
termina com uma lista "ok / FALTA" de tudo que deveria existir). A mensagem de erro do site
traz o nome da função que faltou.

**"A tabela public.X já existe com outro formato"**
Sobra de outra tentativa antiga. Renomeie a antiga (o próprio erro diz o comando) e rode de novo.

Ordem recomendada: 1) friends-corrigir-social-privacy.sql  2) friends-system.sql


---

# Instalar em partes (se o SQL grande for cortado ao colar)

Use os arquivos da pasta `sql/amigos/`: `parte-1.sql` até `parte-7.sql` (3 a 6 KB cada).
Cole e rode UMA de cada vez, em ordem. A parte 7 termina com a lista "ok / FALTA".
(`sql/friends-system.sql` é o mesmo conteúdo em um arquivo só.)
Opcional: `sql/amigos/limpar-funcoes-antigas.sql` apaga 4 funções de um sistema antigo.
