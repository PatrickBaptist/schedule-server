# `schedule-server`

Backend em `"Node.js"` com `"Express"` para cuidar de:

- `"login"` e `"cadastro"` de usuários
- `"escala"` mensal e `"escala especial"` de músicas
- `"lista de músicas"` e `"histórico"` de músicas
- `"notificações"` e `"avisos"`
- `"auditoria"` de ações
- tarefas automáticas, chamadas de `"crons"`

O banco usado é o `"Firestore"` do `"Firebase"`.

## O que esse backend faz

Ele funciona como um servidor para um ministério/agenda de louvor. As pessoas entram, fazem login, veem sua escala, recebem avisos, e os administradores podem organizar usuários, músicas e escalas.

Ele também salva tudo importante no Firestore, como:

- `"users"`
- `"schedules"`
- `"specialSchedules"`
- `"musicLinks"`
- `"allMusicLinks"`
- `"notifications"`
- `"warnings"`
- `"auditLogs"`

## Tecnologias

- `"TypeScript"`
- `"Express 5"`
- `"Firebase Admin"`
- `"JWT"`
- `"bcrypt"`
- `"CORS"`
- `"Helmet"`
- `"Resend"` para envio de e-mails
- `"node-cron"` para rotinas automáticas
- `"dayjs"` para datas
- `"translate"` e `"node-fetch"` para buscar e traduzir versículos

## Como rodar

### Desenvolvimento

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Produção

```bash
npm start
```

## Variáveis de ambiente

Essas variáveis aparecem no código e precisam existir:

- `"PORT"`: porta do servidor
- `"JWT_SECRET"`: chave do token
- `"GUEST_EMAIL"`: e-mail usado no login de convidado
- `"RESEND_API_KEY"`: chave do serviço de e-mail
- `"FIREBASE_PROJECT_ID"`
- `"FIREBASE_CLIENT_EMAIL"`
- `"FIREBASE_PRIVATE_KEY"`
- `"FIREBASE_DATABASE_URL"`

## Segurança

O backend usa algumas proteções:

- `"Helmet"` para headers de segurança
- `"CORS"` liberado só para:
  - `https://ibmmlouvor.com.br`
  - `http://localhost:5173`
- `"JWT"` para autenticação
- `"bcrypt"` para senha
- `"auditMiddleware"` para registrar ações importantes

## Autenticação

O fluxo principal é assim:

1. A pessoa faz `"login"` em `/auth/login`
2. O servidor devolve um `"token"`
3. Esse token vai no header:

```http
Authorization: Bearer SEU_TOKEN
```

Também existe:

- `/auth/register` para cadastro
- `/auth/guest` para login de convidado
- `/auth/me` para buscar o usuário logado

## Perfis e permissões

Os perfis usados no código são:

- `"admin"`
- `"leader"`
- `"minister"`
- `"vocal"`
- `"guitar"`
- `"keyboard"`
- `"bass"`
- `"drums"`
- `"violao"`
- `"sound"`
- `"lighting"`
- `"midia"`
- `"datashow"`
- `"guest"`

Regras importantes:

- `"admin"` e `"leader"` têm acesso a várias rotas de gestão
- `"guest"` vê menos dados em usuários, músicas e notificações
- algumas rotas aceitam só certos perfis para criar, editar ou apagar

## Rotas

### `"ping"`

- `GET /ping`
- Responde se o sistema está vivo

### `"auth"`

- `GET /auth/me`
- `POST /auth/login`
- `POST /auth/register`
- `POST /auth/guest`

### `"users"`

- `GET /users`
  - lista usuários
  - precisa de `"token"`
- `GET /users/all`
  - lista usuários filtrados
  - precisa de `"admin"` ou `"leader"`
- `GET /users/:id`
  - busca um usuário por id
- `PUT /users/:id`
  - atualiza usuário
  - só `"admin"`
- `DELETE /users/:id`
  - apaga usuário
  - só `"admin"`

### `"schedule"`

- `GET /schedule/next-sunday`
  - retorna a escala do próximo domingo
- `GET /schedule/special-schedule`
  - lista escalas especiais
- `GET /schedule/:month`
  - busca a escala de um mês
  - resposta: `músicos` com o nome atual do usuário e `músicosIds` com os IDs salvos
