# Partes do sistema e plano de construção — Transporte escolar

Versão: 1.0 — 22/10/2026

## 1. Como usar este documento

Construir por etapas pequenas, concluindo os critérios de aceite de cada parte antes de avançar. As regras funcionais estão em `regras_de_negocio.md`; os códigos RN e D abaixo apontam para esse documento.

Este plano é uma proposta técnica, sem escolha obrigatória de linguagem, banco, hospedagem ou plataforma. As etapas intermediárias servem para desenvolvimento e demonstração; o uso real depende da integração dos mecanismos de segurança e da resolução das decisões operacionais pendentes.

## 2. Organização sugerida

- Uma interface responsiva com navegação por perfil: responsável, motorista e escola.
- Coordenação como permissão específica dentro da escola.
- Um backend central que valida acessos, vínculos, estados e confirmações.
- Um banco transacional para viagens, eventos, confirmações e histórico.
- Um processamento de notificações e alertas que funciona mesmo com os aplicativos fechados.
- Um registro de auditoria integrado desde o início.

Começar com uma aplicação modular única; não é necessário separar cada módulo em um serviço independente. Não incluir GPS, mapas ou aproximação.

## 3. Visão geral das partes

| Parte | Entrega principal | Dependências |
| --- | --- | --- |
| 1 | Contas, perfis e permissões | Nenhuma |
| 2 | Cadastros e vínculos | 1 |
| 3 | Rotina semanal e planejamento diário | 2 |
| 4 | Viagens e lista de passageiros | 3 |
| 5 | Movimentações com dupla confirmação | 4 |
| 6 | Atualizações e notificações | 5 |
| 7 | Alertas graduais e ocorrências | 5 e 6 |
| 8 | Conferência final e encerramento | 4, 5 e 7 |
| 9 | Histórico, correções e gestão operacional | Base nas partes anteriores |
| 10 | Integração e preparação para operação | Todas |

## 4. Parte 1 — Contas, perfis e permissões

**Objetivo:** identificar cada usuário e limitar suas ações ao seu escopo.

### Telas

- Entrar e recuperar acesso.
- Aceitar convite e completar cadastro.
- Meu perfil.
- Seleção de contexto, caso uma pessoa tenha mais de um vínculo autorizado.
- Equipe da escola e permissões da coordenação.

### Construção

- Autenticação e sessão.
- Papéis e vínculos com organizações.
- Verificação de permissão no backend em toda leitura e alteração.
- Identificação individual de quem confirma ações.
- Estrutura inicial de auditoria.

### Critérios de aceite

- Responsável não consulta filho de outra pessoa.
- Escola e motorista não consultam alunos sem vínculo autorizado.
- Trocar identificadores de uma requisição não contorna as permissões.
- Cada ação persistida identifica o autor.

**Regras:** RN-01 a RN-03, RN-33. **Decisões:** parte de D-08.

## 5. Parte 2 — Cadastros e vínculos

**Objetivo:** permitir que motorista e escola iniciem o cadastro e a associação dos alunos.

### Telas

- Alunos: lista, cadastro e detalhe.
- Escolas vinculadas, na visão do motorista.
- Transportes vinculados, na visão da escola.
- Solicitações de vínculo: pendentes, aceitas e recusadas.
- Responsáveis vinculados e convites.
- Veículos.
- Pessoas autorizadas a receber, após definição de D-08.

### Construção

- Cadastro de aluno, escola, transporte, motorista, veículo e responsável.
- Vínculo com estado pendente/ativo/recusado/inativo.
- Fluxo simétrico: criação iniciada pela escola ou pelo motorista.
- Tratamento de possíveis duplicidades com revisão, sem união automática por nome.
- Preservação dos vínculos usados em viagens passadas.

### Critérios de aceite

- As duas partes conseguem iniciar o cadastro e solicitar associação.
- Um convite não concede acesso a uma criança diferente da autorizada.
- Vínculo pendente não libera acesso operacional indevido.
- Inativar vínculo não remove o histórico existente.

**Regras:** RN-04 e RN-05, RN-34. **Decisões:** D-08 e D-12.

## 6. Parte 3 — Rotina semanal e planejamento diário

