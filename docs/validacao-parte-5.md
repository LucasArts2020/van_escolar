# Validação — Parte 5

Executada em 22/10/2026. Entrega limitada a embarques e desembarques com duas confirmações independentes e registro de sequência incompleta.

| Verificação | Resultado |
| --- | --- |
| `npm test` | 66 testes HTTP/SQL: 52 anteriores e 14 cenários de movimentações |
| `npm run typecheck` | API, painel e aplicativo aprovados |
| `npm run build` | API NestJS e painel Next.js aprovados; API recompilada após ajuste de reconexão |
| Exportação Expo Android | Bundle Hermes gerado, 624 módulos |
| Migração PostgreSQL | Movimentações, confirmações, ocorrências de sequência e referência da atribuição vigente acrescentadas sem remover registros existentes |
| Concorrência HTTP em PostgreSQL real | Na volta: escola/motorista simultâneos no embarque e responsável/motorista simultâneos no recebimento retornaram 201/201, com quatro confirmações e dois movimentos validados |
| Reenvio no PostgreSQL real | IDs, horários, autores e quantidade de registros preservados; entrega validada sem concluir a viagem |
| Edge / Playwright | Ida completa entre responsável, motorista e escola; primeira confirmação informada, segunda validada; autores e horários; privacidade familiar; ocorrência que permanece após validar o recebimento |
| Layout | Capturas desktop de 1440 px e celular de 390 px inspecionadas; sem rolagem horizontal em 390/320 px e sem erros JavaScript capturados |
| API principal | `/health` com `status: ok`, `stage: 5` |

## Cobertura dos testes de movimentações

- Matriz da ida e da volta e ordem livre entre os dois lados.
- Primeiro embarque informado: criança possivelmente a bordo e entrega pendente.
- Duas confirmações de embarque: estado validado; contadores de informado/validado separados.
- Primeiro desembarque não valida a entrega nem retira a pendência.
- Responsável que já confirmou o recebimento não precisa repetir para suprir o motorista.
- Reenvios simultâneos preservam dois autores distintos, horários e somente uma confirmação por lado.
- Mesma pessoa com contextos de motorista/responsável não fornece os dois lados.
- Dois responsáveis não validam o lado do motorista entre si.
- Desembarque sem embarque, ou com embarque de um lado, conserva os fatos e abre uma ocorrência única.
- Confirmações posteriores de embarque não apagam a ocorrência anterior; validação da entrega também não a resolve automaticamente.
- Embarque real impede ausência e alteração do planejamento; mudar a rotina não apaga o evento registrado.
- Corrida entre ausência e embarque só persiste uma destinação compatível.
- Substituição preserva autor e atribuição dos eventos anteriores; motorista anterior perde permissão para novos registros.
- Troca de IDs, envio de autor/lado e tentativa de lote são rejeitados no backend.
- Viagem planejada, cancelada ou criança não transportada não recebem novos registros.
- Revogação operacional/familiar impede novas ações sem apagar confirmações anteriores.
- Viagem ainda aberta recebe confirmação depois da meia-noite, conservando o horário real de recebimento e a data original do serviço.

## Isolamento e ambiente local

A suíte usa PGlite em memória. Os testes adicionais com PostgreSQL e navegador usaram um schema temporário exclusivo, com uma API local na porta 3002. As chamadas do navegador de QA foram encaminhadas somente para essa API. O cenário visual da ida usou Sofia; o de sequência incompleta usou Lucas, ambos fictícios no schema isolado.

O schema e a API temporários foram removidos ao terminar. A base principal e as viagens da Parte 4 foram preservadas; não foram preenchidas confirmações na demonstração principal pelos testes desta etapa.

Durante a preparação de um cenário adicional, o Docker Desktop ficou preso no encerramento. A instância Docker/WSL foi reiniciada, o PostgreSQL foi iniciado novamente com o volume existente e a API principal voltou a responder. O cenário PostgreSQL e o navegador foram executados novamente no schema isolado após a recuperação. A API agora limita a abertura de novas conexões a cinco segundos e trata erros de conexões ociosas para permitir recuperação do pool.

Resultados e capturas de QA estão em `.local/parte5-*.json` e `.local/parte5-*.png`. O bundle Android está em `.local/mobile-export`.

## Teste do usuário

Siga `teste-parte-5.md`. O aplicativo foi verificado por TypeScript e exportação Android; o teste em aparelho físico/iOS continua pendente. Não houve envio externo. Atualização automática/notificações, escalonamento, tratamento de ocorrências e conferência final continuam nas próximas etapas.
