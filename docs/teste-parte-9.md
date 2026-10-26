# Teste da Parte 9

Abra [http://localhost:3000](http://localhost:3000). As contas demo têm senha inicial `Caminho@2026!`, caso não tenha sido alterada. Utilize dados fictícios.

## Consultar o histórico

1. Entre como motorista e abra **Histórico e correções**. No aplicativo, abra **Histórico**.
2. Escolha início/fim e uma criança; clique em **Consultar histórico**. O intervalo máximo é 93 dias.
3. Abra uma participação. Confira os autores e horários originais, as ocorrências, as conferências e a linha do tempo. Use **Filtrar esta viagem** para consultar uma viagem específica.
4. Repita como responsável e escola: somente os registros permitidos pelo contexto atual devem aparecer.

## Solicitar correção do próprio registro

1. Escolha uma confirmação registrada pela conta atual. Clique em **Solicitar correção deste registro**.
2. Informe motivo e relato corrigido com pelo menos 20 caracteres cada e envie.
3. Confira a solicitação e a divergência crítica. Os autores, IDs e horários originais continuam visíveis.
4. Se a viagem já estava concluída, ela deve aparecer como **Conclusão sob revisão**.
5. Confirmações de outras pessoas não oferecem o botão de correção. Operação comum, motorista e responsável não oferecem botões para decidir a solicitação.

## Decisão da coordenação

1. Entre como **Gestão da escola** ou outra conta com coordenação ativa da escola da criança.
2. Abra a mesma participação no histórico.
3. Preencha motivo, contatos e verificações com pelo menos 20 caracteres cada.
4. Teste **Aprovar correção**: a retificação fica vinculada ao original, a confirmação corrigida deixa de contar como vigente e a divergência continua aberta. Não há confirmação em nome de outra pessoa.
5. Em outro cenário, teste **Rejeitar correção**: o registro original continua vigente e aquela solicitação fica encerrada com motivo e autoria.

## Resolução excepcional e nova conferência

1. Após decidir as solicitações pendentes, localize **Resolução excepcional pela coordenação**.
2. Informe motivo, contatos, verificação física/destinação e marque a declaração da verificação.
3. Para entrega, selecione um funcionário ativo da escola na ida ou responsável verificado na volta. Não é permitido selecionar outra escola ou inventar um adulto alternativo.
4. Registre. O histórico deve mostrar **Contabilizada excepcionalmente**, com motivo, pessoas, verificações e recebedor. As confirmações ausentes continuam ausentes; as originais continuam identificáveis.
5. Confira a central de notificações: a atualização deve dizer **Contabilização excepcional**, sem anunciar dupla confirmação normal.
6. A viagem continua aberta ou sob revisão. Entre como motorista designado e registre nova conferência física em **Viagens e passageiros / Viagens**.
7. A tela deve mostrar **Concluída com contabilização excepcional** e preservar as conferências anteriores.

Para testar **Não transportada**, utilize um cenário sem confirmação vigente. Se houver clique equivocado, ele exige correção aprovada antes dessa contabilização excepcional. Uma movimentação vigente não pode ser apagada por ausência.

## Novo risco e indisponibilidade

1. Após uma resolução excepcional, registre uma nova contestação ou solicite correção de outra confirmação própria. A resolução anterior deve continuar no histórico como anterior, exigindo nova verificação.
2. Mesmo depois da conclusão, em **Viagens**, use **Relatar criança não localizada ou recebimento contestado**. A viagem deve entrar em revisão. Essa ação também atende responsáveis sem confirmação própria para corrigir.
3. Abra **Operação, permissões e indisponibilidade** no histórico e confira o procedimento sem internet. Não há fila offline ou exportação configurada.
4. Em cenário fictício, interrompa a conexão durante um envio. A tela deve mostrar falha de comunicação, sem anunciar sucesso. Restabeleça a conexão e atualize o histórico para verificar o recebimento antes de repetir.

O painel foi verificado em 1440, 390 e 320 pixels. O aplicativo exige também seu teste interativo em aparelho físico.

Pare nesta etapa para avaliar. Integração final e preparação para operação ficam para a Parte 10.