**Objetivo:** converter uma rotina semanal em previsões por data, confirmadas no dia anterior.

### Telas

- Rotina semanal por filho, com ida e volta independentes.
- Confirmação do dia seguinte.
- Solicitação de alteração após o limite.
- Lista de previstos e confirmações, para motorista e escola.

### Construção

- Rotina semanal e exceções por data.
- Geração idempotente da previsão diária.
- Confirmação, indicação de não uso e alteração tardia.
- Horário limite parametrizado no fuso da operação.
- Separação entre pendência de planejamento e ocorrência de segurança.

### Critérios de aceite

- Confirmar a ida não confirma a volta automaticamente.
- Falta de resposta mantém a previsão pendente.
- Alterar a rotina não modifica viagens já registradas.
- Reexecutar a geração não duplica previsões.

**Regras:** RN-06 a RN-12. **Decisões:** D-01, D-02 e D-12.

## 7. Parte 4 — Viagens e passageiros

**Objetivo:** organizar a operação diária e contabilizar cada criança.

### Telas

- Viagens do dia do motorista.
- Preparação da viagem: data, trecho, escola(s), veículo e passageiros.
- Viagem em andamento.
- Painel do dia da escola.
- Inclusão excepcional de aluno e registro de ausência.

### Construção

- Viagem de ida separada da viagem de volta.
- Participação do aluno vinculada à previsão e à viagem.
- Estados da viagem: planejada, em andamento, trajeto encerrado com ocorrência aberta e concluída.
- Estado de cancelamento apenas para viagem ainda não iniciada, sujeito às regras operacionais.
- Histórico de substituição de veículo/motorista.
- Totais derivados dos registros individuais, sem edição manual dos contadores.

### Critérios de aceite

- Todo aluno previsto recebe uma destinação explícita.
- Ausência não pode remover um aluno com embarque informado.
- Substituições preservam a autoria dos eventos anteriores.
- Encerramento ainda depende da Parte 8; não criar um botão que ignore essa regra.

**Regras:** RN-12, RN-16, RN-17 e RN-30. **Decisões:** D-02 e D-09.

## 8. Parte 5 — Movimentações e dupla confirmação

**Objetivo:** implementar o núcleo do sistema, com duas confirmações independentes por movimentação.

### Telas

- Ação de embarque/desembarque do motorista.
- “Confirmar que entreguei a criança” e “Confirmar que recebi a criança” do responsável.
- Recebimento na escola e entrega para a volta.
- Detalhe da movimentação: quem confirmou, quem falta e horário.

### Construção

- Uma movimentação por criança, viagem e tipo de evento.
- Confirmações separadas por lado exigido, conforme a matriz do documento de regras.
- Ordem livre entre confirmadores.
- Proteção contra cliques repetidos, reenvios e concorrência.
- Estado agregado calculado a partir das confirmações válidas.
- Registro de sequência incompleta como ocorrência, sem fabricar eventos anteriores.
- Ações de confirmação individuais; não oferecer confirmação indiscriminada de toda a van.

### Critérios de aceite

- Primeira confirmação resulta em “informado”; segunda, em “validado”.
- Uma pessoa não confirma pelos dois lados.
- Uma confirmação de desembarque não encerra a entrega.
- Reenvio cria apenas uma confirmação válida por lado.
- Confirmações simultâneas produzem uma movimentação validada com dois autores.
- Criança com embarque informado aparece como possivelmente a bordo.

**Regras:** RN-13 a RN-20.

## 9. Parte 6 — Atualizações e notificações

**Objetivo:** manter o responsável informado e pedir ações à pessoa correta.

### Telas

- Início do responsável com situação de cada filho.
- Linha do tempo da viagem.
- Central de notificações e detalhe da pendência.

### Construção

- Eventos internos gerados quando a transação da movimentação é confirmada.
- Fila persistente de envio, com deduplicação e tentativas controladas.
- Adaptador para o canal escolhido em D-04.
- Links para a criança e a movimentação correta, sempre sujeitos à autorização.
- Estados de tentativa/envio/falha, sem confundir “enviado” com “lido” ou “resolvido”.

### Critérios de aceite

