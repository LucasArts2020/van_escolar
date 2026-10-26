# Teste da Parte 6

Abra [o painel local](http://localhost:3000). Contas demo começam com `Caminho@2026!`; senhas alteradas são preservadas. O roteiro usa uma viagem de ida em andamento com Sofia, preparada conforme a Parte 4. Se houver uma viagem já criada no dia/trecho, continue nela, sem tentar reservar a criança duas vezes.

1. Entre como `motorista@demo.local`. Em **Viagens e passageiros**, prepare/inicie a ida, revisando a destinação se necessário. Registre somente o embarque do motorista para Sofia.
2. Entre como `responsavel@demo.local` no contexto familiar. Na **Visão geral**, Sofia aparece com **Embarque informado**, **Possivelmente a bordo** e falta do responsável. Nenhuma criança de outra família deve aparecer.
3. Abra **Notificações** e atualize. A mensagem identifica o relato do motorista, sem dizer que ambos confirmaram. Abra-a: a criança, a data, o trecho e o evento devem ser os corretos.
4. Use **Marcar como lida**. O botão de confirmação continua necessário; a leitura não valida o embarque.
5. Confirme que entregou Sofia ao motorista. A situação atual muda para **Embarque validado**, com dois autores. A mensagem inicial continua descrevendo o que ocorreu naquele instante, mas deixa de cobrar sua ação. A linha do tempo mostra ambos os registros.
6. Entre como motorista e informe somente o desembarque na escola. A família recebe uma atualização; não recebe botão para confirmar pela escola. A escola recebe a pendência do recebimento.
7. Entre como `escola@demo.local`, abra a notificação de desembarque e confirme o recebimento na escola. A entrega passa a validada. Na família, atualize a visão geral: a indicação possivelmente a bordo desaparece. A viagem continua em andamento.
8. Para inverter a ordem, numa outra movimentação válida, confirme primeiro pelo responsável. O pedido restante deve ser do motorista; a família não precisa confirmar novamente.
9. Se testar desembarque sem embarque validado, haverá uma mensagem de sequência incompleta. Marcar como lida ou validar a entrega não fecha essa ocorrência.
10. Troque para outra escola/conta ou inative um vínculo no cenário de teste. O link de uma notificação não deve revelar uma criança sem autorização, mesmo conhecendo seu ID.

As telas atualizam a cada 15 segundos enquanto ativas. O botão **Atualizar** permite conferir imediatamente. A central pode mostrar **Push não habilitado no servidor** ou **Nenhum aparelho habilitado**: a mensagem interna já está gravada; isso não significa envio ao celular.

## Push no aparelho

Depois de configurar EAS/FCM/APNs e as variáveis descritas em `parte-6.md`, instale um development/release build. Na aba **Notificações**, escolha **Ativar neste aparelho** e conceda a permissão. Produza uma nova confirmação por outra conta. Toque no aviso para abrir o detalhe autorizado.

Confira **Envio ao celular e tentativas**: ticket aceito pelo Expo, recibo posterior e leitura são estados separados. **Desativar neste aparelho** interrompe novos envios sem apagar a central. Sair da conta e entrar como outra pessoa não deve expor notificações antigas.

O Expo Go permite testar a central, a linha do tempo e as confirmações. O push remoto não foi validado em aparelho físico nesta entrega, pois ainda faltam projeto, credenciais e build configurados.
