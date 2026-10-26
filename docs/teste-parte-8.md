# Teste da Parte 8

Abra [http://localhost:3000](http://localhost:3000). Use apenas dados fictícios neste teste local. A senha inicial das contas demo é `Caminho@2026!`, caso não tenha sido alterada.

## Começar

1. Entre como **Motorista**, abra **Viagens e passageiros** e selecione uma viagem iniciada. Escolha a data correspondente se estiver consultando uma viagem anterior.
2. Localize **Conferência final**. Confira o resumo de entregas, ausências e pendências por criança.
3. Verifique que o botão de encerramento exige as três marcações de conferência física e a seleção do resultado da inspeção.

## Trajeto terminou com pendência

1. Em um cenário fictício com criança sem eventos ou entrega com apenas uma confirmação, registre a conferência e selecione **Van vazia, sem criança a bordo**.
2. O resultado deve ser **Trajeto encerrado com ocorrência aberta**. A criança deve continuar na lista de pendências.
3. Abra **Alertas e ocorrências**. A falta de contabilização deve estar crítica imediatamente, sem esperar 15 minutos. As confirmações originais e sua autoria devem permanecer intactas.
4. Retorne à viagem. As confirmações individuais continuam disponíveis para os perfis corretos. Ler ou assumir o alerta não conclui a viagem.

## Concluir após as entregas

1. Na ida, motorista e responsável confirmam embarque; motorista e escola confirmam desembarque. Na volta, escola e motorista confirmam embarque; motorista e responsável confirmam desembarque. Registre somente os fatos simulados do cenário de teste.
2. Caso haja sequência incompleta ou relato de risco, trate o acompanhamento conforme a Parte 7. A entrega validada sozinha não elimina essa ocorrência.
3. Volte ao motorista designado e clique em **Atualizar viagens**. A viagem ainda deve estar aberta, mesmo com a contabilização atendida.
4. Faça uma nova conferência, marque as três verificações e selecione van vazia. Registre: o resultado deve ser **Concluída**, com autor e horário.
5. Expanda **Conferências registradas**. A tentativa anterior deve continuar registrada com seu resultado original.

## Criança não transportada

1. Em uma viagem ainda aberta, escolha uma criança que não tenha qualquer confirmação.
2. Em **Alterar destinação** ou **Definir destinação**, descreva a ausência verificada e clique em **Registrar ausência**.
3. Confira que a ausência contabiliza somente essa criança. Depois do término do trajeto, isso também pode ser feito em uma data anterior, sem alterar horários ou planejamento passado.
4. A viagem não deve concluir automaticamente. Registre uma nova conferência física após resolver todas as pendências.
5. Para criança com qualquer movimentação informada, registrar ausência deve permanecer bloqueado.

## Permissões e segurança da inspeção

- Responsável e escola consultam suas crianças, sem botão de encerramento ou observações livres da inspeção. Outro motorista da operação também não faz a conferência pelo designado.
- Selecionar **Há criança a bordo ou a segurança não está assegurada** exige observação. Mesmo com as entregas validadas, o resultado permanece aberto.
- Uma mudança concorrente deve exigir atualização antes de salvar. Não reutilize uma marcação de conferência anterior: faça uma nova verificação física.
- Motorista e veículo permanecem reservados até a conclusão; uma nova viagem com os mesmos recursos não inicia enquanto houver esse encerramento pendente.

No aplicativo Expo, execute os mesmos cenários em **Viagens**. A exportação Android foi verificada; a interação nativa e as notificações em aparelho físico precisam de teste no dispositivo.

Pare aqui para avaliar esta etapa. Histórico ampliado, correções e resoluções excepcionais ficam para a Parte 9.
