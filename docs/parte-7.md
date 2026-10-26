# Parte 7 — Alertas graduais e ocorrências

Etapa autorizada em 23/10/2026. O usuário escolheu **5 minutos para lembrete, 10 para atenção e 15 para crítico**. A próxima etapa continua dependendo do teste do usuário.

## Telas e uso

Painel e aplicativo possuem **Alertas e ocorrências / Alertas**, com casos em acompanhamento e resolvidos. A coordenação recebe a **Central da coordenação**. Cada ocorrência identifica criança, data, trecho, movimentação, origem do prazo, próximo nível, responsáveis, gravidade e histórico.

Na conta do transporte, abra **Intervalos da operação** para registrar 5 / 10 / 15 minutos ou alterar a configuração. Na primeira configuração, registros antigos são avaliados pelo horário original; uma pendência antiga pode alcançar imediatamente seu nível atual. A autoridade do transporte para configurar é uma proposta técnica para D-03, limitada ao seu próprio transporte. Escola e família não alteram os intervalos.

Em cada caso é possível consultar as confirmações, assumir o acompanhamento quando autorizado e registrar contatos efetivamente realizados e verificações físicas. Os registros exigem descrição, autor e horário. A leitura de mensagens, a atribuição a uma pessoa e a inclusão de anotações não encerram a pendência nem reiniciam o prazo.

Dentro da participação de uma criança em viagem aberta, **Relatar criança não localizada ou recebimento contestado** abre um crítico imediato. O relato preserva as confirmações anteriores. Mesmo havendo entrega validada nos registros originais, a criança passa a ter indicação de **recebimento sob verificação**, integra novamente o total de entregas pendentes e permanece visível até tratamento do risco.

## Estados separados

| Dimensão     | Valores                                                                  |
| ------------ | ------------------------------------------------------------------------ |
| Gravidade    | Pendência, Lembrete, Atenção, Crítico                                    |
| Atendimento  | Aberta, Em atendimento, Resolvida                                        |
| Movimentação | Continua derivada das duas confirmações da Parte 5                       |
| Notificação  | Fila, tentativa, aceite, recibo, falha e leitura continuam independentes |

Uma pessoa pode assumir um crítico, mantendo gravidade crítica e o prazo original. Somente uma pessoa assume cada acompanhamento; concorrência e versões impedem sobrescrita silenciosa. Os demais autorizados continuam podendo registrar fatos conforme seu papel.

## Origem e escalada

- **Confirmação pendente:** uma parte confirmou e falta a outra. O prazo começa no instante da primeira confirmação válida, com intervalos capturados na ocorrência. Reenvios não alteram o horário.
- **Sequência incompleta:** mantém a ocorrência da Parte 5, inicia em Atenção e pode alcançar Crítico pelo prazo capturado. A confirmação posterior do embarque não a resolve automaticamente.
- **Criança não localizada / recebimento contestado:** relato individual autorizado, crítico imediato, sem aguardar os intervalos. Repetir a mesma requisição não duplica o relato; um segundo caso aberto do mesmo tipo/evento é rejeitado.
- **Nenhuma das partes registrou:** não há detecção automática de parada sem referência operacional adicional. D-07 permanece pendente. Não se usa planejamento sem resposta, GPS ou simples tempo desde o início da viagem para presumir uma omissão.

Configurações alteradas valem para novos casos; os casos existentes preservam os intervalos e a revisão capturados. Ocorrências criadas sem política de tempo, como sequência incompleta, conservam sua origem quando a primeira política é definida. Relatos de risco independem dessa política.

Se o processamento voltar depois de um intervalo longo, aplica o nível correspondente ao prazo já transcorrido. Não envia uma sequência de lembretes vencidos para simular níveis intermediários.

## Destinatários

