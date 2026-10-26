# Central da escola — confirmação individual

Atualização da navegação e do planejamento: consulte [Simplificação — rodada escolar](simplificacao-escola.md), que amplia esta entrega com `GET /school/day` e as previsões sem viagem.

Esta rodada simplifica o painel web da escola e corrige critérios compartilhados de movimentação. Motorista e responsável mantêm sua navegação atual; a revisão completa desses layouts fica para a próxima rodada.

## Operação da escola

Ao entrar ou mudar para um contexto escolar, a entrada padrão é **Central da escola**. Links de alertas e notificações continuam abrindo o destino autorizado. A tela inicia na data de hoje fornecida pelo servidor e tem duas abas:

| Aba                    | Viagem/evento     | Ação do funcionário    |
| ---------------------- | ----------------- | ---------------------- |
| Receber na escola      | Ida / desembarque | Recebi na escola       |
| Entregar ao transporte | Volta / embarque  | Entreguei ao motorista |

Cada criança tem seu próprio botão. A escola pode confirmar primeiro; o registro identifica o funcionário e mantém pendente a confirmação do motorista. Um funcionário diferente não cria uma segunda confirmação do lado da escola. A mesma pessoa nunca preenche os dois lados.

As viagens aparecem agrupadas com veículo, placa, motorista e data. Pesquisa e filtro ajudam a localizar a criança; o identificador curto distingue homônimos. Depois da confirmação, a linha mantém seu lugar. Autores, horários, correções e histórico ficam nos detalhes. A conferência da van permanece com o motorista na tela de viagens.

A escola só registra em viagem iniciada e participação autorizada. Quando não puder agir, a tela apresenta o motivo do servidor. Recebimento real sem embarque validado pode ser registrado; a pendência anterior gera ocorrência e não desaparece com o recebimento.

## Estado atual e histórico

Confirmação aprovada em correção deixa de contar como vigente, mas conserva o fato original. A verificação de sequência e a autorização de encerrar ocorrências usam confirmações vigentes, em vez de datas históricas de validação. Contabilizações excepcionais não integram o contador de entregas normais.

Os componentes existentes na web e no Expo não apresentam registro invalidado com check verde. Uma correção pendente aparece sob verificação. Duas confirmações e ocorrência aberta são informações separadas; uma não encerra a outra nem conclui a viagem automaticamente.

## D-05 — decisão desta rodada

O usuário escolheu **coordenação da própria escola e motorista designado** para o crítico de embarque na volta. Mantêm-se os intervalos 5/10/15 escolhidos anteriormente. Cobrança de confirmação é dirigida somente a quem ainda falta; a parte que já confirmou recebe acompanhamento, sem nova exigência de clique.

Sem coordenação ativa, o encaminhamento aparece incompleto, embora o motorista continue acompanhando. Casos abertos são reavaliados sem reiniciar origem/prazos e sem duplicar o aviso da mudança. Críticos de embarque na ida continuam pendentes de definição. Não há destinatário substituto aprovado para ausência de resposta.

## Contrato e atualização

`GET /trips?date=AAAA-MM-DD` fornece as viagens limitadas ao contexto. A confirmação continua no `POST /trips/:tripId/passengers/:passengerId/movements/:kind/confirm`, com corpo `{}`.

A resposta preserva `id`, `state` e `unchanged` e acrescenta `passenger` (resumo atualizado) e `tripVersion`, inclusive em replay. O resumo é produzido com dados relidos na mesma transação. A central atualiza a linha com essa resposta, sem um GET de detalhes por criança e sem ampliar limites HTTP.

A tela consulta o estado periodicamente enquanto visível, ao retornar ao foco ou recuperar conexão. Respostas antigas não sobrescrevem confirmações novas. Falha ambígua exige consulta antes de repetir; não há confirmação otimista antes da resposta nem fila offline. Dados deixam de ser apresentados se o acesso for revogado.

Sem alteração destrutiva ou nova estrutura de banco nesta rodada. Fatos originais e resoluções existentes permanecem preservados. Uso real continua condicionado às pendências de operação descritas na Parte 10.
