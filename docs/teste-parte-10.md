# Teste interativo da Parte 10

Abra http://localhost:3000. O menu **Preparação para operação** reúne as orientações. No Expo, use **Preparação**. Faça os testes com dados fictícios e contas distintas; não use dados de crianças reais. Senha inicial das contas demo, se não alterada: `Caminho@2026!`.

## 1. Tela de preparação

1. Entre como motorista, responsável e escola, um de cada vez.
2. Confira as orientações do perfil, o aviso **Teste local · uso real não liberado** e as doze decisões.
3. Confira 5/10/15 em D-03 e a autoridade de coordenação em D-09; as demais definições não devem aparecer como aprovadas.
4. Abra os atalhos para planejamento, viagens, alertas e histórico.
5. Com o guia aberto, desligue a conexão: o texto já carregado permanece legível. Ações de viagem continuam exigindo comunicação.

## 2. Ida e volta completas

Use uma data futura para o planejamento, confirmado no dia anterior. Para testar uma viagem de hoje com planejamento ainda pendente, o transporte precisa registrar inclusão excepcional com motivo; esse caminho não equivale a planejamento confirmado no prazo.

1. Responsável (`responsavel@demo.local`, contexto familiar): configure a rotina de Sofia e confirme ida e volta separadamente.
2. Motorista (`motorista@demo.local`): prepare uma viagem da data e trecho corretos, motorista/veículo disponíveis, incluindo Sofia. Inicie a viagem no dia da operação.
3. Ida: responsável + motorista confirmam embarque; motorista + escola confirmam desembarque. Use `escola@demo.local` ou a operação da escola para a confirmação escolar.
4. Volta, em outra viagem: escola + motorista confirmam embarque; responsável + motorista confirmam recebimento.
5. Depois da primeira confirmação veja **informado**; só depois da segunda, **validado**. Confira as mensagens da família.
6. Motorista registra a conferência física. Cada viagem só conclui se todos estiverem contabilizados e sem divergência aberta.
7. Confira os autores e horários no histórico com os três perfis.

## 3. Pendências e falhas

| Teste                                        | Resultado esperado                                                                                                            |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Falta a confirmação da escola no desembarque | Entrega pendente; após 15 minutos, crítico para coordenação.                                                                  |
| Responsável indisponível na volta            | Entrega pendente; crítico para responsável; motorista mantém o acompanhamento.                                                |
| Responsável já confirmou, motorista falta    | A cobrança continua para o motorista; não exigir nova confirmação da família.                                                 |
| Nenhuma confirmação                          | Não inferir parada. Conferência final exige contabilização e mantém ocorrência crítica.                                       |
| Duplo clique/reenvio                         | Uma confirmação por lado, com autor preservado.                                                                               |
| Rede cai durante o envio                     | Não anunciar recebimento sem resposta. Ao reconectar, atualizar antes de repetir; resposta pode ter se perdido após o commit. |
| Push desabilitado                            | Atualização na central; nenhuma indicação de push real entregue.                                                              |
| Declaração de van vazia com pendência        | Trajeto encerrado com ocorrência aberta; a declaração não apaga a pendência.                                                  |
| Escola diferente tenta consultar ID          | Backend nega a consulta/ação.                                                                                                 |

Os prazos de 5/10/15 minutos são reais no ambiente de demonstração. A suíte automatizada avança apenas seu relógio isolado; não existe botão de acelerar o tempo na aplicação.

## 4. Correção e exceção

Siga `teste-parte-9.md`: autor solicita correção; operação comum não pode decidir; coordenação da própria escola registra decisão/evidências. Se houver contabilização excepcional, ela deve aparecer separada das confirmações originais. O motorista faz nova inspeção antes de concluir. Uma correção ou relato posterior deve abrir revisão, preservando o histórico.

## 5. Verificação técnica

Na pasta do projeto:

```powershell
npm test
npm run typecheck
npm run build

# Banco local do Compose: somente schema e fila de QA serão criados/removidos.
$env:QA_DATABASE_URL='postgresql://caminho:caminho_local@127.0.0.1:5432/caminho'
$env:QA_REDIS_URL='redis://127.0.0.1:6379'
$env:QA_BACKUP_DRILL='true'
npm run test:integration
npm run ops:check
```

`QA_BACKUP_DRILL=true` acrescenta pg_dump e restauração temporária de dados fictícios usando o PostgreSQL do Compose. Sem essa opção, a suíte PostgreSQL/Redis não inclui restauração. O teste falha se o schema não estiver naquele banco; não faz dump de `public`.

`ops:check` lê `apps/api/.env`; uma credencial local aleatória foi configurada sem ser exibida. Saída 2 é esperada enquanto push estiver desabilitado: banco/fila saudáveis não significam canal real pronto. Veja `operacao-parte-10.md`.

Depois do seu teste, registre falhas e decisões ainda necessárias para a liberação. A homologação interativa e os testes em aparelhos reais permanecem pendentes até você executá-los.
