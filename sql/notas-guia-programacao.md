# Guia de programação de canais (EPG) — contrato do endpoint

Esse endpoint **ainda não existe** na sua API. O site já está pronto
pra usar ele assim que você criar — só precisa seguir exatamente esse
formato. Enquanto ele não existir, o player de canal simplesmente não
mostra essa parte (sem erro nenhum aparecendo pra quem usa o site).

## URL esperada

```
GET https://alx-player.netlify.app/.netlify/functions/programacao?stream=<stream-url-codificada>
```

- `stream` é a URL do vídeo do canal (o mesmo valor que já vem no
  campo `stream` do catálogo principal), **codificada com
  `encodeURIComponent`**. Uso essa URL como identificador porque é o
  único dado garantidamente único por canal que a API principal já
  devolve (nome e categoria podem se repetir entre canais diferentes).

## Resposta esperada (JSON)

```json
{
  "success": true,
  "atual": {
    "titulo": "Jornal Nacional",
    "inicio": "2026-08-30T19:00:00-03:00",
    "fim": "2026-08-30T19:45:00-03:00"
  },
  "proximo": {
    "titulo": "Novela das 21h",
    "inicio": "2026-08-30T19:45:00-03:00",
    "fim": "2026-08-30T20:30:00-03:00"
  }
}
```

- `titulo` — nome do programa (obrigatório; sem isso o site ignora
  aquele item).
- `inicio` / `fim` — data e hora em formato ISO 8601, **com o fuso
  horário incluído** (ex: `-03:00` pra horário de Brasília). Sem o
  fuso, o horário mostrado pode ficar errado dependendo de onde a
  pessoa está acessando. Se não tiver esses dados, pode mandar
  `null` — o site mostra só o nome do programa, sem o horário.
- `atual` e/ou `proximo` podem vir como `null` se não tiver essa
  informação pra aquele canal — o site esconde só a parte que faltar.

## Quando não tiver dado nenhum

```json
{ "success": false }
```
ou simplesmente um erro HTTP (404, 500 etc.) — o site trata os dois
casos do mesmo jeito: não mostra nada, sem quebrar a tela.

## Onde isso é usado no código

- `js/channels.js` → função `getChannelProgramGuide(streamUrl)`
- `js/channel-player.js` → mostra o resultado logo acima do vídeo,
  no player de canal (tags "AGORA" e "A SEGUIR")

Se quando você construir o endpoint de verdade o formato ficar
diferente do combinado aqui (nomes de campo diferentes, outro jeito
de identificar o canal etc.), é só me avisar o formato real que eu
ajusto o `getChannelProgramGuide` pra bater — a lógica de mostrar na
tela não muda, só a parte que lê a resposta.