- Texto distingue registro de uma parte de validação por ambas.
- Responsável recebe somente informações das crianças autorizadas.
- Falha de envio não apaga o evento nem conclui a pendência.
- Reprocessamento não envia duplicatas desnecessárias.

**Regras:** RN-21, RN-23, RN-25 e RN-28. **Decisões:** D-04.

## 10. Parte 7 — Alertas graduais e ocorrências

**Objetivo:** transformar pendências persistentes em ações de acompanhamento.

### Telas

- Pendências do motorista.
- Central de alertas da coordenação.
- Alerta do responsável.
- Detalhe da ocorrência: nível, origem, prazo, responsáveis e histórico.
- Registro de contato, verificação e resolução.
- Configuração de intervalos, com permissão a definir.

### Construção

- Agendador persistente independente do navegador/celular.
- Níveis pendência, lembrete, atenção e crítico.
- Reavaliação do estado atual antes de enviar cada alerta, evitando avisos obsoletos após confirmação.
- Encaminhamento crítico na escola para coordenação; em casa para responsável.
- Regras de risco que pulam intervalos, conforme validação da proposta.
- Estados de ocorrência: aberta, em atendimento e resolvida; nível de gravidade separado.
- Tratamento explícito da falta de ambas as confirmações, após definição de D-07.

### Critérios de aceite

- Fechar o aplicativo não interrompe o escalonamento.
- Reiniciar o processamento não reinicia os prazos nem duplica ocorrências.
- Ler/assumir um alerta não resolve a entrega.
- Se o responsável já confirmou, lembretes cobram a ação do motorista.
- Nenhuma configuração presume um destinatário alternativo ainda não aprovado.
- Uma confirmação que chega junto ao vencimento é reavaliada antes do envio.

**Regras:** RN-22 a RN-28 e RN-35. **Decisões:** D-03 a D-07 e D-09.

## 11. Parte 8 — Conferência final e encerramento

**Objetivo:** impedir conclusão normal enquanto houver crianças ou divergências sem contabilização.

### Telas

- Resumo final da viagem.
- Lista de crianças com entrega/ausência pendente.
- Registro da conferência física da van.
- Resultado: concluída ou trajeto encerrado com ocorrência aberta.

### Construção

- Validação no backend de todas as condições de encerramento.
- Conferência registrada com autor e horário.
- Manutenção de alertas após término do trajeto com ocorrência.
- Proibição de usar a declaração “van vazia” para eliminar pendências individuais.

### Critérios de aceite

- Criança prevista sem qualquer evento precisa ser contabilizada.
- Criança com apenas uma confirmação de desembarque impede conclusão normal.
- Registro de van vazia não remove ocorrência.
- Viagem concluída tem entregas/ausências contabilizadas e conferência final registrada.

**Regras:** RN-29 a RN-32. **Decisões:** D-09.

## 12. Parte 9 — Histórico, correções e gestão operacional

**Objetivo:** permitir investigação e correção sem perder os fatos originais.

### Telas

- Histórico por criança, viagem e data.
- Detalhe de confirmações e ocorrências.
- Solicitação e tratamento de correção.
- Configurações operacionais por escopo autorizado.

### Construção

- Consulta do histórico capturado desde a Parte 1.
- Correções vinculadas ao evento original, com motivo e autor.
- Distinção entre confirmação normal e resolução excepcional.
- Regras de retenção e eventual exportação após definição de D-11.
- Procedimento de indisponibilidade e sincronização conforme D-10.

### Critérios de aceite

- Evento original continua identificável após correção.
- Escola e motorista não alteram confirmações em nome de outras partes.
- Históricos respeitam permissões mesmo após inativação de cadastros.
- Ocorrência resolvida registra quem resolveu, por quê e quais verificações fez.

**Regras:** RN-33 a RN-35 e seção 9 do documento de regras. **Decisões:** D-08 a D-11.

## 13. Modelo de dados conceitual

Os nomes são sugestões; não representam um esquema de banco já implementado.

