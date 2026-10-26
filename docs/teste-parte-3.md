# Roteiro de teste — Parte 3

Abra [http://localhost:3000](http://localhost:3000) e atualize a página. Contas e senhas anteriores foram preservadas. A senha inicial das contas demo é `Caminho@2026!`.

## 1. Rotina semanal

1. Entre como Responsável, no contexto familiar de Ana.
2. Abra **Rotina e confirmações → Rotina semanal** e selecione Sofia/Escola Horizonte/Transporte Boa Viagem. O código do cadastro aparece para distinguir homônimos.
3. Configure ida e volta independentemente e salve. Desmarcar a volta de um dia não deve desmarcar a ida. Recarregue a rotina para confirmar a persistência.
4. As contas da escola/motorista consultam essa rotina, mas não a editam em nome do responsável.

Se Sofia não aparecer, confira se a associação operacional e o vínculo familiar continuam ativos na Parte 2. O seed preserva inativações feitas nos testes anteriores.

## 2. Planejamento de amanhã

1. Volte à aba **Planejamento diário**. A data inicial corresponde a amanhã no fuso da operação.
2. Escolha o dia nos círculos do calendário. Use as setas para navegar entre meses e **Hoje** para voltar à data atual. No painel, o nome do mês também permite escolher outro mês.
3. Clique no botão **+** (Gerar previsões do dia). Serão criadas ida e volta para os vínculos autorizados com limite configurado. Clique de novo: nenhuma linha deve duplicar; previsões existentes e decisões devem permanecer.
4. Toque no cartão da ida para abrir os detalhes e ações. Antes do limite, confirme uso somente na ida. A volta deve continuar aguardando confirmação se estiver prevista.
5. Informe não uso na volta. A ida deve continuar confirmada.
6. Não responda a outro trecho previsto e consulte depois do limite: ele continua pendente. Não vira ausência/cancelamento automaticamente.

Se o trecho não estiver marcado na rotina, o estado é Sem previsão na rotina. Isso não impede uma exceção por data; não representa resposta de cancelamento.

**Opções do planejamento** reúne a entrada manual de data, Gerar / atualizar previsões e Atualizar situação. **Resumo do dia** abre os totais por situação. As ações de cada trecho ficam dentro do cartão; abrir outro cartão recolhe o anterior.

## 3. Mudança tardia e decisão

Para testar sem esperar o relógio, selecione **a data de hoje** e gere as previsões. O prazo desse planejamento é o dia anterior; portanto toda escolha diferente será tardia.

1. Como responsável, escreva um motivo de pelo menos 10 caracteres no cartão da ida e clique **Solicitar uso** ou **Solicitar não uso**.
2. Confira Alteração aguardando aceite e Situação vigente. A solicitação ainda não altera a escolha vigente, nem muda a volta.
3. Entre como Motorista e abra **Planejamento diário** na mesma data. Aceite a alteração da ida.
4. Volte à conta do responsável ou à escola e use Atualizar situação. A decisão aparece e o estado é atualizado apenas nesse trecho.
5. Faça outro pedido e recuse pelo motorista com motivo: a situação anterior deve permanecer.
6. Faça novo pedido e retire pelo próprio responsável. A situação anterior também deve permanecer. Escola e outro responsável não conseguem retirar o pedido alheio.

## 4. Limite e fuso

1. Como motorista, abra **Horário limite**. O transporte demo usa 18:00 / America/Sao_Paulo, identificado como proposta de demonstração.
2. Salve o limite/fuso desejados para o teste. Escola e responsável não podem modificar esse parâmetro.
3. Previsões já geradas mantêm seus prazos anteriores. Gere uma data nova para conferir o novo limite.
4. Uma nova operação de transporte não tem limite salvo automaticamente. Configure antes de gerar previsões para seus vínculos.

O valor e a autoridade definitiva ainda dependem de D-01. As configurações são propostas para este teste.

## 5. Preservação, permissões e histórico

1. Gere uma data, anote os estados e depois altere a rotina semanal. As linhas geradas devem conservar a previsão capturada e as escolhas anteriores.
2. Para alterar aquela data, utilize seu cartão diário. Datas passadas são somente leitura; confirmação de datas futuras é feita no dia anterior.
3. Entre como Outra escola. Ela não deve consultar previsões/rotinas de Sofia nem atuar enviando seus IDs.
4. Inativar o vínculo familiar revoga o acesso do responsável; inativar a associação revoga as ações operacionais e preserva os registros.
5. Na escola/transporte, confira previstos, pendentes, uso confirmado, não uso e alterações em análise separadamente. Esses números não indicam embarque.

## 6. Aplicativo

Configure o IP da API conforme o README e execute `npm run dev:mobile`.

- Responsável: **Planejamento → Rotina semanal** para editar os sete dias; **Por data** para gerar e responder por trecho.
- Motorista: **Planejamento → Por data** para consultar e decidir pedidos tardios; **Limite** para configurar a operação.
- Escolha as datas no calendário mensal. A entrada manual em **Opções do planejamento** usa AAAA-MM-DD e o limite usa HH:MM. A exibição dos prazos usa o fuso configurado.
- Após mudança feita por outra pessoa, use Atualizar situação. Não há notificações reais nesta etapa.

O teste automatizado da interface deixou, em 22/10/2026, a ida de Sofia aceita por pedido tardio e a volta independente. Para 23/10/2026, gerou as duas previsões sem respondê-las. A rotina foi restaurada após o teste.

**Pare ao concluir e informe ajustes ou autorize a Parte 4 — Viagens e passageiros.** Não há viagem, embarque, entrega ou alerta de segurança implementado nesta etapa.
