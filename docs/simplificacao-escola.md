# Simplificação — rodada 1: escola

A rodada escolar reúne planejamento e operação na Central, na web e no Expo. A navegação principal tem Central, Alunos e transportes e Mais. Mensagens, perfil e troca de contexto ficam no cabeçalho. Histórico e ocorrências abrem o registro correspondente à criança, com retorno à Central preservando sua seleção. As próximas rodadas são motorista, responsável e gestão; seus novos layouts ainda não fazem parte desta entrega.

## Planejamento e operação

`GET /school/day?date=AAAA-MM-DD` é uma consulta autenticada exclusiva do contexto escolar. Sem data, usa hoje no servidor. Retorna vínculos ativos da escola, duas linhas independentes por vínculo/data (ida e volta), planejamento vigente e participação opcional em viagem. O identificador da linha é vínculo/data/trecho; nomes, van e participação não definem sua identidade.

O planejamento já registrado prevalece sobre mudanças posteriores da rotina. Sem registro, hoje e futuro mostram estimativa identificada da rotina; passado permanece sem planejamento registrado. Ausência de configuração, falta de resposta, não uso expresso e rotina sem previsão são estados distintos. Pedido tardio não altera a situação vigente antes da decisão do transporte.

Somente uma viagem real define van, placa e motorista. Crianças sem viagem aparecem sob o transporte com “van a definir”; o cadastro de veículos não é utilizado como previsão. “Não utilizarão” e “Sem uso previsto” ficam recolhidos. Uma participação real continua visível mesmo se houver não uso no planejamento.

Ao abrir data permitida na Agenda da família ou na preparação do transporte, a interface materializa os registros pelo POST idempotente existente, respeitando a janela de cada transporte e preservando registros anteriores. Abrir a Central escolar é somente leitura. Nenhuma dessas ações confirma uso automaticamente.

## Confirmações e acesso

A escola continua confirmando recebimento na ida e entrega ao motorista na volta, individualmente. O servidor decide `canConfirm` e `blockedReason`; preparar ou iniciar a viagem continua sendo responsabilidade do transporte. São preservados autoria, confirmação independente do motorista, correções, ocorrências e conferência física.

O POST de confirmação retorna passageiro atualizado e versão da viagem. A Central aplica a resposta na linha sem consultar detalhes de cada criança. Respostas antigas não substituem dados mais recentes. A consulta periódica ocorre a cada 15 segundos em tela visível e ao recuperar foco; no Expo, ao voltar ao aplicativo. Uma falha ambígua exige leitura do estado antes de permitir nova tentativa. Não existe fila de confirmação offline.

Filtros, dados e rascunhos ficam apenas na sessão/contexto. Ao mudar de contexto, os componentes são recriados; revogação remove dados autorizados anteriormente. Histórico infantil e auditoria administrativa mantêm permissões distintas, e gestão de equipe só aparece para quem pode gerenciá-la.

## Roteiro de teste

1. Entre como escola em http://localhost:3000. Confira as três entradas e os atalhos de mensagens/perfil/contexto.
2. Na Central, use Hoje/Amanhã, busca e filtro de transporte. Confira previsões antes de qualquer viagem e ausência de van inventada.
3. Entre como família em outra sessão. Abra a Agenda e responda ida/volta separadamente. Reabra a data: os registros existentes devem permanecer.
4. Como motorista, abra a data e prepare uma viagem com veículo/motorista. Atualize a Central: a mesma criança deve adquirir os dados reais da viagem, sem duplicação.
5. Antes de a viagem começar, confira o motivo que impede a confirmação escolar. Depois, confirme uma criança e verifique autoria e espera pelo motorista.
6. Abra histórico ou ocorrência nos detalhes da criança e volte: data, busca, filtro e posição devem permanecer.
7. Teste pedidos tardios, homônimos, não uso recolhido e vínculos revogados. Operador e coordenação devem ter ações distintas.

Ambiente de teste. Esta rodada não libera operação real nem altera decisões operacionais pendentes.