| Entidade | Finalidade e relações principais |
| --- | --- |
| Usuário | Pessoa autenticada; possui papéis e vínculos de acesso. |
| Escola | Instituição com equipe operacional e coordenação. |
| Transporte | Escopo da operação do motorista, seus veículos e vínculos. |
| Aluno | Criança, sem conta de acesso própria prevista no MVP. |
| Vínculo aluno-responsável | Associação verificada e permissões do responsável. |
| Vínculo aluno-escola-transporte | Associação operacional e seu estado de aceite. |
| Veículo | Van associada à operação e às viagens. |
| Rotina semanal | Previsões de ida/volta por dia da semana. |
| Planejamento diário | Data, trecho, previsão, confirmação e alterações. |
| Viagem | Data, trecho, motorista, veículo e estado operacional. |
| Participação na viagem | Aluno associado à viagem e sua contabilização. |
| Movimentação | Embarque ou desembarque da participação. |
| Confirmação | Lado exigido, autor e horários de uma movimentação. |
| Ocorrência | Divergência/pendência, gravidade, atendimento e resolução. |
| Notificação | Destinatário, evento de origem, canal e tentativas. |
| Conferência final | Registro de inspeção vinculado à viagem. |
| Evento de auditoria | Histórico imutável de ações e correções. |

### Restrições técnicas importantes

- Unicidade da movimentação por participação e tipo.
- Unicidade da confirmação válida por movimentação e lado exigido.
- Integridade entre criança, viagem e vínculo autorizado.
- Transação atômica ao confirmar e atualizar estado.
- Horários persistidos de forma consistente e exibidos no fuso da operação.
- Auditoria e controle de acesso no servidor, não apenas na interface.
- Nenhum campo de localização necessário ao escopo atual.

## 14. Parte 10 — Integração e preparação para operação

Validar os seguintes cenários completos com os três perfis:

| Cenário | Resultado esperado |
| --- | --- |
| Ida normal | Planejamento confirmado, embarque duplo, recebimento duplo e conferência final. |
| Volta normal | Escola/motorista confirmam embarque; responsável/motorista confirmam entrega. |
| Uma confirmação ausente | Pendência visível e escalonamento correto. |
| Ambas ausentes | Contabilização obrigatória e detecção conforme D-07. |
| Responsável indisponível | Entrega não concluída; ocorrência permanece aberta. |
| Escola não confirma recebimento | Alerta crítico chega à coordenação. |
| Desembarque em casa pendente | Alerta crítico chega ao responsável. |
| Clique repetido ou simultâneo | Nenhuma duplicação ou perda de autoria. |
| Falha de rede/notificação | Estado não é apresentado como confirmado indevidamente; procedimento de contingência disponível. |
| Correção conflitante | Histórico preservado e divergência tratada. |
| Tentativa de encerrar com criança pendente | Conclusão normal impedida; alerta e verificação mantidos. |
| Acesso indevido | Consulta e ação rejeitadas pelo backend. |

### Condições para liberar a primeira versão para uso real

- Partes 1 a 10 integradas, com todos os fluxos críticos verificados.
- Decisões D-01 a D-12 resolvidas ou explicitamente delimitadas em procedimento operacional aprovado.
- Canais e destinatários reais de alertas configurados e verificados.
- Conferência física e tratamento de ocorrências compreendidos pelos operadores.
- Falhas de processamento/notificação observáveis pela equipe que mantém o sistema.
- Nenhuma simulação de envio apresentada como notificação real.

## 15. Sequência sugerida de entregas

| Entrega | Partes | Resultado revisável |
| --- | --- | --- |
| A | 1 e 2 | Usuários e vínculos funcionais com acesso restrito. |
| B | 3 e 4 | Planejamento e viagens com passageiros. |
| C | 5 | Ida e volta com dupla confirmação em ambiente de desenvolvimento. |
| D | 6 e 7 | Atualizações, escalonamento e tratamento de ocorrências. |
| E | 8 e 9 | Encerramento seguro, histórico e correções. |
| F | 10 | Fluxo completo validado para piloto supervisionado. |

Para solicitar a construção de uma etapa, fornecer os dois arquivos e indicar: “Implemente a Parte N, respeitando as regras RN relacionadas, as dependências já construídas e os critérios de aceite. Não transforme decisões D pendentes em regras definitivas sem registrá-las como propostas.”