| Situação                             | Encaminhamento                                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lembrete                             | Apenas a pessoa/lado que ainda precisa confirmar                                                                                                          |
| Atenção                              | Envolvidos e atualização ao responsável; cobrança só para o lado faltante                                                                                 |
| Crítico no desembarque na escola     | Coordenação ativa da escola da criança, mais visibilidade do motorista e cobrança do lado faltante                                                        |
| Crítico no desembarque em casa       | Responsáveis verificados ativos da criança, mais visibilidade do motorista e cobrança do lado faltante                                                    |
| Crítico de embarque                  | Na entrega original, D-05 pendente. Atualização na central escolar: volta encaminha à coordenação da escola e motorista designado; ida continua pendente. |
| Coordenação/responsável indisponível | Registra falta de destinatário crítico; não escolhe alternativa nem aciona serviços externos                                                              |

Quem já confirmou pode receber uma atualização de acompanhamento, sem ser solicitado a confirmar de novo. Escola de operação não assume um acompanhamento crítico reservado à coordenação. O motorista deve estar atualmente designado para assumir ou registrar fatos pela operação.

Permissões, vínculo, destinatário e estado da pendência são reavaliados antes do envio. Mensagens vencidas de nível inferior ou casos já encerrados são dispensados. Troca de motorista, habilitação/revogação de coordenação ou mudança dos destinatários produz reavaliação auditável, sem reiniciar o relógio. Identificadores de outra criança, organização ou contexto não liberam leitura ou ação.

## Encerramento do acompanhamento — proposta limitada para D-09

Uma pendência comum termina quando **as duas partes reais confirmam aquela movimentação**, na mesma transação da segunda confirmação. O fechamento registra a confirmação que o fundamentou. Não fecha uma ocorrência independente de risco ou sequência incompleta.

Para encerrar o acompanhamento de uma sequência incompleta ou relato de risco, esta etapa exige:

1. Embarque validado e entrega validada pelas partes reais.
2. Contato realizado registrado no caso.
3. Verificação física realizada registrada no caso.
4. Nota explícita de encerramento por autoridade autorizada: coordenação no lado da escola; motorista atualmente designado no lado de casa.

As anotações são declarações identificadas de quem as registrou, sem sensores ou prova física automática. O encerramento não edita, exclui ou fabrica confirmações e não conclui a viagem. A ocorrência original de sequência incompleta acompanha o estado de atendimento e preserva o histórico.

**Não existe resolução excepcional sem as confirmações exigidas.** Autoridades, procedimentos alternativos, correções conflitantes e demais casos de D-09/RN-35 continuam na Parte 9 e precisam de definição operacional antes do uso real. O encaminhamento crítico ao responsável em casa não lhe concede autoridade para resolver uma exceção unilateralmente.

## Persistência e execução

`alert_cases`, `alert_events` e `alert_policies` ficam no PostgreSQL. Confirmação, criação/fechamento de pendência e eventos de notificação são transacionais. Eventos de atendimento têm posição sequencial por caso, além do horário, para preservar a ordem quando registros compartilham o mesmo instante.

O backend da Parte 6 agora agenda jobs atrasados BullMQ com IDs por ocorrência/nível e mantém reconciliação periódica das fontes e prazos do banco. Fechar o app não interfere no processamento. Reinício ou indisponibilidade do Redis não redefine os prazos; a reconciliação recupera o nível vigente e os jobs necessários. Locks da operação/viagem e restrições únicas impedem duplicação e serializam a corrida entre vencimento e confirmação.

O push continua opcional e depende da configuração externa da Parte 6. Falhas e ausência de aparelhos não resolvem o caso; a central continua disponível. Os jobs podem executar depois do instante solicitado conforme a disponibilidade do processamento, por isso a decisão usa o prazo original persistido, não o horário de execução do job. Referências: [jobs atrasados do BullMQ](https://docs.bullmq.io/guide/jobs/delayed), [identificadores de jobs](https://docs.bullmq.io/guide/jobs/job-ids).

## Limite da entrega

Conferência física final da van, tentativa de encerramento de trajeto e conclusão da viagem pertencem à Parte 8. A presente etapa registra verificações individuais em ocorrências, sem introduzir um botão de van vazia ou encerramento. Não há confirmação em lote, GPS, destinatário alternativo, ligação automática ou acionamento de emergência.
