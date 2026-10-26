# Parte 5 — Movimentações com dupla confirmação

Etapa autorizada pelo usuário após a Parte 4. Cada embarque e desembarque pertence a uma participação específica, com criança, viagem, data, trecho e tipo. Não há confirmação em lote.

## Matriz implementada

| Trecho | Movimentação | Dois lados exigidos |
| --- | --- | --- |
| Ida | Embarque em casa | Responsável verificado e motorista designado |
| Ida | Recebimento na escola | Motorista designado e funcionário da escola vinculada |
| Volta | Entrega pela escola ao transporte | Funcionário da escola vinculada e motorista designado |
| Volta | Recebimento em casa | Motorista designado e responsável verificado |

Qualquer lado pode registrar primeiro. A primeira confirmação gera Embarque informado ou Desembarque informado; somente o segundo lado, por outra pessoa, valida a movimentação. Duas pessoas da mesma parte não substituem o outro lado. A mesma pessoa com mais de um contexto também não pode confirmar pelos dois lados.

## Telas

Em **Viagens e passageiros → detalhes da viagem → criança**, o painel e o aplicativo mostram:

- Estado agregado da criança e indicação Possivelmente a bordo enquanto há registro de movimentação sem entrega validada.
- Embarque e desembarque separados, com local, criança, data e trecho identificados.
- Dois lados de cada evento, com nome individual de quem confirmou, organização e horário recebido pelo servidor, exibido no fuso da viagem.
- Quem ainda precisa confirmar, sem pedir que uma pessoa repita a confirmação por faltar a outra.
- Botões por perfil: Confirmar embarque/desembarque; Confirmar que entreguei/recebi a criança; Confirmar entrega ao motorista/recebimento na escola.
- Ocorrência de sequência incompleta separada do estado da movimentação.

Os números de Embarques informados correspondem a embarques com apenas um lado; Embarques validados correspondem aos dois lados. Entregas pendentes incluem qualquer participação com embarque ou desembarque informado e sem as duas confirmações do recebimento. Entrega validada não conclui a viagem.

## Sequência incompleta — proposta RN-19

Um desembarque pode ser registrado mesmo sem embarque anterior validado. O sistema conserva o recebimento e abre uma ocorrência persistente, identificando se havia zero ou uma confirmação de embarque. Não cria confirmações retroativas.

A ocorrência é única por movimentação de desembarque e continua aberta se o embarque for confirmado posteriormente. O estado pode mostrar Entrega validada ao mesmo tempo que a ocorrência permanece aberta para revisão. Nenhum usuário resolve essa ocorrência nesta etapa: atendimento, gravidade, escalonamento e resolução autorizada dependem das Partes 7/9 e de D-09.

Ausência de registros dos dois eventos, sozinha, não abre ocorrência automaticamente: o gatilho continua dependente de D-07. Não há alerta, envio ou agendador simulado.

## Autorização e integridade

- A viagem precisa estar Em andamento ou, futuramente, Trajeto encerrado com ocorrência aberta. Viagens Planejadas, Canceladas ou Concluídas não recebem novos eventos.
- A criança precisa estar incluída para transporte e possuir vínculo operacional ativo. Se foi marcada Não transportada, o motorista deve revisar a destinação antes de registrar movimentações. Essa revisão não é permitida depois de qualquer movimentação informada.
- Somente o motorista atualmente designado confirma pela operação. Escola atua somente no seu lado e nos seus alunos. Responsável precisa do contexto familiar e vínculo verificado ativo.
- Autor, lado e perfil são derivados da sessão/contexto no servidor. A API rejeita corpos que tentam informar autor, lado, lista de crianças ou outro tipo de evento.
- Uma movimentação por participação/tipo; uma confirmação por lado e uma por pessoa na movimentação, com restrições únicas no PostgreSQL.
- Transação serializa a operação e bloqueia viagem, vínculo, previsão e participação. Confirmação, horários derivados, versão da viagem, auditoria e eventual ocorrência são persistidos juntos.
- Confirmações independentes não exigem a versão que estava na tela, permitindo concorrência entre os lados. Alterações de destinação/substituição continuam com controle de versão da Parte 4.
- Reenvio do mesmo autor/lado retorna o registro existente e não reinicia horários, incrementa versão nem duplica auditoria. Permissões e vínculos são verificados novamente mesmo no reenvio.
- Embarque ou desembarque informado bloqueia ausência e cancelamento; rotina e respostas comuns de planejamento não apagam movimentos da viagem.
- Cada confirmação aponta para a atribuição vigente de motorista/veículo. Substituições criam uma nova atribuição e preservam os autores e referências dos eventos anteriores. A viagem guarda referência explícita da atribuição corrente, sem depender de ordenar horários.
- Inativação posterior de vínculo não apaga uma confirmação válida recebida anteriormente; revoga novas ações e a consulta no escopo revogado.
- Não há API para editar/excluir confirmações ou fabricar a confirmação da outra pessoa. Correções continuam na Parte 9.

## Confirmação depois da meia-noite — proposta técnica

Uma viagem ainda aberta pode receber a confirmação pendente depois da sua data. O registro guarda o instante real de recebimento, sem retroagir o horário ou a data da viagem. Isso permite registrar o recebimento atual sem bloquear por uma mudança de dia. Viagens futuras e terminais não aceitam novos eventos. Alterações comuns de planejamento/destinação de datas passadas continuam restritas conforme as etapas anteriores.

## Limite da entrega

As atualizações aparecem ao consultar ou usar **Atualizar viagens**. Filas e notificações serão implementadas na Parte 6, alertas graduais na Parte 7 e conferência/encerramento na Parte 8. Mesmo com todas as entregas validadas, esta etapa não encerra a viagem automaticamente e não oferece declaração de van vazia. D-02/D-09 e demais decisões pendentes permanecem propostas para teste local.
