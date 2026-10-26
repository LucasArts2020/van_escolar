# Regras de negócio — Segurança no transporte escolar

Versão: 1.0 — 22/10/2026

## 1. Objetivo e status das definições

Acompanhar cada criança no transporte entre casa e escola, registrar a transferência de responsabilidade por dupla confirmação e destacar entregas pendentes para reduzir o risco de crianças esquecidas na van.

Este documento consolida a conversa. As decisões expressas do usuário estão na seção 2. As demais regras detalham a proposta de funcionamento e devem ser validadas antes da operação real. Pontos ainda indefinidos estão na seção 13.

O registro digital não substitui o recebimento presencial nem a conferência física do veículo.

## 2. Decisões confirmadas

- Os perfis principais são motorista, responsável pela criança e escola.
- Motorista e escola podem cadastrar alunos e iniciar vínculos entre aluno, escola e transporte.
- O responsável pode configurar uma rotina semanal e deve confirmar o uso no dia anterior.
- Ida e volta têm confirmações próprias.
- Todas as movimentações exigem confirmação de duas partes.
- Na ida: responsável e motorista confirmam o embarque; motorista e escola confirmam o desembarque.
- Na volta: escola e motorista confirmam o embarque; motorista e responsável confirmam o desembarque.
- O responsável recebe atualizações dos registros e das confirmações.
- Os alertas aumentam gradualmente nas pendências comuns.
- No desembarque na escola, o alerta crítico é encaminhado à coordenação da escola.
- No desembarque em casa, o alerta crítico é encaminhado ao responsável pela criança.
- Não haverá identificação de aproximação da van, mapa ou rastreamento de localização nesta versão.

## 3. Perfis, acesso e administração compartilhada

| Perfil | Responsabilidades |
| --- | --- |
| Motorista | Cadastrar alunos, solicitar/aceitar vínculos com seu transporte, consultar passageiros, iniciar viagens, confirmar suas movimentações, tratar pendências e conferir a van. |
| Responsável | Consultar seus filhos, definir rotina semanal, confirmar uso, confirmar entrega/recebimento e acompanhar atualizações. |
| Escola — operação | Cadastrar alunos, solicitar/aceitar vínculos com a escola, consultar previstos e confirmar recebimentos e embarques. |
| Escola — coordenação | Acompanhar e tratar alertas críticos no desembarque na escola, além das permissões operacionais autorizadas. |

**RN-01 — Identidade individual.** Cada pessoa utiliza sua própria conta. Confirmações da escola identificam o funcionário que agiu.

**RN-02 — Acesso por vínculo.** Responsável acessa somente seus filhos; motorista, os alunos e viagens vinculados ao seu transporte; escola, seus alunos e viagens relacionadas. Conhecer um identificador não concede acesso.

**RN-03 — Administração limitada ao próprio escopo.** Administração compartilhada não permite alterar usuários, equipes ou viagens de outra organização sem vínculo e permissão.

**RN-04 — Aceite de vínculo (proposta).** Quem cadastra solicita a associação; a outra parte valida o vínculo com sua escola ou transporte. O responsável deve ter sua associação à criança verificada antes de acessar dados ou confirmar movimentações.

**RN-05 — Duplicidade (proposta).** Ao identificar possível aluno já cadastrado, tratar o vínculo com revisão autorizada. Não unir cadastros automaticamente apenas por nome nem expor dados de outras escolas para deduplicação.

## 4. Planejamento semanal e confirmação diária

**RN-06 — Rotina independente por trecho.** O responsável define, para cada dia da semana, se haverá ida e/ou volta.

**RN-07 — Previsão não é confirmação.** A rotina gera a previsão para uma data. No dia anterior, o responsável confirma ou altera cada trecho.

| Situação do planejamento | Significado |
| --- | --- |
| Previsto, aguardando confirmação | Existe previsão semanal, mas falta resposta para a data. |
| Uso confirmado | Responsável confirmou o trecho naquela data. |
| Não utilizará | Responsável informou que a criança não usará aquele trecho. |
| Alteração aguardando aceite | Mudança após o horário limite, sujeita a tratamento pelo transporte. |

**RN-08 — Ausência de resposta.** Não responder não equivale a cancelar. A previsão fica pendente; sua inclusão na lista operacional definitiva ainda precisa ser definida.

**RN-09 — Horário limite.** Deve existir horário limite configurado para a confirmação do dia seguinte. O valor e a autoridade para configurá-lo estão pendentes.

**RN-10 — Mudança tardia (proposta).** Após o limite, a mudança precisa ser aceita pelo transporte e comunicada às partes afetadas.

**RN-11 — Preservação da viagem.** Alterar a rotina semanal não modifica registros de viagens passadas nem apaga movimentações de uma viagem em andamento.

**RN-12 — Cancelamento após embarque.** Uma criança com embarque informado não pode ser removida da viagem por cancelamento. É necessário tratar a movimentação ou a ocorrência.

## 5. Viagens e dupla confirmação

Cada viagem corresponde a uma data, um trecho (ida ou volta), um motorista, um veículo e uma lista de crianças. Ida e volta são independentes.

