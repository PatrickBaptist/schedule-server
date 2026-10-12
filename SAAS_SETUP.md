# Organizações e convites

Cada conta pode participar de várias organizações. As funções musicais e a
permissão administrativa ficam em `organizations/{id}/members/{userId}`.
O JWT identifica a conta; todas as rotas de dados confirmam a participação atual.

## Configuração antes de publicar

1. Use o mesmo projeto Firebase no backend e no frontend. O backend emite um
   `firebaseCustomToken` com UID igual ao ID do documento de usuário. O navegador
   entra com `signInWithCustomToken` e mantém a sessão para escutar as músicas.
2. Publique `firestore.rules` e `firestore.indexes.json` no projeto escolhido.
   Com Firebase CLI autenticado: `firebase deploy --only firestore --project ID`.
   Confira o ID explicitamente. O código não executa esse comando automaticamente.
3. Configure `APP_PUBLIC_URL` com a URL pública do frontend. Convites são enviados
   por Resend quando essa URL e `RESEND_API_KEY` estiverem configuradas. Sem elas,
   a tela entrega um link para copiar e compartilhar individualmente.
4. `EMAIL_FROM` pode definir um remetente verificado no Resend. O remetente atual
   é preservado como fallback. Rotacione a chave Resend mencionada na conversa.
5. Publique frontend e backend juntos: rotas globais de dados foram retiradas.
   A conta continua podendo editar o próprio perfil em `PATCH /users/me`.

## Migrar os dados atuais

Antes de aplicar, faça uma exportação/backup do Firestore. O script copia dados
para um destino novo e preserva as coleções antigas. Não copia auditoria antiga,
porque os registros podem conter senhas e tokens; eles devem ser tratados à parte.

Defina o projeto/banco de origem e o ID real de uma conta habilitada que será
proprietária. Nunca use um ID fictício para executar a migração.

```powershell
npm run build
node dist/scripts/migrateOrganization.js --organization-id=ID --name="NOME" --slug=SLUG --owner-id=ID_USUARIO
```

Esse comando só mostra contagens. Após revisar, acrescente `--apply` ao mesmo
comando. A organização fica desabilitada enquanto os documentos são copiados,
e só é ativada ao terminar. Se houver falha, o destino fica desabilitado para
investigar; o script recusa sobrescrever qualquer destino existente.

Usuários antigos `admin` tornam-se `organization_admin`, `leader` tornam-se
`leader`, e as outras funções viram `musicalRoles`. Contas antigas pendentes ou
desativadas ficam com participação desativada. O visitante compartilhado antigo
também fica desativado; acesso público por organização exige um fluxo próprio.

As regras novas só permitem ao navegador ler músicas de organizações ativas nas
quais a conta possui participação habilitada. Todas as escritas são pela API.
O Firebase Admin ignora regras; por isso a API também valida organização e membro.

## Uso

- Entre e abra `/organizations` para criar ou escolher uma organização.
- Proprietário, administrador e líder abrem `/organization-settings` para criar,
  listar e cancelar convites. Líder só convida membros comuns.
- O convidado abre `/invite/{slug}/{token}`, entra com o mesmo e-mail e aceita.
- O segredo só é entregue na criação. No banco fica seu hash SHA-256.
- Convites expiram em até 30 dias. A tela permite 1, 7 ou 14 dias.
- Aceitação é transacional, não duplica participação nem muda permissões de quem
  já é membro ativo. Repetir a aceitação com a mesma conta é seguro.
- Músicas usam `onSnapshot`; usuários, escalas, histórico e avisos usam a API.
- Ao trocar de organização, providers e listeners anteriores são desmontados.
- Rotinas de e-mail e retenção percorrem organizações ativas e seus dados.
- `musicLinks` é limpo ao iniciar o servidor e a cada 24 horas enquanto ele
  estiver ativo: músicas com `scheduleDate` anterior a um mês de calendário
  são removidas, até 400 por organização por execução. Datas ausentes ou
  inválidas são preservadas. Essa limpeza não remove a biblioteca `allMusicLinks`.

## Verificação

`npm test` inclui testes com banco simulado e rotas HTTP locais: acesso entre
organizações, músicas com IDs iguais, convite por e-mail, papel administrativo,
revogação, expiração, aceitação repetida e remoção de segredos da auditoria.

As regras do Firebase ainda precisam de validação no Emulator Suite ou em
homologação após a publicação. Não houve acesso nem alteração no banco real.

Fonte para o fluxo de autenticação:
https://firebase.google.com/docs/auth/admin/create-custom-tokens
