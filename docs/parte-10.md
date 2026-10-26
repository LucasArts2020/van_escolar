# Parte 10 — Integração e preparação para operação

Entrega de integração para **teste local**, com os fluxos das Partes 1 a 9, orientações para os três perfis, testes reproduzíveis e diagnóstico de processamento. A primeira versão para uso real continua condicionada às definições e verificações abaixo. Concluir a implementação não autoriza operação real nem piloto com crianças.

## Interfaces

No painel, abra **Preparação para operação**; no Expo, **Preparação**. A tela reúne orientações específicas do perfil atual, atalhos para planejamento/viagens/alertas/histórico, cuidados sem comunicação e um registro das decisões D-01 a D-12. O conteúdo comum fica em `apps/shared/operation-guide.ts`.

O registro distingue escolhas expressas do usuário — intervalos 5/10/15 e coordenação da escola para correções/exceções com motivo e verificações — das propostas ainda pendentes. A tela não permite aprovar políticas com um clique nem presume que o documento foi aprovado. As configurações efetivas continuam nas telas autorizadas de planejamento e alertas.

O guia carregado permanece legível se a conexão cair. Não é cache offline de viagens, não permite confirmar sem rede e não sincroniza ações posteriormente.

## Cenários integrados

`apps/api/test/integration.test.ts` percorre rotina semanal, geração, confirmação do planejamento no dia anterior, viagem, dupla confirmação com três autores, central da família, inspeção e histórico. Ida e volta têm cenários completos independentes.

Também valida uma confirmação ausente com 5/10/15; ausência das duas sem inferir parada; crítico de recebimento na escola e em casa; responsável indisponível com entrega pendente; cliques concorrentes/repetidos; perda de resposta depois do commit e replay; falhas do provedor sem fabricar recebimento; revisão/correção/exceção com nova inspeção; acesso por ID indevido e revogação. As suítes anteriores preservam as verificações específicas de cada parte.

`npm test` usa PGlite em memória. `npm run test:integration` executa a mesma suíte em PostgreSQL real com schema aleatório `qa_part10_*`, adicionando Redis/BullMQ reais e reinício de uma instância do worker. A fila utiliza prefixo exclusivo. Não se reinicia o Redis compartilhado nem se fazem flushes globais. O encerramento remove somente o schema e o prefixo criados nessa execução.

O teste de envio usa um adaptador de falha explícito; não envia push externo. Ele testa o tratamento de falhas, sem comprovar entrega em aparelho.

## Observabilidade protegida

`GET /health` continua sendo a verificação básica de API/banco, agora com `stage: 10`. Para manutenção:

| Endpoint                       | Comportamento                                                                                   |
| ------------------------------ | ----------------------------------------------------------------------------------------------- |
| `GET /health/operations`       | Diagnóstico JSON, HTTP 200 mesmo se degradado, para observar a causa geral.                     |
| `GET /health/operations/ready` | HTTP 200 com dependências saudáveis; HTTP 503 se banco, worker ou fila estiverem indisponíveis. |

Ambos exigem `X-Operations-Token`, configurado em `OPERATIONS_TOKEN` com pelo menos 32 caracteres. Sem configuração retornam 503; credencial ausente/incorreta retorna 401. Sessão da escola, inclusive coordenação, não substitui a credencial de manutenção. Respostas têm `Cache-Control: no-store`.

O diagnóstico mostra banco, último ciclo bem-sucedido/falha, fila pausada, jobs aguardando/ativos/agendados/falhos, caixa de saída, data da mensagem mais antiga, tentativas pendentes/falhas, recibos desconhecidos, push desabilitado/sem aparelho e alertas vencidos/sem destinatário crítico. Não retorna nomes de crianças, tokens de dispositivos, endereços de conexão ou mensagens de erro SQL/Redis.

Considera o worker indisponível após 30 segundos sem ciclo bem-sucedido; consulta da fila tem limite de 2,5 segundos. Os totais de banco são globais da instalação; heartbeat e fila correspondem à instância/namespace consultados. Em múltiplas réplicas, monitore cada instância. Jobs falhos são os retidos pelo BullMQ; falhas de entrega e alertas são totais persistidos, inclusive históricos. Não confunda um contador histórico com uma nova ocorrência.

O diagnóstico registra `NOT_RELEASED`, mesmo quando as dependências estão saudáveis. Aceite do provedor não significa leitura, recebimento presencial ou resolução.

## Preparação para liberação

Veja `operacao-parte-10.md` para a rotina de manutenção e `teste-parte-10.md` para o teste interativo. Antes de qualquer uso real, ainda é necessário:

- Aprovar ou delimitar cada decisão D-01 a D-12, inclusive autoridade de configuração/inclusão tardia, críticos de embarque, falta de resposta, omissão das duas confirmações, adultos alternativos, calendário, contingência e retenção.
- Configurar entrega real de convites/recuperação; o adaptador atual só imprime links locais e rejeita uso em produção.
- Configurar EAS/FCM/APNs, canais e aparelhos reais, verificar recebimento e recusa de permissão em cada perfil, com destinatários e plantão definidos.
- Validar aplicação instalada, conferência física e treinamento dos operadores. Exportação de bundle não substitui esse teste.
- Definir hospedagem, HTTPS, segredos, restrições de rede, backups criptografados, frequência, retenção e responsáveis; testar restauração no ambiente escolhido.

Não foram criados hospedagem, publicação nas lojas, e-mail real, destinatário alternativo ou registros offline nesta etapa.
