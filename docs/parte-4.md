# Parte 4 — Viagens e passageiros

Etapa autorizada pelo usuário após testar a agenda da Parte 3. A entrega prepara listas por data e trecho e permite iniciar uma viagem. Movimentações e dupla confirmação continuam na Parte 5; notificações nas Partes 6/7; conferência e encerramento na Parte 8.

## Funcionalidades

- Viagens de ida e volta independentes, com motorista, veículo e alunos de uma ou mais escolas.
- Preparação pelo transporte, selecionando previsões autorizadas. Cada participação conserva aluno, escola, vínculo, previsão, situação original, autor e motivo.
- Destinação por criança: A transportar, Definir destinação ou Não transportada. As previsões ainda sem viagem ficam visíveis no painel/app.
- Revisão de previsão sem resposta, registro individual de ausência e inclusão excepcional com motivo.
- Início exclusivamente pelo motorista designado, na data da viagem no fuso capturado da operação, com passageiros revisados e recursos disponíveis.
- Histórico de motorista/veículo, com motivo, autor, horário e atribuições anteriores. Nenhuma substituição reescreve eventos anteriores.
- Cancelamento com motivo apenas antes do início e sem movimentação informada. Preserva participações e histórico; libera as reservas do planejamento.
- Consulta pela escola limitada aos seus alunos, e pelo responsável limitada aos filhos com vínculo familiar verificado. Os totais também respeitam esse filtro, inclusive em viagens com várias escolas.
- Contadores derivados das participações; nenhuma edição manual dos números.
- Painel Next.js e tela Expo. As alterações feitas por outra pessoa aparecem ao usar Atualizar viagens.

## Propostas de teste — decisões ainda pendentes

**D-02:** uma previsão PENDING selecionada entra como Definir destinação. Não é presumida ausência nem uso. Antes de iniciar, o motorista registra motivo e decide A transportar ou Não transportada. Essa decisão operacional não cria confirmação de uso em nome da família e não modifica o estado original do planejamento. Previsões não selecionadas permanecem explicitamente Sem viagem, para destinação em outra preparação.

Uma confirmação de uso entra como A transportar. Um não uso expresso entra como Não transportada, com a origem registrada. Trecho sem previsão requer motivo de inclusão excepcional, na preparação ou depois, nos detalhes. A rotina permanece inalterada. Não existe inclusão de aluno sem cadastro e vínculo operacional ativo.

**D-09:** para esta etapa de teste, motoristas ativos do próprio transporte podem preparar viagens, decidir a revisão, registrar ausências e autorizar inclusões excepcionais com motivo de pelo menos dez caracteres. Em andamento, mudanças de passageiros exigem o motorista atualmente designado. Substituições podem ser registradas por outro motorista ativo da mesma operação, com motivo, para permitir a continuidade quando o motorista anterior estiver indisponível. Escola e responsável consultam, sem autorizar em nome do transporte. Essas permissões são propostas, não decisões operacionais definitivas.

Outras propostas técnicas:

- Preparação de hoje até os próximos trinta dias, no fuso configurado da operação. Datas passadas são somente consulta.
- Cada criança pode ter uma reserva ativa por data/trecho, inclusive quando tem mais de um vínculo operacional. Homônimos com IDs diferentes continuam distintos.
- Uma van não pode exceder sua capacidade cadastrada; passageiros em revisão ocupam vaga para essa verificação. Não transportadas não ocupam vaga.
- Motorista e veículo não iniciam outra viagem enquanto estiverem em uma viagem em andamento. Isso também é verificado na substituição.
- Não é possível iniciar uma viagem sem passageiros A transportar, com revisão pendente, recursos inativos, vínculo operacional inativo ou antes/depois de sua data.
- Alteração de planejamento ainda em análise impede reservar o trecho. Resolva-a na Parte 3 antes da inclusão.

## Estados e preservação

O banco prevê Planejada, Em andamento, Trajeto encerrado com ocorrência aberta, Concluída e Cancelada. Nesta etapa, somente preparação, início e cancelamento anterior ao início têm endpoints. **Não existe botão ou endpoint de conclusão ou encerramento.** Os demais estados dependem das Partes 7/8.

Ao reservar uma previsão, a transação bloqueia seu planejamento (`locked_at`) e incrementa sua versão. Respostas e decisões da Parte 3 não reescrevem a lista reservada. Ausência e inclusão são decisões da viagem e mantêm o retrato original da previsão. Ao cancelar uma viagem ainda não iniciada, a reserva é liberada sem apagar o registro antigo.

RN-12/RN-16/RN-17: as participações reservam campos de integração para primeiro embarque, validação do embarque, primeiro desembarque e validação da entrega. Uma movimentação informada impede transformar o passageiro em Não transportada ou cancelar a viagem. Isso foi testado por preparação do estado no banco de teste; não há endpoint de embarque nesta parte. A Parte 5 deverá gravar confirmações individuais e atualizar esses campos na mesma transação. Iniciar viagem não preenche nenhum deles. Entrega pendente é derivada de embarque informado sem entrega validada; ausência de registro não é exibida como criança embarcada.

RN-30: crianças A transportar sem entrega validada continuam sem contabilização final. Esta etapa não declara viagem concluída, van vazia ou entrega realizada. Ocorrências e alertas não são simulados.

## Transações e autorização

- Preparação usa UUID de idempotência e hash do conteúdo. Reenvio igual retorna a viagem já criada; reutilizar a chave com conteúdo diferente é rejeitado.
- Índice único impede duas reservas ativas para a mesma previsão. Bloqueio da criança impede reservas concorrentes por vínculos diferentes.
- Escritas serializam a operação e usam a versão atual da viagem. Duas decisões concorrentes não sobrescrevem silenciosamente a anterior.
- Atribuições bloqueiam o usuário do motorista e o veículo, além de verificar operação e atividade. Isso evita iniciar duas viagens com o mesmo motorista em operações distintas.
- Vínculos e previsões são bloqueados na transação antes de reservar ou decidir a destinação. A autorização é validada pelo backend, inclusive recebendo IDs diretamente.
- Inativar vínculo familiar revoga a consulta da família; inativar associação operacional revoga a consulta da escola e novas ações naquele passageiro. O transporte conserva o retrato histórico da própria viagem.
- Auditoria registra preparação, inclusão, decisão de destinação, início, substituição e cancelamento. Não há exclusão pública de participações.

## Limites da etapa

Não há viagens automáticas, GPS, mapas, sincronização offline, envios externos, alertas, embarques/entregas ou conferência final. O aplicativo precisa de conexão com a API. A validação em aparelho físico/iOS ainda depende do teste do usuário. Decisões pendentes continuam propostas para teste local.