| Trecho | Evento | Primeira parte exigida | Segunda parte exigida |
| --- | --- | --- | --- |
| Ida | Embarque em casa | Responsável | Motorista |
| Ida | Desembarque na escola | Motorista | Funcionário da escola |
| Volta | Embarque na escola | Funcionário da escola | Motorista |
| Volta | Desembarque em casa | Motorista | Responsável |

**RN-13 — Ordem livre entre as partes.** Qualquer uma das duas partes pode registrar primeiro. O sistema informa quem falta confirmar.

**RN-14 — Duas partes reais.** A mesma pessoa não pode suprir os dois lados da mesma movimentação, mesmo que tenha mais de um perfil.

**RN-15 — Confirmação específica.** Cada ação identifica criança, data, viagem, trecho e tipo de evento. Não é permitido confirmar uma criança diferente por associação à parada ou ao grupo.

**RN-16 — Embarque informado.** A primeira confirmação de embarque coloca a criança na relação de quem pode estar no veículo, mesmo sem a segunda confirmação.

**RN-17 — Desembarque informado.** Uma única confirmação de desembarque não conclui a entrega nem remove a criança da relação de entregas pendentes.

**RN-18 — Entrega validada.** As duas confirmações válidas de desembarque/recebimento concluem a entrega. Divergências ou etapas anteriores pendentes permanecem registradas e precisam ser resolvidas.

**RN-19 — Sequência incompleta (proposta).** Um desembarque relatado sem embarque registrado abre uma ocorrência de sequência incompleta. O sistema não inventa confirmações anteriores nem impede que se registre onde a criança foi recebida.

**RN-20 — Repetição.** Cliques repetidos e reenvios não criam confirmações adicionais nem notificações duplicadas para o mesmo evento.

## 6. Estados e visibilidade

Separar planejamento, movimentação e ocorrência. Uma ocorrência pode coexistir com qualquer estado da movimentação; não deve substituí-lo e esconder a última informação conhecida.

| Estado da movimentação | Condição |
| --- | --- |
| Aguardando embarque | Nenhuma confirmação de embarque registrada. |
| Embarque informado | Apenas uma parte confirmou o embarque. |
| Embarque validado | Ambas confirmaram o embarque. |
| Desembarque informado | Apenas uma parte confirmou o desembarque/recebimento. |
| Entrega validada | Ambas confirmaram o desembarque/recebimento. |
| Não transportada | Ausência/cancelamento registrado sem embarque informado. |

O painel do motorista deve mostrar separadamente previstos, embarques informados, embarques validados, entregas pendentes, entregas validadas e ocorrências. Uma entrega contestada volta a exigir verificação, preservando o histórico anterior.

## 7. Atualizações e alertas

**RN-21 — Atualizações ao responsável.** Informar registro inicial e validação de embarque/desembarque, alterações relevantes e ocorrências da criança. Diferenciar claramente “motorista informou” de “ambas as partes confirmaram”.

**RN-22 — Escalonamento gradual.** Pendências comuns avançam por níveis com intervalos configuráveis; os valores ainda não estão definidos.

| Nível | Gatilho proposto | Ação |
| --- | --- | --- |
| Pendência | Uma parte confirmou e falta a outra. | Exibir quem deve agir. |
| Lembrete | Primeiro intervalo excedido. | Notificar quem falta confirmar. |
| Atenção | Segundo intervalo excedido. | Destacar ocorrência aos envolvidos e atualizar o responsável. |
| Crítico | Limite crítico excedido ou evento de risco. | Encaminhar ao destinatário crítico e manter ocorrência visível ao motorista. |

| Evento de desembarque | Destinatário crítico definido |
| --- | --- |
| Na escola, na ida | Coordenação da escola |
| Em casa, na volta | Responsável pela criança |

**RN-23 — Destinatário da cobrança.** O lembrete de confirmação é dirigido a quem ainda não confirmou. Se o responsável já confirmou, não deve ser obrigado a confirmar novamente porque falta o motorista.

**RN-24 — Exceções ao escalonamento (proposta de segurança).** Relato de criança não localizada, contestação de recebimento ou tentativa de encerrar viagem com entrega pendente gera alerta crítico sem esperar os intervalos.

**RN-25 — Reconhecimento não é resolução.** Ler, silenciar ou assumir um alerta não comprova a entrega. A ocorrência deve manter estado aberto até resolução explícita e auditável.

**RN-26 — Relógio persistente.** Fechar o aplicativo, trocar de tela ou repetir a confirmação não reinicia o prazo. Os prazos começam no primeiro registro válido da pendência.

**RN-27 — Falta de registro das duas partes.** Sem aproximação/GPS, o sistema não sabe sozinho quando ocorreu uma parada. Detectar uma omissão em que ninguém confirmou exige referência adicional, como prazo operacional previsto ou revisão ao encerrar. O gatilho temporal ainda está pendente de definição.

**RN-28 — Falha de notificação.** Falha no envio não resolve a pendência. O sistema registra tentativa/falha e mantém a ocorrência visível. Canais e política de tentativas precisam ser definidos.

