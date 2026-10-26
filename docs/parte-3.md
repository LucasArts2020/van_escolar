# Parte 3 — Rotina semanal e planejamento diário

Entrega limitada à Parte 3, após autorização do usuário para continuar. Viagens e passageiros serão implementados na Parte 4; confirmações de embarque/entrega, na Parte 5. Esta etapa registra intenção de uso, sem comprovar movimentação da criança.

## Funcionalidades

- Rotina semanal por criança e vínculo operacional ativo, com ida e volta independentes nos sete dias.
- Edição somente pelo responsável com vínculo familiar verificado; escola e transporte podem consultar as rotinas dos alunos autorizados.
- Previsões por data, geradas a partir de uma versão da rotina. Duas linhas independentes por vínculo/data: ida e volta.
- Confirmação de uso e indicação expressa de não uso no dia anterior. Uma resposta não confirma/cancela o outro trecho.
- Exceções por data, preservando a rotina semanal.
- Solicitação tardia com motivo, aceite/recusa pelo transporte e retirada pelo solicitante. A situação vigente permanece até o aceite.
- Listas e contadores de planejamento para escola e transporte; o responsável consulta somente seus filhos verificados.
- Limite de confirmação por operação de transporte, com fuso configurável e revisão. O prazo aplicado à previsão fica armazenado como instante com fuso.
- Auditoria de configurações, rotinas, geração, respostas e decisões; controle de concorrência por revisão/versão.
- Telas no painel e no aplicativo; nomes e código do cadastro ajudam a distinguir homônimos.

## Propostas de teste e decisões pendentes

**D-01 — Limite e autoridade:** a configuração é permitida aos motoristas ativos da própria operação, conforme o modelo de administração proposto na Parte 2. Horário e autoridade definitivos ainda precisam ser aprovados. Não há limite implícito para novas operações: sem configuração, os vínculos são informados como não gerados. O formulário sugere 18:00, mas exige salvar. Somente o transporte fictício do seed recebe 18:00 em `America/Sao_Paulo`, marcado como demonstração e auditado com `demo: true`.

**D-02 — Previsão sem resposta:** permanece pendente, inclusive depois do limite e na própria data. Não se transforma em cancelamento, ausência, confirmação ou ocorrência de segurança. A inclusão definitiva na lista de passageiros ainda depende de D-02 e da Parte 4.

**D-12 — Calendário e transferências:** não há calendário automático de feriados/dias sem aula. O responsável pode registrar não uso por data. Novas escolas/transportes não recebem a rotina antiga automaticamente: ela pertence à associação específica da criança. A política definitiva de calendários e transferências continua pendente.

Outras propostas técnicas desta etapa:

- Antes do limite, uma resposta para amanhã é aplicada imediatamente. A partir do instante exato do limite, ou na própria data do serviço, uma escolha diferente exige solicitação com motivo de pelo menos 10 caracteres e aceite do transporte. Não há resposta antecipada para datas posteriores a amanhã.
- Geração é **sob demanda**, pelo botão Gerar / atualizar previsões, para hoje até os próximos 30 dias. Não existe agendador diário automático ou processamento com o aplicativo fechado nesta etapa. Escola/transporte geram seu conjunto autorizado; responsável gera somente os vínculos de seus filhos. Autoria e transações são registradas no servidor.
- Rotina não configurada ou trecho desmarcado geram `Sem previsão na rotina`, distinguindo ausência de previsão de uma resposta expressa `Não utilizará`. A indicação pode ser alterada para uso pela confirmação/exceção correspondente. O estado não inventa uma presença nem um cancelamento.
- Alterar rotina, horário limite ou fuso afeta somente previsões **ainda não geradas**. As já geradas preservam a versão da rotina, previsão original, prazo e fuso. Para mudar uma data existente, é necessário usar sua resposta ou pedido de alteração.
- Uma alteração pendente impede outra concorrente para o mesmo trecho. Reenvios iguais do mesmo solicitante reutilizam o pedido. Para corrigir um pedido pendente, seu autor deve retirá-lo e fazer outro. Aceitar, recusar ou retirar preserva o registro original.
- Recusar exige motivo; retirar não muda a situação vigente. O aceite verifica novamente o vínculo operacional e o vínculo familiar do solicitante. Escolas não aceitam alterações em nome do transporte.
- Datas passadas são somente para consulta. Nenhum usuário consegue reescrevê-las por geração ou resposta comum.
- Decisões são comunicadas nesta entrega pela situação compartilhada e pelo registro da última decisão no painel/app. Não há envio externo: notificações e filas continuam reservadas para as Partes 6/7.

## Estados distintos

| Estado | Significado |
| --- | --- |
| Sem previsão na rotina | Trecho desmarcado, ou rotina ainda não configurada; não é cancelamento |
| Aguardando confirmação | Trecho previsto, sem resposta expressa |
| Uso confirmado | Responsável confirmou antes do limite, ou transporte aceitou pedido de uso |
| Não utilizará | Não uso registrado expressamente ou aceito pelo transporte |
| Alteração aguardando aceite | Pedido separado, coexistindo com a situação vigente acima |

Contadores de trechos previstos representam a previsão capturada da rotina; confirmações, não uso e solicitações são contados separadamente. Não são contadores de passageiros embarcados.

## Integridade e integração futura

- Unicidade por associação/data/trecho e geração `ON CONFLICT DO NOTHING`. Reexecução não duplica nem reseta decisões.
- A rotina tem revisão; respostas usam a versão corrente da previsão. Alteração concorrente não sobrescreve silenciosamente a decisão de outra pessoa.
- Vínculos são verificados no servidor, inclusive ao consultar por ID. Inativar vínculo familiar ou operacional bloqueia acesso e novas ações, sem apagar o planejamento persistido.
- Prazo calculado no PostgreSQL para o horário local do dia anterior e persistido em `timestamptz`. Comparações usam instante UTC; exibição usa o fuso capturado na previsão. Referência: [PostgreSQL — funções de data/hora](https://www.postgresql.org/docs/16/functions-datetime.html).
- A coluna `locked_at` impede resposta, retirada e decisão de alteração quando a operação bloquear a previsão. Não existe botão público para contornar esse bloqueio. Foi testado como contrato para a integração futura.
- **RN-11/RN-12:** alterar a rotina não reescreve previsões já geradas. Ainda não existem viagens nem embarques nesta etapa. Ao implementar as Partes 4/5, será obrigatório bloquear o planejamento na transação da operação e testar o caso real de embarque; o contrato `locked_at` não substitui essa integração.

## Dados fictícios e preservação

O seed acrescenta rotina de Sofia de segunda a sexta, ida e volta marcadas, e limite demonstrativo de 18:00 no fuso de São Paulo. Não gera respostas de responsáveis nem previsões automaticamente. Se o vínculo de Sofia/Ana tiver sido inativado, o seed não o reativa. Rotinas e configurações existentes não são sobrescritas ao reexecutar o seed.

`npm run db:migrate` acrescenta as tabelas da Parte 3 sem remover os dados anteriores. Não há GPS, mapas, notificações simuladas, viagens ou confirmação de movimentação nesta entrega.
