# Meu dia e coerência das informações

Esta é a segunda rodada da simplificação, disponível para teste local na web e no Expo. A rodada da família e a ficha unificada de gestão continuam posteriores ao teste do usuário.

## Como testar

1. Entre como `motorista@demo.local`. O início é **Meu dia**. O menu principal contém **Meu dia · Alunos e frota · Mais**; mensagens, perfil e contexto ficam no cabeçalho.
2. Escolha Hoje/Amanhã ou outra data. As viagens atribuídas aparecem primeiro. **Outras viagens do transporte** mantém o acesso de consulta e gestão existente; a confirmação e a conferência continuam exclusivas do motorista designado.
3. Use **Preparar viagem** para abrir a preparação na data selecionada. Previsões são materializadas de forma idempotente, sem confirmar uso familiar. Os controles de inclusão, destinação, veículo e motorista foram preservados. Salvar abre diretamente a nova viagem em Meu dia, na data escolhida.
4. Abra uma viagem. **Iniciar viagem** fica no cabeçalho; continua exigindo a data permitida, motorista designado e revisão das destinações.
5. Use as abas **Embarque** e **Desembarque**. Busque nome/identificação e filtre escola. Cada botão confirma uma criança, sem modal ou troca automática de etapa. A linha permanece no lugar e informa quem ainda falta confirmar.
6. Confira **Autores, horários e histórico**. Ocorrência, revisão e exceção ficam separadas da dupla confirmação. Abrir histórico/correção/atendimento leva ao registro exato; voltar preserva a lista.
7. Abra **Conferência e encerramento**. A viagem é relida, e as verificações físicas continuam obrigatórias. Mudança de versão invalida a conferência em preenchimento. Uma van vazia não resolve pendências de contabilização.
8. Confira pendências e viagens abertas de outras datas, inclusive conclusões sob revisão. A prévia destaca críticos; **Ver todas as pendências** e a paginação dão acesso ao restante.

O recebimento factual sem embarque validado continua permitido quando autorizado pelo servidor, com ocorrência de sequência. Não há confirmação em lote ou fila offline. Se o resultado do envio for desconhecido, a tela consulta o servidor antes de oferecer nova tentativa.

## Informações corrigidas

- **Incluídos na viagem** representa a classificação do cadastro, separada do avanço da viagem.
- A Agenda mantém o uso vigente visível junto ao pedido de alteração ainda pendente; ida e volta continuam independentes.
- Falta de rotina na criação do planejamento é diferente de não uso expresso e da configuração atual. Cadastrar rotina posteriormente não reescreve previsões existentes.
- Escola web/Expo compartilham textos de confirmação, correção e invalidação. Ocorrências em atendimento continuam visíveis, e exceções não passam a representar confirmações normais.
- O início da família mantém a viagem mais recente e uma lista independente de pendências/revisões, com identificação e data.
- Operador escolar consulta o nome da organização; edição exige a permissão de gestão já existente.

## Contratos e atualização

`GET /driver/day?date=AAAA-MM-DD&page=0&openPage=0&attentionPage=0` é exclusivo do contexto motorista. Retorna data do servidor, viagens do dia, viagens atribuídas abertas em outras datas e ocorrências autorizadas. Cada lista tem páginas de 20, total completo e `hasMore`; cartões não carregam passageiros. O detalhe usa `GET /trips/:id` ao abrir a viagem. Opções de preparação só são carregadas nesse fluxo.

A confirmação preserva `id`, `state`, `unchanged`, `passenger` e `tripVersion`, acrescentando `tripSummary` com situação, contadores e contabilização/encerramento. Passageiro e resumo são relidos na transação, inclusive no replay. Respostas de crianças diferentes são conciliadas independentemente da ordem de chegada; resumo e contadores não retrocedem de versão.

O acompanhamento atualiza a cada 15 segundos enquanto visível e ao recuperar foco/conexão. A troca de contexto desmonta o estado anterior; revogação limpa dados, filtros e preparação. O aplicativo usa Expo Network para recuperar a leitura após reconexão. Exportação Android não substitui teste em aparelho físico.

Nenhuma migração de dados é necessária nesta rodada. Não há novas autoridades, substituição de fatos históricos ou liberação para uso real.
