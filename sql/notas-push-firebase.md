# Push com o app fechado (Firebase) — passo a passo, só pelo celular

Sem isso o app já notifica enquanto está aberto/em segundo plano. Com isso, a notificação chega **mesmo com o app fechado**
(com os botões Responder / Aceitar / Recusar). Tudo grátis. Faça na ordem.

## 1. Projeto no Firebase
1. Abra **console.firebase.google.com** → **Criar projeto** (nome livre, pode desligar o Google Analytics).
2. Na página do projeto toque no ícone do **Android** (“Adicionar app”). **Nome do pacote: `com.alxmovies.app`** (exatamente). Apelido livre. Registrar app.
3. **Baixe o `google-services.json`** e pule o resto do assistente.
4. Abra o arquivo (app de arquivos/editor de texto), **copie o conteúdo inteiro**.

## 2. Secret no GitHub (liga o Firebase no APK)
Repositório → **Settings → Secrets and variables → Actions → New repository secret**
- Nome: `GOOGLE_SERVICES_JSON`
- Valor: o conteúdo inteiro do `google-services.json`.

## 3. Chave do servidor (Firebase → Supabase)
1. Firebase → engrenagem → **Configurações do projeto → Contas de serviço → Gerar nova chave privada**. Baixa um `.json`.
2. Supabase → **Edge Functions → Secrets** (ou *Project Settings → Edge Functions*) → adicione:
   - `FCM_SERVICE_ACCOUNT` = o conteúdo inteiro desse `.json`
   - `PUSH_SECRET` = uma senha longa inventada por você (anote: vai no passo 5)

## 4. Edge Function
Supabase → **Edge Functions → Deploy a new function** (pelo editor) → nome **`push-send`** → cole o conteúdo de
`supabase/functions/push-send/index.ts` → Deploy. Nas configurações da função **desligue “Verify JWT”** (a proteção é o `PUSH_SECRET`).

## 5. Banco
Abra `sql/push-notifications.sql`, troque `TROQUE_ESTE_SEGREDO` pela mesma senha do `PUSH_SECRET` e rode no **SQL Editor**.

## 6. Novo APK
Suba o zip novo no GitHub (como sempre). No log da etapa "Firebase (google-services.json)" deve aparecer **Firebase ligado.**
Instale, abra o app, **permita as notificações** e entre na conta. Teste: feche o app e mande uma mensagem de outra conta.

## Problemas comuns
- Não chega nada: confira em Supabase → Edge Functions → push-send → **Logs**. 403 = senha diferente nos dois lugares; "FCM_SERVICE_ACCOUNT não configurado" = passo 3.
- Tabela `push_tokens` vazia depois de abrir o app logado: o APK foi compilado sem o secret do passo 2 (ou o pacote do Firebase não é `com.alxmovies.app`).
- Aparelho sem Google Play Services (alguns Huawei) não recebe push do Firebase.
- Com o app **aberto na tela** o push não aparece de propósito (o app mostra por dentro).