## 8. Conferência final do veículo — proposta de segurança

**RN-29 — Conferência física.** Ao terminar cada viagem, o motorista deve percorrer o interior da van, verificar bancos e áreas onde uma criança possa permanecer e registrar a conferência.

**RN-30 — Conclusão normal.** Só é permitida quando todas as crianças estão contabilizadas (entregues ou não transportadas), não há divergência de segurança sem tratamento e a conferência foi registrada.

**RN-31 — Encerramento com ocorrência.** Se o trajeto terminou mas há pendências, registrar “trajeto encerrado com ocorrência aberta”, mantendo alertas e tratamento ativos. Não apresentar a viagem como concluída normalmente.

**RN-32 — Declaração de veículo vazio.** Esse registro não elimina entrega pendente e não constitui, sozinho, prova de que a conferência física foi realizada.

## 9. Exceções e correções — proposta

| Situação | Tratamento |
| --- | --- |
| Responsável ausente na volta | Não concluir a entrega. Criança permanece sob cuidados do transporte até entrega a adulto autorizado; abrir ocorrência. |
| Outro adulto recebe | Exigir autorização prévia verificada e identificar o recebedor; forma de confirmação ainda a definir. |
| Clique errado | Registrar correção e motivo, preservando a ação original. Se houver conflito com confirmação da outra parte, abrir divergência. |
| Criança sem previsão | Exigir inclusão autorizada e registro na viagem; não transportar sem registro. |
| Troca de motorista/veículo | Registrar substituição, horário e responsável, mantendo continuidade da viagem. |
| Sem internet | Indicar ausência de sincronização; não apresentar uma ação local como confirmação recebida pelo servidor. Usar procedimento alternativo de contato a definir. |
| Recebimento contestado | Manter as versões e abrir ocorrência crítica para verificação. |

Nenhum usuário pode resolver uma divergência fabricando a confirmação de outra pessoa.

## 10. Histórico e auditoria

**RN-33 — Rastreabilidade.** Registrar autor, perfil, criança, viagem, evento, horário de recebimento pelo sistema, horário informado da ação quando aplicável e alterações posteriores.

**RN-34 — Preservação.** Correções e resoluções acrescentam histórico; não apagam silenciosamente confirmações, ocorrências ou vínculos usados em viagens passadas.

**RN-35 — Resolução excepcional.** Registrar motivo, pessoa autorizada e verificações realizadas; manter distinção entre entrega validada pelas partes e ocorrência resolvida excepcionalmente. Quem pode executar essa resolução ainda precisa ser definido.

Não coletar localização nesta versão. Prazo de retenção e regras de acesso/exportação dos históricos ainda precisam ser definidos.

## 11. Exemplos de comportamento esperado

1. Motorista confirma embarque e responsável não confirma: mostrar embarque informado, contar a criança como possivelmente a bordo e iniciar a pendência.
2. Motorista confirma desembarque na escola: avisar o responsável que falta o recebimento pela escola; se persistir, escalar à coordenação.
3. Responsável confirma recebimento em casa antes do motorista: cobrar a confirmação do motorista; não pedir nova confirmação do responsável.
4. Duas confirmações concorrentes: validar uma única movimentação, preservando os dois autores.
5. Responsável não confirma o planejamento: manter “aguardando confirmação”; não registrar ausência automaticamente.
6. Motorista tenta concluir com criança sem entrega validada: manter ocorrência aberta e exigir verificação.
7. Uma criança prevista não tem nenhum registro: exigir contabilização antes de concluir; não presumir que ela não viajou.

## 12. Fora do escopo inicial

- Aproximação automática, GPS e mapas.
- Otimização de rotas.
- Mensalidades e cobrança.
- Sensores, câmeras e biometria.
- Acionamento automático de serviços externos de emergência.

## 13. Decisões pendentes antes da operação real

| ID | Decisão necessária |
| --- | --- |
| D-01 | Horário limite de confirmação e quem pode configurá-lo. |
| D-02 | Tratamento operacional de previsão não confirmada. |
| D-03 | Intervalos dos níveis de alerta e autoridade para alterá-los. |
| D-04 | Canais de notificação e política de falhas/tentativas. |
| D-05 | Destinatários críticos das pendências de embarque, na ida e na volta. |
| D-06 | Contingência quando o responsável ou a coordenação não responde ao alerta crítico. Não há destinatário alternativo aprovado. |
| D-07 | Prazos ou ações que detectam falta de registro das duas partes, sem GPS. |
| D-08 | Validação de vínculos, critérios de duplicidade e adultos autorizados. |
| D-09 | Quem autoriza inclusão tardia, resolve exceções e aprova correções conflitantes. |
| D-10 | Procedimento sem internet e eventual suporte a registros offline. |
| D-11 | Retenção de dados e permissões de consulta/exportação. |
| D-12 | Tratamento de feriados, dias sem aula e mudanças de escola/transporte. |

## 14. Documento complementar

Consultar `partes_do_sistema.md` para módulos, telas, dependências, etapas e critérios de aceite para construção.
