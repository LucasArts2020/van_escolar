# Meu dia: pendências e preparação

A entrada do motorista concentra a data, o botão **Preparar viagem**, as pendências e o resumo de uso do transporte. Viagens preparadas e de outras datas ficam em acessos recolhidos para retomada.

## Resumo antes da preparação

- **Vão:** uso confirmado pela família ou participação já liberada pelo transporte. A liberação pelo transporte é identificada quando não há confirmação familiar.
- **Não vão:** não uso expresso ou decisão registrada de não transportar.
- **A conferir:** resposta pendente, participação em revisão, previsão da rotina, configuração ausente ou falta de registro.
- Ida e volta são selecionadas separadamente. O trecho escolhido segue para o formulário de preparação.
- Nomes, escola e identificador distinguem homônimos. As listas mostram até 20 nomes por grupo e página; os totais consideram todos os vínculos autorizados.
- Pedidos em análise aparecem separados, preservando a situação vigente.
- Quando o planejamento não existe, hoje e futuro podem exibir previsão identificada da rotina. O passado sem registro não usa a rotina atual.

A leitura não gera planos, não confirma uso ou movimentação e não inventa van prevista. As opções de preparação só são carregadas ao abrir esse fluxo. Confirmar presença e conferir a van continuam dentro da viagem selecionada.

## Contrato

`GET /driver/day` mantém os campos anteriores e acrescenta `preparation`. Os parâmetros opcionais `preparationDirection` (OUTBOUND/RETURN) e `preparationPage` controlam trecho e página do resumo. A consulta é restrita ao transporte autorizado e mantém as verificações de contexto ativo.

## Verificação

10 testes de Meu dia passaram, incluindo projeção sem gravação, rotina configurada depois do planejamento, situação vigente versus pedido pendente, direções independentes, paginação de homônimos, isolamento e revogação. Tipos, build e exportação Expo foram executados. O teste físico do aplicativo permanece pendente.

O teste de navegador com PostgreSQL isolado validou 320, 390 e 1440 px, resumo sem gravações, seleção de ida/volta, preparação no trecho escolhido e retomada das viagens existentes. Não houve erro de JavaScript ou transbordamento horizontal. O ambiente temporário foi removido, preservando a base local do usuário.

Para testar: entre como Motorista, abra Meu dia, alterne Ida/Volta, confira os grupos e toque em Preparar viagem. Para uma viagem existente, abra Viagens preparadas nesta data ou Viagens de outras datas para retomar.
