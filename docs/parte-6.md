# Parte 6 — Atualizações e notificações

Etapa autorizada após a Parte 5. Inclui início do responsável, linha do tempo individual e central de notificações no painel e no aplicativo. A Parte 7 continua pendente do teste do usuário.

## Experiência

- O início do responsável mostra cada filho com vínculo familiar verificado e operacional ativo, a última viagem até hoje e quem falta confirmar. Uma viagem aberta com entrega pendente tem prioridade, mesmo que seja do dia anterior.
- **Acompanhar viagem** abre somente a participação daquela criança, seus eventos, autores e horários. A linha do tempo também contempla confirmações anteriores à Parte 6.
- **Notificações** apresenta as 50 atualizações mais recentes do contexto atual, contador de não lidas e detalhe. A consulta atualiza a cada 15 segundos enquanto a tela está ativa; há atualização manual.
- A mensagem preserva o estado no instante do evento: informado por uma parte ou validado por ambas. A situação atual aparece separadamente. Uma cobrança antiga deixa de pedir ação quando aquele lado já confirmou.
- A confirmação é individual, reutiliza as regras da Parte 5 e nunca ocorre automaticamente ao abrir a notificação.
- **Marcar como lida** altera somente `read_at`, com auditoria e reenvio idempotente. Não altera confirmações, entrega ou ocorrência.
- A escola recebe pedidos do seu lado; o motorista designado recebe os do seu lado. Responsáveis recebem atualizações dos próprios filhos e cobranças somente das suas confirmações pendentes. Uma pessoa não recebe pedido para suprir os dois lados.

## Persistência e fila

Cada nova confirmação grava `notification_events` e as mensagens dos destinatários na mesma transação PostgreSQL da movimentação. Uma ocorrência nova de sequência incompleta produz sua própria atualização. Reenvios da confirmação não criam eventos adicionais; rollback desfaz também a caixa de saída.

O processamento do backend materializa entregas aos aparelhos habilitados e publica jobs BullMQ no Redis, independentemente do navegador ou aplicativo. Redis usa AOF e `noeviction`. Um ciclo a cada três segundos reconcilia a caixa de saída e as entregas ainda pendentes; IDs estáveis, restrições únicas e bloqueios de linha protegem o reprocessamento e múltiplos workers. Se Redis estiver indisponível, os registros continuam no PostgreSQL e são retomados quando a conexão volta. O desligamento aguarda o processamento antes de fechar o banco.

Há uma mensagem por evento/contexto, mas somente um push por evento/aparelho, mesmo que a pessoa possua dois contextos destinatários. Cobranças são priorizadas ao escolher o contexto de abertura. O envio verifica novamente sessão do aparelho, proprietário, geração do registro, vínculo familiar/operacional, motorista atual e confirmação ainda necessária. Uma cobrança obsoleta é dispensada, mantendo seu histórico na central.

Ativar push depois de um evento não dispara o histórico antigo. `DISABLED`, `NO_DEVICE` e `SUPPRESSED` não são anunciados como envio bem-sucedido. Entregas e tentativas são consultáveis no detalhe da notificação. Não há endpoint público de reenvio indiscriminado nem manipulação da fila.

## Proposta para D-04

A decisão operacional de canais e tentativas permanece aberta. Para teste desta etapa:

| Canal/estado | Comportamento |
| --- | --- |
| Central interna | Persistente e disponível após o commit, mesmo com push desabilitado |
| Push Expo | Opcional; requer build e credenciais reais, aparelho registrado e `EXPO_PUSH_ENABLED=true` |
| Falha transitória de envio | Até três tentativas, com intervalos mínimos de 5 e 10 segundos, registrados no PostgreSQL e processados pelo BullMQ |
| Rejeição permanente | Falha registrada sem repetição inútil; `DeviceNotRegistered` desativa o token |
| Ticket aceito pelo Expo | `ACCEPTED`; ainda não significa entrega ao serviço do aparelho |
| Consulta de recibo | Começa após 15 minutos; até quatro consultas, com intervalos de 15, 30 e 60 minutos quando ainda não disponível |
| Recibo positivo | `PROVIDER_ACCEPTED`; não comprova exibição nem leitura pelo usuário |
| Recibo indisponível após o limite | `RECEIPT_UNKNOWN`; não reenvia automaticamente o conteúdo já aceito pelo Expo |
| Leitura | Somente `read_at`, mediante ação explícita na central |

Não há garantia de exatamente um envio físico: se o provedor receber uma mensagem e a resposta se perder antes de persistir o ticket, uma tentativa posterior pode repetir esse push. A caixa interna e a confirmação de negócio permanecem únicas. A falha de envio nunca resolve uma entrega ou ocorrência.

## Aparelhos e links

No aplicativo, **Notificações → Ativar neste aparelho** solicita a permissão do sistema, obtém o Expo Push Token e registra a instalação na sessão autenticada. O registro é renovado na retomada do app ou rotação de token, sem reiniciar sua geração quando nada mudou. A desativação é explícita e preservada localmente; sair da conta desativa seus aparelhos associados à sessão. Sessões revogadas ou expiradas também impedem envio.

O push usa texto genérico, sem nome da criança, escola ou estado operacional na tela bloqueada. Contém identificadores da notificação e do contexto. Ao tocar, o aplicativo seleciona somente um contexto presente na sessão atual e consulta novamente a API. O servidor revalida a criança e a movimentação; adulterar identificadores não concede acesso. O painel aceita `?notification=<uuid>&context=<uuid>` com as mesmas verificações. Um aparelho transferido para outra conta não herda as entregas antigas.

## Configuração

```powershell
docker compose --profile alerts up -d postgres redis
npm run db:migrate
npm run dev
```

O worker inicia no backend fora do ambiente de teste. `NOTIFICATIONS_WORKER=false` desliga somente o processamento; a central e a caixa de saída permanecem. `REDIS_URL` e `NOTIFICATIONS_QUEUE_PREFIX` configuram a conexão e o namespace. Mantenha o prefixo estável entre reinícios e instâncias da mesma operação.

Para push real, configure EAS/FCM/APNs, `EXPO_PUBLIC_EAS_PROJECT_ID` no app e `EXPO_PUSH_ENABLED=true` no backend. Se o projeto exigir autenticação adicional no Expo Push, use `EXPO_ACCESS_TOKEN` somente no servidor. Não coloque esse segredo nas variáveis públicas do aplicativo. Reinicie os processos após alterar as configurações.

O projeto inclui `expo-notifications`, `expo-constants`, `expo-crypto` e o plugin nativo. Push remoto exige um development/release build configurado; a central continua utilizável no Expo Go. Não foram criados projeto EAS, credenciais ou builds remotos nesta entrega.

Referências técnicas: [BullMQ — IDs de jobs](https://docs.bullmq.io/guide/jobs/job-ids), [BullMQ — tentativas](https://docs.bullmq.io/guide/retrying-failing-jobs), [Expo Notifications](https://docs.expo.dev/versions/latest/sdk/notifications/), [tickets e recibos do Expo](https://docs.expo.dev/push-notifications/sending-notifications/).

## Limite da etapa

Os eventos desta etapa abrangem confirmações e abertura de sequência incompleta. Alterações de planejamento, atribuição e cadastro continuam consultáveis em suas telas e históricos, sem novos canais de notificação nesta entrega. Não há escalonamento, níveis de gravidade, lembretes por prazo, contato com coordenação ou resolução de ocorrências: pertencem às próximas partes. Não há encerramento automático, declaração de van vazia ou GPS.
