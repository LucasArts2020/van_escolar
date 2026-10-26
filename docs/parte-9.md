# Parte 9 — Histórico, correções e gestão operacional

Etapa para teste local das RN-33 a RN-35 e dos critérios de histórico e correção. A Parte 10 permanece pendente.

## Histórico e permissões

O painel oferece **Histórico e correções** e o aplicativo oferece **Histórico**. A consulta filtra por criança, viagem e intervalo de até 93 dias, com páginas de 30 participações. Cada detalhe reúne confirmações originais, solicitações e decisões de correção, ocorrências e atendimento, contabilizações excepcionais, conferências físicas e atribuições de motorista/veículo.

Nomes capturados nas viagens permanecem preservados. O filtro identifica a criança pelo ID e utiliza o nome capturado na participação mais recente autorizada, evitando duplicá-la após uma mudança de nome.

O servidor revalida o contexto em todas as consultas e alterações. A família exige vínculo familiar ativo e verificado e associação operacional ativa; a escola exige associação operacional ativa da própria escola. O transporte consulta os registros das próprias viagens, inclusive os registros preservados após inativação, mas não solicita nova correção operacional de uma participação/vínculo inativo. Conhecer o ID não concede acesso. As observações livres das inspeções de uma viagem compartilhada não são incorporadas ao histórico da criança.

## Autoridade escolhida pelo usuário — D-09

O usuário autorizou **a coordenação da escola, com motivo e verificações**, para aprovar correções conflitantes e resoluções excepcionais. A implementação exige contexto ativo de coordenação da escola da criança. Motorista, responsável, operação comum e coordenação de outra escola não recebem essa autoridade.

A mesma autoridade é usada na ida e na volta. Isso não concede permissão para registrar a confirmação de outra pessoa, nem altera os destinatários ainda pendentes dos alertas gerais de embarque. Solicitações de correção são encaminhadas à coordenação responsável por decidi-las.

## Solicitar e decidir uma correção

Somente o autor de uma confirmação pode solicitar sua correção. Informa motivo e relato correto, ambos com pelo menos 20 caracteres. A solicitação referencia o ID original, registra autor, contexto e horário do servidor e abre uma divergência crítica.

A confirmação original não é apagada, editada, transferida a outro autor nem substituída por um clique da coordenação. Há uma solicitação pendente por confirmação; os dois autores da mesma movimentação podem apresentar solicitações independentes.

A coordenação aprova ou rejeita após registrar motivo, contatos e verificações. A decisão é única, com versão e autoria. Rejeitar mantém a confirmação original vigente e encerra aquela divergência de correção. Aprovar acrescenta a retificação; a confirmação original continua visível, mas deixa de ser contada como confirmação vigente para a contabilização normal. A divergência permanece aberta até contabilização excepcional documentada. Uma correção aprovada não habilita outra pessoa a refazer o registro original.

## Contabilização excepcional

A coordenação pode contabilizar uma criança de viagem aberta ou sob revisão quando as condições normais ainda não estão atendidas. Deve decidir antes todas as solicitações de correção pendentes e registrar:

- Motivo, contatos e verificação física/destinação, com pelo menos 20 caracteres por campo.
- Declaração explícita de verificação física e identificação da destinação segura.
- Resultado: entrega verificada excepcionalmente ou não transportada verificada excepcionalmente.
- Para entrega, funcionário ativo da escola na ida ou responsável já verificado e ativo na volta, selecionado dos vínculos autorizados dessa criança.

Outro adulto não é liberado por texto livre: essa possibilidade continua condicionada a D-08. Não transportada exige inexistência de confirmações vigentes; eventuais registros equivocados precisam de correções aprovadas. A ausência comum continua bloqueada quando há movimentação original, exigindo esse tratamento excepcional.

A resolução é um registro separado e preservado. Encerra os acompanhamentos abertos daquela criança com classificação **EXCEPTIONAL_ACCOUNTING**, motivo, coordenação, contatos e verificações. Não cria confirmações, não preenche horários de embarque/entrega e não apresenta a criança como validada pelas duas partes. Produz atualização própria na central de notificações, também quando não havia uma ocorrência prévia; reenvio não duplica o evento.

As telas mostram **Contabilizada excepcionalmente** e, após a conferência final, **Concluída com contabilização excepcional**. A conferência física do motorista continua obrigatória; resolver o acompanhamento não conclui a viagem automaticamente.

## Novos fatos e revisão de uma conclusão

Uma solicitação de correção ou relato de risco após a conclusão coloca a viagem em **Conclusão sob revisão**, preservando a hora de conclusão anterior e as inspeções já registradas. O relato de risco continua disponível mesmo para um responsável que não tenha confirmação própria para corrigir. A revisão histórica não reserva novamente motorista e veículo de viagens atuais.

Novas confirmações, correções, relatos de risco e mudanças de destinação invalidam a vigência de uma contabilização excepcional anterior. O registro anterior permanece no histórico e exige nova verificação; uma exceção antiga não encobre fatos posteriores. Com contabilização excepcional vigente, a aplicação não exige uma confirmação automática da parte ausente.

Depois de tratar as pendências, o motorista designado faz nova conferência física para concluir. A revisão não apaga reservas históricas da criança nem reabre o planejamento passado.

## Concorrência e falha de comunicação

Operação, viagem, vínculos e contexto são revalidados sob bloqueios transacionais. Solicitações e resoluções usam chaves de idempotência; decisões usam versão. Repetição não duplica registros, e decisões concorrentes não sobrescrevem uma decisão já tomada. As evidências são salvas junto à alteração, aos eventos e à caixa de saída.

Sem comunicação, a interface não anuncia recebimento. Mantém o formulário e orienta atualizar o histórico antes de repetir. Não existe fila offline ou envio automático de dados locais. O bloco **Operação, permissões e indisponibilidade** explica esse procedimento e mostra configurações do escopo; o transporte acessa as telas autorizadas de planejamento e alertas.

## Limites explícitos

D-10 ainda exige o procedimento operacional de contato alternativo e eventual sincronização offline. D-11 ainda exige retenção, exclusão e permissões de exportação. Esta etapa não inventa destinatários/canais, não exclui registros automaticamente e não oferece exportação. D-08 continua pendente para adultos alternativos. Push real depende das credenciais e aparelhos já delimitados nas partes anteriores.