- `POST /schedule/`
  - cria ou atualiza uma escala manual
  - `"admin"` ou `"leader"`
  - o frontend deve enviar os músicos por `"ID"` em `músicosIds`
  - formato esperado:
    - `minister`: `["userId"]`
    - `vocal`: `["userId1", "userId2"]`
    - `teclas`, `violao`, `batera`, `bass`, `guita`, `sound`: `["userId"]`
  - os `GETs` devolvem todas as funções como arrays; registros antigos com valor único também são normalizados para array
- `POST /schedule/generate-monthly`
  - gera a escala mensal automática
  - `"admin"` ou `"leader"`
- `POST /schedule/special-schedule`
  - salva escalas especiais
  - `"admin"` ou `"leader"`
  - o frontend deve enviar os músicos por `"ID"` em cada campo, sempre como array
  - a resposta inclui todas as funções como arrays e `musicosIds`/`músicosIds` com os IDs gravados
- `DELETE /schedule/special-schedule/:id`
  - apaga escala especial
  - `"admin"` ou `"leader"`

### `"musicList"`

- `GET /musicList/`
  - lista as músicas da semana
- `POST /musicList/`
  - cria música
  - perfis permitidos: `"admin"`, `"leader"`, `"minister"`, `"vocal"`
- `PUT /musicList/:id`
  - atualiza música
  - vários perfis podem editar
- `DELETE /musicList/:id`
  - apaga música
  - só `"admin"`, `"leader"`, `"minister"`

### `"allMusicLinks"`

- `GET /allMusicLinks/`
  - lista o histórico completo
  - precisa de `"token"`
- `POST /allMusicLinks/`
  - adiciona item no histórico
- `PUT /allMusicLinks/:id`
  - atualiza item do histórico
- `DELETE /allMusicLinks/:id`
  - apaga item do histórico

### `"notification"`

- `GET /notification/`
  - busca a notificação atual
- `GET /notification/warning`
  - busca o aviso atual
- `POST /notification/`
  - salva notificação
  - `"admin"` ou `"leader"`
- `POST /notification/warning`
  - salva aviso
  - `"admin"` ou `"leader"`

### `"audit"`

- `GET /audit/`
  - lista logs de auditoria
  - precisa de `"token"`
  - aceita filtros por:
    - `"limit"`
    - `"method"`
    - `"path"`
    - `"from"`
    - `"to"`

### `"cron"`

Essas rotas existem para disparar tarefas automáticas manualmente:

- `GET /cron/birthday`
  - envia e-mails de aniversário
- `GET /cron/verse`
  - envia versículo da semana
- `GET /cron/music`
  - envia a lista de músicas da semana
- `GET /cron/delete-musics-weekly`
  - apaga os registros de músicas da semana

## Como a escala funciona

A parte de `"schedule"` faz duas coisas:

1. permite salvar manualmente um dia da escala
2. gera uma escala automática do mês

A geração automática tenta:

- usar usuários ativos
- distribuir as funções de forma mais justa
- evitar repetir a mesma pessoa no domingo anterior
- respeitar os papéis e instrumentos do usuário

As funções usadas na escala incluem:

- `"minister"`
- `"vocal"`
- `"teclas"`
- `"violao"`
- `"batera"`
- `"bass"`
- `"guita"`
- `"sound"`

## Como as músicas funcionam

Existem duas camadas:

- `"musicLinks"`: músicas da semana
- `"allMusicLinks"`: histórico geral

Quando uma música é criada ou atualizada:

- o link pode virar link de `"embed"`
- a ordem é controlada por um campo `"order"`
- o histórico também é mantido em `"allMusicLinks"`

## E-mails automáticos

O sistema envia e-mails usando `"Resend"` para:

- avisar líderes sobre novo cadastro
- mandar parabéns de aniversário
- mandar versículo da semana
- mandar músicas da semana

## Auditoria

O `"auditMiddleware"` registra automaticamente ações de:

- `"POST"`
- `"PUT"`
- `"PATCH"`
- `"DELETE"`

Ele grava:

- método
- rota
- status
- autor da ação
- payload resumido
- resposta resumida
- data e hora
- IP
- user-agent

As consultas da auditoria podem filtrar por período, método e caminho.

## Observações

- O projeto não tem `"tests"` configurados ainda
- O `"README"` anterior estava vazio; este arquivo descreve o backend de verdade
- Se você quiser, eu posso fazer uma segunda versão com:
  - exemplos de `"request/response"`
  - exemplos de `"JSON"`
  - tabela de `"status codes"`
  - diagrama das rotas
